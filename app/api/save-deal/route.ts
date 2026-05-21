/**
 * POST /api/save-deal
 *
 * Persists the extracted deal back to the deals table and writes a
 * `deal_captured` activity event. If an unresolved ambiguity remains,
 * `confirmedAt` is left null (the deal still routes to the legacy engine
 * until the ambiguity is resolved); otherwise it's set so the V2 engine
 * picks up.
 *
 * Idempotent on showId — overwrites the existing deal row in place.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { deals, activityEvents, shareLinks } from "@/db/schema";
import { randomUUID } from "node:crypto";
import type { Bonus } from "@/db/schema";
import type { Ambiguity, RecoupV2 } from "@/lib/dealMathV2";

type Body = {
  showId?: string;
  externalId?: string;
  sourceProse?: string;
  extraction?: {
    deal_type: "vs" | "percentage_of_net" | "flat" | "percentage_of_gross" | "door";
    guarantee_amount: number | null;
    percentage: number | null;
    percentage_basis: "gross" | "net" | null;
    expense_cap: number | null;
    hospitality_cap: number | null;
    bonuses: Bonus[];
    recoups: Array<{
      category: RecoupV2["category"];
      amount: number;
      label: string;
      position: RecoupV2["position"];
      prose_span?: string;
    }>;
    ambiguities: Ambiguity[];
    comp_rules: Record<string, boolean> | null;
  };
  /** Local resolutions applied to ambiguities (id → resolution value). */
  resolutions?: Record<string, string>;
  ambiguitiesFlaggedCount?: number;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { showId, externalId, sourceProse, extraction } = body;
  if (!showId || !externalId || !sourceProse || !extraction) {
    return NextResponse.json(
      { error: "Body must include showId, externalId, sourceProse, extraction" },
      { status: 400 },
    );
  }

  // Apply local resolutions onto the ambiguities + matching recoups.
  const ambiguities = extraction.ambiguities.map((a) => {
    const r = body.resolutions?.[a.id];
    if (!r || a.resolution) return a;
    return {
      ...a,
      resolution: r,
      resolved_at: new Date().toISOString(),
      resolved_by: "user" as const,
    };
  });
  const recoups: RecoupV2[] = extraction.recoups.map((r, idx) => {
    const base: RecoupV2 = {
      id: `recoup_${r.category}_${idx}`,
      category: r.category,
      label: r.label,
      amount: r.amount,
      position: r.position,
      status: "agreed",
      prose_span: r.prose_span,
    };
    // If the user resolved the recoup-position ambiguity, apply it.
    const matchedAmbig = ambiguities.find(
      (a) => a.field === `recoups[${idx}].position` && a.resolution,
    );
    if (matchedAmbig && base.position === "ambiguous") {
      base.position = matchedAmbig.resolution as RecoupV2["position"];
      base.position_resolved_by = "user";
      base.position_resolved_at = matchedAmbig.resolved_at;
    }
    return base;
  });

  const unresolvedCount = ambiguities.filter((a) => !a.resolution).length;
  const now = new Date();
  const confirmedAt = unresolvedCount === 0 ? now : null;

  // Load existing deal to decide insert vs update.
  const [existing] = await db.select().from(deals).where(eq(deals.showId, showId));

  const payload = {
    showId,
    dealType: extraction.deal_type,
    guaranteeAmount: extraction.guarantee_amount,
    percentage: extraction.percentage,
    percentageBasis: extraction.percentage_basis,
    expenseCap: extraction.expense_cap,
    hospitalityCap: extraction.hospitality_cap,
    bonusesJson:
      extraction.bonuses.length > 0
        ? JSON.stringify(extraction.bonuses)
        : null,
    dealNotesFreetext: existing?.dealNotesFreetext ?? null,
    externalId,
    sourceProse,
    extractedAt: now,
    confirmedAt,
    recoupsJson: JSON.stringify(recoups),
    ambiguitiesJson: JSON.stringify(ambiguities),
    compRulesJson: extraction.comp_rules
      ? JSON.stringify(extraction.comp_rules)
      : null,
    createdAt: existing?.createdAt ?? now,
  };

  let dealId: string;
  if (existing) {
    dealId = existing.id;
    await db.update(deals).set(payload).where(eq(deals.id, existing.id));
  } else {
    dealId = `deal_${showId}`;
    await db.insert(deals).values({ id: dealId, ...payload });
  }

  // Write a deal_captured activity event.
  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: externalId,
    showId,
    eventType: "deal_captured",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: existing
      ? "Re-captured deal via AI extraction"
      : "Captured deal via AI extraction from email prose",
    payloadJson: JSON.stringify({
      source: "email_paste",
      ambiguities_flagged: body.ambiguitiesFlaggedCount ?? ambiguities.length,
      ambiguities_unresolved: unresolvedCount,
      confirmed: confirmedAt !== null,
    }),
    occurredAt: now,
  });

  // Auto-create a deal-type share_link if one doesn't already exist. The
  // token is what the clarification email interpolates so the agent has a
  // direct URL to click, and what /shared/deal/[token] resolves against.
  const [existingLink] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.resourceType, "deal"),
        eq(shareLinks.resourceId, dealId),
      ),
    )
    .limit(1);

  let dealShareToken: string;
  if (existingLink) {
    dealShareToken = existingLink.id;
  } else {
    dealShareToken = `dl-${randomUUID().slice(0, 12)}`;
    await db.insert(shareLinks).values({
      id: dealShareToken,
      resourceType: "deal",
      resourceId: dealId,
      createdAt: now,
      signoffStatus: "open",
    });
  }

  return NextResponse.json({
    ok: true,
    dealId,
    dealShareToken,
    confirmed: confirmedAt !== null,
    unresolvedAmbiguities: unresolvedCount,
  });
}
