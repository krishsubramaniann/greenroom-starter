import { cn } from "@/lib/utils";

/**
 * Phase 7.5 lifecycle bar — 7 stages reframed around the deal capture +
 * expense confirmation + agent sign-off pipeline (no more walkthrough).
 *
 *   1. Deal draft        — deal row exists (capture has been saved)
 *   2. Deal submitted    — same row + share_link generated (auto on save)
 *   3. Deal in review    — agent opened the deal share link
 *   4. Deal signed       — deal.confirmedAt set (all ambiguities resolved)
 *   5. Expenses          — settlement.expensesConfirmedAt set by Mariana
 *   6. Finalized/Disputed— single slot, flips amber when disputed
 *   7. Paid              — wire confirmed (settlement.paidAt)
 *
 * Caller computes the stage state from the resource graph and hands it
 * to the bar as a `LifecycleState` so render logic stays declarative.
 */

export type StageState = "pending" | "active" | "complete" | "warning";

export type LifecycleState = {
  dealDraft: StageState;
  dealSubmitted: StageState;
  dealInReview: StageState;
  dealSigned: StageState;
  expensesConfirmed: StageState;
  /** Either "Finalized" (complete) or "Disputed" (warning). Determines both
   *  the label and the tone of the 6th stop. */
  outcome: { label: "Finalized" | "Disputed"; state: StageState };
  /** Stage 7 flips between "Paid" (green) and "On hold" (amber). A GM
   *  hold ≠ a payment, so the dot can't stay green just because we're
   *  past the agent-ack milestone. Optional reason surfaces below the
   *  label when state="warning". */
  paid: { label: "Paid" | "On hold"; state: StageState; reason?: string };
};

const STOPS = [
  { key: "dealDraft", label: "Deal draft" },
  { key: "dealSubmitted", label: "Deal submitted" },
  { key: "dealInReview", label: "Deal in review" },
  { key: "dealSigned", label: "Deal signed" },
  { key: "expensesConfirmed", label: "Expenses" },
  { key: "outcome", label: null }, // label comes from state.outcome
  { key: "paid", label: "Paid" },
] as const;

function classesFor(state: StageState, isOutcomeWarning: boolean) {
  if (state === "complete" && !isOutcomeWarning) {
    return { dot: "bg-brand-700", text: "text-brand-800" };
  }
  if (state === "complete" && isOutcomeWarning) {
    return { dot: "bg-rose-600", text: "text-rose-800" };
  }
  if (state === "warning") {
    return { dot: "bg-rose-600 ring-2 ring-rose-200", text: "text-rose-900" };
  }
  if (state === "active") {
    return { dot: "bg-brand-700 ring-2 ring-brand-200", text: "text-brand-900" };
  }
  return { dot: "bg-ink-200", text: "text-ink-400" };
}

type Props = { state: LifecycleState };

