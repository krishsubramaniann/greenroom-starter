/**
 * POST /api/end-of-show
 *
 * Demo affordance: marks a show ended and populates canned box-office +
 * comp data so the settle page has something to work with. Idempotent —
 * re-running on an already-ended show is a no-op for the timestamps but
 * the canned ticket/comp rows are inserted only if missing.
 *
 * The settle page is gated on shows.endOfShowAt — this endpoint is the
 * single way to flip that gate, so the demo flow can't accidentally
 * leak partial mid-show data into settlement math.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  shows,
  ticketSales,
  comps,
  deals,
  activityEvents,
} from "@/db/schema";

type Body = { showId?: string };

// Canned box-office + comp picture for the demo end-of-show. Realistic
// numbers for a ~650-cap seated room: 400 tickets at $30 + 15 comps split
// across band / crew / plus list.
const CANNED_BOX_OFFICE = {
  qty: 400,
  faceValue: 30,
  gross: 12000,
  feePct: 0.03,
} as const;

const CANNED_COMPS = [
  { category: "artist_gl" as const, count: 5, notes: "Band guest list" },
  { category: "venue_staff" as const, count: 5, notes: "Crew passes" },
  { category: "promo" as const, count: 5, notes: "Plus list" },
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

  const now = new Date();
  const fees = Math.round(CANNED_BOX_OFFICE.gross * CANNED_BOX_OFFICE.feePct * 100) / 100;

  // Insert ticket-sales + comps only if not already present (idempotent re-runs).
  const existingTickets = await db
    .select()
    .from(ticketSales)
    .where(eq(ticketSales.showId, showId));
  if (existingTickets.length === 0) {
    await db.insert(ticketSales).values({
      id: `ts_${showId}_eos`,
      showId,
      qty: CANNED_BOX_OFFICE.qty,
      gross: CANNED_BOX_OFFICE.gross,
      fees,
      capturedAt: now,
    });
  }

  const existingComps = await db
    .select()
    .from(comps)
    .where(eq(comps.showId, showId));
  if (existingComps.length === 0) {
    for (const [idx, c] of CANNED_COMPS.entries()) {
      await db.insert(comps).values({
        id: `comp_${showId}_${idx}`,
        showId,
        category: c.category,
        count: c.count,
        faceValue: CANNED_BOX_OFFICE.faceValue,
        countsTowardGross: false,
        notes: c.notes,
      });
    }
  }

  await db
    .update(shows)
    .set({ endOfShowAt: now, status: "settled" })
    .where(eq(shows.id, showId));

  const [dealRow] = await db.select().from(deals).where(eq(deals.showId, showId));
  const totalComps = CANNED_COMPS.reduce((s, c) => s + c.count, 0);

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: dealRow?.externalId ?? null,
    showId,
    eventType: "show_complete",
    actorType: "system",
    actorName: "Greenroom (demo)",
    actorRole: "System",
    summary: `Show complete · ${CANNED_BOX_OFFICE.qty} tickets · $${CANNED_BOX_OFFICE.gross.toLocaleString()} gross · ${totalComps} comps`,
    payloadJson: JSON.stringify({
      gross: CANNED_BOX_OFFICE.gross,
      tickets: CANNED_BOX_OFFICE.qty,
      comps: totalComps,
      surface: "show_detail",
    }),
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    endOfShowAt: now.toISOString(),
    boxOffice: {
      gross: CANNED_BOX_OFFICE.gross,
      qty: CANNED_BOX_OFFICE.qty,
      fees,
    },
    comps: totalComps,
  });
}
