/**
 * POST /api/simulate-agent-reply
 *
 * Demo button that fast-forwards through the agent-reply lifecycle:
 *   1. Marks the matching deal ambiguity resolved
 *   2. Updates the matching recoup's position from "ambiguous" → resolution
 *   3. Writes a clause_comments row capturing the agent's reply
 *   4. Writes two activity_events: agent_commented + ambiguity_resolved
 *
 * Used by the AmbiguityRail's [Simulate agent reply] affordance during the
 * Loom — in a real product this state would arrive via inbound email parsing
 * or the agent clicking through the magic-link viewer.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  deals,
  clauseComments,
  activityEvents,
  shows,
  artists,
} from "@/db/schema";
import { randomUUID } from "node:crypto";
import type { RecoupV2, Ambiguity } from "@/lib/dealMathV2";

type Body = {
  dealId?: string;
  ambiguityId?: string;
  resolution?: string;
  agentName?: string;
  clauseRef?: string;
  /** Synthetic body for the agent's "email reply". Optional. */
  replyBody?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { dealId, ambiguityId, resolution, agentName, clauseRef } = body;
  if (!dealId || !ambiguityId || !resolution || !agentName || !clauseRef) {
    return NextResponse.json(
      {
        error:
          "Body must include dealId, ambiguityId, resolution, agentName, clauseRef.",
      },
      { status: 400 },
    );
  }

  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // ---- mutate ambiguities ----
  const now = new Date();
  const nowIso = now.toISOString();
  const ambiguities: Ambiguity[] = deal.ambiguitiesJson
    ? (JSON.parse(deal.ambiguitiesJson) as Ambiguity[])
    : [];
  const ambiguity = ambiguities.find((a) => a.id === ambiguityId);
  if (!ambiguity) {
    return NextResponse.json(
      { error: `Ambiguity ${ambiguityId} not on this deal` },
      { status: 404 },
    );
  }
  ambiguity.resolution = resolution;
  ambiguity.resolved_at = nowIso;
  ambiguity.resolved_by = "agent";

  // ---- mutate recoups ----
  const recoups: RecoupV2[] = deal.recoupsJson
    ? (JSON.parse(deal.recoupsJson) as RecoupV2[])
    : [];
  // Resolution targets a recoup by ambiguity.field (e.g. "recoups[0].position").
  // For the demo we match the first recoup whose position is "ambiguous";
  // a future version would parse the field path properly.
  const recoupMatch = recoups.find((r) => r.position === "ambiguous");
  if (recoupMatch) {
    recoupMatch.position = resolution as RecoupV2["position"];
    recoupMatch.position_resolved_by = "agent";
    recoupMatch.position_resolved_at = nowIso;
    if (recoupMatch.status === "disputed") recoupMatch.status = "agreed";
  }

  // ---- write back the deal ----
  await db
    .update(deals)
    .set({
      ambiguitiesJson: JSON.stringify(ambiguities),
      recoupsJson: JSON.stringify(recoups),
    })
    .where(eq(deals.id, dealId));

  // ---- look up show + artist for activity context ----
  const [showRow] = await db
    .select({ id: shows.id, artistId: shows.artistId })
    .from(shows)
    .where(eq(shows.id, deal.showId));
  const artistName = showRow
    ? (
        await db
          .select({ name: artists.name })
          .from(artists)
          .where(eq(artists.id, showRow.artistId))
      )[0]?.name
    : undefined;

  const replyBody =
    body.replyBody ??
    `We read this as ${resolution.replace(/_/g, " ")}. That was always the intent — single cap on all venue-charged costs.`;

  // ---- clause comment ----
  await db.insert(clauseComments).values({
    id: `cc_${randomUUID()}`,
    dealId,
    clauseRef,
    actorType: "agent",
    actorName: agentName,
    body: replyBody,
    channel: "email_reply",
    resolvedAt: now,
    createdAt: now,
  });

  // ---- activity events (agent_commented + ambiguity_resolved) ----
  await db.insert(activityEvents).values([
    {
      id: `ae_${randomUUID()}`,
      dealId: deal.externalId,
      showId: deal.showId,
      eventType: "agent_commented",
      actorType: "agent",
      actorName: agentName,
      actorRole: "Agent",
      summary: `${agentName} replied: "${replyBody.slice(0, 80)}${replyBody.length > 80 ? "…" : ""}"`,
      payloadJson: JSON.stringify({
        clause_ref: clauseRef,
        body: replyBody,
        channel: "email_reply",
        artist_name: artistName,
      }),
      occurredAt: now,
    },
    {
      id: `ae_${randomUUID()}`,
      dealId: deal.externalId,
      showId: deal.showId,
      eventType: "ambiguity_resolved",
      actorType: "user",
      actorName: "Mariana Reyes",
      actorRole: "Booker",
      summary: `Resolved ambiguity "${ambiguity.field}" → ${resolution} (confirmed by ${agentName})`,
      payloadJson: JSON.stringify({
        ambiguity_id: ambiguityId,
        resolution,
        resolved_with_agent: true,
      }),
      occurredAt: now,
    },
  ]);

  return NextResponse.json({
    ok: true,
    updatedDeal: {
      ambiguities,
      recoups,
    },
  });
}
