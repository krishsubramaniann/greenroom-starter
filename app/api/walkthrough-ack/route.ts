/**
 * POST /api/walkthrough-ack
 *
 * Persists one line acknowledgment during the settlement walkthrough.
 * Upserts on (settlementId, lineKey) — re-acking a line overwrites the
 * prior ack (acting as a "actually I want to dispute this" reversal).
 *
 * Also writes a `trace_line_acked` activity event. The payload includes
 * the line key and any dispute note so the activity feed shows
 * "TM acknowledged Net to artist pool" or "TM questioned Off-net recoup
 * with note: ..." without a separate query.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  walkthroughAcks,
  activityEvents,
  settlements,
  deals,
  shows,
} from "@/db/schema";

type Body = {
  settlementId?: string;
  lineKey?: string;
  ackedByActorType?: "tour_manager" | "user" | "agent";
  ackedByName?: string;
  ackedByUserId?: string;
  disputeNote?: string;
};

const ROLE_LABEL: Record<string, string> = {
  tour_manager: "TM",
  user: "Booker",
  agent: "Agent",
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    settlementId,
    lineKey,
    ackedByActorType,
    ackedByName,
    ackedByUserId,
    disputeNote,
  } = body;
  if (!settlementId || !lineKey || !ackedByActorType || !ackedByName) {
    return NextResponse.json(
      {
        error:
          "Body must include settlementId, lineKey, ackedByActorType, ackedByName.",
      },
      { status: 400 },
    );
  }

  const now = new Date();

  // Look up settlement → show → deal so we can stamp event with externalId.
  const [stl] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.id, settlementId));
  if (!stl) {
    return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
  }
  const [dealRow] = await db
    .select()
    .from(deals)
    .where(eq(deals.showId, stl.showId));

  // Upsert on (settlementId, lineKey).
  const [existing] = await db
    .select()
    .from(walkthroughAcks)
    .where(
      and(
        eq(walkthroughAcks.settlementId, settlementId),
        eq(walkthroughAcks.lineKey, lineKey),
      ),
    );

  let ackId: string;
  if (existing) {
    ackId = existing.id;
    await db
      .update(walkthroughAcks)
      .set({
        ackedByUserId: ackedByUserId ?? null,
        ackedByActorType,
        ackedByName,
        ackedAt: now,
        disputeNote: disputeNote ?? null,
      })
      .where(eq(walkthroughAcks.id, existing.id));
  } else {
    ackId = `wa_${randomUUID()}`;
    await db.insert(walkthroughAcks).values({
      id: ackId,
      settlementId,
      lineKey,
      ackedByUserId: ackedByUserId ?? null,
      ackedByActorType,
      ackedByName,
      ackedAt: now,
      disputeNote: disputeNote ?? null,
    });
  }

  // Activity event — single line ack. The end-of-walkthrough endpoint
  // writes a separate summary event ("Acknowledged all N lines").
  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: dealRow?.externalId ?? null,
    showId: stl.showId,
    settlementId,
    eventType: "trace_line_acked",
    actorType: ackedByActorType,
    actorName: ackedByName,
    actorRole: ROLE_LABEL[ackedByActorType] ?? ackedByActorType,
    summary: disputeNote
      ? `${ackedByName} questioned line ${lineKey}: "${disputeNote.slice(0, 80)}${
          disputeNote.length > 80 ? "…" : ""
        }"`
      : `${ackedByName} acknowledged line ${lineKey}`,
    payloadJson: JSON.stringify({
      line_key: lineKey,
      questioned: !!disputeNote,
      dispute_note: disputeNote ?? null,
    }),
    occurredAt: now,
  });

  return NextResponse.json({ ok: true, ackId });
}
