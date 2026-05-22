/**
 * POST /api/gm-hold
 *
 * GM clicked [Hold for review] on /m/gm-approve/[token] and entered a
 * reason. Stamps settlement.gmHeldAt + gmHoldReason, marks the link
 * "questions" (using the existing share_links signoff lexicon), and
 * writes a gm_held activity event. Settlement status stays in whatever
 * pre-hold state it was in (typically "finalized" after the agent ack).
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  shareLinks,
  settlements,
  users as usersTable,
  deals,
  activityEvents,
} from "@/db/schema";

type Body = { token?: string; reason?: string };

const GM_ACTOR_NAME_FALLBACK = "Marcus Chen";
const GM_ACTOR_ROLE = "GM · The Crescent";

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { token, reason } = body;
  if (!token || !reason?.trim()) {
    return NextResponse.json(
      { error: "token + reason required" },
      { status: 400 },
    );
  }
  const trimmed = reason.trim();

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

  const [gmUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "gm"));
  const gmName = gmUser?.name ?? GM_ACTOR_NAME_FALLBACK;
  const now = new Date();

  await db
    .update(settlements)
    .set({
      gmHeldAt: now,
      gmHoldReason: trimmed,
      gmApprovedAt: null,
    })
    .where(eq(settlements.id, settlement.id));

  await db
    .update(shareLinks)
    .set({
      signoffStatus: "questions",
      signoffByName: gmName,
      signoffText: trimmed,
      signoffAt: now,
    })
    .where(eq(shareLinks.id, token));

  const [dealRow] = await db
    .select()
    .from(deals)
    .where(eq(deals.showId, settlement.showId));

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: dealRow?.externalId ?? null,
    showId: settlement.showId,
    settlementId: settlement.id,
    eventType: "gm_held",
    actorType: "user",
    actorName: gmName,
    actorRole: GM_ACTOR_ROLE,
    summary: `${gmName} placed wire on hold: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}"`,
    payloadJson: JSON.stringify({
      reason: trimmed,
      settlement_id: settlement.id,
      surface: "gm_mobile",
    }),
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    heldAt: now.toISOString(),
    gmName,
  });
}
