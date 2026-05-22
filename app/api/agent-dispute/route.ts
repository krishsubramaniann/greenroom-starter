/**
 * POST /api/agent-dispute
 *
 * Agent clicked [Dispute / request changes] on /shared/settlement/[token]
 * and entered a reason. Marks share_link status "questions" and flips the
 * settlement to "disputed". Fires agent_disputed activity event with the
 * full reason captured in payload.
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

type Body = { token?: string; disputeReason?: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { token, disputeReason } = body;
  if (!token || !disputeReason?.trim()) {
    return NextResponse.json(
      { error: "token + disputeReason required" },
      { status: 400 },
    );
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
  const reason = disputeReason.trim();
  // Second dispute after Mariana has already saved an adjustment line
  // — the adjustment stays locked, but the activity event captures the
  // re-raise so the feed reads "agent disputed again".
  const secondDispute = settlement.adjustmentSavedAt != null;

  await db
    .update(shareLinks)
    .set({
      signoffStatus: "questions",
      signoffText: reason,
      signoffByName: agentName,
      signoffAt: now,
    })
    .where(eq(shareLinks.id, token));

  await db
    .update(settlements)
    .set({
      status: "disputed",
      disputedAt: now,
    })
    .where(eq(settlements.id, settlement.id));

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: deal.externalId,
    showId: ctx.show.id,
    settlementId: settlement.id,
    eventType: "agent_disputed",
    actorType: "agent",
    actorName: agentName,
    actorRole: agentRole,
    summary: secondDispute
      ? `${agentName} disputed the revised settlement: "${reason.slice(0, 80)}${reason.length > 80 ? "…" : ""}"`
      : `${agentName} disputed: "${reason.slice(0, 80)}${reason.length > 80 ? "…" : ""}"`,
    payloadJson: JSON.stringify({
      resource_type: "settlement",
      reason,
      secondDispute,
    }),
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    settlementStatus: "disputed",
    disputedAt: now.toISOString(),
  });
}
