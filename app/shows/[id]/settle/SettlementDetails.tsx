"use client";

/**
 * Settle-page settlement details — the three-section view that replaces
 * the V2 trace + LiveExpensesPanel sidebar from earlier phases.
 *
 *   Section A  TICKET SALES
 *     Gross box office, comp adjustments, ticketing fees → Net Box Office
 *   Section B  EXPENSES (live, polled)
 *     Per-row PM uploads + deal-term recoups, capped if over the deal cap
 *   Section C  SETTLEMENT TO ARTIST
 *     Net pool, vs deal math, total to artist
 *
 * Polls /api/expenses every 5s for new PM-mobile rows; new arrivals get
 * a green "just now · from production manager" pill and a one-shot
 * background flash. The engine re-runs locally on each tick so the
 * Section B totals + Section C math stay in sync without a full
 * server round-trip.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Lock,
  Paperclip,
  Receipt,
  Smartphone,
  Ticket,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { ReceiptModal, type ReceiptModalData } from "./ReceiptModal";
import {
  calculateSettlementV2,
  type SettlementResultV2,
} from "@/lib/dealMathV2";
import type { Deal, TicketSale, Expense, Comp } from "@/db/schema";

export type DetailsExpense = {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  approved: boolean;
  absorbedByVenue: boolean;
  source: "manual" | "pm_mobile" | null;
  enteredAt: string;
  enteredByUserId: string | null;
  /** Public path to the receipt artifact, e.g. "/receipts/sound.svg".
   *  Null for legacy rows with no associated receipt. */
  receiptPath: string | null;
};

export type AdjustmentDetails = {
  description: string;
  amount: number;
  savedAt: string;
  savedBy: string;
};

type Props = {
  deal: Deal;
  ticketSales: TicketSale[];
  comps: Comp[];
  initialExpenses: DetailsExpense[];
  venueCapacity: number;
  showId: string;
  /** When false, no polling, no "just now" pills. Used by the agent
   *  read-only one-pager where the settlement is frozen at send time. */
  live?: boolean;
  /** Phase 8.9: dispute state surfaced from the most recent agent
   *  settlement share-link. When true + adjustment is null, Mariana
   *  sees the editable "Other adjustments" row. */
  agentDisputed?: boolean;
  /** Phase 8.9: saved adjustment line, or null. */
  adjustment?: AdjustmentDetails | null;
  /** Phase 8.9: render the adjustment row in editable mode. Only true on
   *  Mariana's settle page. The agent shared view sees the locked row
   *  but never the editor. */
  canEditAdjustment?: boolean;
};

const POLL_INTERVAL_MS = 5000;
const FRESH_WINDOW_MS = 60_000;

const CATEGORY_LABELS: Record<string, string> = {
  sound: "Sound",
  production: "Production",
  lights: "Lights",
  hospitality: "Hospitality",
  marketing: "Marketing",
  backline: "Backline",
  security: "Security",
  other: "Other",
};

function expenseToDbShape(e: DetailsExpense): Expense {
  return {
    id: e.id,
    showId: "",
    category: e.category as Expense["category"],
    amount: e.amount,
    description: e.description,
    approved: e.approved,
    absorbedByVenue: e.absorbedByVenue,
    enteredByUserId: e.enteredByUserId,
    enteredAt: new Date(e.enteredAt),
    source: e.source,
    receiptPath: e.receiptPath,
  } as Expense;
}

