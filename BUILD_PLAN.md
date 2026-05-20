# BUILD_PLAN.md

This is the execution plan for the case-study slice: **deal capture with AI extraction + walkthrough-aware settlement statement, with the agent-facing artifact as one rendering.** Read `MEMO.md` for the strategic framing and the "why" of the cut. This file is the "what" and "how."

The build is structured for execution by Claude Code (or equivalent agentic coding tool). It's phased, additive, and backwards-compatible with the existing settlement codepath.

---

## Scope at a glance

**Tier 1 (built fully — the demo spine):**

1. AI deal capture with ambiguity flagging
2. Vs / % of net settlement engine emitting a structured trace
3. Walkthrough mode with line-level acknowledgment
4. Agent-facing shared artifact (mobile-responsive, preview-only)

**Tier 2 (built as working skeletons — demo-ready, intentionally shallow):**

5. Ambiguity resolution flow (draft + simulated agent reply)
6. Wednesday risk forecast on the show page
7. Missing inputs rail on the show page

**Explicitly cut:**

- Per-line comment threads on the agent artifact
- Extraction for door deals
- Authentication on the agent share link (magic-link token only, for demo)
- Templated agent artifact per agency
- GM-side approval anomaly detection
- Real SMTP / inbound email parsing (simulated)
- Multi-show fleet view / reporting page changes

These cuts are defended in `MEMO.md`.

---

## Time budget (8 hours total)

| Phase | Work | Hours |
|---|---|---|
| 0 | Schema additions + seed updates | 0.75 |
| 1 | New engine (`lib/dealMathV2.ts`) | 1.5 |
| 2 | Deal capture flow + extraction API | 2.0 |
| 3 | Settle page rewrite around V2 | 1.0 |
| 4 | Walkthrough mode overlay | 0.75 |
| 5 | Agent-facing artifact | 1.0 |
| 6 | Ambiguity clarification (Tier 2) | 0.5 |
| 7 | Wednesday risk card (Tier 2) | 0.25 |
| 8 | Missing inputs rail (Tier 2) | 0.25 |
| 9 | Loom recording + memo polish | 1.5 (off the clock for build) |

**Total build: ~8 hours.** Loom + memo polish in addition.

If we slip, the cut-order is: phase 8 → phase 7 → phase 6 → trim phase 5 to desktop-only. Never cut into the Tier 1 spine.

---

## Phase 0 — Schema additions

Files touched: `db/schema.ts`, `db/seed.ts`, new migration via Drizzle.

**Additions to `deals` table (additive, all nullable):**

```ts
recoupsJson:      text("recoups_json"),         // recoups are deal-time, not settlement-time
ambiguitiesJson:  text("ambiguities_json"),     // AI-flagged
sourceProse:      text("source_prose"),         // verbatim deal email
extractedAt:      integer("extracted_at", { mode: "timestamp" }),
confirmedAt:      integer("confirmed_at", { mode: "timestamp" }),
compRulesJson:    text("comp_rules_json"),      // per-deal overrides
```

**New tables:**

```ts
// Line-level acknowledgments captured during the walkthrough
walkthroughAcks: sqliteTable("walkthrough_acks", {
  id: text("id").primaryKey(),
  settlementId: text("settlement_id").notNull().references(() => settlements.id),
  lineKey: text("line_key").notNull(),               // matches TraceStep.key
  ackedByUserId: text("acked_by_user_id"),           // null if agent-side
  ackedAt: integer("acked_at", { mode: "timestamp" }).notNull(),
  disputeNote: text("dispute_note"),                  // if TM disagreed at the table
});

// Clarification emails sent to agents about flagged ambiguities
agentClarifications: sqliteTable("agent_clarifications", {
  id: text("id").primaryKey(),
  dealId: text("deal_id").notNull().references(() => deals.id),
  ambiguityKey: text("ambiguity_key").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  draftText: text("draft_text"),
  responseAt: integer("response_at", { mode: "timestamp" }),
  responseText: text("response_text"),
  parsedResolution: text("parsed_resolution"),       // JSON: what reading the agent confirmed
});

// Shareable links to settlements for agent review
settlementShareLinks: sqliteTable("settlement_share_links", {
  id: text("id").primaryKey(),                        // uuid token used as URL slug
  settlementId: text("settlement_id").notNull().references(() => settlements.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  accessedAt: integer("accessed_at", { mode: "timestamp" }),
  agentSignoffStatus: text("agent_signoff_status", { enum: ["open", "agreed", "questions"] })
    .notNull().default("open"),
  agentSignoffText: text("agent_signoff_text"),
  agentSignoffAt: integer("agent_signoff_at", { mode: "timestamp" }),
});
```

