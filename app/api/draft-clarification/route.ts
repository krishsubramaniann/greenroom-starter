/**
 * POST /api/draft-clarification
 *
 * Drafts a clarification email from the booker to the agent for a single
 * unresolved ambiguity. Demo-mode: returns the canned Example-1 output from
 * `prompts/clarification.md` (the Coastal Spell marketing-recoup case).
 *
 * In a real implementation this would call Claude with the
 * prompts/clarification.md system prompt. Phase 2 stubs that out and returns
 * a deterministic template, with the agent/artist/date interpolated.
 */

import { NextRequest, NextResponse } from "next/server";

type ClarificationContext = {
  venue_name?: string;
  booker_name?: string;
  agent_name?: string;
  agency_name?: string;
  artist_name?: string;
  show_date?: string;
  prose_span?: string;
  venue_reading?: string;
  alternative_reading?: string;
  estimated_dollar_impact?: string;
};

type Body = {
  ambiguityId?: string;
  dealExternalId?: string;
  context?: ClarificationContext;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ctx = body.context ?? {};
  const agent = ctx.agent_name ?? "[agent]";
  const artist = ctx.artist_name ?? "[artist]";
  const date = ctx.show_date ?? "[date]";
  const prose =
    ctx.prose_span ??
    "Expenses capped $2,500, marketing recoup of $900 against gross.";
  const venueReading =
    ctx.venue_reading ??
    "off gross — i.e., the $900 is deducted from gross before fees and expenses, in addition to the $2,500 cap on other operational costs";
  const altReading =
    ctx.alternative_reading ??
    "the $900 sits inside the $2,500 cap";
  const impact = ctx.estimated_dollar_impact ?? "~$720";
  const booker = ctx.booker_name ?? "Mariana";

  const subject = `${artist} ${date} — quick deal clarification`;

  const body_text = [
    `Hi ${agent.split(" ")[0]},`,
    "",
    `Confirming a detail on the ${artist} deal before we get to settlement. The deal email had this sentence: "${prose}"`,
    "",
    `On our side, we're reading the marketing recoup as positioned ${venueReading}. The alternative reading would be that ${altReading}.`,
    "",
    `Want to make sure that matches your read before we settle on the ${date.replace(/^\D+/, "")}. The two interpretations end up ${impact} apart at the gross we're tracking for this show, which is why I'd rather lock it in now.`,
    "",
    `Can you confirm? Happy to jump on a call if easier.`,
    "",
    booker,
  ].join("\n");

  // Simulate drafting latency.
  await sleep(800);

  return NextResponse.json({ subject, body: body_text });
}
