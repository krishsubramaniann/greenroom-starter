"use client";

/**
 * Agent settlement preview — Phase 7.5 clean one-pager.
 *
 * Read-only. Shows the same SettlementDetails Mariana sees (sections
 * A/B/C, no polling because the figures are frozen at send-time) plus a
 * deal-terms summary and a Total to Artist headline. Two bottom CTAs:
 *
 *   [Acknowledge & accept]   → /api/agent-acknowledge  (marks Finalized)
 *   [Dispute / request changes] → /api/agent-dispute   (marks Disputed,
 *                                                       captures reason)
 *
 * Once the agent has acted, the page shows a confirmation state instead
 * of the action bar.
 */

import { useMemo, useState } from "react";
import { Check, HelpCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlainBadge } from "@/components/ui/badge";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  SettlementDetails,
  type AdjustmentDetails,
} from "@/app/shows/[id]/settle/SettlementDetails";
import type { DetailsExpense } from "@/app/shows/[id]/settle/SettlementDetails";
import type { SettlementResultV2 } from "@/lib/dealMathV2";
import type {
  Deal,
  Show,
  Artist,
  Settlement,
  TicketSale,
  Comp,
} from "@/db/schema";

const DEAL_TYPE_LABELS: Record<Deal["dealType"], string> = {
  flat: "Flat guarantee",
  vs: "Vs (guarantee vs %)",
  percentage_of_net: "Percentage of net",
  percentage_of_gross: "Percentage of gross",
  door: "Door deal",
};

type Props = {
  token: string;
  deal: Deal;
  show: Show;
  artist: Artist;
  settlement: Settlement;
  result: SettlementResultV2;
  agentName: string;
  agencyName: string | null;
  ticketSales: TicketSale[];
  comps: Comp[];
  initialExpenses: DetailsExpense[];
  signoffStatus: "open" | "agreed" | "questions";
  signoffText: string | null;
  signoffByName: string | null;
  signoffAt: Date | null;
};

