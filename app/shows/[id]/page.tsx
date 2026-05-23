import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  AlertCircle,
  Check,
  Clock,
  TrendingUp,
} from "lucide-react";
import { getShowById } from "@/lib/queries";
import { ShowActionBar } from "./ShowActionBar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Field,
} from "@/components/ui/card";
import { StatusBadge, DealTypeBadge, PlainBadge } from "@/components/ui/badge";
import { deriveDisplayStatus } from "@/lib/settlementStage";
import { Button } from "@/components/ui/button";
import { parseBonuses } from "@/lib/dealMath";
import { calculateSettlementV2, parseDealRecoups } from "@/lib/dealMathV2";
import {
  ExpensesBreakdown,
  type ExpensesBreakdownLineItem,
  type ExpensesBreakdownRecoup,
} from "@/components/settlement/ExpensesBreakdown";
import {
  formatMoney,
  formatMoneyCompact,
  formatShowDateFull,
  relativeShowDate,
} from "@/lib/format";
import type { Bonus } from "@/db/schema";

const COMP_LABELS: Record<string, string> = {
  artist_gl: "Artist guest list",
  label: "Label / management",
  press: "Press",
  venue_staff: "Venue staff",
  sponsor: "Sponsor",
  promo: "Promo / radio",
  other: "Other",
};

