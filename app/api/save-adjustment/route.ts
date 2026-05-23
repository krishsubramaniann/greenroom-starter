/**
 * POST /api/save-adjustment
 *
 * Mariana hit [Save and send revised settlement to agent] on the
 * Other-adjustments row in Section B of /shows/[id]/settle. Captures a
 * single signed-dollar adjustment line (description + amount) on the
 * settlement, invalidates any prior GM approval, and clears the agent's
 * disputed status so the share link is ready for re-review.
 *
 * One-shot: if adjustmentSavedAt is already set, this 400s — the row
 * is locked permanently after first save. Re-disputes after that point
 * stay locked too.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  settlements,
  deals,
  shareLinks,
  activityEvents,
  ticketSales as ticketSalesTable,
  expenses as expensesTable,
  comps as compsTable,
} from "@/db/schema";
import { calculateSettlementV2 } from "@/lib/dealMathV2";

const PM_ACTOR_NAME = "Mariana Reyes";
const PM_ACTOR_ROLE = "Booker";

type Body = {
  showId?: string;
  description?: string;
  amount?: number;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { showId, description, amount } = body;
  if (!showId) {
    return NextResponse.json({ error: "showId required" }, { status: 400 });
  }
  if (!description?.trim()) {
    return NextResponse.json(
      { error: "description required" },
      { status: 400 },
    );
  }
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return NextResponse.json(
      { error: "amount must be a finite number" },
      { status: 400 },
    );
  }

  const [settlement] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.showId, showId));
  if (!settlement) {
    return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
  }
  if (settlement.adjustmentSavedAt) {
    return NextResponse.json(
      { error: "Adjustment already saved — row is locked" },
      { status: 400 },
    );
  }
  if (!settlement.disputedAt) {
    return NextResponse.json(
      { error: "Adjustment row is only editable when a dispute is active" },
      { status: 400 },
    );
  }

  const wasGmApproved = settlement.gmApprovedAt != null;
  const now = new Date();
  const trimmedDescription = description.trim();

  // Phase 8.9.2 — recompute the canonical pre/post-adjustment numbers
  // so (a) settlements.total_to_artist (read by /shows index, show
  // detail page, metrics, activity rollups) stays in sync, and (b)
  // the settlement_adjusted activity event payload captures the
  // structural diff for audit ("cap was protecting the artist" story).
  const [deal, showTickets, showExpenses, showComps] = await Promise.all([
    db.select().from(deals).where(eq(deals.showId, showId)).limit(1),
    db.select().from(ticketSalesTable).where(eq(ticketSalesTable.showId, showId)),
    db.select().from(expensesTable).where(eq(expensesTable.showId, showId)),
    db.select().from(compsTable).where(eq(compsTable.showId, showId)),
  ]);
  let newTotalToArtist: number | null = settlement.totalToArtist ?? null;
  let beforeSnapshot: {
    totalToArtist: number;
    netExpense: number;
    capAbsorbed: number;
    originalGross: number;
  } | null = null;
  let afterSnapshot: {
    totalToArtist: number;
    netExpense: number;
    capAbsorbed: number;
    adjustedGross: number;
  } | null = null;
  if (deal[0]) {
    const before = calculateSettlementV2({
      deal: deal[0],
      ticketSales: showTickets,
      expenses: showExpenses,
      comps: showComps,
      venueCapacity: 650,
    });
    const after = calculateSettlementV2({
      deal: deal[0],
      ticketSales: showTickets,
      expenses: showExpenses,
      comps: showComps,
      venueCapacity: 650,
      adjustment: { amount, description: trimmedDescription },
    });
    if (before.supported && after.supported) {
      newTotalToArtist = after.totalToArtist;
      // The before-engine had no adjustment, so totalExpenses = the
      // pre-adjustment net expense and originalGross is recoverable
      // via the "gross_expenses" trace step (or totalExpenses + any
      // capAbsorbed it ate, which is 0 in the no-adjustment case
      // when cap wasn't binding, else (cap absorbed)).
      const beforeOriginalGross =
        before.trace.find((s) => s.key === "gross_expenses")?.value ??
        before.totalExpenses;
      const beforeCapAbsorbed =
        Math.max(0, beforeOriginalGross - (deal[0].expenseCap ?? Infinity));
      beforeSnapshot = {
        totalToArtist: before.totalToArtist,
        netExpense: before.totalExpenses,
        capAbsorbed: beforeCapAbsorbed,
        originalGross: beforeOriginalGross,
      };
      afterSnapshot = {
        totalToArtist: after.totalToArtist,
        netExpense: after.adjustmentApplied?.netExpense ?? after.totalExpenses,
        capAbsorbed: after.adjustmentApplied?.capAbsorbed ?? 0,
        adjustedGross:
          after.adjustmentApplied?.adjustedGross ?? beforeOriginalGross + amount,
      };
    }
  }

  // Persist the adjustment + invalidate GM approval in the same write
  // so polling/UI can't catch a half-applied state.
  await db
    .update(settlements)
    .set({
      adjustmentDescription: trimmedDescription,
      adjustmentAmount: amount,
      adjustmentSavedAt: now,
      adjustmentSavedBy: PM_ACTOR_NAME,
      totalToArtist: newTotalToArtist,
      // Clear GM approval — Mariana edited the math, so the prior
      // approval is no longer covering the current settlement.
      gmApprovedAt: null,
      paidAt: null,
      status: "disputed",
    })
    .where(eq(settlements.id, settlement.id));

  // Wipe any open gm_approval share_links so a fresh one is minted on
  // the next [Send to GM for wire approval] click.
  await db
    .delete(shareLinks)
    .where(
      and(
        eq(shareLinks.resourceType, "gm_approval"),
        eq(shareLinks.resourceId, settlement.id),
      ),
    );

  const dealRow = deal[0];

  // Audit trail — adjustment first, then the GM-approval invalidation if
  // it actually applied.
  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: dealRow?.externalId ?? null,
    showId,
    settlementId: settlement.id,
    eventType: "settlement_adjusted",
    actorType: "user",
    actorName: PM_ACTOR_NAME,
    actorRole: PM_ACTOR_ROLE,
    summary: `Mariana saved adjustment · ${formatSignedAmount(amount)} · "${trimmedDescription.slice(0, 80)}${trimmedDescription.length > 80 ? "…" : ""}"`,
    payloadJson: JSON.stringify({
      description: trimmedDescription,
      adjustmentAmount: amount,
      surface: "settle_page",
      settlementId: settlement.id,
      // Phase 8.9.2 — structural before/after so the audit trail
      // proves whether the cap absorbed the change or it flowed
      // through to the artist total.
      originalGross: beforeSnapshot?.originalGross ?? null,
      adjustedGross: afterSnapshot?.adjustedGross ?? null,
      capAbsorbedBefore: beforeSnapshot?.capAbsorbed ?? null,
      capAbsorbedAfter: afterSnapshot?.capAbsorbed ?? null,
      netExpenseBefore: beforeSnapshot?.netExpense ?? null,
      netExpenseAfter: afterSnapshot?.netExpense ?? null,
      totalToArtistBefore: beforeSnapshot?.totalToArtist ?? null,
      totalToArtistAfter: afterSnapshot?.totalToArtist ?? null,
    }),
    occurredAt: now,
  });

  if (wasGmApproved) {
    await db.insert(activityEvents).values({
      id: `ae_${randomUUID()}`,
      dealId: dealRow?.externalId ?? null,
      showId,
      settlementId: settlement.id,
      eventType: "gm_approval_invalidated",
      actorType: "system",
      actorName: "Greenroom",
      actorRole: "system",
      summary:
        "GM approval invalidated · settlement edited after wire release",
      payloadJson: JSON.stringify({
        reason: "settlement_adjusted",
      }),
      occurredAt: new Date(now.getTime() + 1),
    });
  }

  // Pull the agent's settlement share link so the response can hand the
  // client back a fresh "ready for re-review" url if it needs one.
  const [agentLink] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.resourceType, "settlement"),
        eq(shareLinks.resourceId, settlement.id),
      ),
    )
    .orderBy(desc(shareLinks.createdAt))
    .limit(1);

  return NextResponse.json({
    ok: true,
    adjustmentSavedAt: now.toISOString(),
    adjustmentDescription: trimmedDescription,
    adjustmentAmount: amount,
    adjustmentSavedBy: PM_ACTOR_NAME,
    gmApprovalInvalidated: wasGmApproved,
    agentShareLinkToken: agentLink?.id ?? null,
  });
}

function formatSignedAmount(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (amount < 0) return `-${formatted}`;
  if (amount > 0) return `+${formatted}`;
  return formatted;
}
