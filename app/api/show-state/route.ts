/**
 * GET /api/show-state?showId=<id>
 *
 * Lightweight polling endpoint used by the settle-page client to detect
 * cross-actor state changes (PM finalized, agent signed, etc.) without
 * a full server re-render. Returns just the deltas SettleCtaBar cares
 * about, keyed by show + most recent settlement share_link.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { shows, settlements, shareLinks } from "@/db/schema";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const showId = searchParams.get("showId");
  if (!showId) {
    return NextResponse.json({ error: "showId required" }, { status: 400 });
  }
  const [show] = await db.select().from(shows).where(eq(shows.id, showId));
  if (!show) {
    return NextResponse.json({ error: "show not found" }, { status: 404 });
  }
  const [settlement] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.showId, showId));
  const [link] = settlement
    ? await db
        .select()
        .from(shareLinks)
        .where(
          and(
            eq(shareLinks.resourceType, "settlement"),
            eq(shareLinks.resourceId, settlement.id),
          ),
        )
        .orderBy(desc(shareLinks.createdAt))
        .limit(1)
    : [];

  return NextResponse.json({
    endOfShowAt: show.endOfShowAt?.toISOString() ?? null,
    pmExpensesFinalizedAt: show.pmExpensesFinalizedAt?.toISOString() ?? null,
    expensesConfirmedAt: settlement?.expensesConfirmedAt?.toISOString() ?? null,
    settlementStatus: settlement?.status ?? null,
    agentSignoffStatus: link?.signoffStatus ?? null,
    agentSignoffByName: link?.signoffByName ?? null,
    agentSignoffAt: link?.signoffAt?.toISOString() ?? null,
    agentSignoffText: link?.signoffText ?? null,
    gmApprovedAt: settlement?.gmApprovedAt?.toISOString() ?? null,
    gmHeldAt: settlement?.gmHeldAt?.toISOString() ?? null,
    gmHoldReason: settlement?.gmHoldReason ?? null,
  });
}
