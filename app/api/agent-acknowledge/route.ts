/**
 * POST /api/agent-acknowledge
 *
 * Agent clicked [Acknowledge & accept] on /shared/settlement/[token].
 * Marks the share_link signed and flips the settlement status to "finalized"
 * (terminal pre-payment state). Fires agent_acknowledged activity event.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { shareLinks, settlements, activityEvents } from "@/db/schema";
import {
  resolveShareLinkContext,
  agentAttribution,
} from "@/lib/shareLinks";

type Body = { token?: string };

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

  const ctx = await resolveShareLinkContext(token, "settlement");
  if (!ctx || ctx.resource.type !== "settlement") {
    return NextResponse.json(
      { error: "Settlement share link not found" },
      { status: 404 },
    );
  }
  const { settlement, deal } = ctx.resource;
  const { name: agentName, role: agentRole } = agentAttribution(ctx);
  const now = new Date();

  await db
    .update(shareLinks)
    .set({
      signoffStatus: "agreed",
      signoffByName: agentName,
      signoffAt: now,
    })
    .where(eq(shareLinks.id, token));

  await db
    .update(settlements)
    .set({
      status: "finalized",
      signedAt: settlement.signedAt ?? now,
      finalizedAt: now,
    })
    .where(eq(settlements.id, settlement.id));

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: deal.externalId,
    showId: ctx.show.id,
    settlementId: settlement.id,
    eventType: "agent_acknowledged",
    actorType: "agent",
    actorName: agentName,
    actorRole: agentRole,
    summary: `${agentName} acknowledged & accepted the settlement`,
    payloadJson: JSON.stringify({ resource_type: "settlement" }),
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    settlementStatus: "finalized",
    acknowledgedAt: now.toISOString(),
  });
}