export function LifecycleBar({ state }: Props) {
  return (
    <ol className="flex items-center gap-2 w-full overflow-x-auto py-2">
      {STOPS.map((stop, idx) => {
        let ss: StageState;
        let label: string;
        let isWarning = false;
        let reason: string | undefined;
        if (stop.key === "outcome") {
          ss = state.outcome.state;
          label = state.outcome.label;
          isWarning =
            state.outcome.label === "Disputed" && state.outcome.state !== "pending";
        } else if (stop.key === "paid") {
          ss = state.paid.state;
          label = state.paid.label;
          isWarning =
            state.paid.label === "On hold" && state.paid.state !== "pending";
          reason = state.paid.reason;
        } else {
          ss = state[stop.key];
          label = stop.label as string;
        }
        const { dot, text } = classesFor(ss, isWarning);

        // The connector line lights up only when both adjacent stops are
        // complete (signals continuous lineage).
        const next = STOPS[idx + 1];
        let nextSs: StageState = "pending";
        if (next) {
          if (next.key === "outcome") nextSs = state.outcome.state;
          else if (next.key === "paid") nextSs = state.paid.state;
          else nextSs = state[next.key];
        }
        const connectorComplete =
          ss === "complete" && next != null && nextSs !== "pending";

        return (
          <li key={stop.key} className="flex items-center gap-2 min-w-fit">
            <div className="flex flex-col items-center min-w-[88px]">
              <span
                className={cn("size-3 rounded-full shrink-0 shadow-sm", dot)}
                aria-current={ss === "active" ? "step" : undefined}
              />
              <span
                className={cn(
                  "mt-1.5 text-[11px] font-medium whitespace-nowrap",
                  text,
                )}
              >
                {label}
              </span>
              {reason && (
                <span
                  className="text-[9.5px] text-amber-700/80 mt-0.5 max-w-[120px] truncate"
                  title={reason}
                >
                  “{reason}”
                </span>
              )}
            </div>
            {next && (
              <div
                className={cn(
                  "h-px flex-1 min-w-[20px]",
                  connectorComplete ? "bg-brand-300" : "bg-ink-200",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Derive the LifecycleState from raw show + deal + settlement + share-link
 * inputs. Co-located here so the bar's contract stays single-purpose.
 */
export function deriveLifecycleState(input: {
  hasDeal: boolean;
  dealConfirmedAt: Date | null;
  dealShareAccessedAt: Date | null;
  expensesConfirmedAt: Date | null;
  settlementStatus:
    | "draft"
    | "submitted"
    | "in_review"
    | "signed"
    | "disputed"
    | "revised"
    | "finalized"
    | "paid"
    | "voided"
    | null;
  paidAt: Date | null;
  gmApprovedAt?: Date | null;
  gmHeldAt?: Date | null;
  gmHoldReason?: string | null;
}): LifecycleState {
  const {
    hasDeal,
    dealConfirmedAt,
    dealShareAccessedAt,
    expensesConfirmedAt,
    settlementStatus,
    paidAt,
    gmApprovedAt,
    gmHeldAt,
    gmHoldReason,
  } = input;

  const dealDraft: StageState = hasDeal ? "complete" : "pending";
  const dealSubmitted: StageState = hasDeal ? "complete" : "pending";
  const dealInReview: StageState = dealShareAccessedAt
    ? "complete"
    : hasDeal
      ? "active"
      : "pending";
  const dealSigned: StageState = dealConfirmedAt ? "complete" : "pending";
  const expensesConfirmed: StageState = expensesConfirmedAt
    ? "complete"
    : dealConfirmedAt
      ? "active"
      : "pending";

  // Outcome stage logic — flips based on settlement status.
  let outcome: LifecycleState["outcome"];
  if (settlementStatus === "disputed" || settlementStatus === "revised") {
    outcome = { label: "Disputed", state: "warning" };
  } else if (
    settlementStatus === "finalized" ||
    settlementStatus === "paid" ||
    settlementStatus === "signed"
  ) {
    outcome = { label: "Finalized", state: "complete" };
  } else if (expensesConfirmedAt) {
    outcome = { label: "Finalized", state: "active" };
  } else {
    outcome = { label: "Finalized", state: "pending" };
  }

  // Stage 7 — Paid only when the GM has explicitly approved the wire. The
  // agent's acknowledgement (which flips settlement.status to "finalized")
  // is captured in stage 6, NOT here — paying happens after the GM signs
  // off, never before. A standalone hold holds amber; nothing else moves
  // the dot off grey.
  //
  // Note `paidAt` is set as a side-effect of gm-approve, so checking
  // gmApprovedAt is sufficient. Don't piggyback on `settlementStatus ===
  // "finalized"` here — that would mean agent acknowledge alone lights
  // the dot, which is the bug Phase 8.6 is here to fix.
  let paid: LifecycleState["paid"];
  if (gmApprovedAt) {
    paid = { label: "Paid", state: "complete" };
  } else if (gmHeldAt) {
    paid = {
      label: "On hold",
      state: "warning",
      reason: gmHoldReason ?? undefined,
    };
  } else {
    paid = { label: "Paid", state: "pending" };
  }
  // paidAt is intentionally not consulted — kept on the input shape for
  // symmetry with callers but settlementStatus "paid" / paidAt aren't
  // signals we trust here. gmApprovedAt is the canonical "wire released"
  // marker; everything else flows from it.
  void paidAt;

  return {
    dealDraft,
    dealSubmitted,
    dealInReview,
    dealSigned,
    expensesConfirmed,
    outcome,
    paid,
  };
}
