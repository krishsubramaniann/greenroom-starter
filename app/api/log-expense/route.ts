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
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type Body = {
  token?: string;
  vendor?: string;
  amount?: number;
  category?: string;
  notes?: string;
  /** Legacy: filename string. Kept for back-compat with any JSON callers
   *  (the real-upload path goes through multipart/form-data instead). */
  receiptFilename?: string | null;
  enteredByName?: string;
};

type ParsedRequest = {
  fields: Body;
  file: File | null;
};

/** Parse the incoming request as either multipart/form-data (real uploads
 *  from the PM mobile form) or application/json (back-compat with curl /
 *  existing JSON callers). */
async function parseRequest(req: NextRequest): Promise<ParsedRequest | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    const file = fd.get("receipt");
    const amount = fd.get("amount");
    return {
      fields: {
        token: (fd.get("token") as string | null) ?? undefined,
        vendor: (fd.get("vendor") as string | null) ?? undefined,
        amount: amount != null ? Number(amount) : undefined,
        category: (fd.get("category") as string | null) ?? undefined,
        notes: (fd.get("notes") as string | null) ?? undefined,
        enteredByName:
          (fd.get("enteredByName") as string | null) ?? undefined,
      },
      file: file instanceof File && file.size > 0 ? file : null,
    };
  }
  try {
    const body = (await req.json()) as Body;
    return { fields: body, file: null };
  } catch {
    return null;
  }
}

function sanitizeFilename(name: string): string {
  // Strip path separators + most special chars; keep extension dot.
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return cleaned.length > 0 ? cleaned : "receipt";
}

export async function POST(req: NextRequest) {
  const parsed = await parseRequest(req);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const body = parsed.fields;
  const { token, vendor, amount, category, notes } = body;
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

  // Compose description from vendor + optional notes.
  const descriptionParts: string[] = [];
  descriptionParts.push(vendor.trim());
  if (notes?.trim()) descriptionParts.push(notes.trim());
  const description = descriptionParts.join(" · ");

  // Receipt: real upload preferred, canned-by-category as fallback.
  const CATEGORY_RECEIPT: Record<string, string> = {
    sound: "/receipts/sound.svg",
    hospitality: "/receipts/hospitality.svg",
    security: "/receipts/security.svg",
    production: "/receipts/production.svg",
  };
  let receiptPath = CATEGORY_RECEIPT[category] ?? "/receipts/production.svg";

  if (parsed.file) {
    const file = parsed.file;
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Receipt too large (${file.size} > ${MAX_UPLOAD_BYTES})` },
        { status: 413 },
      );
    }
    // mime guard — be permissive about empty type (some HEIC uploads
    // come through without one) but reject explicitly non-image types.
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported receipt type: ${file.type}` },
        { status: 415 },
      );
    }
    const ts = Date.now();
    const safe = sanitizeFilename(file.name || "receipt");
    const dir = join(process.cwd(), "public", "uploads", "receipts", showId);
    await mkdir(dir, { recursive: true });
    const filename = `${ts}-${safe}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(join(dir, filename), buf);
    receiptPath = `/uploads/receipts/${showId}/${filename}`;
  }

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
      receipt_path: receiptPath,
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