**Seed updates** (`db/seed.ts`):

Populate the `show_coastal_spell_dispute` fixture with full V2-shape data:
- `sourceProse` = the verbatim deal email from the dispute thread
- `recoupsJson` = `[{ category: "marketing", amount: 900, label: "Spotify pre-show ad spend", position: "off_gross", prose_span: "Marketing recoup of $900 against gross" }]`
- `ambiguitiesJson` = the marketing recoup positioning ambiguity per the extraction prompt's Example 3
- `confirmedAt` set so the page renders via the V2 codepath
- `expense_cap` ensured at 2500

This gives the demo a fully-loaded "before/after" example without requiring the extraction API to run during the Loom.

**Commands:**

```bash
npx drizzle-kit generate --name v2_schema
npm run db:reset   # this re-runs seed including the new fixture
```

---

## Phase 1 — New engine

File: `lib/dealMathV2.ts` (new, alongside the existing `lib/dealMath.ts`)

### TraceStep contract

Every downstream surface (settle page, walkthrough, agent artifact) renders off this shape. Stable across the codebase.

```ts
export type TraceStepKind =
  | "gross"
  | "fee"
  | "comp_adjustment"
  | "recoup"
  | "expense"
  | "branch"
  | "bonus"
  | "result";

export type TraceStepFlag = "ambiguity" | "absorbed_by_venue" | "forecast" | "not_triggered";

export type TraceSource =
  | { type: "ticketing"; refIds: string[]; detail?: string }
  | { type: "expense_row"; refIds: string[]; detail?: string }
  | { type: "comp_rule"; category: string }
  | { type: "deal_term"; field: string }
  | { type: "derived"; detail: string };

export type TraceStep = {
  key: string;                  // stable id, used to match walkthrough_acks rows
  label: string;                // human-readable, e.g. "Marketing recoup (off-gross)"
  value: number;                // signed: +5000 or -900
  kind: TraceStepKind;
  source: TraceSource;
  flag?: TraceStepFlag;
  formula?: string;             // optional, for branch/result steps
  detail?: string;              // optional, for "venue absorbed $X over cap"
};

export type SettlementResultV2 =
  | {
      supported: true;
      trace: TraceStep[];
      totalToArtist: number;
      branches: {
        guarantee: number;
        percentage: number;
        winner: "guarantee" | "percentage" | "neither";
      };
      ambiguities: Ambiguity[];   // pass-through from deal
      grossBoxOffice: number;
      netBoxOffice: number;
      totalExpenses: number;
    }
  | {
      supported: false;
      reason: string;
      dealType: Deal["dealType"];
    };
```

### Engine flow

Pseudocode for the calculator. Implement in TS strictly:

