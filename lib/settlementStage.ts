/**
 * Settlement lifecycle helpers.
 *
 * The settlement state machine:
 *
 *   draft → submitted → in_review → signed → finalized → paid
 *                              \→ disputed → revised ↗
 *
 *   voided is a terminal off-ramp (cancelled show / scrapped settlement)
 */

import type { Settlement, SettlementStage } from "@/db/schema";

export const STAGE_ORDER: SettlementStage[] = [
  "draft",
  "submitted",
  "in_review",
  "signed",
  "disputed",
  "revised",
  "finalized",
  "paid",
];

export const STAGE_LABELS: Record<SettlementStage, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  signed: "Signed",
  disputed: "Disputed",
  revised: "Revised",
  finalized: "Finalized",
  paid: "Paid",
  voided: "Voided",
};

export const STAGE_DESCRIPTIONS: Record<SettlementStage, string> = {
  draft:
    "Mariana is still entering numbers. Not yet sent to the artist team.",
  submitted:
    "Sent to the artist's tour manager. Waiting for them to start review.",
  in_review:
    "The artist team has opened the settlement and is reviewing line items.",
  signed:
    "The artist team has approved the math. Money has not yet moved.",
  disputed:
    "At least one line item is contested. The settlement is on hold.",
  revised:
    "A revised version has been sent in response to a dispute. Awaiting acceptance.",
  finalized:
    "The revised settlement has been agreed. Awaiting payment.",
  paid: "Money has moved. The settlement is closed.",
  voided:
    "The settlement was scrapped (cancelled show, force majeure, etc.).",
};

/** Visual style hints for each stage — used by the UI. */
export const STAGE_TONES: Record<
  SettlementStage,
  "neutral" | "active" | "complete" | "warning" | "danger"
> = {
  draft: "active",
  submitted: "active",
  in_review: "active",
  signed: "complete",
  disputed: "warning",
  revised: "warning",
  finalized: "complete",
  paid: "complete",
  voided: "danger",
};

/** What stage transitions are available from a given stage? */
export function nextStages(stage: SettlementStage): SettlementStage[] {
  switch (stage) {
    case "draft":
      return ["submitted", "voided"];
    case "submitted":
      return ["in_review", "voided"];
    case "in_review":
      return ["signed", "disputed"];
    case "signed":
      return ["paid"];
    case "disputed":
      return ["revised", "voided"];
    case "revised":
      return ["finalized", "disputed"];
    case "finalized":
      return ["paid"];
    case "paid":
      return [];
    case "voided":
      return [];
  }
}

/**
 * Phase 8.9.1 — derived display status for the top-of-page badge.
 * Combines `shows.status` (the booking-pipeline DB value) with the
 * live settlement state so reviewers see "Disputed" / "In review" /
 * "Finalized" / "Settled" in real time rather than the stale DB
 * column. Order matters: settle-page states win over the show status
 * when both are present.
 */
export type DisplayStatus =
  | "booked"
  | "advanced"
  | "day_of"
  | "settled"
  | "closed"
  | "disputed"
  | "in_review"
  | "finalized";

export function deriveDisplayStatus(input: {
  showStatus: "booked" | "advanced" | "day_of" | "settled" | "closed";
  settlement: {
    status?: SettlementStage | null;
    gmApprovedAt?: Date | null;
    finalizedAt?: Date | null;
    disputedAt?: Date | null;
    adjustmentSavedAt?: Date | null;
  } | null;
}): DisplayStatus {
  const s = input.settlement;
  if (!s) return input.showStatus;
  if (s.gmApprovedAt) return "settled";
  // adjustmentSavedAt set + still disputed = "In review" (waiting for
  // the agent's re-acknowledgement). If the agent has since re-ack'd,
  // finalizedAt will be newer than adjustmentSavedAt and we fall
  // through to "finalized".
  if (
    s.adjustmentSavedAt &&
    (!s.finalizedAt || s.finalizedAt < s.adjustmentSavedAt)
  ) {
    return "in_review";
  }
  if (
    s.status === "disputed" ||
    (s.disputedAt && (!s.finalizedAt || s.finalizedAt < s.disputedAt))
  ) {
    return "disputed";
  }
  if (s.finalizedAt || s.status === "finalized" || s.status === "signed") {
    return "finalized";
  }
  return input.showStatus;
}

/** Returns the stages this settlement has been through, in order, with timestamps. */
export function stageHistory(s: Settlement) {
  const history: { stage: SettlementStage; at: Date }[] = [];
  if (s.draftedAt) history.push({ stage: "draft", at: s.draftedAt });
  if (s.submittedAt) history.push({ stage: "submitted", at: s.submittedAt });
  if (s.reviewStartedAt)
    history.push({ stage: "in_review", at: s.reviewStartedAt });
  if (s.disputedAt) history.push({ stage: "disputed", at: s.disputedAt });
  if (s.revisedAt) history.push({ stage: "revised", at: s.revisedAt });
  if (s.signedAt) history.push({ stage: "signed", at: s.signedAt });
  if (s.finalizedAt) history.push({ stage: "finalized", at: s.finalizedAt });
  if (s.paidAt) history.push({ stage: "paid", at: s.paidAt });
  return history.sort((a, b) => a.at.getTime() - b.at.getTime());
}
