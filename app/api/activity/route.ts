/**
 * GET /api/activity?showId=<id>&since=<iso>
 *
 * Generic activity-feed polling endpoint — returns every activity_events
 * row for the show whose occurredAt is newer than `since`. The settle-page
 * activity dropdown polls this so cross-actor events (gm_held,
 * agent_acknowledged, expenses_confirmed, etc.) appear in real time
 * without a page refresh.
 *
 * Without `since`, returns up to 50 most recent events.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { activityEvents } from "@/db/schema";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const showId = searchParams.get("showId");
  const since = searchParams.get("since");
  if (!showId) {
    return NextResponse.json(
      { error: "showId required" },
      { status: 400 },
    );
  }

  if (since) {
    const rows = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.showId, showId),
          gt(activityEvents.occurredAt, new Date(since)),
        ),
      )
      .orderBy(asc(activityEvents.occurredAt));
    return NextResponse.json({
      events: rows,
      serverTime: new Date().toISOString(),
    });
  }

  // Initial fetch — last 50, descending.
  const rows = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.showId, showId))
    .orderBy(desc(activityEvents.occurredAt))
    .limit(50);
  return NextResponse.json({
    events: rows,
    serverTime: new Date().toISOString(),
  });
}