export function AgentArtifact({
  token,
  deal,
  show,
  artist,
  settlement,
  result,
  agentName,
  agencyName,
  ticketSales,
  comps,
  initialExpenses,
  signoffStatus,
  signoffByName,
  signoffAt,
  signoffText,
}: Props) {
  const [status, setStatus] = useState(signoffStatus);
  const [stamp, setStamp] = useState<{
    name: string | null;
    at: Date | null;
    text: string | null;
  }>({ name: signoffByName, at: signoffAt, text: signoffText });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  // Phase 8.9 — Mariana saved a single-line adjustment after the agent
  // disputed. We surface a "Updated by Mariana" banner at the top,
  // inject the adjustment line into Section C, and reopen both CTAs
  // for a second pass (Acknowledge or re-Dispute). The previous
  // dispute reason is shown as an indicator below the total.
  const adjustment: AdjustmentDetails | null = useMemo(() => {
    if (
      !settlement.adjustmentSavedAt ||
      settlement.adjustmentDescription == null ||
      settlement.adjustmentAmount == null
    ) {
      return null;
    }
    return {
      description: settlement.adjustmentDescription,
      amount: settlement.adjustmentAmount,
      savedAt:
        typeof settlement.adjustmentSavedAt === "string"
          ? settlement.adjustmentSavedAt
          : settlement.adjustmentSavedAt.toISOString(),
      savedBy: settlement.adjustmentSavedBy ?? "Booker",
    };
  }, [
    settlement.adjustmentSavedAt,
    settlement.adjustmentDescription,
    settlement.adjustmentAmount,
    settlement.adjustmentSavedBy,
  ]);
  // Re-review mode = an adjustment is saved AND the agent hasn't
  // re-acknowledged yet. Once they re-ack (status flips to "agreed")
  // we collapse back to the normal accepted-stamp footer.
  const reReviewMode = adjustment != null && status === "questions";
  // Capture the prior dispute info before the agent re-acts in this
  // session (the stamp state will overwrite signoffAt/Text on click).
  const priorDispute = useMemo(() => {
    if (!reReviewMode || !signoffAt || !signoffText) return null;
    return { at: signoffAt, text: signoffText };
  }, [reReviewMode, signoffAt, signoffText]);
  // Phase 8.9.1 — the engine bakes the adjustment into the canonical
  // result.totalToArtist; surfaces read that directly so the number
  // matches across Mariana's settle page, this agent view, and the GM
  // mobile view.
  const headerTotal = result.supported ? result.totalToArtist : 0;

  if (!result.supported) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-[20px] font-display text-ink-900">
            Settlement not available
          </h1>
          <p className="text-[13px] text-ink-600">{result.reason}</p>
        </div>
      </div>
    );
  }

  async function handleAcknowledge() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Acknowledge failed");
      }
      const data = await res.json();
      setStatus("agreed");
      setStamp({
        name: agentName,
        at: new Date(data.acknowledgedAt),
        text: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Acknowledge failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDispute() {
    if (!disputeReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, disputeReason: disputeReason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Dispute failed");
      }
      const data = await res.json();
      setStatus("questions");
      setStamp({
        name: agentName,
        at: new Date(data.disputedAt),
        text: disputeReason.trim(),
      });
      setDisputeOpen(false);
      setDisputeReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dispute failed");
    } finally {
      setBusy(false);
    }
  }

  // Standard flow: any non-open signoff status means the agent has acted
  // and we show the stamp. Re-review override: when Mariana adjusted
  // post-dispute, status is still "questions" but we treat the page as
  // unresolved so the CTAs reopen.
  const agentResponded =
    (status === "agreed" || status === "questions") && !reReviewMode;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="bg-white border-b border-ink-200">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-5 sm:py-6">
          <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
            The Crescent · settlement preview for review
          </div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <h1 className="text-[22px] sm:text-[26px] font-display text-ink-900 leading-tight">
              {artist.name}
            </h1>
            <span className="text-ink-500 text-[14px]">
              · {formatShowDateFull(show.date)}
            </span>
          </div>
          <div className="mt-3 font-mono tabular text-[32px] sm:text-[40px] text-ink-900 leading-none">
            {formatMoney(headerTotal)}
          </div>
          <div className="text-[12px] text-ink-500 mt-1">
            Total to artist · for {agentName}
            {agencyName ? ` (${agencyName})` : ""}
            {adjustment && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-800 font-medium">
                · revised
              </span>
            )}
          </div>
          {priorDispute && (
            <div className="mt-3 text-[11.5px] text-amber-800 bg-amber-50/60 border border-amber-200/60 rounded-md px-3 py-1.5">
              You previously disputed on{" "}
              {new Date(priorDispute.at).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              : &ldquo;{priorDispute.text}&rdquo;
            </div>
          )}
        </div>
      </header>

      {adjustment && (
        <div className="bg-amber-50/70 border-b border-amber-200/60">
          <div className="max-w-3xl mx-auto px-5 sm:px-6 py-3 flex items-start gap-2.5">
            <RefreshCw className="size-4 text-amber-800 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-[12.5px] text-amber-900 font-medium">
                Updated by {adjustment.savedBy} on{" "}
                {new Date(adjustment.savedAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
              <div className="text-[11.5px] text-ink-700 mt-0.5 leading-relaxed">
                A single adjustment line was added in response to your
                dispute. Review the revised settlement below — see
                &ldquo;Other adjustments&rdquo; in Section C.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-6 space-y-5 pb-40">
        {/* Deal terms summary — 4 fields, read-only */}
        <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <header className="px-4 py-3 border-b border-ink-100">
            <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
              Deal terms
            </div>
          </header>
          <div className="grid grid-cols-2 gap-3 p-4">
            <Field
              label="Type"
              value={DEAL_TYPE_LABELS[deal.dealType] ?? deal.dealType}
            />
            <Field
              label="Guarantee"
              value={
                deal.guaranteeAmount != null
                  ? formatMoney(deal.guaranteeAmount)
                  : "—"
              }
              mono
            />
            <Field
              label={`% of ${deal.percentageBasis ?? "—"}`}
              value={
                deal.percentage != null
                  ? `${(deal.percentage * 100).toFixed(0)}%`
                  : "—"
              }
              mono
            />
            <Field
              label="Expense cap"
              value={
                deal.expenseCap != null ? formatMoney(deal.expenseCap) : "—"
              }
              mono
            />
          </div>
        </section>

        {/* Settlement Details — sections A/B/C, read-only */}
        <SettlementDetails
          deal={deal}
          ticketSales={ticketSales}
          comps={comps}
          initialExpenses={initialExpenses}
          venueCapacity={650}
          showId={show.id}
          live={false}
          adjustment={adjustment}
        />

        {/* Error banner */}
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
            {error}
          </div>
        )}
      </div>

      {/* Sticky footer — sign-off actions */}
      <footer className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-ink-200">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-3">
          {agentResponded ? (
            <ResponseStamp
              status={status}
              stamp={stamp}
              agentName={agentName}
              agencyName={agencyName}
            />
          ) : disputeOpen ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-medium text-amber-900">
                  What needs to change?
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDisputeOpen(false);
                    setDisputeReason("");
                  }}
                  aria-label="Close"
                  className="text-ink-500 hover:text-ink-800"
                >
                  <X className="size-4" />
                </button>
              </div>
              <textarea
                autoFocus
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={3}
                placeholder="Summarize what doesn't match your read."
                className="w-full px-3 py-2 text-[13px] rounded border border-ink-200 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDisputeOpen(false);
                    setDisputeReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onClick={handleDispute}
                  disabled={busy || !disputeReason.trim()}
                >
                  Send to Mariana
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[12px] text-ink-500 max-w-[55%]">
                Your review goes back to Mariana. The settlement isn&apos;t
                finalized until you accept.
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDisputeOpen(true)}
                  className="gap-1.5"
                >
                  <HelpCircle className="size-3.5" /> Dispute / request changes
                </Button>
                <Button
                  variant="brand"
                  size="lg"
                  onClick={handleAcknowledge}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <Check className="size-4" />
                  {busy ? "Acknowledging…" : "Acknowledge & accept"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
        {label}
      </div>
      <div
        className={cn(
          "text-[13px] text-ink-900 mt-0.5",
          mono && "font-mono tabular",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ResponseStamp({
  status,
  stamp,
  agentName,
  agencyName,
}: {
  status: "agreed" | "questions" | "open";
  stamp: { name: string | null; at: Date | null; text: string | null };
  agentName: string;
  agencyName: string | null;
}) {
  const isAgreed = status === "agreed";
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-[12px]">
      <div
        className={cn(
          "inline-flex items-start gap-2",
          isAgreed ? "text-brand-800" : "text-amber-800",
        )}
      >
        {isAgreed ? (
          <Check className="size-4 mt-0.5" />
        ) : (
          <HelpCircle className="size-4 mt-0.5" />
        )}
        <div>
          <div>
            {isAgreed ? "Acknowledged & accepted" : "Dispute submitted"} by{" "}
            <strong>{stamp.name ?? agentName}</strong>
            {stamp.at && (
              <>
                {" "}
                ·{" "}
                {new Date(stamp.at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            )}
          </div>
          {stamp.text && (
            <div className="text-ink-600 italic mt-1">“{stamp.text}”</div>
          )}
        </div>
      </div>
      <PlainBadge variant={isAgreed ? "brand" : "amber"}>
        {agencyName ?? "Agent"}
      </PlainBadge>
    </div>
  );
}