```
calculateSettlementV2({ deal, ticketSales, expenses, comps, venueCapacity }):

  trace = []
  
  // 1. Gross box office
  gross = sum(ticketSales.gross)
  trace.add({ kind: "gross", value: gross, source: ticketing })
  
  // 2. Comp adjustments — per-deal override or default
  for each comp:
    if (deal.compRules[comp.category] ?? comp.countsTowardGross):
      gross += comp.count * comp.faceValue
      trace.add({ kind: "comp_adjustment", value: +adj, source: comp_rule })
  
  // 3. Off-gross recoups
  for recoup in deal.recoups where position == "off_gross":
    gross -= recoup.amount
    trace.add({ kind: "recoup", value: -recoup.amount, source: deal_term,
                detail: "Off gross, before fees" })
  
  // 4. Fees
  fees = sum(ticketSales.fees)
  trace.add({ kind: "fee", value: -fees, source: ticketing })
  adjustedGross = gross - fees
  
  // 5. Expenses + inside-cap recoups + cap logic
  operationalExpenses = sum(expenses where not absorbedByVenue)
  insideCapRecoups = sum(deal.recoups where position == "inside_cap")
  totalCappable = operationalExpenses + insideCapRecoups
  cappedTotal = min(totalCappable, deal.expenseCap ?? Infinity)
  absorbedByVenue = totalCappable - cappedTotal
  trace.add({ kind: "expense", value: -cappedTotal, source: expense_row,
              detail: absorbedByVenue > 0 ? `Venue absorbed $${absorbedByVenue} over cap` : undefined,
              flag: absorbedByVenue > 0 ? "absorbed_by_venue" : undefined })
  
  net = adjustedGross - cappedTotal
  
  // 6. Off-net recoups
  for recoup in deal.recoups where position == "off_net":
    net -= recoup.amount
    trace.add({ kind: "recoup", value: -recoup.amount, source: deal_term,
                detail: "Off net, before percentage" })
  
  // 7. Compute branches (vs deal mechanic)
  guaranteeBranch = deal.guaranteeAmount ?? 0
  percentageBranch = computePercentageBranch(net, deal, trace)  // handles flat %, tier ratchets
  
  if (deal.dealType in ["vs", "flat", "percentage_of_net", "percentage_of_gross"]):
    base = max(guaranteeBranch, percentageBranch)
    winner = guaranteeBranch >= percentageBranch ? "guarantee" : "percentage"
    trace.add({ kind: "branch", value: base, source: derived,
                formula: `max(guarantee $${guaranteeBranch}, percentage $${percentageBranch})` })
  
  // 8. Bonuses
  bonusTotal = 0
  for bonus in deal.bonuses:
    if shouldFire(bonus, { gross, tickets, capacity }):
      bonusTotal += bonus.amount
      trace.add({ kind: "bonus", value: +bonus.amount, source: deal_term })
    else:
      trace.add({ kind: "bonus", value: 0, source: deal_term, flag: "not_triggered" })
  
  // 9. Off-artist-share recoups (prior advances, etc.)
  artistTake = base + bonusTotal
  for recoup in deal.recoups where position == "off_artist_share":
    artistTake -= recoup.amount
    trace.add({ kind: "recoup", value: -recoup.amount, source: deal_term })
  
  trace.add({ kind: "result", value: artistTake, source: derived,
              formula: "Total to artist" })
  
  return { supported: true, trace, totalToArtist: artistTake, branches, ambiguities: deal.ambiguities, ... }
```

### Tier ratchet handling

`computePercentageBranch` needs to handle three cases:

- **No ratchet**: simple `net * percentage`
- **Split tier ratchet (`reading: "split"`)**: net is allocated across tiers, each portion gets its tier's percentage
- **Flat ratchet (`reading: "flat_ratchet"`)**: once a tier threshold is crossed, the new percentage applies to all net
- **Ambiguous (`reading: "ambiguous"`)**: pick the *split* reading (conservative for venue) and emit a flag in the trace

For attendance-based ratchets, the threshold is computed against `capacity * percentage` (e.g., 0.80 * 650 = 520 tickets).

For gross-based ratchets, the threshold is direct dollar amount.

### Backwards compatibility

The existing `calculateSettlement` function in `lib/dealMath.ts` stays in place. The settle page checks: `if (deal.confirmedAt) use V2; else use legacy`. Old paid settlements continue to render via the legacy path.

---

## Phase 2 — Deal capture flow

**New routes:**

- `app/shows/[id]/deal/capture/page.tsx` — server component
- `app/shows/[id]/deal/capture/DealCaptureFlow.tsx` — client component
- `app/api/extract-deal/route.ts` — POST handler that calls Claude

**The extraction call** uses the system prompt at `prompts/extraction.md`. The API route loads this file, sends `messages: [{ role: "user", content: pasted_prose }]` with the system prompt, and parses the JSON response. Use `anthropic-ai/sdk` (`@anthropic-ai/sdk`) and model `claude-sonnet-4-6`.

```ts
// app/api/extract-deal/route.ts
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const EXTRACTION_PROMPT = readFileSync(
  join(process.cwd(), "prompts", "extraction.md"),
  "utf-8"
);

export async function POST(req: NextRequest) {
  const { prose } = await req.json();
  
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content: prose }],
  });
  
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const extracted = JSON.parse(extractJsonBlock(text));
  
  return NextResponse.json(extracted);
}
```

**The capture flow UI** (`DealCaptureFlow.tsx`):

Two-column layout, ambiguity rail at the bottom.

