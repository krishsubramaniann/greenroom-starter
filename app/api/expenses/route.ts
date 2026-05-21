/**
 * GET /api/expenses?showId=<id>&since=<iso>
 *
 * Returns expenses for a show, ordered by enteredAt ascending.
 * If `since` is provided (ISO timestamp), only returns rows with
 * enteredAt > since — used by the LiveExpensesPanel for incremental
 * polling. Without `since`, returns the full list (initial load).
 */

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const showId = searchParams.get("showId");
  const since = searchParams.get("since");

  if (!showId) {
    return NextResponse.json(
      { error: "showId query param is required" },
      { status: 400 },
    );
  }

  const whereClause = since
    ? and(eq(expenses.showId, showId), gt(expenses.enteredAt, new Date(since)))
    : eq(expenses.showId, showId);

  const rows = await db
    .select()
    .from(expenses)
    .where(whereClause)
    .orderBy(asc(expenses.enteredAt));

  return NextResponse.json({
    expenses: rows.map((e) => ({
      id: e.id,
      category: e.category,
      amount: e.amount,
      description: e.description,
      approved: e.approved,
      absorbedByVenue: e.absorbedByVenue,
      source: e.source ?? "manual",
      enteredAt: e.enteredAt.toISOString(),
      enteredByUserId: e.enteredByUserId,
    })),
    serverTime: new Date().toISOString(),
  });
}
