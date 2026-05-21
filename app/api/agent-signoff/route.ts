/**
 * POST /api/agent-signoff
 *
 * Handles [I agree] and [I have questions] submissions from both the deal
 * magic link and the settlement magic link. Writes back to share_links and
 * emits the appropriate activity event.
 *
 * Idempotent: re-submitting overwrites the prior signoff (a "questions"
 * submission followed by an "agreed" submission flips the status forward).
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { shareLinks, activityEvents } from "@/db/schema";
import {
  resolveShareLinkContext,
  agentAttribution,
} from "@/lib/shareLinks";

type Body = {
  token?: string;
  signoffStatus?: "agreed" | "questions";
  signoffText?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { token, signoffStatus, signoffText } = body;
  if (!token || !signoffStatus) {
    return NextResponse.json(
      { error: "Body must include token and signoffStatus." },
      { status: 400 },
    );
  }
  if (signoffStatus !== "agreed" && signoffStatus !== "questions") {
    return NextResponse.json(
      { error: "signoffStatus must be 'agreed' or 'questions'." },
      { status: 400 },
    );
  }

  const ctx = await resolveShareLinkContext(token);
  if (!ctx) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  const { name: actorName, role: actorRole } = agentAttribution(ctx);
  const now = new Date();

  await db
    .update(shareLinks)
    .set({
      signoffStatus,
      signoffText: signoffText?.trim() || null,
      signoffByName: actorName,
      signoffAt: now,
    })
    .where(eq(shareLinks.id, token));

  // Choose the activity event by resource type + outcome.
  let eventType:
    | "agent_signed_off"
    | "agent_questioned"
    | "deal_locked";
  let summary: string;
  if (ctx.resource.type === "deal") {
    if (signoffStatus === "agreed") {
      eventType = "deal_locked";
      summary = `${actorName} confirmed the deal terms`;
    } else {
      eventType = "agent_questioned";
      summary = `${actorName} raised questions on the deal`;
    }
  } else {
    if (signoffStatus === "agreed") {
      eventType = "agent_signed_off";
      summary = `${actorName} signed off settlement${
        signoffText ? `: "${signoffText.trim().slice(0, 80)}${signoffText.trim().length > 80 ? "…" : ""}"` : ""
      }`;
    } else {
      eventType = "agent_questioned";
      summary = `${actorName} raised questions on the settlement`;
    }
  }

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: ctx.resource.deal.externalId,
    showId: ctx.show.id,
    settlementId:
      ctx.resource.type === "settlement" ? ctx.resource.settlement.id : null,
    eventType,
    actorType: "agent",
    actorName,
    actorRole,
    summary,
    payloadJson: JSON.stringify({
      signoff_status: signoffStatus,
      signoff_text: signoffText?.trim() || null,
      resource_type: ctx.resource.type,
    }),
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    link: {
      signoffStatus,
      signoffByName: actorName,
      signoffAt: now,
      signoffText: signoffText?.trim() || null,
    },
  });
}
