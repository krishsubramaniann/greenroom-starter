# BUILD_PLAN.md

This is the execution plan for the case-study slice: **the deal-to-wire workflow with the deal as shared source of truth, the live settlement ledger that fills in throughout the week, the walkthrough that confirms rather than constructs, and the unified activity log that captures every event.** Read `MEMO.md` for the strategic framing.

The build is structured for execution by Claude Code. It's phased, additive, and backwards-compatible with the existing settlement codepath.

---

## Scope at a glance

**Built fully (the demo spine):**

1. AI deal capture with ambiguity flagging (canned response for Coastal Spell; live extraction optional via API key)
2. Vs / % of net settlement engine emitting a structured trace
3. Live settlement ledger (rewritten settle page that's "live" all week)
4. Walkthrough / confirmation mode with line-level acknowledgment
5. Agent-facing magic-link artifact (deal confirmation + settlement preview, mobile-responsive)
6. Unified activity log on the show/deal page
7. Production manager mobile expense entry (canned OCR)
8. GM mobile approval view

**Mocked but functional in the demo:**

- AI extraction (canned JSON for Coastal Spell; real API call optional if `ANTHROPIC_API_KEY` is set)
- Receipt OCR (canned auto-fill on the mobile form)
- Email integration (mocked events in the activity log; deal-anchored reply addresses described but no SMTP)
- Agent reply parsing (simulated via a demo button)
- POS ticket sales updates (manually refreshable; no real integration)

**Explicitly cut:**

- Per-line agent comment threads (replaced by per-clause magic-link comments)
- Extraction for door deals (different physical workflow)
- Real authentication (magic-link tokens only)
- Templated artifacts per agency (one default template)
- Multi-show fleet view
- Reporting page changes
- Real SMTP / inbound email parsing

These cuts are defended in `MEMO.md`.

---

## Time budget (8 hours of build + 1.5 hrs Loom/memo)

| Phase | Work | Hours |
|---|---|---|
| 0 | Schema additions + seed updates | 0.75 |
| 1 | V2 engine (`lib/dealMathV2.ts`) | 1.5 |
| 2 | Deal capture flow + canned extraction API | 1.5 |
| 3 | Settle page rewrite around V2 (live ledger) | 1.0 |
| 4 | Walkthrough / confirmation mode | 0.75 |
| 5 | Agent-facing artifact (deal + settlement) | 1.0 |
| 6 | Unified activity log component | 0.75 |
| 7 | Production manager mobile expense entry | 0.75 |
| 8 | GM mobile approval view | 0.5 |
| 9 | Loom recording + memo polish | 1.5 (off the clock) |

**Total build: ~8.5 hrs.** Loom + memo polish in addition.

If we slip, the cut order is:
- Phase 8 (GM approval — describe in memo, mock with a screenshot)
- Phase 7 mobile-styling polish (functional desktop form is enough)
- Phase 6 → simpler inline event list instead of full component
- Never cut into Phases 1–5 (the demo spine)

---

## Phase 0 — Schema additions

Files touched: `db/schema.ts`, `db/seed.ts`, new migration via Drizzle, `db/seed-activity.ts` (new).

### Additions to `deals` table (additive, all nullable)

```ts
recoupsJson:      text("recoups_json"),         // recoups are deal-time, not settlement-time
ambiguitiesJson:  text("ambiguities_json"),     // AI-flagged
sourceProse:      text("source_prose"),         // verbatim deal email
extractedAt:      integer("extracted_at", { mode: "timestamp" }),
confirmedAt:      integer("confirmed_at", { mode: "timestamp" }),
compRulesJson:    text("comp_rules_json"),      // per-deal overrides
externalId:       text("external_id"),          // CRES-COA-2025-03-14 style, human-readable
```

### New tables

```ts
// Line-level acknowledgments captured during the walkthrough
walkthroughAcks: sqliteTable("walkthrough_acks", {
  id: text("id").primaryKey(),
  settlementId: text("settlement_id").notNull().references(() => settlements.id),
  lineKey: text("line_key").notNull(),               // matches TraceStep.key
  ackedByUserId: text("acked_by_user_id"),
  ackedByActorType: text("acked_by_actor_type", { enum: ["user", "tour_manager", "agent"] }),
  ackedByName: text("acked_by_name"),                 // denormalized
  ackedAt: integer("acked_at", { mode: "timestamp" }).notNull(),
  disputeNote: text("dispute_note"),
});

// Shareable links to deals and settlements
shareLinks: sqliteTable("share_links", {
  id: text("id").primaryKey(),                        // uuid token used as URL slug
  resourceType: text("resource_type", { enum: ["deal", "settlement"] }).notNull(),
  resourceId: text("resource_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  accessedAt: integer("accessed_at", { mode: "timestamp" }),
  signoffStatus: text("signoff_status", { enum: ["open", "agreed", "questions"] })
    .notNull().default("open"),
  signoffText: text("signoff_text"),
  signoffByName: text("signoff_by_name"),
  signoffAt: integer("signoff_at", { mode: "timestamp" }),
});

// Clause-level comments on deals
clauseComments: sqliteTable("clause_comments", {
  id: text("id").primaryKey(),
  dealId: text("deal_id").notNull().references(() => deals.id),
  clauseRef: text("clause_ref").notNull(),            // e.g., "recoups[0].position"
  actorType: text("actor_type", { enum: ["user", "agent", "tour_manager"] }).notNull(),
  actorName: text("actor_name").notNull(),
  body: text("body").notNull(),
  channel: text("channel", { enum: ["magic_link_inline", "email_reply", "in_app"] }).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Unified activity events feed
activityEvents: sqliteTable("activity_events", {
  id: text("id").primaryKey(),
  dealId: text("deal_id"),
  showId: text("show_id"),
  settlementId: text("settlement_id"),
  eventType: text("event_type").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role"),
  payloadJson: text("payload_json"),
  summary: text("summary").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
});
```

### Seed updates

`db/seed.ts`:
- Populate `show_coastal_spell_dispute` fixture with full V2-shape data including the structured marketing recoup
- Set `confirmedAt` so the page renders via the V2 codepath
- Add a second show in "deal-locked, week-of-show" state for the live demo (use existing Pale Lake show, or add one)

`db/seed-activity.ts`:
- Import the seed events from `canned/activity-log-seed.ts` (provided)
- Insert into `activity_events` for both Coastal Spell and Pale Lake

### Commands

```bash
npx drizzle-kit generate --name v2_schema
npm run db:reset   # this re-runs seed including the new fixtures
```

---

## Phase 1 — New engine

File: `lib/dealMathV2.ts` (new, alongside the existing `lib/dealMath.ts`)

### TraceStep contract

Every downstream surface (settle page, walkthrough, agent artifact, activity log) renders off this shape.

```ts
export type TraceStepKind =
  | "gross" | "fee" | "comp_adjustment" | "recoup"
  | "expense" | "branch" | "bonus" | "result";

export type TraceStepFlag = "ambiguity" | "absorbed_by_venue" | "forecast" | "not_triggered";

export type TraceSource =
  | { type: "ticketing"; refIds: string[]; detail?: string }
  | { type: "expense_row"; refIds: string[]; detail?: string }
  | { type: "comp_rule"; category: string }
  | { type: "deal_term"; field: string }
  | { type: "derived"; detail: string };

export type TraceStep = {
  key: string;                  // stable id, used to match walkthrough_acks rows
  label: string;
  value: number;                // signed: +5000 or -900
  kind: TraceStepKind;
  source: TraceSource;
  flag?: TraceStepFlag;
  formula?: string;
  detail?: string;
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
      ambiguities: Ambiguity[];
      grossBoxOffice: number;
      netBoxOffice: number;
      totalExpenses: number;
    }
  | { supported: false; reason: string; dealType: Deal["dealType"] };
```

### Engine flow

(See `lib/dealMath.ts` for the existing single-branch implementation. V2 needs the vs branch, recoup positioning, tier ratchets, and trace emission.)

```
calculateSettlementV2({ deal, ticketSales, expenses, comps, venueCapacity }):

  trace = []

  // 1. Gross box office (from ticketing)
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
    trace.add({ kind: "recoup", value: -recoup.amount, source: deal_term })

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
  trace.add({ kind: "expense", value: -cappedTotal, ..., flag: absorbedByVenue > 0 ? "absorbed_by_venue" : undefined })

  net = adjustedGross - cappedTotal

  // 6. Off-net recoups
  for recoup in deal.recoups where position == "off_net":
    net -= recoup.amount
    trace.add({ kind: "recoup", value: -recoup.amount, source: deal_term })

  // 7. Compute branches (vs deal mechanic)
  guaranteeBranch = deal.guaranteeAmount ?? 0
  percentageBranch = computePercentageBranch(net, deal, trace)  // handles flat % or tier ratchets
  base = max(guaranteeBranch, percentageBranch)
  trace.add({ kind: "branch", value: base, formula: `max(${guaranteeBranch}, ${percentageBranch})` })

  // 8. Bonuses
  for bonus in deal.bonuses:
    if shouldFire(bonus, { gross, tickets, capacity }):
      trace.add({ kind: "bonus", value: +bonus.amount })
    else:
      trace.add({ kind: "bonus", value: 0, flag: "not_triggered" })

  // 9. Off-artist-share recoups
  artistTake = base + bonusTotal
  for recoup in deal.recoups where position == "off_artist_share":
    artistTake -= recoup.amount
    trace.add({ kind: "recoup", value: -recoup.amount })

  trace.add({ kind: "result", value: artistTake, formula: "Total to artist" })

  return { supported: true, trace, totalToArtist: artistTake, branches, ambiguities }
```

### Tier ratchet handling

`computePercentageBranch` handles four cases:
- No ratchet: simple `net * percentage`
- Split (`reading: "split"`): net allocated across tiers
- Flat ratchet (`reading: "flat_ratchet"`): new percentage applies to all net once threshold hit
- Ambiguous (`reading: "ambiguous"`): pick split (conservative) and emit flag

### Backwards compatibility

`if (deal.confirmedAt) use V2; else use legacy.` Old paid settlements continue to render via the legacy path.

---

## Phase 2 — Deal capture flow

**New routes:**
- `app/shows/[id]/deal/capture/page.tsx` — server component
- `app/shows/[id]/deal/capture/DealCaptureFlow.tsx` — client component
- `app/api/extract-deal/route.ts` — POST handler

### Extraction API: canned-by-default, API-optional

The route checks for `ANTHROPIC_API_KEY` in env:

```ts
// app/api/extract-deal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

const CANNED_PATH = join(process.cwd(), "lib/canned/coastal-spell-extraction.json");
const CANNED = JSON.parse(readFileSync(CANNED_PATH, "utf-8"));

export async function POST(req: NextRequest) {
  const { prose } = await req.json();

  // Demo-friendly: simulate AI latency
  await new Promise((r) => setTimeout(r, 1500));

  // If the prose matches the Coastal Spell email (or any prose, in demo mode),
  // return the canned response. If ANTHROPIC_API_KEY is set, call real API instead.
  if (process.env.ANTHROPIC_API_KEY && !proseMatchesCannedExample(prose)) {
    return NextResponse.json(await callRealClaude(prose));
  }
  return NextResponse.json(CANNED);
}
```

The canned JSON is in `lib/canned/coastal-spell-extraction.json` (provided alongside this build plan).

### UI layout

Two-column split + ambiguity rail at the bottom.

- **Left column**: textarea for paste; once extracted, becomes read-only prose viewer with `<mark>` spans
- **Right column**: extracted fields with confidence chips (`high` ✓, `medium` ?, `low` ⚠)
- **Hover bidirectional**: hovering a prose span highlights the matching field; hovering a field highlights the prose
- **Ambiguity rail at the bottom**: cards with prose span, candidate readings (radio buttons), suggested clarification, action buttons
- **Footer**: `[Save deal]` writes to deals + activity_events tables

### Clarification flow

When `[Send clarification to agent]` is clicked on an ambiguity card:
- POST to `/api/draft-clarification` — returns canned draft (the marketing recoup clarification from `prompts/clarification.md` Example 1)
- Modal opens with the draft, editable
- `[Send]` writes `clauseComments` row + `activity_event` (type: `confirmation_sent`)
- A `[Simulate agent reply: inside cap]` button appears below → writes a synthetic agent comment + resolves the ambiguity + re-renders

---

## Phase 3 — Settle page rewrite (live ledger)

File: `app/shows/[id]/settle/page.tsx`

Detect version: `if (deal.confirmedAt && isV2Supported(deal)) renderV2(); else renderLegacy();`

### V2 rendering

1. **Lifecycle bar** — 7 stops including Signed and Disputed as first-class (currently collapsed)
2. **Big number + branch summary** — total to artist + "Guarantee branch: $5,000 / Percentage branch: $12,285 — percentage wins"
3. **Trace** — vertical list of `<TraceLine>` components (label, value, source pill, kind icon, ambiguity flag, ack toggle)
4. **Ambiguity panel** — sidebar if unresolved ambiguities remain
5. **Sticky action bar**: `[Walkthrough mode]` `[Send to agent for preview]`

### `<TraceLine>` component

```tsx
<TraceLine
  step={step}
  ackable={settlement.status === "in_review" || isWalkthroughMode}
  ackedBy={getAck(step.key)}
  onAck={(disputeNote?) => recordAck(step.key, disputeNote)}
/>
```

Shows: label (left), value (right, mono), source pill (between, expandable), ack toggle, ambiguity flag.

### Live ledger framing

The page is "live" — meaning the trace recomputes whenever the underlying data changes (new expense, new ticket sale, ambiguity resolved). For the demo, this means revisiting the page after the production manager logs an expense shows the updated total.

---

## Phase 4 — Walkthrough / confirmation mode

File: `app/shows/[id]/settle/Walkthrough.tsx` (client overlay)

Triggered by `[Walkthrough mode]`. Full-screen modal.

- Bigger type (`text-display`)
- One trace line in focus; others dimmed
- Progress bar: "3 of 12 acknowledged"
- Each ack writes immediately to `walkthrough_acks` + `activity_events`
- "Note" affordance for inline disputes
- End screen: "Walkthrough complete. Send to agent?" → creates `shareLink`, shows URL + copy button + QR code

---

## Phase 5 — Agent-facing artifact

Routes:
- `app/shared/deal/[token]/page.tsx` — deal confirmation
- `app/shared/settlement/[token]/page.tsx` — settlement preview

### Deal confirmation page

- Renders structured deal terms read-only
- Each clause has a comment thread (click to expand, type comment)
- Comments write to `clauseComments` + `activity_events`
- Bottom: `[Confirm deal]` button → writes signoffStatus = "agreed" on the deal's share link

### Settlement preview page

- Renders the same trace as the walkthrough, read-only
- Deal terms panel at top (collapsible)
- Trace source pills tappable (touch-friendly) — expand into provenance detail
- **Mobile-responsive** via Tailwind container queries
- Bottom: `[I agree]` / `[I have questions]` (with optional textarea)
- Writes signoff state back; flows into Mariana's view

**No auth** for demo. Tokens are long random UUIDs. Memo notes production would use proper magic-link auth with expiry.

---

## Phase 6 — Unified activity log

File: `components/activity/ActivityLog.tsx`

Renders the chronological event feed for a deal/show/settlement. Reads from `activity_events` table.

### Component shape

```tsx
<ActivityLog
  dealId={dealId}
  showId={showId}
  filter={{ types: ["all"] }}   // optional filter
  limit={50}
/>
```

### Visual design

Vertical timeline. Each event:
- Icon (varies by `actorType` + `eventType`)
- Timestamp (left)
- Actor name + role
- Summary (one line)
- Expandable detail (clicking shows payload)

Event-type icons:
- ⚙ system events (auto)
- ✉ external communications (email, comments)
- 📷 capture events (receipts, photos)
- ✓ acknowledgments
- 💼 approvals (GM)

### Placement

- Full timeline on `/shows/[id]` (collapsed by default, "View activity (28 events)" expander)
- Last 5 events on settle page sidebar
- Full timeline visible on agent share link (transparency surface)

### Data source

Auto-generated from existing event timestamps + the seed events from `canned/activity-log-seed.ts`. Future events (during the live demo) are written by the app at the moment of the action.

---

## Phase 7 — Production manager mobile expense entry

Route: `app/m/expense/page.tsx` (the `/m/*` namespace signals mobile-first)

### Design

A phone-shaped container (max-width ~420px) styled to look like a mobile app. Big touch targets, single column.

Fields:
- **Show**: auto-selected (latest in-progress show), with override dropdown
- **Category**: pill buttons — Hospitality / Sound / Lights / Production / Backline / Marketing / Other
- **Amount**: large numeric input
- **Description**: optional text
- **[Attach receipt]** button — opens file picker, mocked to use a stock receipt image

### Canned OCR behavior

When a receipt is "attached" (any file or just clicking the button in demo mode), the form pre-fills:
- Amount: $480.00 (matches Mike Chen's seed event)
- Vendor: "The Crescent Bar"
- Receipt photo preview thumbnail (a generic stock receipt image)

Loading state shows "Reading receipt..." for 1.5 seconds before pre-fill, simulating OCR.

### Submit behavior

`[Log expense]` button writes:
- New row to `expenses` table tagged to deal ID
- Event to `activity_events` (type: `expense_logged`, actorType: `production_manager`)
- Returns to a success screen with "Logged ✓" and "Log another" button

The activity log on Mariana's side updates immediately (server-side rendering means next page load shows it).

### Mocked "auth"

No login screen. Page assumes the user is Mike Chen (hardcoded for demo). A small "Logged in as Mike Chen (PM)" indicator in the header.

---

## Phase 8 — GM mobile approval

Route: `app/m/approve/[token]/page.tsx`

### Design

Phone-shaped container. Three sections:

1. **Header**: "$12,285 to Coastal Spell"
2. **Summary**: deal terms (collapsed), branch result, anomalies flagged
3. **Sign-off chain**: TM ack ✓, agent ack ✓, GM (pending)
4. **Actions**: `[Approve wire]` (primary) / `[Question]` (secondary, opens textarea)

### Anomaly callouts

System highlights:
- Absorbed amounts ("Venue absorbed $80 over hospitality cap")
- Ambiguities (none for Coastal Spell since we resolved upstream)
- Unusual variance from forecast

### Submit behavior

`[Approve wire]` writes to `activity_events` (type: `gm_approved`) + updates settlement status. Page transitions to "Wire approved. Mariana will process on Monday."

### Mocked auth

Same as Phase 7 — hardcoded as Marcus for demo.

---

## Phase 9 — Loom recording + memo polish

### Loom script (6–8 minutes)

**Open (30s)** — *"I'm walking through the slice I picked for the Greenroom case study: rebuilding settlement so it's not a 2am construction event. Here's why."*

**Problem (45s)** — *"Settlement has two failure modes wearing one name. The session is hard because the engine can't compute 63% of deal types and expenses arrive late. The session produces disputes because deal interpretation lives in prose and the wrong person signs at the table. Every disputed settlement in the database — all 22 — has positive TM signoff text. The agent disagreed the next morning. The slice attacks both."*

**Show today's broken state (45s)** — Open Coastal Spell show page. Show structured fields next to `deal_notes_freetext` with the "in-app tool can't settle a vs deal yet" message. *"Mariana goes to a spreadsheet. The product has a UI affordance for its own defeat."*

**Deal capture (90s)** — Navigate to `/shows/[id]/deal/capture`. Paste the original Coastal Spell deal email. Click Extract. *"The AI projects prose into structured terms with confidence chips and flags one ambiguity — the marketing recoup positioning. Hover any prose span, see what field it produced. Hover any field, see the source. Two-way traceability."*

**Resolve the ambiguity (60s)** — Click "Send clarification to Andrea." Show drafted email. *"Notice the tone — leads with our reading, names the alternative, asks for confirmation."* Click "Simulate agent reply: inside cap." *"Andrea confirms. The deal record updates. The recoup position is now structured truth."*

**Pre-show transparency (45s)** — Back to show page. Show the activity log: deal captured, ambiguity flagged, confirmation sent, agent commented, ambiguity resolved, deal locked. *"This is the audit trail Mariana didn't have. Every event timestamped, every actor named. The deal stops being a ghost."*

**During-show window (60s)** — Open a phone-sized window. Navigate to `/m/expense`. *"Mike, the production manager, logs the hospitality bill from his phone at 11:31pm."* Attach receipt → OCR pre-fills $480 → flag for over-cap → submit. Switch back to Mariana's view → her activity log shows the new event → settle page shows updated number. *"The data is in the system the moment it happens. Mariana isn't waiting at 2am to reconstruct."*

**Settlement = confirmation (90s)** — Click into settle page. Show the trace running on the V2 engine — every line has a source. Click into a line → see the receipt. *"Big numbers, full provenance, every line acknowledged-or-disputed individually."* Trigger walkthrough mode. Walk through 3 lines on camera, acknowledging each. *"The paper trail Mariana asked for, captured at the moment of agreement. Eight minutes instead of ninety."*

**Agent + GM signoff (60s)** — End walkthrough. Open the share link in a new tab — *"This is what Andrea sees Sunday morning."* Show the deal terms panel + the trace. Click "I agree." Switch tabs to GM mobile approval — *"This is what Marcus sees from his couch."* Show summary, anomaly callouts, sign-off chain. Click Approve. *"Wire goes Monday. Total elapsed: 59 hours from end of show to approved."*

**Close (30s)** — *"This was the same deal, same parties, same potential dispute. The dispute didn't happen because the ambiguity was resolved in December. The 2am session didn't happen because the data was already there. The agent's review took 5 minutes because they were looking at the same artifact they'd been part of for three months. What I cut: door deals, real email parsing, full templated artifacts, GM-side anomaly detection — described in the memo. What I'd ship next is in the memo. Thanks."*

### Memo polish

After the build, walk through `MEMO.md` against what actually shipped. Add a "What's running in the prototype vs what's mocked" subsection if anything diverged from the plan.

---

## Validation tests to run after build

Three tests, ordered by cost. Optional but worth running if time allows.

1. **Coastal Spell replay**: pull the original deal email from `data/dispute-thread.md`. Paste into the capture flow. Verify: (a) marketing recoup positioning ambiguity fires, (b) simulated agent reply produces $12,285. *This is the demo's claim, validated.*

2. **Historic disputes replay**: query all 22 disputed settlements. For each, run their deal prose through the canned extraction (or a stubbed extractor). Count: what fraction surface at least one ambiguity. *Target: ≥70% (the prompt is conservative on ambiguity flagging).*

3. **Coverage parity**: run V2 engine on all 184 vs deals and 103 % of net deals. Verify each returns `supported: true` and a non-empty trace. *Target: 100%.*

Optional `scripts/validate.ts` runnable via `npx tsx scripts/validate.ts`.

---

## Engineering notes for Claude Code

A few things to be opinionated about during execution:

- **Don't break legacy rendering.** The settle page falls through to the existing engine for old paid settlements. New deals go through V2.
- **Preserve prose verbatim.** `sourceProse` is sacred — never normalize whitespace, never rewrite.
- **`TraceStep.key` must be stable.** Use deterministic keys like `recoup_marketing_0`, not random UUIDs. The walkthrough acks depend on them.
- **Use existing UI primitives.** `Card`, `Badge`, `Field` from `components/ui/`. Don't fork the visual language.
- **Extraction prompt + clarification prompt are markdown files** loaded at runtime from `prompts/extraction.md` and `prompts/clarification.md`. They're intentionally not in code — iterating on them shouldn't require a rebuild.
- **Canned files**: `lib/canned/coastal-spell-extraction.json` (provided) is the extraction response. `db/seed-activity.ts` (provided as `canned/activity-log-seed.ts`) seeds the activity events.
- **All AI calls go through `/api/*` routes**, never client-side.
- **For the demo path, hardcode the venue capacity (650)** rather than threading through the schema for tier-ratchet attendance evaluation.
- **Mobile pages** (`/m/expense`, `/m/approve/[token]`) should use a max-width container styled as phone-shaped. Don't engineer true mobile-only — just look right when shrunk.

If you get stuck on anything: make a reasonable assumption, comment `// TODO(case-study)`, and proceed. The brief explicitly says *"if you ever get stuck on any part of the process, make reasonable assumptions > call those out > unblock yourself and proceed."*

---

## Files this build creates or modifies

**Creates:**
- `prompts/extraction.md`, `prompts/clarification.md` (already in place)
- `lib/canned/coastal-spell-extraction.json` (provided)
- `lib/dealMathV2.ts`
- `app/api/extract-deal/route.ts`
- `app/api/save-deal/route.ts`
- `app/api/draft-clarification/route.ts`
- `app/api/simulate-agent-reply/route.ts`
- `app/api/walkthrough-ack/route.ts`
- `app/api/agent-signoff/route.ts`
- `app/api/log-expense/route.ts`
- `app/api/gm-approve/route.ts`
- `app/shows/[id]/deal/capture/page.tsx`
- `app/shows/[id]/deal/capture/DealCaptureFlow.tsx`
- `app/shows/[id]/settle/Walkthrough.tsx`
- `app/shared/deal/[token]/page.tsx`
- `app/shared/deal/[token]/DealConfirmation.tsx`
- `app/shared/settlement/[token]/page.tsx`
- `app/shared/settlement/[token]/AgentArtifact.tsx`
- `app/m/expense/page.tsx`
- `app/m/expense/ExpenseForm.tsx`
- `app/m/approve/[token]/page.tsx`
- `app/m/approve/[token]/GMApproval.tsx`
- `components/settlement/TraceLine.tsx`
- `components/settlement/AmbiguityCard.tsx`
- `components/activity/ActivityLog.tsx`
- `components/activity/ActivityEvent.tsx`
- `db/seed-activity.ts`
- `MEMO.md`

**Modifies:**
- `db/schema.ts`
- `db/seed.ts`
- `lib/settlementStage.ts` (add Signed/Disputed as first-class stops)
- `lib/queries.ts` (add queries for share links, walkthrough acks, activity events, clause comments)
- `app/shows/[id]/settle/page.tsx` (V2 codepath)
- `app/shows/[id]/page.tsx` (add deal capture CTA, activity log section)
- `package.json` (optional: `@anthropic-ai/sdk` if using real API)
- `.env.example` (optional: `ANTHROPIC_API_KEY`)
