/**
 * POST /api/gm-approve
 *
 * GM clicked [Approve & release wire] on /m/gm-approve/[token]. Validates
 * the gm_approval magic link, stamps settlement.gmApprovedAt + paidAt,
 * flips settlement.status to "paid", and writes a gm_approved activity
 * event with the GM persona attribution.
 *
 * Mirrors the agent-acknowledge flow but anchored to a different resource
 * type. Mariana sees the result reflected in the settle-page lifecycle
 * (stage 7 turns green) on next /api/show-state poll tick.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  shareLinks,
  settlements,
  users as usersTable,
  shows,
  deals,
  activityEvents,
} from "@/db/schema";

type Body = { token?: string };

const GM_ACTOR_NAME_FALLBACK = "Marcus Chen";
const GM_ACTOR_ROLE = "GM · The Crescent";

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { token } = body;
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const [link] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.id, token),
        eq(shareLinks.resourceType, "gm_approval"),
      ),
    );
  if (!link) {
    return NextResponse.json(
      { error: "GM approval link not found" },
      { status: 404 },
    );
  }

  // gm_approval share_links anchor on settlementId.
  const [settlement] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.id, link.resourceId));
  if (!settlement) {
    return NextResponse.json(
      { error: "Settlement not found" },
      { status: 404 },
    );
  }

  // Idempotency guard — re-tapping [Approve] on an already-approved link
  // is a no-op error, not a silent re-write. Surfaces to the GM mobile
  // page so the UI can route to the already-approved state.
  if (settlement.gmApprovedAt) {
    return NextResponse.json(
      { error: "Already approved" },
      { status: 400 },
    );
  }

  // Capture hold provenance BEFORE we clear it so the activity event
  // payload records "this approval released a prior hold and the reason
  // was X." Mariana's right rail uses this to render the
  // "previously held: '<reason>'" stamp on the Paid card.
  const releasedFromHold = settlement.gmHeldAt != null;
  const previousHoldReason = settlement.gmHoldReason;
  const previousHeldAt = settlement.gmHeldAt;

  // GM identity — lifted from the seeded GM user when present.
  const [gmUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "gm"));
  const gmName = gmUser?.name ?? GM_ACTOR_NAME_FALLBACK;

  const now = new Date();

  await db
    .update(settlements)
    .set({
      gmApprovedAt: now,
      gmHeldAt: null,
      gmHoldReason: null,
      status: "paid",
      paidAt: settlement.paidAt ?? now,
    })
    .where(eq(settlements.id, settlement.id));

  await db
    .update(shareLinks)
    .set({
      signoffStatus: "agreed",
      signoffByName: gmName,
      signoffAt: now,
    })
    .where(eq(shareLinks.id, token));

  const [show] = await db
    .select()
    .from(shows)
    .where(eq(shows.id, settlement.showId));
  const [dealRow] = await db
    .select()
    .from(deals)
    .where(eq(deals.showId, settlement.showId));

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: dealRow?.externalId ?? null,
    showId: settlement.showId,
    settlementId: settlement.id,
    eventType: "gm_approved",
    actorType: "user",
    actorName: gmName,
    actorRole: GM_ACTOR_ROLE,
    summary: releasedFromHold
      ? `${gmName} released hold · wire scheduled for release`
      : `${gmName} approved · wire scheduled for release`,
    payloadJson: JSON.stringify({
      total_to_artist: settlement.totalToArtist,
      settlement_id: settlement.id,
      surface: "gm_mobile",
      releasedFromHold,
      previousHoldReason: previousHoldReason ?? null,
      previousHeldAt: previousHeldAt
        ? previousHeldAt.toISOString()
        : null,
    }),
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    approvedAt: now.toISOString(),
    settlementStatus: "paid",
    gmName,
    releasedFromHold,
    previousHoldReason: previousHoldReason ?? null,
  });
}
