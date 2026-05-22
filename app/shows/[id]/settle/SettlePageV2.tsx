/**
 * V2 settle page — Phase 7.5 redesign.
 *
 * Gated on `shows.endOfShowAt`: if the show hasn't been marked ended, we
 * redirect to /shows/[id] so settlement math never runs against partial
 * box-office data.
 *
 * Layout:
 *   - LifecycleBar (7 stages — deal capture → expenses → finalized → paid)
 *   - Big number + branch summary (Total to artist)
 *   - SettleCtaBar (sequential gated CTAs: Send PM link → Confirm expenses
 *     → Send to agent for review)
 *   - SettlementDetails (Section A/B/C, with live PM-mobile expense polling)
 *   - Sidebar: deal terms, engine summary, optional unresolved ambiguities,
 *     collapsible Recent Activity
 *
 * The Walkthrough overlay from Phase 4 is removed. Sign-off now happens on
 * this page directly via the CTA bar.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { and, asc, desc, eq, like } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import {
  walkthroughAcks as walkthroughAcksTable,
  shareLinks as shareLinksTable,
  clauseComments as clauseCommentsTable,
  activityEvents as activityEventsTable,
  settlements as settlementsTable,
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

import {
  LifecycleBar,
  deriveLifecycleState,
} from "@/components/settlement/LifecycleBar";
import { BranchSummary } from "@/components/settlement/BranchSummary";
import { AmbiguityCard } from "@/components/settlement/AmbiguityCard";
import { ActivityLog } from "@/components/activity/ActivityLog";

import { SettleCtaBar } from "./SettleCtaBar";
import { SettlementDetails, type DetailsExpense } from "./SettlementDetails";
import { CollapsibleActivityCard } from "./CollapsibleActivityCard";

const DEAL_TYPE_LABELS: Record<Deal["dealType"], string> = {
  flat: "Flat guarantee",
  vs: "Vs (guarantee vs %)",
  percentage_of_net: "Percentage of net",
  percentage_of_gross: "Percentage of gross",
  door: "Door deal",
};

/** Lazy-create a draft settlement on first V2 visit. */
async function ensureDraftSettlement(showId: string, deal: Deal) {
  const [existing] = await db
    .select()
    .from(settlementsTable)
    .where(eq(settlementsTable.showId, showId))
    .limit(1);
  if (existing) return existing;
  const id = `stl_${showId}`;
  const now = new Date();
  await db.insert(settlementsTable).values({
    id,
    showId,
    status: "draft",
    draftedAt: now,
  });
  await db.insert(activityEventsTable).values({
    id: `ae_${randomUUID()}`,
    dealId: deal.externalId,
    showId,
    settlementId: id,
    eventType: "settlement_drafted",
    actorType: "system",
    actorName: "Greenroom",
    actorRole: "System",
    summary: "Settlement draft auto-created on first settle-page visit",
    payloadJson: null,
    occurredAt: now,
  });
  const [created] = await db
    .select()
    .from(settlementsTable)
    .where(eq(settlementsTable.id, id));
  return created;
}

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

async function ensurePmExpenseShareLink(showId: string): Promise<string> {
  const existing = await db
    .select()
    .from(shareLinksTable)
    .where(
      and(
        eq(shareLinksTable.resourceType, "pm_expense"),
        eq(shareLinksTable.resourceId, showId),
      ),
    )
    .orderBy(desc(shareLinksTable.createdAt))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const token = `pm-${randomUUID().slice(0, 12)}`;
  await db.insert(shareLinksTable).values({
    id: token,
    resourceType: "pm_expense",
    resourceId: showId,
    createdAt: new Date(),
    signoffStatus: "open",
  });
  return token;
}

type Props = {
  data: ShowWithRelations;
  searchParams: { walkthrough?: string };
};

