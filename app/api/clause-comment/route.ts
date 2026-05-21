/**
 * POST /api/clause-comment
 *
 * Agent (or other share-link visitor) leaves a comment on a clause of the
 * deal or a specific trace line. clauseRef is opaque to the route — the
 * agent surface uses paths like "recoups[0].position" for deal clauses
 * and "trace.<step_key>" for settlement trace lines.
 *
 * Writes a clause_comments row + an `agent_commented` activity_event.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { clauseComments, activityEvents } from "@/db/schema";
import {
  resolveShareLinkContext,
  agentAttribution,
} from "@/lib/shareLinks";

type Body = {
  token?: string;
  clauseRef?: string;
  body?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { token, clauseRef, body: text } = body;
  if (!token || !clauseRef || !text?.trim()) {
    return NextResponse.json(
      { error: "Body must include token, clauseRef, and non-empty body." },
      { status: 400 },
    );
  }

  const ctx = await resolveShareLinkContext(token);
  if (!ctx) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  const { name: actorName, role: actorRole } = agentAttribution(ctx);
  const dealId = ctx.resource.deal.id;
  const now = new Date();

  const commentId = `cc_${randomUUID()}`;
  await db.insert(clauseComments).values({
    id: commentId,
    dealId,
    clauseRef,
    actorType: "agent",
    actorName,
    body: text.trim(),
    channel: "magic_link_inline",
    createdAt: now,
  });

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: ctx.resource.deal.externalId,
    showId: ctx.show.id,
    settlementId:
      ctx.resource.type === "settlement"
        ? ctx.resource.settlement.id
        : null,
    eventType: "agent_commented",
    actorType: "agent",
    actorName,
    actorRole,
    summary: `${actorName} commented on ${clauseRef}: "${text.trim().slice(0, 80)}${
      text.trim().length > 80 ? "…" : ""
    }"`,
    payloadJson: JSON.stringify({
      clause_ref: clauseRef,
      body: text.trim(),
      channel: "magic_link_inline",
    }),
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    comment: {
      id: commentId,
      actorName,
      actorType: "agent",
      body: text.trim(),
      channel: "magic_link_inline",
      createdAt: now,
    },
  });
}
