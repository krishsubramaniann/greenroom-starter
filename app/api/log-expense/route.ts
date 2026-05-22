/**
 * POST /api/log-expense
 *
 * Receives an expense from the production manager's mobile form at
 * /m/expense?token=<token>. The token is a pm_expense share_link whose
 * resourceId is the showId. We don't authenticate the PM — magic-link
 * pattern, same as the agent-side surfaces from Phase 5.
 *
 * Side effects:
 *   1. expenses row (source="pm_mobile", enteredByUserId=null since the
 *      PM isn't in the users table)
 *   2. expense_logged activity event (actorType=production_manager) so the
 *      "from production manager" attribution shows up in the unified log
 *      and live panel
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  shareLinks,
  expenses,
  shows,
  deals,
  activityEvents,
} from "@/db/schema";

const CATEGORIES = new Set([
  "production",
  "sound",
  "lights",
  "hospitality",
  "marketing",
  "backline",
  "security",
  "other",
]);

type Body = {
  token?: string;
  vendor?: string;
  amount?: number;
  category?: string;
  notes?: string;
  /** Filename or stand-in URL — we don't store the actual file in the demo. */
  receiptFilename?: string | null;
  /** PM's name for activity attribution. Defaults to "Production manager". */
  enteredByName?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { token, vendor, amount, category, notes, receiptFilename } = body;
  if (!token || !vendor?.trim() || amount == null || !category) {
    return NextResponse.json(
      {
        error:
          "Body must include token, vendor, amount, category.",
      },
      { status: 400 },
    );
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 },
    );
  }
  if (!CATEGORIES.has(category)) {
    return NextResponse.json(
      { error: `Unknown category: ${category}` },
      { status: 400 },
    );
  }

  // Validate token.
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.id, token),
        eq(shareLinks.resourceType, "pm_expense"),
      ),
    );
  if (!link) {
    return NextResponse.json(
      { error: "Invalid or expired PM token" },
      { status: 404 },
    );
  }

  const showId = link.resourceId;
  const [show] = await db.select().from(shows).where(eq(shows.id, showId));
  if (!show) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }
  const [dealRow] = await db.select().from(deals).where(eq(deals.showId, showId));

  const now = new Date();
  const expenseId = `exp_${randomUUID()}`;

  // Compose description from vendor + optional notes. The receipt path
  // (set below) is stored on its own column — no more "📷 sound.png" tail
  // glued onto the description; that hack is dead post-Phase-8.5.
  const descriptionParts: string[] = [];
  descriptionParts.push(vendor.trim());
  if (notes?.trim()) descriptionParts.push(notes.trim());
  const description = descriptionParts.join(" · ");

  // Demo: ignore the uploaded filename and assign a canned receipt by
  // category. Unmapped categories fall back to the production receipt.
  const CATEGORY_RECEIPT: Record<string, string> = {
    sound: "/receipts/sound.svg",
    hospitality: "/receipts/hospitality.svg",
    security: "/receipts/security.svg",
    production: "/receipts/production.svg",
  };
  const receiptPath = CATEGORY_RECEIPT[category] ?? "/receipts/production.svg";

  await db.insert(expenses).values({
    id: expenseId,
    showId,
    category: category as
      | "production"
      | "sound"
      | "lights"
      | "hospitality"
      | "marketing"
      | "backline"
      | "security"
      | "other",
    amount,
    description,
    approved: true,
    absorbedByVenue: false,
    enteredByUserId: null,
    enteredAt: now,
    source: "pm_mobile",
    receiptPath,
  });

  // First-touch on the token: stamp accessedAt so Mariana can see "PM
  // opened the link at HH:MM" in the activity feed.
  if (!link.accessedAt) {
    await db
      .update(shareLinks)
      .set({ accessedAt: now })
      .where(eq(shareLinks.id, token));
  }

  const actorName = body.enteredByName?.trim() || "Production manager";

  await db.insert(activityEvents).values({
    id: `ae_${randomUUID()}`,
    dealId: dealRow?.externalId ?? null,
    showId,
    eventType: "expense_logged",
    actorType: "production_manager",
    actorName,
    actorRole: "PM",
    summary: `${actorName} logged ${category} expense: $${amount.toFixed(2)} (${vendor.trim()})`,
    payloadJson: JSON.stringify({
      amount,
      category,
      vendor: vendor.trim(),
      notes: notes?.trim() ?? null,
      receipt_filename: receiptFilename ?? null,
      surface: "pm_mobile",
    }),
    occurredAt: now,
  });

  return NextResponse.json({
    ok: true,
    expense: {
      id: expenseId,
      showId,
      category,
      amount,
      description,
      enteredAt: now.toISOString(),
      source: "pm_mobile",
    },
  });
}
