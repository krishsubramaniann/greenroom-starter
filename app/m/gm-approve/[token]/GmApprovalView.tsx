"use client";

/**
 * GM approval view — mobile-optimized higher-level summary tailored to a
 * wire-release decision rather than line-by-line settlement review. The
 * GM is signing off on authorization, not auditing the math (the agent
 * already did that on the agent-share view).
 *
 * Layout:
 *   - Header (show name, date, venue)
 *   - Big number: Total to Artist
 *   - Summary card: gross, net expenses, settlement basis, deal type
 *   - Approval context: 4 green-check rows (Deal signed, Show complete,
 *     Expenses confirmed, Agent acknowledged)
 *   - CTAs: [Approve & release wire] (primary) / [Hold for review]
 *
 * Approve → confirmation screen. Hold → inline textarea, posts reason.
 */

import { useState } from "react";
import {
  Check,
  Clock,
  Loader2,
  Pause,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import type {
  Show,
  Artist,
  Venue,
  Deal,
  Settlement,
} from "@/db/schema";
import type { SettlementResultV2 } from "@/lib/dealMathV2";

type Props = {
  token: string;
  show: Show;
  artist?: Artist;
  venue?: Venue;
  deal: Deal;
  settlement: Settlement;
  result: SettlementResultV2;
  agentSignoffByName: string | null;
  agentSignoffAt: Date | null;
  initialApprovedAt: Date | null;
  initialHeldAt: Date | null;
  initialHoldReason: string | null;
};

const DEAL_TYPE_LABELS: Record<Deal["dealType"], string> = {
  flat: "Flat guarantee",
  vs: "Vs (guarantee vs %)",
  percentage_of_net: "Percentage of net",
  percentage_of_gross: "Percentage of gross",
  door: "Door deal",
};

function dateLine(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dateTimeLine(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function GmApprovalView({
  token,
  show,
  artist,
  venue,
  deal,
  settlement,
  result,
  agentSignoffByName,
  agentSignoffAt,
  initialApprovedAt,
  initialHeldAt,
  initialHoldReason,
}: Props) {
  const [busy, setBusy] = useState<"approve" | "hold" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<Date | string | null>(
    initialApprovedAt,
  );
  const [heldAt, setHeldAt] = useState<Date | string | null>(initialHeldAt);
  const [holdReason, setHoldReason] = useState<string | null>(
    initialHoldReason,
  );
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdDraft, setHoldDraft] = useState("");

  if (!result.supported) {
    return (
      <div className="min-h-screen bg-ink-900 text-white flex items-center justify-center px-6">
        <p className="text-[13px] text-ink-300">{result.reason}</p>
      </div>
    );
  }

  async function handleApprove() {
    setBusy("approve");
    setError(null);
    try {
      const res = await fetch("/api/gm-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Approve failed");
      }
      const data = await res.json();
      setApprovedAt(data.approvedAt);
      setHeldAt(null);
      setHoldReason(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleHold() {
    if (!holdDraft.trim()) return;
    setBusy("hold");
    setError(null);
    try {
      const res = await fetch("/api/gm-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: holdDraft.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Hold failed");
      }
      const data = await res.json();
      setHeldAt(data.heldAt);
      setHoldReason(holdDraft.trim());
      setApprovedAt(null);
      setHoldOpen(false);
      setHoldDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hold failed");
    } finally {
      setBusy(null);
    }
  }

  // State machine: fresh (no decision yet) / held (paused, awaiting action)
  // / approved (terminal). All three render the same page chrome — header,
  // big number, summary, approval context — with different status pills,
  // an optional hold-details panel, and different footer CTAs.
  const gmState: "fresh" | "held" | "approved" = approvedAt
    ? "approved"
    : heldAt
      ? "held"
      : "fresh";

  return (
    <div className="min-h-screen bg-ink-900 text-white">
      <div
        className={cn(
          "mx-auto max-w-[420px] px-4 py-5",
          gmState === "approved" ? "pb-12" : "pb-32",
        )}
      >
        <div className="flex items-center gap-2">
          <div className="text-[10.5px] uppercase tracking-wider text-ink-400 font-medium">
            {gmState === "approved"
              ? "Wire approved"
              : gmState === "held"
                ? "Wire on hold"
                : "Wire approval"}
          </div>
          {gmState === "approved" && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-900/60 text-brand-200 ring-1 ring-inset ring-brand-700">
              <Check className="size-2.5" /> approved
            </span>
          )}
          {gmState === "held" && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-900/60 text-amber-200 ring-1 ring-inset ring-amber-700">
              <Pause className="size-2.5" /> on hold
            </span>
          )}
        </div>
        <h1 className="text-[20px] font-display text-white mt-1 leading-tight">
          {artist?.name ?? "Show"}
        </h1>
        <p className="text-[12px] text-ink-400 mt-1">
          {formatShowDateFull(show.date)}
          {venue?.name && <span> · {venue.name}</span>}
        </p>

        {/* Big number */}
        <div className="mt-6">
          <div className="text-[10.5px] uppercase tracking-wider text-brand-300 font-medium">
            Total to artist
          </div>
          <div className="font-mono tabular text-[40px] text-white leading-none mt-1">
            {formatMoney(result.totalToArtist)}
          </div>
        </div>

        {/* Summary card */}
        <section className="mt-6 rounded-lg border border-ink-700 bg-ink-800/60 p-4 space-y-2.5">
          <SummaryRow
            label="Gross box office"
            value={formatMoney(result.grossBoxOffice)}
          />
          <SummaryRow
            label="Net expenses"
            value={`-${formatMoney(result.totalExpenses)}`}
          />
          <SummaryRow
            label="Settlement basis"
            value={
              result.branches.winner === "percentage"
                ? `${deal.percentage != null ? `${(deal.percentage * 100).toFixed(0)}% of net` : "Percentage"} (percentage branch)`
                : result.branches.winner === "guarantee"
                  ? "Guarantee branch"
                  : "—"
            }
          />
          <SummaryRow
            label="Deal type"
            value={
              deal.dealType === "vs" && deal.guaranteeAmount != null
                ? `Vs (guarantee ${formatMoney(deal.guaranteeAmount)} vs %)`
                : DEAL_TYPE_LABELS[deal.dealType] ?? deal.dealType
            }
          />
        </section>

        {/* Approval context — 4 green checks */}
        <section className="mt-5 rounded-lg border border-ink-700 bg-ink-800/60 p-4 space-y-2">
          <div className="text-[10.5px] uppercase tracking-wider text-ink-400 font-medium mb-1">
            Approval context
          </div>
          <ContextRow
            label="Deal signed"
            stamp={dateLine(deal.confirmedAt)}
            done={!!deal.confirmedAt}
          />
          <ContextRow
            label="Show complete"
            stamp={dateLine(show.endOfShowAt)}
            done={!!show.endOfShowAt}
          />
          <ContextRow
            label="Expenses confirmed by booker"
            stamp={dateTimeLine(settlement.expensesConfirmedAt)}
            done={!!settlement.expensesConfirmedAt}
          />
          <ContextRow
            label="Agent acknowledged"
            stamp={
              agentSignoffByName
                ? `${dateTimeLine(agentSignoffAt)} · ${agentSignoffByName}`
                : dateTimeLine(agentSignoffAt)
            }
            done={!!agentSignoffAt}
          />
        </section>

        {/* On-hold details (state = held) */}
        {gmState === "held" && (
          <section className="mt-5 rounded-lg border border-amber-700 bg-amber-950/30 p-4">
            <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-amber-300 font-medium">
              <Pause className="size-3" />
              On hold since {dateTimeLine(heldAt)}
            </div>
            {holdReason && (
              <p className="text-[12.5px] text-amber-100 italic mt-2 leading-relaxed">
                “{holdReason}”
              </p>
            )}
            <p className="text-[11px] text-amber-300/80 mt-2">
              Mariana sees this note on her settle page. Release the hold to
              approve, or leave it on hold while she addresses the question.
            </p>
          </section>
        )}

        {/* Approval stamp (state = approved) */}
        {gmState === "approved" && (
          <section className="mt-5 rounded-lg border border-brand-700 bg-brand-950/30 p-4">
            <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-brand-300 font-medium">
              <Check className="size-3" /> Wire scheduled for release
            </div>
            <p className="text-[12.5px] text-brand-100 mt-2 leading-relaxed">
              Approved by{" "}
              <strong className="text-white">Marcus Chen</strong> ·{" "}
              {dateTimeLine(approvedAt)}
            </p>
            <p className="text-[11px] text-brand-300/80 mt-2">
              You can close this tab. Mariana&apos;s page reflects the
              approval within a few seconds.
            </p>
          </section>
        )}

        {error && (
          <div className="mt-4 text-[12px] text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Sticky footer CTAs — state-driven. Approved state has no footer. */}
      {gmState !== "approved" && (
        <footer className="fixed bottom-0 inset-x-0 z-20 bg-ink-900/95 backdrop-blur border-t border-ink-700">
          <div className="mx-auto max-w-[420px] px-4 py-3">
            {holdOpen ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-amber-300 font-medium">
                    Why are you holding this?
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setHoldOpen(false);
                      setHoldDraft("");
                    }}
                    className="text-ink-400 hover:text-white"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <textarea
                  autoFocus
                  value={holdDraft}
                  onChange={(e) => setHoldDraft(e.target.value)}
                  rows={3}
                  placeholder="What's the question? (Mariana sees this)"
                  className="w-full px-3 py-2 rounded bg-ink-800 text-white text-[13px] border border-ink-700 placeholder-ink-500 focus:outline-none focus:border-amber-400 resize-none"
                />
                <button
                  type="button"
                  onClick={handleHold}
                  disabled={!holdDraft.trim() || busy === "hold"}
                  className={cn(
                    "w-full h-11 rounded-lg text-[13.5px] font-medium flex items-center justify-center gap-2",
                    holdDraft.trim() && busy !== "hold"
                      ? "bg-amber-600 hover:bg-amber-500 text-white"
                      : "bg-ink-700 text-ink-500",
                  )}
                >
                  {busy === "hold" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send hold to Mariana"
                  )}
                </button>
              </div>
            ) : gmState === "held" ? (
              // On-hold actionable state: release the hold (which approves) or
              // leave it on hold. "Continue hold" is no-op visual confirmation —
              // the GM can just close the tab.
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={busy === "approve"}
                  className={cn(
                    "w-full h-12 rounded-lg text-[14.5px] font-medium flex items-center justify-center gap-2",
                    busy === "approve"
                      ? "bg-ink-700 text-ink-500"
                      : "bg-brand-600 hover:bg-brand-500 text-white",
                  )}
                >
                  {busy === "approve" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Releasing hold…
                    </>
                  ) : (
                    <>
                      <Check className="size-4" />
                      Release hold &amp; approve &amp; release wire
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    /* no-op — keeping the hold in place. The GM can just
                       close the tab; Mariana's view is unchanged. */
                  }}
                  className="w-full h-11 rounded-lg bg-ink-800 hover:bg-ink-700 text-ink-200 text-[13.5px] font-medium flex items-center justify-center gap-2 border border-ink-700"
                >
                  <Pause className="size-4" />
                  Continue hold
                </button>
              </div>
            ) : (
              // Fresh state — original Approve / Hold CTAs.
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={busy === "approve"}
                  className={cn(
                    "w-full h-12 rounded-lg text-[15px] font-medium flex items-center justify-center gap-2",
                    busy === "approve"
                      ? "bg-ink-700 text-ink-500"
                      : "bg-brand-600 hover:bg-brand-500 text-white",
                  )}
                >
                  {busy === "approve" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Releasing wire…
                    </>
                  ) : (
                    <>
                      <Check className="size-4" />
                      Approve &amp; release wire
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setHoldOpen(true)}
                  className="w-full h-11 rounded-lg bg-ink-800 hover:bg-ink-700 text-ink-200 text-[13.5px] font-medium flex items-center justify-center gap-2 border border-ink-700"
                >
                  <Clock className="size-4" />
                  Hold for review
                </button>
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className="text-ink-400">{label}</span>
      <span className="text-white font-mono tabular text-right">{value}</span>
    </div>
  );
}

function ContextRow({
  label,
  stamp,
  done,
}: {
  label: string;
  stamp: string;
  done: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Check
          className={cn(
            "size-3.5 shrink-0",
            done ? "text-brand-400" : "text-ink-600",
          )}
        />
        <span className="text-[12.5px] text-white">{label}</span>
      </div>
      <span className="text-[11px] text-ink-400 text-right shrink-0">
        {stamp}
      </span>
    </div>
  );
}