export async function SettlePageV2({ data, searchParams }: Props) {
  void searchParams; // walkthrough query param is deprecated post-Phase-7.5

  const { show, artist, deal, ticketSales, expenses, comps } = data;
  let { settlement } = data;

  if (!deal) {
    return (
      <div className="px-12 py-10 max-w-4xl">
        <BackLink showId={show.id} />
        <div className="text-[13px] text-ink-400">No deal captured.</div>
      </div>
    );
  }

  // Hard gate: settle page only opens after the show has ended.
  if (!show.endOfShowAt) {
    redirect(`/shows/${show.id}`);
  }

  if (!settlement && deal.confirmedAt) {
    settlement = await ensureDraftSettlement(show.id, deal);
  }

  // Run the engine for the big-number header + sidebar summary.
  const result = calculateSettlementV2({
    deal,
    ticketSales,
    expenses,
    comps,
    venueCapacity: 650,
  });

  const shareUrl = settlement
    ? await ensureSettlementShareLink(settlement.id)
    : null;

  const pmExpenseToken = await ensurePmExpenseShareLink(show.id);
  const pmExpenseUrl = `/m/expense?token=${pmExpenseToken}`;

  const initialExpenses: DetailsExpense[] = expenses.map((e) => ({
    id: e.id,
    category: e.category,
    amount: e.amount,
    description: e.description,
    approved: e.approved,
    absorbedByVenue: e.absorbedByVenue,
    source: (e.source ?? "manual") as "manual" | "pm_mobile",
    enteredAt: e.enteredAt.toISOString(),
    enteredByUserId: e.enteredByUserId,
  }));

  // Sidebar: signoff link state + trace-line comments (legacy from Phase 5).
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

  // Unresolved ambiguities sidebar (when deal has any).
  const dealAmbiguities = parseDealAmbiguities(deal);
  const unresolved = dealAmbiguities.filter((a) => !a.resolution);

  // Recent activity (last 20, descending) — feeds the collapsible card.
  const recentActivity = await db
    .select()
    .from(activityEventsTable)
    .where(eq(activityEventsTable.showId, show.id))
    .orderBy(desc(activityEventsTable.occurredAt))
    .limit(20);

  // Deal share link accessedAt drives the "Deal in review" lifecycle stage.
  const [dealShareLink] = await db
    .select()
    .from(shareLinksTable)
    .where(
      and(
        eq(shareLinksTable.resourceType, "deal"),
        eq(shareLinksTable.resourceId, deal.id),
      ),
    )
    .orderBy(desc(shareLinksTable.createdAt))
    .limit(1);

  // walkthrough_acks are no longer surfaced on this page (the overlay is
  // gone), but we keep the table for backward compatibility — `like` query
  // pulled only if needed.

  const lifecycleState = deriveLifecycleState({
    hasDeal: true,
    dealConfirmedAt: deal.confirmedAt ?? null,
    dealShareAccessedAt: dealShareLink?.accessedAt ?? null,
    expensesConfirmedAt: settlement?.expensesConfirmedAt ?? null,
    settlementStatus: settlement?.status ?? null,
    paidAt: settlement?.paidAt ?? null,
  });

  return (
    <div className="px-12 py-10 pb-24 max-w-7xl mx-auto">
      <BackLink showId={show.id} />

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
          <LifecycleBar state={lifecycleState} />
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
                    {artist?.name ?? "Artist"} ·{" "}
                    {DEAL_TYPE_LABELS[deal.dealType]}
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

          {/* Grid: main col + sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              <SettleCtaBar
                showId={show.id}
                pmExpenseUrl={pmExpenseUrl}
                agentShareUrl={shareUrl}
                initialPmExpensesFinalizedAt={
                  show.pmExpensesFinalizedAt?.toISOString() ?? null
                }
                initialExpensesConfirmedAt={
                  settlement?.expensesConfirmedAt?.toISOString() ?? null
                }
                initialAgentSignoffStatus={signoff?.status ?? null}
                initialAgentSignoffByName={signoff?.byName ?? null}
                initialAgentSignoffAt={
                  signoff?.at ? signoff.at.toISOString() : null
                }
                initialAgentSignoffText={signoff?.text ?? null}
              />

              <SettlementDetails
                deal={deal}
                ticketSales={ticketSales}
                comps={comps}
                initialExpenses={initialExpenses}
                venueCapacity={650}
                showId={show.id}
              />
            </div>

            <div className="lg:col-span-4 space-y-4">
              {/* Unresolved ambiguities — surfaced only when something's
                  still open (shouldn't happen at this stage, but defensive). */}
              {unresolved.length > 0 && (
                <Card accent="amber">
                  <CardHeader>
                    <div>
                      <CardTitle className="text-[14px]">
                        Unresolved ambiguities
                      </CardTitle>
                      <div className="text-[11px] text-amber-700/80 mt-0.5">
                        Resolve upstream before continuing.
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
                  <Field
                    label="Type"
                    value={DEAL_TYPE_LABELS[deal.dealType]}
                  />
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
                  <CardTitle className="text-[14px]">
                    Settlement summary
                  </CardTitle>
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

              {/* Recent activity (collapsible) */}
              <CollapsibleActivityCard events={recentActivity} viewAllHref={`/shows/${show.id}`} />
            </div>
          </div>
        </>
      ) : (
        <UnsupportedDealPanel
          dealType={result.dealType}
          reason={result.reason}
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
