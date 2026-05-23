/**
 * GET /api/show-state?showId=<id>
 *
 * Lightweight polling endpoint used by the settle-page client to detect
 * cross-actor state changes (PM finalized, agent signed, etc.) without
 * a full server re-render. Returns just the deltas SettleCtaBar cares
 * about, keyed by show + most recent settlement share_link.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  shows,
  settlements,
  shareLinks,
  activityEvents,
} from "@/db/schema";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const showId = searchParams.get("showId");
  if (!showId) {
    return NextResponse.json({ error: "showId required" }, { status: 400 });
  }
  const [show] = await db.select().from(shows).where(eq(shows.id, showId));
  if (!show) {
    return NextResponse.json({ error: "show not found" }, { status: 404 });
  }
  const [settlement] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.showId, showId));
  const [link] = settlement
    ? await db
        .select()
        .from(shareLinks)
        .where(
          and(
            eq(shareLinks.resourceType, "settlement"),
            eq(shareLinks.resourceId, settlement.id),
          ),
        )
        .orderBy(desc(shareLinks.createdAt))
        .limit(1)
    : [];

  // Phase 8.9.6 — surface whether the most-recent pm_expenses_finalized
  // event was the "no expenses to report" path so SettleCtaBar's banner
  // can read the right copy without polling the activity feed.
  let pmNoExpensesToReport = false;
  if (show.pmExpensesFinalizedAt) {
    const [latestFinalize] = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.showId, showId),
          eq(activityEvents.eventType, "pm_expenses_finalized"),
        ),
      )
      .orderBy(desc(activityEvents.occurredAt))
      .limit(1);
    if (latestFinalize?.payloadJson) {
      try {
        const payload = JSON.parse(latestFinalize.payloadJson) as {
          noExpensesToReport?: boolean;
        };
        pmNoExpensesToReport = payload.noExpensesToReport === true;
      } catch {
        // best-effort
      }
    }
  }

  return NextResponse.json({
    endOfShowAt: show.endOfShowAt?.toISOString() ?? null,
    pmExpensesFinalizedAt: show.pmExpensesFinalizedAt?.toISOString() ?? null,
    expensesConfirmedAt: settlement?.expensesConfirmedAt?.toISOString() ?? null,
    settlementStatus: settlement?.status ?? null,
    agentSignoffStatus: link?.signoffStatus ?? null,
    agentSignoffByName: link?.signoffByName ?? null,
    agentSignoffAt: link?.signoffAt?.toISOString() ?? null,
    agentSignoffText: link?.signoffText ?? null,
    gmApprovedAt: settlement?.gmApprovedAt?.toISOString() ?? null,
    gmHeldAt: settlement?.gmHeldAt?.toISOString() ?? null,
    gmHoldReason: settlement?.gmHoldReason ?? null,
    paidAt: settlement?.paidAt?.toISOString() ?? null,
    agentDisputedAt: settlement?.disputedAt?.toISOString() ?? null,
    adjustmentDescription: settlement?.adjustmentDescription ?? null,
    adjustmentAmount: settlement?.adjustmentAmount ?? null,
    adjustmentSavedAt: settlement?.adjustmentSavedAt?.toISOString() ?? null,
    adjustmentSavedBy: settlement?.adjustmentSavedBy ?? null,
    pmNoExpensesToReport,
  });
}
