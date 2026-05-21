/**
 * V2 settle page — built around lib/dealMathV2.ts TraceStep[].
 *
 * Routed to when `deal.confirmedAt` is set. Renders the full lifecycle bar
 * (Signed + Disputed as first-class stops), big number with branch summary,
 * the trace as a vertical list of TraceLine components, an unresolved-
 * ambiguities sidebar, and a sticky action bar with [Walkthrough mode] and
 * [Send to agent for preview].
 *
 * If the V2 engine returns supported:false (e.g. a confirmed door deal),
 * an "unsupported deal type" panel renders in place of the trace.
 */

import Link from "next/link";
import { ArrowLeft, AlertTriangle, Check } from "lucide-react";
import { eq, and, desc, like } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import {
  walkthroughAcks as walkthroughAcksTable,
  shareLinks as shareLinksTable,
  clauseComments as clauseCommentsTable,
  type WalkthroughAck,
  type Deal,
} from "@/db/schema";
import type { ShowWithRelations } from "@/lib/queries";
import {
  calculateSettlementV2,
  parseDealAmbiguities,
} from "@/lib/dealMathV2";
import { formatMoney, formatShowDateFull } from "@/lib/format";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
} from "@/components/ui/card";
import { StatusBadge, DealTypeBadge, PlainBadge } from "@/components/ui/badge";

import { LifecycleBar } from "@/components/settlement/LifecycleBar";
import { BranchSummary } from "@/components/settlement/BranchSummary";
import { TraceLine } from "@/components/settlement/TraceLine";
import { AmbiguityCard } from "@/components/settlement/AmbiguityCard";

import { SettleActionBar } from "./SettleActionBar";
import { Walkthrough } from "./Walkthrough";

const DEAL_TYPE_LABELS: Record<Deal["dealType"], string> = {
  flat: "Flat guarantee",
  vs: "Vs (guarantee vs %)",
  percentage_of_net: "Percentage of net",
  percentage_of_gross: "Percentage of gross",
  door: "Door deal",
};

/**
 * Resolve (or lazily create) a magic-link share URL for this settlement so
 * the action bar can hand it to the agent. For Phase 3 the destination page
 * (Phase 5) doesn't render yet, but the token is real.
 */
async function ensureSettlementShareLink(
  settlementId: string,
): Promise<string> {
  const existing = await db
    .select()
    .from(shareLinksTable)
    .where(
      and(
        eq(shareLinksTable.resourceType, "settlement"),
        eq(shareLinksTable.resourceId, settlementId),
      ),
    )
    .orderBy(desc(shareLinksTable.createdAt))
    .limit(1);
  if (existing[0]) return `/shared/settlement/${existing[0].id}`;
  const token = `stl-${randomUUID().slice(0, 12)}`;
  await db.insert(shareLinksTable).values({
    id: token,
    resourceType: "settlement",
    resourceId: settlementId,
    createdAt: new Date(),
    signoffStatus: "open",
  });
  return `/shared/settlement/${token}`;
}

type Props = {
  data: ShowWithRelations;
  searchParams: { walkthrough?: string };
};

