/**
 * POST /api/resolve-ambiguity
 *
 * Canonical endpoint for marking a deal ambiguity resolved. Handles both
 * sides of the demo:
 *   - resolvedBy: "user"             — Mariana clicked [Lock in reading]
 *   - resolvedBy: "agent_simulated"  — Mariana clicked [Simulate agent reply]
 *     (the Loom affordance that fast-forwards through the agent's reply)
 *   - resolvedBy: "agent"            — real inbound reply (future)
 *
 * Side effects:
 *   1. Updates deal.ambiguitiesJson to mark this ambiguity resolved
 *   2. Updates the matching recoup's position if the ambiguity's field
 *      points at a recoup (heuristic: field starts with "recoups[")
 *   3. For agent_simulated: writes a clause_comments row that captures the
 *      synthetic agent quote so the activity log + per-clause threads on
 *      Mariana's side reflect the reply
 *   4. Writes an ambiguity_resolved activity event with the right actor
 *      attribution. For agent_simulated, actorName ends with "(simulated)"
 *      so the activity log marks the demo origin honestly.
 *
 * Idempotent — re-resolving overwrites the prior resolution.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  deals,
  shows,
  artists,
  agents,
  clauseComments,
  activityEvents,
} from "@/db/schema";
import type { Ambiguity, RecoupV2, ResolvedBy } from "@/lib/dealMathV2";

type Body = {
  dealId?: string;
  ambiguityId?: string;
  resolvedValue?: string;
  resolvedBy?: ResolvedBy;
  /** Optional override of the auto-resolved agent name. */
  agentName?: string;
  /** Set when resolvedBy="agent_confirmed_via_email" — the clause_comments
   *  row id of the simulated agent reply Mariana is accepting. Recorded in
   *  the activity event payload for traceability. */
  confirmedAgainstReplyId?: string;
};

const ACTOR_ROLE: Record<ResolvedBy, string> = {
  user: "Booker",
  agent: "Agent",
  agent_simulated: "Agent (simulated)",
  // Mariana is the acting human, but the resolution rests on the agent's reply.
  agent_confirmed_via_email: "Booker",
  tour_manager: "TM",
};

const ACTOR_TYPE_FOR_EVENT: Record<ResolvedBy, "user" | "agent" | "tour_manager"> = {
  user: "user",
  agent: "agent",
  agent_simulated: "agent",
  agent_confirmed_via_email: "user",
  tour_manager: "tour_manager",
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { dealId, ambiguityId, resolvedValue, resolvedBy } = body;
  if (!dealId || !ambiguityId || !resolvedValue || !resolvedBy) {
    return NextResponse.json(
      {
        error:
          "Body must include dealId, ambiguityId, resolvedValue, resolvedBy.",
      },
      { status: 400 },
    );
  }

  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // --- Resolve agent identity (for activity attribution + clause comment) ---
  const [show] = await db
    .select()
    .from(shows)
    .where(eq(shows.id, deal.showId));
  const [artist] = show
    ? await db.select().from(artists).where(eq(artists.id, show.artistId))
    : [];
  const [agent] =
    artist?.agentId != null
      ? await db.select().from(agents).where(eq(agents.id, artist.agentId))
      : [];
  const resolvedAgentName = body.agentName ?? agent?.name ?? "Agent";

  // --- Update the ambiguity in-place ---
  const ambiguities: Ambiguity[] = deal.ambiguitiesJson
    ? (JSON.parse(deal.ambiguitiesJson) as Ambiguity[])
    : [];
  const target = ambiguities.find((a) => a.id === ambiguityId);
  if (!target) {
    return NextResponse.json(
      { error: `Ambiguity ${ambiguityId} not on this deal` },
      { status: 404 },
    );
  }
  target.resolution = resolvedValue;
  target.resolved_at = nowIso;
  target.resolved_by = resolvedBy;

  // --- Update matching recoup position if ambiguity points at a recoup ---
  const recoups: RecoupV2[] = deal.recoupsJson
    ? (JSON.parse(deal.recoupsJson) as RecoupV2[])
    : [];
  // Field shape: "recoups[<idx>].position" — pull the index out if present.
  const recoupIdxMatch = target.field.match(/^recoups\[(\d+)\]/);
  if (recoupIdxMatch) {
    const idx = parseInt(recoupIdxMatch[1], 10);
    const r = recoups[idx];
    if (r) {
      r.position = resolvedValue as RecoupV2["position"];
      r.position_resolved_by = resolvedBy;
      r.position_resolved_at = nowIso;
      if (r.status === "disputed") r.status = "agreed";
    }
  }

  // --- Persist deal updates ---
  await db
    .update(deals)
    .set({
      ambiguitiesJson: JSON.stringify(ambiguities),
      recoupsJson: JSON.stringify(recoups),
    })
    .where(eq(deals.id, dealId));

  // --- Pick a human-readable label for the chosen reading (for summaries) ---
  const reading = (target.candidate_readings ?? []).find(
    (r) => (typeof r === "string" ? r : (r as { structured_value?: string }).structured_value) === resolvedValue,
  );
  const readingLabel =
    typeof reading === "string"
      ? reading
      : (reading as { label?: string } | undefined)?.label ?? resolvedValue;

  // --- Actor attribution ---
  const actorTypeForEvent = ACTOR_TYPE_FOR_EVENT[resolvedBy];
  const actorRole = ACTOR_ROLE[resolvedBy];
  const actorName =
    resolvedBy === "agent_simulated"
      ? `${resolvedAgentName} (simulated)`
      : resolvedBy === "user" || resolvedBy === "agent_confirmed_via_email"
        ? "Mariana Reyes"
        : resolvedAgentName;

  // --- agent_simulated: write a synthetic clause_comments row inline.
  //     (The two-step agent_confirmed_via_email flow already wrote the
  //     reply when /api/simulate-agent-reply ran; we don't write a
  //     second comment here.) ---
  if (resolvedBy === "agent_simulated") {
    const replyBody = `We read this as ${resolvedValue.replace(/_/g, " ")}. ${
      readingLabel ? `(${readingLabel})` : ""
    }`.trim();
    await db.insert(clauseComments).values({
      id: `cc_${randomUUID()}`,
      dealId,
      clauseRef: target.field,
      actorType: "agent",
      actorName,
      body: replyBody,
      channel: "email_reply",
      resolvedAt: now,
      createdAt: now,
    });
  }

  // --- ambiguity_resolved activity event ---
  // For agent_confirmed_via_email, the summary names both sides so the
  // log reads honestly: Mariana acted on Sarah's reading.
  const summary =
    resolvedBy === "agent_confirmed_via_email"
      ? `${actorName} accepted ${resolvedAgentName}'s reading: ${readingLabel}`
      : `${actorName} resolved ${target.field} → ${readingLabel}`;

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: deal.externalId,
    showId: deal.showId,
    eventType: "ambiguity_resolved",
    actorType: actorTypeForEvent,
    actorName,
    actorRole,
    summary,
    payloadJson: JSON.stringify({
      ambiguity_id: ambiguityId,
      resolved_value: resolvedValue,
      reading_label: readingLabel,
      resolved_by: resolvedBy,
      confirmed_against_reply_id: body.confirmedAgainstReplyId ?? null,
      surface: "deal_capture",
    }),
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    updatedDeal: { ambiguities, recoups },
    actorName,
    actorRole,
  });
}
