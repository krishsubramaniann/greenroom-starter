/**
 * POST /api/simulate-agent-reply
 *
 * First half of the two-step "Simulate agent reply" demo affordance.
 * Generates Sarah's reply for a (deal, ambiguity, selectedReading) tuple
 * without marking the ambiguity resolved. Mariana sees the reply rendered
 * as an email quote in the card, then either clicks [Accept Sarah's reading]
 * (which calls /api/resolve-ambiguity with resolvedBy="agent_confirmed_via_email")
 * or [Push back].
 *
 * Demo-mode: reply text comes from lib/canned/hollow-oak-agent-replies.json,
 * keyed by [ambiguityId][selectedReading]. If the (ambiguityId, reading)
 * pair has no canned reply, returns 422 so the UI can fall back gracefully.
 *
 * Side effects:
 *   1. clause_comments row (channel: email_reply, body: reply_text,
 *      actor: "<agent_name> (simulated)") — the reply is data, kept after
 *      the demo for the agent magic-link + Mariana's per-clause threads.
 *   2. activity_events row (eventType: agent_replied) — the reviewer-visible
 *      record that the reply came through the simulate affordance.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/db";
import {
  deals,
  shows,
  artists,
  agents,
  clauseComments,
  activityEvents,
} from "@/db/schema";

type Body = {
  dealId?: string;
  ambiguityId?: string;
  selectedReading?: string;
};

type CannedReply = {
  agent_name: string;
  agency: string;
  reply_text: string;
};

const CANNED_PATH = join(
  process.cwd(),
  "lib/canned/hollow-oak-agent-replies.json",
);

async function lookupCannedReply(
  ambiguityId: string,
  selectedReading: string,
): Promise<CannedReply | null> {
  try {
    const raw = await readFile(CANNED_PATH, "utf-8");
    const data = JSON.parse(raw) as Record<
      string,
      Record<string, CannedReply>
    >;
    return data[ambiguityId]?.[selectedReading] ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { dealId, ambiguityId, selectedReading } = body;
  if (!dealId || !ambiguityId || !selectedReading) {
    return NextResponse.json(
      {
        error:
          "Body must include dealId, ambiguityId, and selectedReading.",
      },
      { status: 400 },
    );
  }

  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const canned = await lookupCannedReply(ambiguityId, selectedReading);
  if (!canned) {
    return NextResponse.json(
      {
        error: `No canned reply for ${ambiguityId} × ${selectedReading}.`,
      },
      { status: 422 },
    );
  }

  // Look up agent identity via the resource chain. The canned file's
  // agent_name is the source of truth for the demo, but we'll fall back
  // to the actual seeded agent if it diverges.
  const [show] = await db.select().from(shows).where(eq(shows.id, deal.showId));
  const [artist] = show
    ? await db.select().from(artists).where(eq(artists.id, show.artistId))
    : [];
  const [agent] =
    artist?.agentId != null
      ? await db.select().from(agents).where(eq(agents.id, artist.agentId))
      : [];
  const agentName = canned.agent_name ?? agent?.name ?? "Agent";
  const actorName = `${agentName} (simulated)`;
  const agencyName = canned.agency ?? "";

  const now = new Date();

  // Field of the ambiguity → clauseRef on the clause_comment.
  const ambiguities = deal.ambiguitiesJson
    ? (JSON.parse(deal.ambiguitiesJson) as Array<{
        id: string;
        field?: string;
      }>)
    : [];
  const clauseRef =
    ambiguities.find((a) => a.id === ambiguityId)?.field ?? ambiguityId;

  const replyId = `cc_${randomUUID()}`;
  await db.insert(clauseComments).values({
    id: replyId,
    dealId,
    clauseRef,
    actorType: "agent",
    actorName,
    body: canned.reply_text,
    channel: "email_reply",
    createdAt: now,
  });

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: deal.externalId,
    showId: deal.showId,
    eventType: "agent_replied",
    actorType: "agent",
    actorName,
    actorRole: agencyName ? `Agent (${agencyName})` : "Agent",
    summary: `${actorName} replied: "${canned.reply_text
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80)}${canned.reply_text.length > 80 ? "…" : ""}"`,
    payloadJson: JSON.stringify({
      ambiguity_id: ambiguityId,
      reading: selectedReading,
      reply_text: canned.reply_text,
      reply_id: replyId,
      surface: "deal_capture",
    }),
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    reply: {
      id: replyId,
      text: canned.reply_text,
      agentName,
      agency: agencyName,
      actorName,
      timestamp: now.toISOString(),
    },
  });
}