export function SettlementDetails({
  deal,
  ticketSales,
  comps,
  initialExpenses,
  venueCapacity,
  showId,
  live = true,
  agentDisputed = false,
  adjustment = null,
  canEditAdjustment = false,
}: Props) {
  const router = useRouter();
  const [expenses, setExpenses] = useState<DetailsExpense[]>(initialExpenses);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [openReceipt, setOpenReceipt] = useState<ReceiptModalData | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<{
    description: string;
    amount: string;
  }>({ description: "", amount: "" });
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  const latestAtRef = useRef<string>(
    initialExpenses.length > 0
      ? initialExpenses[initialExpenses.length - 1].enteredAt
      : new Date(0).toISOString(),
  );

  useEffect(() => {
    if (!live) return;
    let stopped = false;

    async function tick() {
      try {
        const url = new URL("/api/expenses", window.location.origin);
        url.searchParams.set("showId", showId);
        url.searchParams.set("since", latestAtRef.current);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { expenses: DetailsExpense[] };
        if (stopped || data.expenses.length === 0) return;
        setExpenses((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          const merged = [...prev];
          for (const e of data.expenses) if (!seen.has(e.id)) merged.push(e);
          merged.sort(
            (a, b) =>
              new Date(a.enteredAt).getTime() -
              new Date(b.enteredAt).getTime(),
          );
          return merged;
        });
        const newIds = data.expenses.map((e) => e.id);
        setFreshIds((prev) => {
          const next = new Set(prev);
          for (const id of newIds) next.add(id);
          return next;
        });
        latestAtRef.current =
          data.expenses[data.expenses.length - 1].enteredAt;
        for (const id of newIds) {
          setTimeout(() => {
            setFreshIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }, FRESH_WINDOW_MS);
        }
      } catch {
        // Best-effort polling — retry next interval.
      }
    }

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [showId, live]);

  // Recompute the engine locally on each render so Sections A and C stay
  // in sync with live Section B additions. The engine is import-safe
  // client-side (lib/dealMathV2 uses only type-only schema imports).
  // Phase 8.9.1 — forward the persisted adjustment so the engine's
  // canonical totalToArtist / netBoxOffice already reflect it; the UI
  // below reads those values directly instead of recomputing locally.
  const result: SettlementResultV2 = useMemo(
    () =>
      calculateSettlementV2({
        deal,
        ticketSales,
        expenses: expenses.map(expenseToDbShape),
        comps,
        venueCapacity,
        adjustment: adjustment
          ? {
              amount: adjustment.amount,
              description: adjustment.description,
            }
          : null,
      }),
    [deal, ticketSales, comps, expenses, venueCapacity, adjustment],
  );

  if (!result.supported) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50/40 p-5 text-[13px] text-amber-900">
        {result.reason}
      </div>
    );
  }

  // Trace lookup helpers — pull out the steps Section A / C need.
  const traceByKey: Record<string, (typeof result.trace)[number]> = {};
  for (const s of result.trace) traceByKey[s.key] = s;
  const grossStep = traceByKey["gross"];
  const feesStep = traceByKey["fees"];
  const netStep = traceByKey["net"];
  const branchStep = traceByKey["branch"];
  const resultStep = traceByKey["result"];

  // Comp adjustments: there can be multiple, one per category. Sum.
  const compAdjustmentSteps = result.trace.filter(
    (s) => s.kind === "comp_adjustment",
  );
  const compAdjustmentTotal = compAdjustmentSteps.reduce(
    (s, t) => s + t.value,
    0,
  );

  // Net box office: gross + comp adjustments − fees.
  const grossValue = grossStep?.value ?? 0;
  const feesValue = feesStep?.value ?? 0;
  const netBoxOffice = grossValue + compAdjustmentTotal + feesValue;

  // Section B substructure — read straight off the engine's
  // trace + adjustmentApplied so the UI and the canonical math stay
  // in sync. Phase 8.9.2 reshapes this entirely: the adjustment is a
  // gross-expense modifier and the cap re-evaluates over the
  // adjusted gross.
  const insideCapRecoups = (
    deal.recoupsJson ? (JSON.parse(deal.recoupsJson) as Array<{
      id: string;
      category: string;
      label: string;
      amount: number;
      position: string;
    }>) : []
  ).filter((r) => r.position === "inside_cap" || r.position === "ambiguous");

  const adjustmentAmount = adjustment?.amount ?? null;
  const originalGross =
    traceByKey["gross_expenses"]?.value ??
    expenses
      .filter((e) => !e.absorbedByVenue)
      .reduce((s, e) => s + e.amount, 0) +
      insideCapRecoups.reduce((s, r) => s + r.amount, 0);
  const adjustedGross =
    result.adjustmentApplied?.adjustedGross ?? originalGross;
  const capAbsorbed = result.adjustmentApplied?.capAbsorbed ?? Math.max(
    0,
    originalGross - (deal.expenseCap ?? Infinity),
  );
  const netExpense = result.totalExpenses;

  // Editor state machine:
  //   hidden   — no dispute + no adjustment
  //   editor   — agentDisputed + no adjustment + onSaveAdjustment in scope
  //   locked   — adjustment is set (final, even if agent re-disputes)
  const adjustmentMode: "hidden" | "editor" | "locked" =
    adjustment != null
      ? "locked"
      : agentDisputed && canEditAdjustment
        ? "editor"
        : "hidden";

  async function handleSaveAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setAdjustmentError(null);
    const trimmedDescription = adjustmentDraft.description.trim();
    const parsedAmount = parseFloat(adjustmentDraft.amount);
    if (!trimmedDescription) {
      setAdjustmentError("Description is required.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
      setAdjustmentError(
        "Amount must be a non-zero number (positive or negative).",
      );
      return;
    }
    setAdjustmentSaving(true);
    try {
      const res = await fetch("/api/save-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showId,
          description: trimmedDescription,
          amount: parsedAmount,
        }),
      });
      if (!res.ok) {
        const errJson = (await res
          .json()
          .catch(() => null)) as { error?: string } | null;
        throw new Error(errJson?.error ?? "Save failed");
      }
      setAdjustmentDraft({ description: "", amount: "" });
      router.refresh();
    } catch (err) {
      setAdjustmentError(
        err instanceof Error ? err.message : "Save failed. Please retry.",
      );
    } finally {
      setAdjustmentSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">
      <header className="px-5 py-3 border-b border-ink-100">
        <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
          Settlement details
        </div>
        <div className="text-[14px] text-ink-900 font-medium mt-0.5">
          Box office → expenses → settlement to artist
        </div>
      </header>

      {/* ── Section A — TICKET SALES ─────────────────────────────── */}
      <SectionHeader icon={<Ticket className="size-3.5" />} label="Ticket sales" />
      <DetailsRow
        label="Box office gross"
        value={grossValue}
        note={
          ticketSales.length > 0
            ? `${ticketSales.reduce((s, t) => s + (t.qty ?? 0), 0)} tickets`
            : undefined
        }
      />
      {compAdjustmentSteps.map((s) => (
        <DetailsRow
          key={s.key}
          label={s.label}
          value={s.value}
          note={s.formula}
          dim
        />
      ))}
      {feesStep && (
        <DetailsRow
          label="Ticketing fees"
          value={feesStep.value}
          note={feesStep.formula}
          dim
        />
      )}
      <DetailsSubtotal label="Net Box Office" value={netBoxOffice} />

      {/* ── Section B — EXPENSES (live) ──────────────────────────── */}
      <SectionHeader
        icon={<Receipt className="size-3.5" />}
        label={
          <>
            Expenses
            <span
              className="inline-flex items-center gap-1 ml-2 text-[9.5px] text-brand-700 normal-case tracking-normal"
              title="Auto-polling every 5 seconds"
            >
              <Smartphone className="size-2.5 animate-pulse" /> live
            </span>
          </>
        }
        right={
          deal.expenseCap != null
            ? `cap ${formatMoney(deal.expenseCap)}`
            : undefined
        }
      />
      {expenses.length === 0 && insideCapRecoups.length === 0 ? (
        <li className="px-5 py-4 text-[12px] text-ink-500 italic border-b border-ink-100 list-none">
          No expenses yet. Use the [Send PM link] button below to get the
          production manager started.
        </li>
      ) : (
        <>
          {expenses.map((e) => {
            const fresh = freshIds.has(e.id);
            const fromPm = e.source === "pm_mobile";
            const vendor =
              e.description?.split(" · ")[0] ??
              CATEGORY_LABELS[e.category] ??
              e.category;
            return (
              <li
                key={e.id}
                className={cn(
                  "list-none px-5 py-2.5 border-b border-ink-100 transition-colors",
                  fresh && fromPm && "bg-brand-50",
                )}
                style={
                  fresh && fromPm
                    ? { animation: "flash-bg 1.5s ease-out 1" }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] font-medium text-ink-900">
                        {CATEGORY_LABELS[e.category] ?? e.category}
                      </span>
                      {e.receiptPath && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpenReceipt({
                              receiptPath: e.receiptPath!,
                              vendor,
                              amount: e.amount,
                              category: e.category,
                              submittedBy:
                                e.source === "pm_mobile"
                                  ? "Production manager"
                                  : "Booker",
                              submittedAt: e.enteredAt,
                            })
                          }
                          className="inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-500 hover:text-ink-800 underline underline-offset-2"
                          aria-label="View receipt"
                        >
                          <Paperclip className="size-2.5" />
                          View receipt
                        </button>
                      )}
                      {fresh && fromPm ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-100 text-brand-800 ring-1 ring-inset ring-brand-200">
                          just now · from production manager
                        </span>
                      ) : fromPm ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/60">
                          PM
                        </span>
                      ) : null}
                      <CapPill amount={e.amount} deal={deal} category={e.category} />
                    </div>
                    {e.description && (
                      <div className="text-[11.5px] text-ink-600 mt-0.5 truncate">
                        {e.description}
                      </div>
                    )}
                  </div>
                  <div className="font-mono tabular text-[13.5px] text-ink-900 shrink-0">
                    {formatMoney(e.amount)}
                  </div>
                </div>
              </li>
            );
          })}
          {insideCapRecoups.map((r) => {
            // Map deal-term recoups to a canned receipt by category. Marketing
            // recoups get the Spotify-style invoice; others fall back to the
            // production receipt rather than rendering nothing.
            const recoupReceipt =
              r.category === "marketing"
                ? "/receipts/marketing.svg"
                : "/receipts/production.svg";
            return (
              <li
                key={r.id}
                className="list-none px-5 py-2.5 border-b border-ink-100"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] font-medium text-ink-900">
                        {r.label}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenReceipt({
                            receiptPath: recoupReceipt,
                            vendor: r.label,
                            amount: r.amount,
                            category: r.category,
                            submittedBy: "Deal term",
                            submittedAt: new Date().toISOString(),
                          })
                        }
                        className="inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-500 hover:text-ink-800 underline underline-offset-2"
                        aria-label="View receipt"
                      >
                        <Paperclip className="size-2.5" />
                        View receipt
                      </button>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/60">
                        deal term · in-cap
                      </span>
                    </div>
                  </div>
                  <div className="font-mono tabular text-[13.5px] text-ink-900 shrink-0">
                    {formatMoney(r.amount)}
                  </div>
                </div>
              </li>
            );
          })}
        </>
      )}
      {/* ── Section B substructure (Phase 8.9.2) ──────────────────── */}
      {/* Original gross expenses subtotal — always shown. When no
           adjustment is present this is the only Section B subtotal
           before Net Expenses; when an adjustment lands, it sits
           above the editor / locked block so the chain
           original → adjustment → adjusted → cap → net reads cleanly. */}
      <DetailsSubtotal
        label={
          adjustmentAmount !== null
            ? "Original gross expenses"
            : "Gross expenses"
        }
        value={originalGross}
      />

      {adjustmentMode === "editor" && (
        <form
          onSubmit={handleSaveAdjustment}
          className="px-5 py-4 border-b border-ink-100 bg-amber-50/40 space-y-2.5"
        >
          <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-amber-900 font-medium">
            <AlertTriangle className="size-3.5" />
            Other adjustments
            <span className="ml-1 normal-case tracking-normal text-[10.5px] text-amber-700">
              · modifies gross expenses · cap logic re-evaluates · saving locks the row
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
            <input
              type="text"
              value={adjustmentDraft.description}
              onChange={(e) =>
                setAdjustmentDraft((d) => ({
                  ...d,
                  description: e.target.value,
                }))
              }
              placeholder="e.g. Adjusting for duplicate hospitality"
              disabled={adjustmentSaving}
              className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <input
              type="text"
              inputMode="decimal"
              value={adjustmentDraft.amount}
              onChange={(e) =>
                setAdjustmentDraft((d) => ({ ...d, amount: e.target.value }))
              }
              placeholder="-500 or 500"
              disabled={adjustmentSaving}
              className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-amber-300 font-mono"
            />
          </div>
          <div className="text-[10.5px] text-amber-800/90 leading-relaxed">
            <strong>Sign convention:</strong>{" "}
            <span className="text-rose-700">Negative</span> = remove or refund a
            charge (e.g. enter <span className="font-mono">-500</span> to remove
            $500 of duplicate hospitality).{" "}
            <span className="text-emerald-700">Positive</span> = add an additional
            charge. The adjustment changes the gross expense total, then cap
            logic re-evaluates.
          </div>
          {adjustmentError && (
            <div className="text-[11.5px] text-rose-700">{adjustmentError}</div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={adjustmentSaving}
              className="rounded-md bg-amber-700 hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[12.5px] font-medium px-3 py-1.5"
            >
              {adjustmentSaving
                ? "Saving…"
                : "Save and send revised settlement to agent"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdjustmentDraft({ description: "", amount: "" });
                setAdjustmentError(null);
              }}
              disabled={adjustmentSaving}
              className="text-[12.5px] text-ink-600 hover:text-ink-900 underline underline-offset-2"
            >
              Cancel
            </button>
            <span className="ml-auto text-[10.5px] text-amber-800">
              Saving invalidates any prior GM approval — you&apos;ll need to
              re-send to GM after the agent re-acknowledges.
            </span>
          </div>
        </form>
      )}
      {adjustmentMode === "locked" && adjustment && (
        <div className="px-5 py-3 border-b border-ink-100 bg-amber-50/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-amber-900 font-medium">
                <Lock className="size-3" />
                Other adjustments
              </div>
              <div className="text-[12.5px] text-ink-900 mt-1">
                &ldquo;{adjustment.description}&rdquo;
              </div>
              <div className="text-[10.5px] text-ink-500 mt-0.5">
                Saved by {adjustment.savedBy} ·{" "}
                {new Date(adjustment.savedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>
            <div
              className={cn(
                "font-mono tabular text-[14px] font-medium shrink-0",
                adjustment.amount < 0 ? "text-rose-700" : "text-emerald-700",
              )}
            >
              {adjustment.amount > 0 ? "+" : ""}
              {formatMoney(adjustment.amount)}
            </div>
          </div>
        </div>
      )}

      {/* Adjusted gross expenses subtotal — only when an adjustment is
           saved. This is the value the cap evaluates against. */}
      {adjustmentAmount !== null && (
        <DetailsSubtotal
          label="Adjusted gross expenses"
          value={adjustedGross}
        />
      )}

      {/* Cap logic — based on the current effective gross (adjusted if
           present, original otherwise). Hidden when there's no cap or
           the cap is unused. */}
      {deal.expenseCap != null && (
        <div className="px-5 py-2 border-b border-ink-100">
          <div className="text-[11px] text-ink-500">
            {capAbsorbed > 0
              ? `Cap logic: ${formatMoney(capAbsorbed)} over cap absorbed by venue`
              : adjustedGross === 0
                ? `Cap unused (${formatMoney(deal.expenseCap)})`
                : `Cap logic: under cap (${formatMoney(deal.expenseCap)}), actual used`}
          </div>
        </div>
      )}

      <DetailsSubtotal label="Net Expenses" value={netExpense} />

      {/* ── Section C — SETTLEMENT TO ARTIST (clean, single source) ─ */}
      <SectionHeader
        icon={<Wallet className="size-3.5" />}
        label="Settlement to artist"
      />
      <DetailsRow label="Net Box Office" value={netBoxOffice} dim />
      <DetailsRow label="− Net Expenses" value={-netExpense} dim />
      {netStep && (
        <DetailsRow
          label="= Net pool"
          value={result.netBoxOffice}
          note="net to artist pool"
        />
      )}
      {branchStep && (
        <DetailsRow
          label={branchStep.label}
          value={branchStep.value}
          note={branchStep.formula}
        />
      )}
      <DetailsTotal label="Total to artist" value={result.totalToArtist} />

      <style>{`
        @keyframes flash-bg {
          0% { background-color: rgb(220 252 231); }
          40% { background-color: rgb(220 252 231); }
          100% { background-color: transparent; }
        }
      `}</style>
      <ReceiptModal data={openReceipt} onClose={() => setOpenReceipt(null)} />
    </section>
  );
}

function SectionHeader({
  icon,
  label,
  right,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-2 bg-ink-50/60 border-b border-ink-100 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-ink-700 font-medium">
        {icon}
        {label}
      </div>
      {right && (
        <span className="text-[10.5px] text-ink-500">{right}</span>
      )}
    </div>
  );
}

function DetailsRow({
  label,
  value,
  note,
  dim,
}: {
  label: React.ReactNode;
  value: number;
  note?: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-5 py-2 border-b border-ink-100 flex items-center justify-between gap-2",
        dim && "text-ink-600",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px]">{label}</div>
        {note && (
          <div className="text-[11px] text-ink-500 mt-0.5 truncate font-mono">
            {note}
          </div>
        )}
      </div>
      <div
        className={cn(
          "font-mono tabular shrink-0",
          dim ? "text-[13px] text-ink-700" : "text-[13.5px] text-ink-900",
          value < 0 && !dim && "text-rose-700",
        )}
      >
        {formatMoney(value)}
      </div>
    </div>
  );
}

function DetailsSubtotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-5 py-2.5 border-b border-ink-200 bg-ink-50/40 flex items-center justify-between gap-2">
      <span className="text-[12px] uppercase tracking-wider text-ink-700 font-medium">
        Subtotal · {label}
      </span>
      <span className="font-mono tabular text-[14px] text-ink-900 font-medium">
        {formatMoney(value)}
      </span>
    </div>
  );
}

function DetailsTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-5 py-3 bg-brand-50/40 flex items-center justify-between gap-2">
      <span className="text-[13px] text-brand-900 font-medium">{label}</span>
      <span className="font-mono tabular text-[20px] text-brand-900 font-medium">
        {formatMoney(value)}
      </span>
    </div>
  );
}

function CapPill({
  amount,
  deal,
  category,
}: {
  amount: number;
  deal: Deal;
  category: string;
}) {
  // Hospitality has its own sub-cap; render that pill when relevant.
  if (
    category === "hospitality" &&
    deal.hospitalityCap != null &&
    amount > deal.hospitalityCap
  ) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200">
        over hospitality cap
      </span>
    );
  }
  if (category === "hospitality") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200">
        hospitality cap
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-ink-50 text-ink-700 ring-1 ring-inset ring-ink-200/60">
      in-cap
    </span>
  );
}
