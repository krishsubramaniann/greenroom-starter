"use client";

/**
 * Section B — Expenses breakdown.
 *
 * Phase 8.9.3 — extracted from SettlementDetails so both the settle
 * page and the show detail page render an identical structural view.
 * The settle page passes `variant="live"` to opt into the polling
 * pill, "just now" flash highlight, and per-row receipt buttons. The
 * show detail page passes `variant="readonly"` and gets a stripped
 * summary view (no receipts, no live pill, no editor — even when a
 * dispute is active and an adjustment hasn't been saved yet).
 *
 * Both consume the SAME engine-derived numbers (originalGross,
 * adjustedGross, capAbsorbed, netExpense) so the subtotals can't
 * drift between surfaces.
 */

import { Paperclip, Receipt, Smartphone, AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { Deal } from "@/db/schema";
import type { ReceiptModalData } from "@/app/shows/[id]/settle/ReceiptModal";
import type { AdjustmentDetails } from "@/app/shows/[id]/settle/SettlementDetails";

export type ExpensesBreakdownLineItem = {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  source: "manual" | "pm_mobile" | null;
  receiptPath: string | null;
  enteredAt: string;
  absorbedByVenue: boolean;
};

export type ExpensesBreakdownRecoup = {
  id: string;
  category: string;
  label: string;
  amount: number;
};

type Props = {
  deal: Deal;
  lineItems: ExpensesBreakdownLineItem[];
  insideCapRecoups: ExpensesBreakdownRecoup[];
  /** Engine-derived canonical numbers. Drive all subtotals in the panel. */
  originalGross: number;
  adjustedGross: number;
  capAbsorbed: number;
  netExpense: number;
  /** Locked adjustment, or null. */
  adjustment: AdjustmentDetails | null;
  /**
   * - "live"     — settle page: polling pill, "just now" flash highlight,
   *                receipt links, full row attribution, editor slot.
   * - "summary"  — show detail page: clean rollup. No PM/cap badges, no
   *                vendor descriptions, no receipt links, no adjustment
   *                description/attribution. Just categories + amounts +
   *                subtotals + cap logic.
   */
  variant: "live" | "summary";
  /** Optional ReactNode slot for the editor form (settle page only).
   *  Rendered in place of the locked adjustment row when provided. */
  editorSlot?: React.ReactNode;
  /** Live-mode "just now" flash set; empty/ignored in readonly mode. */
  freshIds?: Set<string>;
  /** Live-mode receipt modal opener. When null/undefined, the View
   *  receipt links are not rendered. */
  onOpenReceipt?: (data: ReceiptModalData) => void;
};

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

export function ExpensesBreakdown({
  deal,
  lineItems,
  insideCapRecoups,
  originalGross,
  adjustedGross,
  capAbsorbed,
  netExpense,
  adjustment,
  variant,
  editorSlot,
  freshIds,
  onOpenReceipt,
}: Props) {
  const live = variant === "live";
  const adjustmentExists = adjustment != null;
  const canOpenReceipts = live && typeof onOpenReceipt === "function";

  return (
    <>
      <SectionHeader
        icon={<Receipt className="size-3.5" />}
        label={
          <>
            Expenses
            {live && (
              <span
                className="inline-flex items-center gap-1 ml-2 text-[9.5px] text-brand-700 normal-case tracking-normal"
                title="Auto-polling every 5 seconds"
              >
                <Smartphone className="size-2.5 animate-pulse" /> live
              </span>
            )}
          </>
        }
        right={
          deal.expenseCap != null
            ? `cap ${formatMoney(deal.expenseCap)}`
            : undefined
        }
      />
      {lineItems.length === 0 && insideCapRecoups.length === 0 ? (
        <li className="px-5 py-4 text-[12px] text-ink-500 italic border-b border-ink-100 list-none">
          {live
            ? "No expenses yet. Use the [Send PM link] button below to get the production manager started."
            : "No expenses logged."}
        </li>
      ) : (
        <>
          {lineItems.map((e) => {
            const fresh = freshIds?.has(e.id) ?? false;
            const fromPm = e.source === "pm_mobile";
            const vendor =
              e.description?.split(" · ")[0] ??
              CATEGORY_LABELS[e.category] ??
              e.category;
            // Phase 8.9.4 — in summary mode, an "other" category with a
            // backline-ish description renders cleanly as "Backline" so
            // the rollup reads like a real category list.
            const summaryLabel =
              e.category === "other" &&
              e.description &&
              /backline/i.test(e.description)
                ? "Backline"
                : CATEGORY_LABELS[e.category] ?? e.category;
            return (
              <li
                key={e.id}
                className={cn(
                  "list-none px-5 py-2.5 border-b border-ink-100 transition-colors",
                  live && fresh && fromPm && "bg-brand-50",
                )}
                style={
                  live && fresh && fromPm
                    ? { animation: "flash-bg 1.5s ease-out 1" }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] font-medium text-ink-900">
                        {live
                          ? CATEGORY_LABELS[e.category] ?? e.category
                          : summaryLabel}
                      </span>
                      {canOpenReceipts && e.receiptPath && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenReceipt!({
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
                      {live && fresh && fromPm ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-100 text-brand-800 ring-1 ring-inset ring-brand-200">
                          just now · from production manager
                        </span>
                      ) : live && fromPm ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/60">
                          PM
                        </span>
                      ) : null}
                      {live && (
                        <CapPill
                          amount={e.amount}
                          deal={deal}
                          category={e.category}
                        />
                      )}
                    </div>
                    {live && e.description && (
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
                      {canOpenReceipts && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenReceipt!({
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
                      )}
                      {live && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/60">
                          deal term · in-cap
                        </span>
                      )}
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

      {/* Original / Gross subtotal — label flexes based on whether an
           adjustment is present. */}
      <DetailsSubtotal
        label={adjustmentExists ? "Original Gross Expenses" : "Gross Expenses"}
        value={originalGross}
      />

      {/* Adjustment block — settle page may pass an editor slot, else
           we render the locked summary when an adjustment exists. The
           show detail page passes neither, so during the dispute
           window (before save) nothing renders here. */}
      {editorSlot ?? null}
      {adjustmentExists && !editorSlot && live && (
        <div className="px-5 py-3 border-b border-ink-100 bg-amber-50/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-amber-900 font-medium">
                <Lock className="size-3" />
                Other adjustments
              </div>
              <div className="text-[12.5px] text-ink-900 mt-1">
                &ldquo;{adjustment!.description}&rdquo;
              </div>
              <div className="text-[10.5px] text-ink-500 mt-0.5">
                Saved by {adjustment!.savedBy} ·{" "}
                {new Date(adjustment!.savedAt).toLocaleString("en-US", {
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
                adjustment!.amount < 0 ? "text-rose-700" : "text-emerald-700",
              )}
            >
              {adjustment!.amount > 0 ? "+" : ""}
              {formatMoney(adjustment!.amount)}
            </div>
          </div>
        </div>
      )}
      {/* Summary variant: just label + signed amount, no attribution. */}
      {adjustmentExists && !editorSlot && !live && (
        <div className="px-5 py-2.5 border-b border-ink-100 flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-ink-900">Other adjustments</span>
          <span
            className={cn(
              "font-mono tabular text-[13.5px] shrink-0",
              adjustment!.amount < 0 ? "text-rose-700" : "text-emerald-700",
            )}
          >
            {adjustment!.amount > 0 ? "+" : ""}
            {formatMoney(adjustment!.amount)}
          </span>
        </div>
      )}

      {/* Adjusted gross subtotal — only when an adjustment is locked. */}
      {adjustmentExists && (
        <DetailsSubtotal
          label="Adjusted Gross Expenses"
          value={adjustedGross}
        />
      )}

      {/* Cap logic line — reflects current effective gross. */}
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

      {/* Final canonical Net Expenses subtotal that flows into Section C. */}
      <DetailsSubtotal label="Net Expenses" value={netExpense} />
    </>
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

function CapPill({
  amount,
  deal,
  category,
}: {
  amount: number;
  deal: Deal;
  category: string;
}) {
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
