/**
 * POST /api/finalize-pm-expenses
 *
 * The production manager pressed [Expense Finalized · Ready for Review] on
 * /m/expense. Stamps shows.pmExpensesFinalizedAt and fires the
 * pm_expenses_finalized activity event so Mariana's settle page shows the
 * "PM submitted · ready for review" banner.
 *
 * Re-clickable: PMs can re-open the form and submit more expenses, then
 * re-finalize. We just update the timestamp.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { shareLinks, shows, deals, activityEvents } from "@/db/schema";

type Body = { token?: string; showId?: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { token, showId } = body;
  if (!token || !showId) {
    return NextResponse.json(
      { error: "token + showId required" },
      { status: 400 },
    );
  }

  // Validate token resolves to this show.
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.id, token),
        eq(shareLinks.resourceType, "pm_expense"),
        eq(shareLinks.resourceId, showId),
      ),
    );
  if (!link) {
    return NextResponse.json(
      { error: "Invalid PM token for this show" },
      { status: 404 },
    );
  }

  const now = new Date();
  await db
    .update(shows)
    .set({ pmExpensesFinalizedAt: now })
    .where(eq(shows.id, showId));

  const [dealRow] = await db.select().from(deals).where(eq(deals.showId, showId));

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: dealRow?.externalId ?? null,
    showId,
    eventType: "pm_expenses_finalized",
    actorType: "production_manager",
    actorName: "Production manager",
    actorRole: "PM",
    summary: "PM signaled expenses complete · ready for Mariana's review",
    payloadJson: JSON.stringify({ surface: "pm_mobile" }),
    occurredAt: now,
  });

  return NextResponse.json({ ok: true, finalizedAt: now.toISOString() });
}