- **Left column**: textarea for paste; once extracted, becomes a read-only prose viewer with `<mark>` spans for highlighted source attributions. Hovering a span sets `hoveredProseKey`.
- **Right column**: extracted fields with confidence chips. Each field is editable inline. Hovering a field sets `hoveredFieldKey`, which scrolls the prose to the matching span and highlights it.
- **Ambiguity rail**: cards along the bottom. Each card shows the prose span, the candidate readings as radio buttons, and three actions: `[Lock in this reading]`, `[Send clarification to agent]`, `[Defer]`.
- **Footer**: `[Save deal]` button writes to `deals` table, sets `extractedAt` and `confirmedAt`, redirects to the show page.

Confidence visualization:
- `high` → small green check
- `medium` → amber question mark, requires click to acknowledge
- `low` → red flag, requires explicit confirmation in a tooltip ("Confirm this is correct")

The component uses `useState` for the editable extracted deal. The "Save deal" action POSTs to `/api/save-deal`.

---

## Phase 3 — Settle page rewrite

File: `app/shows/[id]/settle/page.tsx`

The page detects: `if (deal.confirmedAt && isV2Supported(deal)) renderV2(); else renderLegacy();`

**V2 rendering:**

1. Lifecycle bar — extended to show 7 stops: Drafted, Submitted, Reviewed, Signed, Disputed, Finalized, Paid. The `STAGE_ORDER` in `lib/settlementStage.ts` is updated to include Signed and Disputed as first-class stops.
2. Big-number total (artist take) and branch breakdown ("Guarantee branch: $5,000 / Percentage branch: $12,285 — percentage wins")
3. Trace rendered as a sequence of `<TraceLine>` components — one per `TraceStep`
4. Ambiguity panel: any unresolved ambiguities show here as a sidebar; resolved ones show as a collapsed audit log
5. Sticky action bar: `[Walkthrough mode]` `[Send to agent for preview]`

**`<TraceLine>` component shape:**

```tsx
<TraceLine
  step={step}
  ackable={settlement.status === "in_review" || isWalkthroughMode}
  onAck={() => recordAck(step.key)}
  ackedAt={getAck(step.key)}
/>
```

Each line shows: label (left), value (right, mono), source pill (between, expandable on click/hover), ack toggle, ambiguity flag if any.

---

## Phase 4 — Walkthrough mode

File: `app/shows/[id]/settle/Walkthrough.tsx` (client overlay)

Triggered by `[Walkthrough mode]` button on settle page. Full-screen modal with:

- Bigger type (using `text-display` classes)
- One trace line in focus at a time; others dimmed at ~40% opacity
- Progress bar at top showing acknowledged / total
- Each ack writes immediately to `/api/walkthrough-ack` which inserts into `walkthrough_acks`
- "Note" affordance: if TM wants to flag a line as questioned, capture short text inline
- End-of-walkthrough screen: "Walkthrough complete." → `[Send to agent for review]` → creates `settlementShareLink`, shows URL + copy button + QR code (for Diego on his phone)

---

## Phase 5 — Agent-facing artifact

Routes:

- `app/shared/settlement/[token]/page.tsx` — server component
- `app/shared/settlement/[token]/AgentArtifact.tsx` — client component

**Behavior:**

- Token lookup against `settlement_share_links`. Update `accessedAt` on first read.
- Renders deal terms panel + same trace as the walkthrough, read-only
- Trace source pills are tappable (touch-friendly) — expand into a small card showing receipts, ticketing rows, deal term references
- Mobile-responsive via Tailwind:
  - `<lg`: trace is a vertical stack with expandable provenance per line
  - `lg+`: trace is the same two-column layout as the settle page

**Signoff:**

- Bottom of artifact: `[I agree]` / `[I have questions]` buttons
- `[I agree]` writes `agentSignoffStatus = "agreed"` and `agentSignoffAt = now()`
- `[I have questions]` opens a small textarea; submission writes `agentSignoffStatus = "questions"` + the text
- Signoff state flows back to Mariana's view on the settle page (`<AgentSignoffStatus>` badge)

**No auth.** The token is treated as a magic link for demo purposes. Tokens are long random UUIDs. Memo notes this would become a proper auth flow in production.

---

## Phase 6 — Ambiguity clarification flow (Tier 2)

When the deal-capture flow's ambiguity card `[Send clarification to agent]` is clicked:

1. POST to `/api/draft-clarification` with the ambiguity context
2. Claude (using `prompts/clarification.md`) drafts the email
3. Modal opens with the draft, editable
4. `[Send]` writes the row to `agent_clarifications`, sets `sentAt`, returns a "Sent ✓" state
5. **Demo-only**: a `[Simulate agent reply: <reading>]` button appears below the sent message. Clicking it writes a synthetic response into `agent_clarifications.responseText`, sets `parsedResolution`, and updates the deal's ambiguity status to "resolved" with the chosen reading.

