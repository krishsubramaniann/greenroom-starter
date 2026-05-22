/**
 * POST /api/confirm-expenses
 *
 * Mariana clicked [Confirm expenses received] on the settle page after
 * cross-checking the PM's submissions. Marks settlements.expensesConfirmedAt
 * and fires the expenses_confirmed activity event. Required before she can
 * send the settlement preview to the agent.
 *
 * Lazy-creates a draft settlement if none exists (defensive — the V2 settle
 * page already lazy-creates, so this is rarely needed in practice).
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { shows, settlements, deals, activityEvents } from "@/db/schema";

type Body = { showId?: string };

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

  const now = new Date();
  let [settlement] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.showId, showId));
  if (!settlement) {
    const id = `stl_${showId}`;
    await db.insert(settlements).values({
      id,
      showId,
      status: "draft",
      draftedAt: now,
      expensesConfirmedAt: now,
    });
    settlement = (
      await db.select().from(settlements).where(eq(settlements.id, id))
    )[0];
  } else {
    await db
      .update(settlements)
      .set({ expensesConfirmedAt: now })
      .where(eq(settlements.id, settlement.id));
  }

  const [dealRow] = await db.select().from(deals).where(eq(deals.showId, showId));

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: dealRow?.externalId ?? null,
    showId,
    settlementId: settlement.id,
    eventType: "expenses_confirmed",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Mariana confirmed PM expense submission · ready to send to agent",
    payloadJson: null,
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    expensesConfirmedAt: now.toISOString(),
    settlementId: settlement.id,
  });
}
