/**
 * POST /api/reset-show-state
 *
 * Demo-only affordance: clears post-deal state on a show so the live
 * walkthrough can be re-run. Wipes endOfShowAt, pmExpensesFinalizedAt,
 * expensesConfirmedAt, all expenses, ticket sales, comps, agent share
 * link state, and the activity events that came from those phases.
 *
 * Deliberately preserves: the deal record + the PM expense share link
 * (so the same token still works) + any agent magic links.
 *
 * Used by the [Reset show state] button next to [Show complete ✓] on
 * /shows/[id] when Mariana wants to record a fresh Loom take.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  shows,
  ticketSales,
  comps,
  expenses,
  settlements,
  shareLinks,
  activityEvents,
} from "@/db/schema";

type Body = { showId?: string };

type PostDealEventType =
  | "show_complete"
  | "expense_logged"
  | "pm_expenses_finalized"
  | "expenses_confirmed"
  | "settlement_drafted"
  | "walkthrough_started"
  | "trace_line_acked"
  | "walkthrough_completed"
  | "settlement_sent"
  | "agent_signed_off"
  | "agent_questioned"
  | "agent_acknowledged"
  | "agent_disputed"
  | "settlement_adjusted"
  | "gm_approval_invalidated"
  | "ticket_milestone"
  | "comp_logged"
  | "gm_approved"
  | "gm_held"
  | "wire_sent"
  | "settlement_paid";

const POST_DEAL_EVENT_TYPES: PostDealEventType[] = [
  "show_complete",
  "expense_logged",
  "pm_expenses_finalized",
  "expenses_confirmed",
  "settlement_drafted",
  "walkthrough_started",
  "trace_line_acked",
  "walkthrough_completed",
  "settlement_sent",
  "agent_signed_off",
  "agent_questioned",
  "agent_acknowledged",
  "agent_disputed",
  "settlement_adjusted",
  "gm_approval_invalidated",
  "ticket_milestone",
  "comp_logged",
  "gm_approved",
  "gm_held",
  "wire_sent",
  "settlement_paid",
];

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { showId } = body;
  if (!showId) {
    return NextResponse.json({ error: "showId required" }, { status: 400 });
  }
  const [show] = await db.select().from(shows).where(eq(shows.id, showId));
  if (!show) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }

  // Clear show-side timestamps + flip status back to advanced (not booked,
  // since deal is still captured).
  await db
    .update(shows)
    .set({
      endOfShowAt: null,
      pmExpensesFinalizedAt: null,
      status: "advanced",
    })
    .where(eq(shows.id, showId));

  // Wipe post-show data.
  await db.delete(ticketSales).where(eq(ticketSales.showId, showId));
  await db.delete(comps).where(eq(comps.showId, showId));
  await db.delete(expenses).where(eq(expenses.showId, showId));
  await db.delete(settlements).where(eq(settlements.showId, showId));

  // Reset agent settlement share links (keep the row so URL keeps working,
  // just clear signoff state).
  await db
    .update(shareLinks)
    .set({
      signoffStatus: "open",
      signoffText: null,
      signoffByName: null,
      signoffAt: null,
      accessedAt: null,
    })
    .where(
      and(
        eq(shareLinks.resourceType, "settlement"),
        // Settlement IDs are stl_<showId>, so any old settlement-share row
        // would have that resourceId. Defensive cleanup.
        eq(shareLinks.resourceId, `stl_${showId}`),
      ),
    );

  // Wipe gm_approval share links entirely — those are scoped to a single
  // wire-release cycle so a re-run shouldn't reuse them.
  await db
    .delete(shareLinks)
    .where(
      and(
        eq(shareLinks.resourceType, "gm_approval"),
        eq(shareLinks.resourceId, `stl_${showId}`),
      ),
    );

  // Strip activity events from the post-deal phases (keep deal_captured,
  // agent_commented on the deal etc. — those are pre-show artifacts).
  await db
    .delete(activityEvents)
    .where(
      and(
        eq(activityEvents.showId, showId),
        inArray(activityEvents.eventType, POST_DEAL_EVENT_TYPES),
      ),
    );

  return NextResponse.json({ ok: true, resetAt: new Date().toISOString() });
}