After resolution, the deal record is updated:
- Recoup position flips (e.g., `off_gross` → `inside_cap`)
- The ambiguity card collapses into a resolved state with a "Resolved by [agent name] at [time]" annotation
- The settle page math, if reopened, runs with the new structured deal

**This is the money shot of the demo.** The Loom should specifically show: paste deal → see ambiguity → send clarification → simulate reply: "inside cap" → reload settle page → number flips from $11,565 to $12,285.

---

## Phase 7 — Wednesday risk forecast (Tier 2)

File: `app/shows/[id]/page.tsx` — add `<SettlementRiskCard>` server component

Reads:
- Deal ambiguities — count unresolved
- Recoup categories on the deal — compare to historical dispute rates (hardcode the rates from our SQLite queries: marketing 19%, production_overage 47%, hospitality_overage 36%, prior_advance 0%)
- Expense entry completeness (median historical: 5 categories per show, see if expected categories are present)

Score:
- **green** ("Looks clean"): no unresolved ambiguities, no high-dispute-rate recoups, expenses ≥80% of expected
- **amber** ("Worth a look"): 1 unresolved ambiguity OR one high-dispute recoup
- **red** ("This one's going to be contested"): 2+ unresolved ambiguities OR multiple high-dispute recoups OR no expenses entered with 2 days to show

Display: a single card with the color, the score label, and a bulleted list of specific concerns ("Marketing recoup position unresolved — 19% historical dispute rate"). One CTA: "Resolve before show night" → links back to deal capture flow.

---

## Phase 8 — Missing inputs rail (Tier 2)

File: `app/shows/[id]/page.tsx` — add a right-side rail

Lists:
- Expected expense categories (sound, lights, hospitality, production, backline) — compare against entered
- If a category is missing, show: "Sound: not entered. Last 10 vs deals averaged $400."
- Comps not yet logged
- Deal not yet confirmed (if `extractedAt` but not `confirmedAt`)

Each item links to the entry surface. The historical median lookup is a single query at page load — server-side, no client state.

---

## Phase 9 — Loom recording + memo polish

### Loom script (5–8 minutes)

**Open (30s)** — "I'm walking you through the slice I picked for this case study: deal capture as the source of truth, plus a walkthrough-aware settlement statement. Here's why."

**Problem (45s)** — "Settlement has two failure modes wearing one name. The 2am session is *hard* because the engine can't compute 63% of deal types and expenses arrive late. The 2am session produces *disputes* because deal interpretation lives in prose and the wrong person signs at the table. Every disputed settlement in the database — all 22 of them — has positive TM signoff text. The agent disagreed the next morning. The slice attacks both."

**The setup — show today's broken state (45s)** — Open Coastal Spell deal page, show structured fields next to deal_notes_freetext. "The structured fields are abandoned; the prose is the truth. The schema comment literally says so. Open the settle page — 'in-app tool can't settle a vs deal yet.' Mariana goes to a spreadsheet. The product has a UI affordance for its own defeat."

**Deal capture (90s)** — Navigate to `/shows/[coastal-spell]/deal/capture`. Paste the original Coastal Spell deal email from the dispute thread. Click Extract. "The AI reads the prose, projects it into structured terms with confidence chips, and flags one ambiguity — the marketing recoup positioning. Hover any prose span, see what field it produced. Hover any field, see the source. Two-way traceability."

**Resolve the ambiguity (60s)** — Click "Send clarification to Andrea." Show the drafted email. "Notice the tone — it leads with our reading, names the alternative, asks for confirmation. Mariana edits one sentence and sends." Click "Simulate agent reply: inside cap." "Andrea confirms. The deal record updates. The recoup position is now structured truth."

**Risk forecast (30s)** — Navigate back to the show page. Show the risk card flipping from amber to green. "Wednesday foreknowledge. The dispute that cost $720 in March 2025 isn't going to fire."

**Settle page + walkthrough (90s)** — Click into the settle page. Show the trace running on the V2 engine. Every line has a source. Click into a line — see the receipt. "Big numbers, full provenance, every line acknowledged-or-disputed individually." Trigger walkthrough mode. Walk through 3 lines on camera, acknowledging each. "The paper trail Mariana asked for, captured at the moment of agreement."