export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getShowById(id);
  if (!data) notFound();

  const {
    show,
    artist,
    agent,
    agency,
    deal,
    settlement,
    ticketSales,
    expenses,
    comps,
  } = data;

  const grossSoFar = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const totalTickets = ticketSales.reduce((sum, t) => sum + (t.qty ?? 0), 0);

  // Phase 8.9.3 — run the V2 engine here so the show detail page's
  // Expenses panel + header Expenses stat mirror the same canonical
  // numbers the settle page reads (originalGross, adjustedGross,
  // capAbsorbed, netExpense). Cheap to recompute server-side; keeps
  // the two pages in lockstep.
  const settlementAdjustment =
    settlement?.adjustmentSavedAt && settlement.adjustmentAmount != null
      ? {
          amount: settlement.adjustmentAmount,
          description: settlement.adjustmentDescription ?? undefined,
        }
      : null;
  const engineResult = deal
    ? calculateSettlementV2({
        deal,
        ticketSales,
        expenses,
        comps,
        venueCapacity: 650,
        adjustment: settlementAdjustment,
      })
    : null;
  const engineOriginalGross =
    engineResult?.supported
      ? engineResult.trace.find((s) => s.key === "gross_expenses")?.value ?? 0
      : 0;
  const engineAdjustedGross =
    engineResult?.supported
      ? engineResult.adjustmentApplied?.adjustedGross ?? engineOriginalGross
      : 0;
  const engineCapAbsorbed =
    engineResult?.supported
      ? engineResult.adjustmentApplied?.capAbsorbed ??
        Math.max(0, engineOriginalGross - (deal?.expenseCap ?? Infinity))
      : 0;
  const engineNetExpense = engineResult?.supported
    ? engineResult.totalExpenses
    : 0;
  /** Pre-engine raw sum — used as a fallback when the deal isn't
   *  confirmed yet (no engine result), otherwise we surface the
   *  canonical engine value below. */
  const rawExpensesSum = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);
  const headerExpensesStat = engineResult?.supported
    ? engineNetExpense
    : rawExpensesSum;
  const insideCapRecoupsForPanel: ExpensesBreakdownRecoup[] = deal
    ? parseDealRecoups(deal)
        .filter(
          (r) => r.position === "inside_cap" || r.position === "ambiguous",
        )
        .map((r) => ({
          id: r.id,
          category: r.category,
          label: r.label,
          amount: r.amount,
        }))
    : [];
  const expensesForPanel: ExpensesBreakdownLineItem[] = expenses
    .filter((e) => !e.absorbedByVenue)
    .map((e) => ({
      id: e.id,
      category: e.category,
      amount: e.amount,
      description: e.description,
      source: (e.source ?? "manual") as "manual" | "pm_mobile",
      receiptPath: e.receiptPath ?? null,
      enteredAt: e.enteredAt.toISOString(),
      absorbedByVenue: e.absorbedByVenue,
    }));
  const lockedAdjustment =
    settlement?.adjustmentSavedAt &&
    settlement.adjustmentDescription &&
    settlement.adjustmentAmount != null
      ? {
          description: settlement.adjustmentDescription,
          amount: settlement.adjustmentAmount,
          savedAt: settlement.adjustmentSavedAt.toISOString(),
          savedBy: settlement.adjustmentSavedBy ?? "Booker",
        }
      : null;

  const totalCompCount = comps.reduce((s, c) => s + c.count, 0);
  const compsCountingTowardGross = comps
    .filter((c) => c.countsTowardGross)
    .reduce((s, c) => s + c.count, 0);

  const bonuses = deal ? parseBonuses(deal) : [];
  const recoups = deal ? parseDealRecoups(deal) : [];

  const isDisputed = settlement?.status === "disputed";

  return (
    <div className="max-w-7xl">
      {/* Poster header */}
      <div className={`px-12 pt-10 pb-14 ${isDisputed ? "bg-gradient-to-b from-rose-50/40 to-canvas" : "bg-gradient-to-b from-brand-50/30 to-canvas"}`}>
        <Link
          href="/shows"
          className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-8 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All shows
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-1.5 mb-4">
              <StatusBadge
                status={deriveDisplayStatus({
                  showStatus: show.status,
                  settlement: settlement
                    ? {
                        status: settlement.status,
                        gmApprovedAt: settlement.gmApprovedAt,
                        finalizedAt: settlement.finalizedAt,
                        disputedAt: settlement.disputedAt,
                        adjustmentSavedAt: settlement.adjustmentSavedAt,
                      }
                    : null,
                })}
              />
              {deal && <DealTypeBadge type={deal.dealType} />}
              {isDisputed && !settlement?.adjustmentSavedAt && (
                <PlainBadge variant="rose">Disputed</PlainBadge>
              )}
              {bonuses.length > 0 && (
                <PlainBadge variant="brand">
                  {bonuses.length} bonus{bonuses.length === 1 ? "" : "es"}
                </PlainBadge>
              )}
            </div>
            <h1
              className="font-display text-[56px] font-medium text-ink-900 leading-[1.02]"
              style={{ letterSpacing: "-0.025em", fontOpticalSizing: "auto" }}
            >
              {artist?.name ?? "—"}
            </h1>
            <div className="text-[14px] text-ink-400 mt-3 flex items-center gap-2">
              <span className="text-ink-600 font-medium">{formatShowDateFull(show.date)}</span>
              <span className="text-ink-300">·</span>
              <span>{relativeShowDate(show.date)}</span>
              <span className="text-ink-200">·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                doors {show.doorsTime} · set {show.setTime}
              </span>
            </div>
          </div>
          <ShowActionBar
            showId={show.id}
            hasDeal={!!deal}
            endOfShowAt={show.endOfShowAt ?? null}
            isViewOnlyExample={show.isViewOnlyExample === true}
          />
        </div>

        {/* Key numbers strip */}
        <div className="flex items-baseline gap-10 mt-8 pt-5 border-t border-ink-200/40">
          <MiniStat label="Gross" value={formatMoneyCompact(grossSoFar)} />
          <MiniStat label="Tickets" value={String(totalTickets)} />
          <MiniStat
            label="Expenses"
            value={formatMoneyCompact(headerExpensesStat)}
          />
          {settlement?.totalToArtist != null && (
            <MiniStat label="To artist" value={formatMoneyCompact(settlement.totalToArtist)} accent />
          )}
        </div>
      </div>

      <div className="px-12 pb-12">
        {show.endOfShowAt ? (
          <div className="mb-8 mt-1 rounded-lg bg-brand-50/50 ring-1 ring-brand-200/60 p-5 flex gap-3">
            <Check className="h-4 w-4 text-brand-700 mt-0.5 shrink-0" />
            <div>
              <div className="eyebrow text-[10px] text-brand-800 mb-1.5">
                Status
              </div>
              <div className="text-[13px] text-ink-800 leading-relaxed">
                Show complete · awaiting expense settlement
              </div>
            </div>
          </div>
        ) : show.internalNotes ? (
          <div className="mb-8 mt-1 rounded-lg bg-amber-50/50 ring-1 ring-amber-200/60 p-5 flex gap-3">
            <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <div className="eyebrow text-[10px] text-amber-800 mb-1.5">
                Mariana&apos;s notes
              </div>
              <div className="text-[13px] text-ink-800 leading-relaxed">
                {show.internalNotes}
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-2">
          {/* Deal terms */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Deal terms</CardTitle>
                <CardDescription>
                  What was negotiated. Mariana enters this from the email
                  thread with the agent.
                </CardDescription>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {deal && <DealTypeBadge type={deal.dealType} />}
                {deal && show.isViewOnlyExample !== true && (
                  <Link
                    href={`/shows/${show.id}/deal/capture`}
                    className="text-[11px] text-ink-500 hover:text-ink-800 underline underline-offset-2"
                  >
                    Recapture deal
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {deal ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Field
                      label="Guarantee"
                      mono
                      value={
                        deal.guaranteeAmount != null
                          ? formatMoney(deal.guaranteeAmount)
                          : "—"
                      }
                    />
                    <Field
                      label="Percentage"
                      mono
                      value={
                        deal.percentage != null
                          ? `${(deal.percentage * 100).toFixed(0)}% ${deal.percentageBasis ? `of ${deal.percentageBasis}` : ""}`
                          : "—"
                      }
                    />
                    <Field
                      label="Expense cap"
                      mono
                      value={
                        deal.expenseCap != null
                          ? formatMoney(deal.expenseCap)
                          : "—"
                      }
                    />
                    <Field
                      label="Hospitality cap"
                      mono
                      value={
                        deal.hospitalityCap != null
                          ? formatMoney(deal.hospitalityCap)
                          : "—"
                      }
                    />
                  </div>

                  {recoups.length > 0 && (
                    <div className="rounded-lg ring-1 ring-amber-200/60 bg-amber-50/30 p-4">
                      <div className="eyebrow text-[10px] text-amber-800 mb-2">
                        Recoups (deal-time deductions)
                      </div>
                      <ul className="space-y-1.5">
                        {recoups.map((r) => (
                          <li
                            key={r.id}
                            className="text-[12.5px] text-ink-800 flex items-center justify-between gap-2"
                          >
                            <span>
                              <span className="capitalize">
                                {r.category.replace(/_/g, " ")}
                              </span>
                              {r.label && (
                                <span className="text-ink-500"> · {r.label}</span>
                              )}
                            </span>
                            <span className="flex items-center gap-2 shrink-0">
                              <span className="font-mono tabular">
                                {formatMoney(r.amount)}
                              </span>
                              <PlainBadge
                                variant={
                                  r.position === "inside_cap"
                                    ? "brand"
                                    : r.position === "off_gross"
                                      ? "amber"
                                      : r.position === "ambiguous"
                                        ? "amber"
                                        : "default"
                                }
                              >
                                {r.position === "ambiguous"
                                  ? "position?"
                                  : r.position.replace(/_/g, "-")}
                              </PlainBadge>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {bonuses.length > 0 && (
                    <div className="rounded-lg ring-1 ring-brand-200/50 bg-brand-50/20 p-4">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <TrendingUp className="h-3.5 w-3.5 text-brand-700" />
                        <div className="eyebrow text-[10px] text-brand-800">
                          Bonuses & escalators (structured)
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {bonuses.map((b, i) => (
                          <li
                            key={i}
                            className="text-[12.5px] text-ink-800 flex items-start gap-2"
                          >
                            <BonusBadge type={b.type} />
                            <span className="leading-relaxed">{b.label}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="text-[11px] text-ink-400 mt-3 leading-snug">
                        Stored in{" "}
                        <code className="font-mono text-[10px] bg-white/80 px-1 py-0.5 rounded ring-1 ring-ink-200/40">
                          bonuses_json
                        </code>
                        . The in-app tool only reads structured bonuses — anything
                        in the prose below is invisible to it.
                      </div>
                    </div>
                  )}

                  {deal.dealNotesFreetext && (
                    <div>
                      <div className="eyebrow text-[10px] text-ink-500 mb-2">
                        Deal notes (free text — what Mariana actually trusts)
                      </div>
                      <div className="text-[13px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/50 leading-relaxed font-[450]" style={{ fontStyle: "italic" }}>
                        {deal.dealNotesFreetext}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg ring-1 ring-brand-200/60 bg-brand-50/30 p-5">
                  <div className="eyebrow text-[10px] text-brand-800 mb-2">
                    Pre-show · deal capture
                  </div>
                  <div className="text-[15px] text-ink-900 font-medium leading-tight">
                    No deal captured yet
                  </div>
                  <p className="text-[12.5px] text-ink-600 mt-1.5 max-w-prose leading-relaxed">
                    Paste the deal email from {agent?.name ?? "the agent"}. AI
                    extracts structured terms, flags ambiguities, and routes
                    the deal to the settlement engine once locked.
                  </p>
                  <div className="mt-4">
                    <Link
                      href={`/shows/${show.id}/deal/capture`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium px-4 h-9 bg-brand-700 text-white hover:bg-brand-800 shadow-sm shadow-brand-700/15 ring-1 ring-inset ring-brand-800/20"
                    >
                      Capture deal terms →
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Artist & agent */}
          <Card>
            <CardHeader>
              <CardTitle>Artist & agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Artist" value={artist?.name ?? "—"} />
              <Field
                label="Genre"
                value={
                  <span className="capitalize">{artist?.genre ?? "—"}</span>
                }
              />
              <Field
                label="Prior shows here"
                value={String(artist?.priorShowCount ?? 0)}
                mono
              />
              <Field
                label="Agent"
                value={
                  agent
                    ? `${agent.name}${agency ? ` · ${agency.name}` : ""}`
                    : "—"
                }
              />
              {agent?.preferencesNotes && (
                <div>
                  <div className="eyebrow text-[10px] text-ink-500 mb-2">
                    Agent notes
                  </div>
                  <div className="text-[12.5px] text-ink-800 bg-amber-50/50 ring-1 ring-amber-200/50 rounded-lg p-3 leading-relaxed">
                    {agent.preferencesNotes}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Box office */}
          <Card>
            <CardHeader>
              <CardTitle>Box office</CardTitle>
              <CardDescription>From integrated ticketing.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="eyebrow text-[10px] text-ink-400">Gross</div>
                  <div className="text-[28px] font-mono tabular font-semibold text-ink-900 mt-1 leading-none">
                    {formatMoneyCompact(grossSoFar)}
                  </div>
                </div>
                {totalTickets > 0 ? (
                  <div className="text-[12px] text-ink-500 pt-4 border-t border-ink-100/80 leading-relaxed">
                    <span className="font-mono tabular font-medium text-ink-700">
                      {totalTickets}
                    </span>{" "}
                    tickets ·{" "}
                    <span className="font-mono tabular">
                      {formatMoney(totalFees)}
                    </span>{" "}
                    in fees
                    <div className="mt-1.5 text-ink-400">
                      Net{" "}
                      <span className="font-mono tabular text-ink-700">
                        {formatMoneyCompact(grossSoFar - totalFees)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[12px] text-ink-400 pt-3 border-t border-ink-100/80">
                    No sales yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Comps */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Comps</CardTitle>
                <CardDescription>
                  {totalCompCount} comp tickets across {comps.length}{" "}
                  categor{comps.length === 1 ? "y" : "ies"}.
                  {compsCountingTowardGross > 0 && (
                    <>
                      {" "}
                      <span className="text-amber-700 font-medium">
                        {compsCountingTowardGross} count toward gross.
                      </span>
                    </>
                  )}
                </CardDescription>
              </div>
              <PlainBadge variant="default">
                {totalCompCount} total
              </PlainBadge>
            </CardHeader>
            <CardContent>
              {comps.length === 0 ? (
                <div className="text-[13px] text-ink-400">
                  No comps recorded for this show.
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left border-b border-ink-100/80">
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold">Category</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Count</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Face value</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Counts toward gross?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100/60">
                    {comps.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5">
                          {COMP_LABELS[c.category] ?? c.category}
                          {c.notes && (
                            <span className="text-ink-400 ml-1">· {c.notes}</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular">{c.count}</td>
                        <td className="py-2.5 text-right font-mono tabular text-ink-500">
                          {formatMoney(c.faceValue * c.count)}
                        </td>
                        <td className="py-2.5 text-right">
                          {c.countsTowardGross ? (
                            <span className="text-amber-700 font-medium">Yes</span>
                          ) : (
                            <span className="text-ink-400">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Expenses — Phase 8.9.3 readonly mirror of settle page Section B */}
          <Card className="md:col-span-3 p-0 overflow-hidden">
            <CardHeader className="px-5 py-3 border-b border-ink-100">
              <div>
                <CardTitle>Expenses</CardTitle>
                <CardDescription>
                  Logged by production manager during the show. Reconciled in
                  settlement.
                </CardDescription>
              </div>
            </CardHeader>
            {deal && engineResult?.supported ? (
              <ExpensesBreakdown
                variant="summary"
                deal={deal}
                lineItems={expensesForPanel}
                insideCapRecoups={insideCapRecoupsForPanel}
                originalGross={engineOriginalGross}
                adjustedGross={engineAdjustedGross}
                capAbsorbed={engineCapAbsorbed}
                netExpense={engineNetExpense}
                adjustment={lockedAdjustment}
              />
            ) : (
              <CardContent>
                <div className="text-[13px] text-ink-500">
                  No expenses yet.
                  <span className="text-ink-400">
                    {" "}
                    Production manager logs expenses during the show.
                  </span>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow text-[9px] text-ink-400">{label}</div>
      <div className={`text-[18px] font-mono tabular font-semibold mt-0.5 leading-none ${accent ? "text-brand-700" : "text-ink-900"}`}>
        {value}
      </div>
    </div>
  );
}

function BonusBadge({ type }: { type: Bonus["type"] }) {
  const labels: Record<Bonus["type"], string> = {
    gross_threshold: "gross",
    sellout: "sellout",
    attendance_threshold: "attend",
    tier_ratchet: "ratchet",
  };
  return (
    <span className="inline-flex shrink-0 items-center px-1.5 py-px rounded text-[9px] font-mono uppercase tracking-wider bg-white ring-1 ring-brand-200/50 text-brand-800">
      {labels[type]}
    </span>
  );
}
