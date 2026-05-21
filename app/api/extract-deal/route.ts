/**
 * POST /api/extract-deal
 *
 * Demo-mode AI extraction. Accepts any prose, simulates 1500ms of AI
 * latency, and returns the canned extraction whose source data best matches
 * the pasted prose. Today the route distinguishes two demo subjects by
 * substring match on the artist name:
 *
 *   - "Hollow Oak" → lib/canned/hollow-oak-extraction.json
 *   - everything else (including "Coastal Spell" and any other prose)
 *     → lib/canned/coastal-spell-extraction.json
 *
 * The match keeps the extracted fields aligned with the prose so the
 * reviewer can verify spans / amounts / recoup labels against what was
 * actually pasted — important because the strategic claim of the demo is
 * that the extractor only surfaces what's in the prose.
 *
 * The live-API branch (calling Claude through @anthropic-ai/sdk) is stubbed
 * here behind `ANTHROPIC_API_KEY`. Wiring it is out of Phase 2 scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const CANNED_DIR = join(process.cwd(), "lib/canned");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pickCannedFile(prose: string): string {
  const lower = prose.toLowerCase();
  if (lower.includes("hollow oak")) return "hollow-oak-extraction.json";
  // Default. Matches Coastal Spell explicitly and acts as the fallback for
  // any unrecognized prose so the demo never returns an error.
  return "coastal-spell-extraction.json";
}

export async function POST(req: NextRequest) {
  let body: { prose?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (typeof body.prose !== "string" || body.prose.trim().length === 0) {
    return NextResponse.json(
      { error: "Body must include a non-empty `prose` string." },
      { status: 400 },
    );
  }

  // Simulate AI latency so the demo loading state is visible.
  await sleep(1500);

  if (process.env.ANTHROPIC_API_KEY) {
    // TODO(case-study): live extraction path via @anthropic-ai/sdk. For
    // Phase 2 we fall through to canned regardless — see BUILD_PLAN.
  }

  const file = pickCannedFile(body.prose);
  const raw = await readFile(join(CANNED_DIR, file), "utf-8");
  const canned = JSON.parse(raw);
  return NextResponse.json(canned);
}