**Agent artifact (45s)** — End walkthrough. Open the share link. Drag the window narrow to show mobile responsiveness. "Diego pulls this up on his phone in the van. Same data, smaller layout, async signoff. The asymmetric document becomes a shared artifact."

**Close (30s)** — "What I cut: door deals, per-line agent comments, real email delivery, GM anomaly view, multi-show fleet view. What I'd ship next: real auth on the share link, agent-side mobile-native view, GM approval anomaly flagging, deal capture as input to the advance workflow. The full story is in the memo. Thanks."

### Memo polish

After the build, walk through `MEMO.md` against what actually shipped. Update validation targets with actual numbers from replay tests where possible.

---

## Validation tests to run after build

Three tests in order of cost:

1. **Coastal Spell replay**: pull the original deal email from `data/dispute-thread.md`. Paste into the capture flow. Verify: (a) the marketing recoup positioning ambiguity fires, (b) the simulated agent reply produces the correct $12,285 total. *This is the demo's claim, validated.*

2. **Historic disputes replay**: query all 22 disputed settlements. For each, extract the deal prose via the capture flow API. Measure: what % surface at least one ambiguity that would have been flagged? Target: ≥70%.

3. **Coverage parity**: run the V2 engine on all 184 vs deals and 103 % of net deals. For each, verify the engine returns `supported: true` and a non-empty trace. Target: 100%.

These tests should be a script in `/scripts/validate.ts` runnable via `npx tsx scripts/validate.ts`.

---

## Engineering notes for Claude Code

A few things to be opinionated about during execution:

- **Don't break the existing settlement page rendering** for legacy paid settlements. The page detects engine version and falls through to the legacy renderer when needed.
- **Preserve the prose verbatim** — never normalize whitespace, never rewrite. `sourceProse` is sacred.
- **`TraceStep.key` must be stable across renders** so walkthrough acks can be matched. Use a deterministic key like `recoup_marketing_0` or `expense_capped` — not random UUIDs.
- **Use the existing UI primitives** (`Card`, `Badge`, `Field` from `components/ui/`) before reaching for new components. The visual language is consistent and we don't want to fork it.
- **The extraction prompt is a markdown file loaded at runtime.** This is intentional — it's the highest-craft single artifact in the slice and iterating on it without touching code is the point.
- **All AI calls go through `/api/*` routes**, never client-side. API keys never reach the browser.
- **For the demo path, hardcode the venue capacity (650)** rather than threading through the schema for tier-ratchet attendance evaluation. Note this in the memo as a cut.

If you get stuck on anything: make a reasonable assumption, call it out as a `// TODO(case-study)` comment, and proceed. The brief explicitly says "if you ever get stuck on any part of the process, make reasonable assumptions > call those out > unblock yourself and proceed."

---

## Files this build creates or modifies

**Creates:**
- `prompts/extraction.md`, `prompts/clarification.md` (already in place)
- `lib/dealMathV2.ts`
- `app/api/extract-deal/route.ts`
- `app/api/save-deal/route.ts`
- `app/api/draft-clarification/route.ts`
- `app/api/simulate-agent-reply/route.ts`
- `app/api/walkthrough-ack/route.ts`
- `app/api/agent-signoff/route.ts`
- `app/shows/[id]/deal/capture/page.tsx`
- `app/shows/[id]/deal/capture/DealCaptureFlow.tsx`
- `app/shows/[id]/settle/Walkthrough.tsx`
- `app/shared/settlement/[token]/page.tsx`
- `app/shared/settlement/[token]/AgentArtifact.tsx`
- `components/settlement/TraceLine.tsx`
- `components/settlement/AmbiguityCard.tsx`
- `components/show/SettlementRiskCard.tsx`
- `components/show/MissingInputsRail.tsx`
- `scripts/validate.ts`
- `MEMO.md`

**Modifies:**
- `db/schema.ts`
- `db/seed.ts`
- `lib/settlementStage.ts` (add Signed/Disputed as first-class stops)
- `lib/queries.ts` (add queries for share links, walkthrough acks)
- `app/shows/[id]/settle/page.tsx` (V2 codepath)
- `app/shows/[id]/page.tsx` (add risk card + missing inputs rail)
- `package.json` (add `@anthropic-ai/sdk`)
- `.env.example` (add `ANTHROPIC_API_KEY`)
