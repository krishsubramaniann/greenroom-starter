/**
 * POST /api/walkthrough-complete
 *
 * Called by the walkthrough end screen when the TM has acknowledged every
 * trace line. Writes the summary activity events, lazily flips settlement
 * status to "signed" if it's currently in the pre-signoff bucket, and
 * returns the existing magic-link URL for the agent preview.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  settlements,
  shareLinks,
  activityEvents,
  walkthroughAcks,
  deals,
} from "@/db/schema";

type Body = {
  settlementId?: string;
  showId?: string;
  signoffText?: string;
};

const PRE_SIGNOFF_STATUSES = new Set([
  "draft",
  "submitted",
  "in_review",
]);

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { settlementId, showId } = body;
  if (!settlementId || !showId) {
    return NextResponse.json(
      { error: "Body must include settlementId and showId." },
      { status: 400 },
    );
  }

  const [stl] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.id, settlementId));
  if (!stl) {
    return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
  }

  const now = new Date();

  // Count acks (sanity check + payload context).
  const ackCountRows = await db
    .select({ n: sql<number>`count(*)`.as("n") })
    .from(walkthroughAcks)
    .where(eq(walkthroughAcks.settlementId, settlementId));
  const acksCount = ackCountRows[0]?.n ?? 0;

  // Flip status if currently pre-signoff. Otherwise leave alone.
  const shouldSign = PRE_SIGNOFF_STATUSES.has(stl.status);
  if (shouldSign) {
    await db
      .update(settlements)
      .set({
        status: "signed",
        signedAt: stl.signedAt ?? now,
        signoffText: body.signoffText ?? stl.signoffText,
      })
      .where(eq(settlements.id, settlementId));
  }

  // Resolve the share link (Phase 3 lazy-creates on settle-page load).
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.resourceType, "settlement"),
        eq(shareLinks.resourceId, settlementId),
      ),
    )
    .orderBy(desc(shareLinks.createdAt))
    .limit(1);

  let shareUrl: string;
  if (link) {
    shareUrl = `/shared/settlement/${link.id}`;
  } else {
    // Defensive: if the user hits complete without ever visiting the V2
    // settle page (impossible in normal flow), create a link here.
    const token = `stl-${randomUUID().slice(0, 12)}`;
    await db.insert(shareLinks).values({
      id: token,
      resourceType: "settlement",
      resourceId: settlementId,
      createdAt: now,
      signoffStatus: "open",
    });
    shareUrl = `/shared/settlement/${token}`;
  }

  // Activity events: walkthrough_completed (TM action) + settlement_sent
  // (Mariana hitting Send-to-agent from the end screen). Both are written
  // here since the end screen is one button press.
  const [dealRow] = await db
    .select()
    .from(deals)
    .where(eq(deals.showId, showId));
  const externalId = dealRow?.externalId ?? null;

  await db.insert(activityEvents).values([
    {
      id: `ae_${randomUUID()}`,
      dealId: externalId,
      showId,
      settlementId,
      eventType: "walkthrough_completed",
      actorType: "user",
      actorName: "Mariana Reyes",
      actorRole: "Booker",
      summary: `Walkthrough completed · ${acksCount} line${
        acksCount === 1 ? "" : "s"
      } acknowledged`,
      payloadJson: JSON.stringify({
        lines_acked: acksCount,
        flipped_status: shouldSign,
      }),
      occurredAt: now,
    },
    {
      id: `ae_${randomUUID()}`,
      dealId: externalId,
      showId,
      settlementId,
      eventType: "settlement_sent",
      actorType: "user",
      actorName: "Mariana Reyes",
      actorRole: "Booker",
      summary: "Sent settlement preview to agent",
      payloadJson: JSON.stringify({ magic_link: shareUrl }),
      occurredAt: now,
    },
  ]);

  return NextResponse.json({
    ok: true,
    shareUrl,
    flippedStatus: shouldSign,
    acksCount,
  });
}