export async function SettlePageV2({ data, searchParams }: Props) {
  const { show, artist, deal, settlement, ticketSales, expenses, comps } = data;
  if (!deal) {
    // No deal at all — shouldn't reach here (router guards), but render safely.
    return (
      <div className="px-12 py-10 max-w-4xl">
        <BackLink showId={show.id} />
        <div className="text-[13px] text-ink-400">No deal captured.</div>
      </div>
    );
  }

  const isWalkthroughActive = searchParams.walkthrough === "1";

  // Run the V2 engine.
  const result = calculateSettlementV2({
    deal,
    ticketSales,
    expenses,
    comps,
    venueCapacity: 650, // BUILD_PLAN: hardcoded for demo
  });

  // Walkthrough acks (joined to a settlement, if any).
  let acks: WalkthroughAck[] = [];
  if (settlement) {
    acks = await db
      .select()
      .from(walkthroughAcksTable)
      .where(eq(walkthroughAcksTable.settlementId, settlement.id));
  }
  const ackByKey = new Map<string, WalkthroughAck>();
  for (const a of acks) ackByKey.set(a.lineKey, a);

  // Share link (lazy-create if missing).
  const shareUrl = settlement
    ? await ensureSettlementShareLink(settlement.id)
    : "/shared/settlement/unavailable";

  // Agent signoff state — most recent share_link for this settlement carries
  // the canonical signoff status (open / agreed / questions).
  let signoff: {
    status: "open" | "agreed" | "questions";
    text: string | null;
    byName: string | null;
    at: Date | null;
  } | null = null;
  if (settlement) {
    const [link] = await db
      .select()
      .from(shareLinksTable)
      .where(
        and(
          eq(shareLinksTable.resourceType, "settlement"),
          eq(shareLinksTable.resourceId, settlement.id),
        ),
      )
      .orderBy(desc(shareLinksTable.createdAt))
      .limit(1);
    if (link) {
      signoff = {
        status: link.signoffStatus,
        text: link.signoffText,
        byName: link.signoffByName,
        at: link.signoffAt,
      };
    }
  }

  // Trace-line questions — clause_comments with clauseRef like "trace.%".
  // Render as a chat-count badge on the matching TraceLine.
  const traceQuestions = await db
    .select()
    .from(clauseCommentsTable)
    .where(
      and(
        eq(clauseCommentsTable.dealId, deal.id),
        like(clauseCommentsTable.clauseRef, "trace.%"),
      ),
    );
  const traceCommentCountByKey = new Map<string, number>();
  for (const c of traceQuestions) {
    const key = c.clauseRef.replace(/^trace\./, "");
    traceCommentCountByKey.set(
      key,
      (traceCommentCountByKey.get(key) ?? 0) + 1,
    );
  }

  // Display ambiguities pull straight from the deal — these are the source
  // of truth for unresolved state, not the engine's filtered list.
  const dealAmbiguities = parseDealAmbiguities(deal);
  const unresolved = dealAmbiguities.filter((a) => !a.resolution);

  return (
    <div className="px-12 py-10 pb-24 max-w-7xl mx-auto">
      <BackLink showId={show.id} />

      {/* Voided banner (when applicable) */}
      {settlement?.status === "voided" && (
        <div className="mb-6 rounded-md border border-ink-300 bg-ink-50 px-3 py-2 text-[12px] text-ink-700 flex items-center gap-2">
          <AlertTriangle className="size-3.5 text-ink-500" />
          This settlement was voided — engine output shown for reference only.
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 mb-3">
          <StatusBadge status={show.status} />
          <DealTypeBadge type={deal.dealType} />
          <PlainBadge variant="brand">V2 engine</PlainBadge>
          {deal.externalId && (
            <span className="text-[10.5px] text-ink-400 font-mono ml-1">
              {deal.externalId}
            </span>
          )}
        </div>
        <h1 className="text-[28px] font-display text-ink-900 leading-tight">
          {artist?.name ?? "Unknown artist"}
          <span className="text-ink-400 font-normal"> · </span>
          <span className="text-ink-500 font-normal text-[20px] align-middle">
            {formatShowDateFull(show.date)}
          </span>
        </h1>
      </div>

      {/* Lifecycle */}
      <Card className="mb-6">
        <CardContent className="px-5 py-4">
          <LifecycleBar settlement={settlement ?? null} />
        </CardContent>
      </Card>

      {result.supported ? (
        <>
          {/* Big number + branch summary */}
          <Card accent="brand" className="mb-6">
            <CardContent className="px-5 py-5">
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-brand-700 font-medium">
                    Total to artist
                  </div>
                  <div className="text-[44px] font-display text-ink-900 leading-none mt-1 font-mono tabular">
                    {formatMoney(result.totalToArtist)}
                  </div>
                  <div className="text-[12px] text-ink-500 mt-1">
                    {artist?.name ?? "Artist"} · {DEAL_TYPE_LABELS[deal.dealType]}
                  </div>
                </div>
                <div className="flex-1 min-w-[320px] max-w-md">
                  <BranchSummary
                    branches={result.branches}
                    dealType={deal.dealType}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grid: trace + sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Settlement trace</CardTitle>
                    <div className="text-[11px] text-ink-500 mt-0.5">
                      {result.trace.length} lines · every step sources back to a
                      receipt, ticketing row, deal term, or comp rule.
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {result.trace.map((step) => (
                    <TraceLine
                      key={step.key}
                      step={step}
                      ackable={false}
                      ackedBy={ackByKey.get(step.key) ?? null}
                      commentsCount={traceCommentCountByKey.get(step.key)}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-4 space-y-4">
              {/* Agent signoff status */}
              {signoff && (
                <Card
                  accent={
                    signoff.status === "agreed"
                      ? "brand"
                      : signoff.status === "questions"
                        ? "amber"
                        : "sky"
                  }
                >
                  <CardContent className="px-4 py-3">
                    <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
                      Agent review
                    </div>
                    {signoff.status === "agreed" ? (
                      <div className="mt-1">
                        <div className="flex items-center gap-1.5 text-[13px] text-brand-900 font-medium">
                          <Check className="size-3.5 text-brand-700" />
                          Signed off
                          {signoff.byName && (
                            <span className="font-normal text-ink-700">
                              · {signoff.byName}
                            </span>
                          )}
                        </div>
                        {signoff.at && (
                          <div className="text-[11px] text-ink-500 mt-0.5">
                            {new Date(signoff.at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                        {signoff.text && (
                          <p className="text-[12px] text-ink-700 mt-2 italic">
                            “{signoff.text}”
                          </p>
                        )}
                      </div>
                    ) : signoff.status === "questions" ? (
                      <div className="mt-1">
                        <div className="text-[13px] text-amber-900 font-medium">
                          Questions raised
                          {signoff.byName && (
                            <span className="font-normal text-ink-700">
                              {" "}
                              · {signoff.byName}
                            </span>
                          )}
                        </div>
                        {signoff.at && (
                          <div className="text-[11px] text-ink-500 mt-0.5">
                            {new Date(signoff.at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                        {signoff.text && (
                          <p className="text-[12px] text-ink-700 mt-2 italic">
                            “{signoff.text}”
                          </p>
                        )}
                        {traceCommentCountByKey.size > 0 && (
                          <p className="text-[11px] text-ink-500 mt-2">
                            {traceCommentCountByKey.size} line
                            {traceCommentCountByKey.size === 1 ? "" : "s"}{" "}
                            questioned — see chat badges in the trace.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-[12px] text-sky-800 mt-1">
                        Awaiting agent review — share link generated, not yet
                        opened.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Unresolved ambiguities */}
              {unresolved.length > 0 && (
                <Card accent="amber">
                  <CardHeader>
                    <div>
                      <CardTitle className="text-[14px]">
                        Unresolved ambiguities
                      </CardTitle>
                      <div className="text-[11px] text-amber-700/80 mt-0.5">
                        Resolve upstream — before signoff.
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {unresolved.map((a) => (
                      <AmbiguityCard key={a.id} ambiguity={a} showId={show.id} />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Deal terms recap */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-[14px]">Deal terms</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 pt-0">
                  <Field label="Type" value={DEAL_TYPE_LABELS[deal.dealType]} />
                  {deal.guaranteeAmount != null && (
                    <Field
                      label="Guarantee"
                      value={formatMoney(deal.guaranteeAmount)}
                      mono
                    />
                  )}
                  {deal.percentage != null && (
                    <Field
                      label={`% of ${deal.percentageBasis ?? "—"}`}
                      value={`${(deal.percentage * 100).toFixed(0)}%`}
                      mono
                    />
                  )}
                  {deal.expenseCap != null && (
                    <Field
                      label="Expense cap"
                      value={formatMoney(deal.expenseCap)}
                      mono
                    />
                  )}
                  {deal.hospitalityCap != null && (
                    <Field
                      label="Hospitality cap"
                      value={formatMoney(deal.hospitalityCap)}
                      mono
                    />
                  )}
                  {deal.confirmedAt && (
                    <Field
                      label="Confirmed"
                      value={new Date(deal.confirmedAt).toLocaleDateString()}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Settlement summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-[14px]">Settlement summary</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 pt-0">
                  <Field
                    label="Gross"
                    value={formatMoney(result.grossBoxOffice)}
                    mono
                  />
                  <Field
                    label="Net pool"
                    value={formatMoney(result.netBoxOffice)}
                    mono
                  />
                  <Field
                    label="Expenses (capped)"
                    value={formatMoney(result.totalExpenses)}
                    mono
                  />
                  <Field
                    label="Settlement base"
                    value={
                      result.branches.winner === "percentage"
                        ? "Percentage"
                        : result.branches.winner === "guarantee"
                          ? "Guarantee"
                          : "—"
                    }
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : (
        <UnsupportedDealPanel
          dealType={result.dealType}
          reason={result.reason}
        />
      )}

      {/* Sticky action bar */}
      <SettleActionBar
        showId={show.id}
        shareUrl={shareUrl}
        isWalkthroughActive={isWalkthroughActive}
      />

      {/* Walkthrough overlay — full-screen takeover when ?walkthrough=1 */}
      {isWalkthroughActive && result.supported && settlement && (
        <Walkthrough
          settlementId={settlement.id}
          showId={show.id}
          artistName={artist?.name ?? "Artist"}
          tourManagerName={`${artist?.name ?? "Artist"} TM`}
          trace={result.trace}
          initialAcks={acks}
          shareUrl={shareUrl}
          exitHref={`/shows/${show.id}/settle`}
        />
      )}
    </div>
  );
}

function BackLink({ showId }: { showId: string }) {
  return (
    <Link
      href={`/shows/${showId}`}
      className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-800 mb-4"
    >
      <ArrowLeft className="size-3.5" /> Back to show
    </Link>
  );
}

function UnsupportedDealPanel({
  dealType,
  reason,
}: {
  dealType: Deal["dealType"];
  reason: string;
}) {
  return (
    <Card accent="amber">
      <CardContent className="px-5 py-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="text-[13px] font-medium text-amber-900">
              V2 engine doesn&apos;t support {DEAL_TYPE_LABELS[dealType]} deals
              yet
            </div>
            <p className="text-[12px] text-ink-600 mt-1 max-w-prose">{reason}</p>
            <p className="text-[12px] text-ink-500 mt-2">
              Power users default to a spreadsheet for these. We&apos;d add
              coverage next.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
