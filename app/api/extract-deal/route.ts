/**
 * POST /api/extract-deal
 *
 * Demo-mode AI extraction. Accepts any prose, simulates 1500ms of AI latency,
 * returns the canned Coastal Spell extraction from
 * `lib/canned/coastal-spell-extraction.json`.
 *
 * The live-API branch (calling Claude through @anthropic-ai/sdk) is stubbed
 * here behind `ANTHROPIC_API_KEY`. Wiring it is out of Phase 2 scope; the
 * demo always uses the canned response.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const CANNED_PATH = join(
  process.cwd(),
  "lib/canned/coastal-spell-extraction.json",
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    // TODO(case-study): live extraction path via @anthropic-ai/sdk. For Phase 2
    // we fall through to canned regardless — see BUILD_PLAN Phase 2 notes.
  }

  const raw = await readFile(CANNED_PATH, "utf-8");
  const canned = JSON.parse(raw);
  return NextResponse.json(canned);
}
