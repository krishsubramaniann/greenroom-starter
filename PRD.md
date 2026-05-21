# PRD: Deal-to-Wire Workflow

**Product area:** Settlement (and the upstream/downstream surfaces it depends on)
**Target release:** Q1 craft bet (per CEO Q4 memo)
**Owner:** [PM candidate]
**Status:** Prototype shipped; described in `MEMO.md`; ready for build estimation

---

## Summary

Replace the current post-show settlement construction event with a **continuously assembled deal-to-wire workflow**: deal captured structurally weeks before the show, costs flowing in throughout the week, settlement already computed by show end, walkthrough is a 5-minute confirmation, agent signs off async, GM approves wire from their phone. Every event in a unified activity log. The deal record (with a human-readable ID like `CRES-COA-2025-03-14`) is the cross-system anchor.

## Problem

Independent venues operate without the resources of arena-scale promoters but settle the same complex deal types. The current Greenroom settlement tool covers only 37% of deal types — 62.6% of deals at a representative venue (The Crescent) get done in spreadsheets. Of the deals that flow through the tool, the lifecycle has a structural seam: 100% of disputed settlements (22 of 22 in the past two years) carry positive tour-manager signoff text, then dispute the next morning when the agent reviews. The root cause is upstream: deal terms live in prose, structured fields are abandoned (51% of vs deals have empty `bonuses_json`), and interpretation ambiguity surfaces too late to resolve cheaply. Settlement is failing because the deal it settles against is a ghost.

## Users and jobs-to-be-done

| Persona | Role | Primary job-to-be-done | Trust signal |
|---|---|---|---|
| **Mariana Reyes** | Lead Booker, The Crescent | Settle shows accurately, fast, with audit; protect agent relationships | Confidence the math is right; spreadsheet replaced |
| **Andrea Pelletier / Sarah Kim** | Agent, WME / Wasserman | Know the artist got paid correctly; route future tours to trusted venues | Settlement reads in 3 min, no questions; itemization, provenance, tone |
| **Diego Velasquez** | Tour Manager | Sign settlement so the artist can load out and drive overnight | Pre-review on phone; visible math; no surprises |
| **Marcus Holland** | GM / Co-owner | Approve wires; protect venue reputation; sleep at night | Flagged anomalies; sign-off chain visible; sub-minute review |
| **Mike Chen** | Production Manager | Log show-night costs (hospitality, overages) without overhead | Single-tap mobile entry; receipt photo OK; no follow-up calls |

## Primary user stories

### S1 — Mariana captures a deal from the agent's email

**As** the booker
**I want to** turn the agent's prose deal email into a structured deal record without retyping
**So that** the deal terms have a single canonical version that downstream math, the agent, and my team can all reference

**Acceptance criteria:**
- I can paste deal email prose into a textarea and click Extract
- Within 2 seconds, structured fields populate (deal_type, guarantee, percentage, basis, expense_cap, hospitality_cap, bonuses, recoups) with per-field confidence (high/medium/low)
- I can hover prose spans to see which structured field they produced, and hover fields to see the source span
- The source prose is preserved verbatim alongside the structured record
- I can edit any field inline before saving
- I can save the deal to lock the V2 engine path

### S2 — System flags deal-interpretation ambiguity at capture time

**As** the booker
**I want** the system to flag prose ambiguities that would otherwise surface as disputes
**So that** I can resolve them in writing with the agent weeks before settlement

**Acceptance criteria:**
- Ambiguities are surfaced as cards distinct from low-confidence extraction
- Each card shows the prose span, candidate readings with estimated dollar impact, and three actions: Lock in / Send clarification to agent / Defer
- Sending a clarification opens a modal with an AI-drafted email that I can edit before sending
- A simulated agent reply resolves the ambiguity, writes a structured agent comment, and updates the deal record
- The deal cannot be marked V2-confirmed (`confirmedAt` set) until all ambiguities are resolved or explicitly deferred

### S3 — Agent confirms the deal asynchronously via shared link

**As** the agent
**I want to** review the structured deal terms and confirm or comment on them, from email
**So that** the deal is jointly authored before the show

**Acceptance criteria:**
- I receive a magic link in the clarification email; no Greenroom account required
- The link renders the structured deal terms read-only
- I can comment on any specific clause; my comment is anchored to that clause
- I can confirm the entire deal with one click; status flows back to the venue
- My response is captured as a structured event in the deal's activity log

### S4 — Production manager logs show-night costs from their phone

**As** the production manager
**I want to** log hospitality and overage costs at the moment they occur, from my phone
**So that** the settlement isn't reconstructed at 2am from receipts on a desk

**Acceptance criteria:**
- Mobile-friendly form (max-width ~420px) with single-column layout and large touch targets
- Show is auto-selected (latest in-progress show at the venue) with override
- Category selectable via pill buttons (Hospitality, Sound, Lights, Production, Backline, Marketing, Other)
- I can attach a receipt photo; system extracts amount and vendor with ~2-second feedback
- Submission posts to the deal record and emits an activity event visible to the booker immediately
- If the entry exceeds a deal cap, the system flags the overage and presents an absorb-or-pass-through decision

### S5 — Booker runs settlement as a confirmation, not a construction

**As** the booker
**I want** the settlement to be 95% assembled by end of show
**So that** the walkthrough with the TM takes 5-10 minutes, not 90

**Acceptance criteria:**
- The settle page is live throughout the week: ticket sales update from POS, expenses appear as they're logged, the projected total recomputes
- By end of show, the trace is complete; opening the settle page at 11:15pm shows the final number (no manual assembly required)
- I can initiate Walkthrough mode: full-screen, one trace line at a time, large touch targets, per-line acknowledgment
- Each line acknowledged is captured with timestamp and actor (the TM)
- A completed walkthrough generates a shareable settlement artifact link for the agent

### S6 — Agent reviews settlement artifact async; GM approves wire from phone

**As** the agent (and separately, the GM)
**I want to** sign off on the settlement from wherever I am
**So that** the wire goes out without a follow-up email thread

**Acceptance criteria:**
- Agent receives a magic link to the settlement artifact; renders the same trace the venue ran the walkthrough against
- Agent can see deal terms (structured, with positioning), trace lines with expandable provenance, and the sign-off chain
- Agent clicks "I agree" or "I have questions" + free-text response
- GM sees a compact mobile view of the final number, sign-off chain, and any anomaly callouts
- GM approves wire with one tap; approval is captured in the activity log

### S7 — All parties see the same audit trail

**As** any stakeholder
**I want to** see a chronological record of every event on a deal
**So that** disputes can be resolved by pointing at the structured record, not by reconstructing from memory

**Acceptance criteria:**
- Activity log is rendered on the show/deal page and the agent share-link pages
- Each event has: icon (varies by actor and type), timestamp, actor name + role, single-line summary, expandable detail
- Events include: deal capture, AI extraction, ambiguity flags, agent comments, ambiguity resolutions, expense logs, ticket milestones, walkthrough acks, agent signoff, GM approval, wire sent
- Log is filterable by event type
- Last 5 events shown on the settle page sidebar; full log on the deal page (collapsed by default)

## Dispute resolution

Even with deal-interpretation ambiguities resolved upstream (S2, S3), three classes of disputes can still surface post-signoff and need a structured resolution path: contested expense line items, contested ticket counts, and contested comp-counting rules. Plus recoup challenges and any deal-term issues that slipped through capture. The product must capture these structurally, trace them back to source, and resolve them without falling back to email threads outside the system.

### Dispute taxonomy

| Type | Where it surfaces | What's contested | Trace back to source |
|---|---|---|---|
| **Expense line** | Agent artifact, post-signoff | *"That hospitality charge looks high"* | Receipt photo + production manager who logged + timestamp |
| **Ticket count** | Agent artifact, post-signoff | *"Our count doesn't match"* | POS row data + scan log (if applicable) |
| **Comp counting** | Agent artifact, post-signoff | *"That promo comp should count toward gross"* | Per-deal comp rule + door staff log |
| **Recoup challenge** | Agent artifact OR pre-show | *"We didn't agree to that production overage"* | Deal `recoups[]` field + pre-noted negotiation history |
| **Deal interpretation** | **Handled pre-show (S2, S3)** | *"We read this clause differently"* | Ambiguity card → clause comments (already in scope) |

### Resolution flow (end-to-end)

**S8 — Agent flags a dispute on the artifact**

**As** the agent
**I want to** flag a specific trace line if I have questions about it
**So that** my objection is anchored to the disputed item, not floating in an email

**Acceptance criteria:**
- "I have questions" affordance on every trace line in the agent artifact
- Clicking opens a modal anchored to that line with a textarea for the question
- Submission writes a `clause_comment` row (anchored via `trace_step_key`) and a `settlement_questioned` activity event
- Settlement status transitions to `disputed`
- Mariana receives an in-app notification (production: also email)

**S9 — Mariana sees the dispute and traces it to source**

**As** the booker
**I want to** see flagged disputes on my settle page with the contested line highlighted and the source data one click away
**So that** I can respond with evidence rather than rebuilding the context from memory

**Acceptance criteria:**
- Disputed trace line shows a red badge with the agent's question text on hover
- Click expands an inline dispute card with the agent's note + source provenance (receipt photo for expenses; POS export for tickets; comp rule explanation for comps)
- Three response actions are available: **Provide evidence** (inline source viewer + counter-comment), **Accept and revise** (adjusts the underlying data and creates a revised settlement version), **Negotiate** (counter-comment continues the thread)

**S10 — Resolution flows back to a signed/finalized settlement**

**As** any party
**I want** the dispute resolution to update the canonical record and notify the other side
**So that** the wire doesn't go out until both sides agree

**Acceptance criteria:**
- Acceptance/revision writes a `settlement_revised` event with the diff; status transitions to `revised`
- Revised artifact is automatically re-sent to the agent via the same share link (no new URL)
- Agent's acceptance writes `agent_signed_off` event on the revised version; status transitions to `finalized`
- GM re-approval flow is one tap (no new wire approval needed for revisions under threshold)
- All events permanently preserved in activity log with full diff visible months later

### Scope for v1 vs v1.5

**v1 (current prototype) — captures structurally, doesn't yet resolve:**
- Walkthrough mode has "Question this line" affordance (Phase 4) — TM-side dispute at the table
- Agent artifact has "I have questions" + textarea (Phase 5) — agent-side dispute post-signoff
- Both write structured events: `clause_comment` + `activity_event` + status transition
- Trace source pills (Phase 1) expose provenance for any line — receipts, POS rows, deal terms, comp rules

**v1.5 (next sprint — explicit in `MEMO.md` what-ships-next):**
- Mariana-side dispute resolution panel with the three actions
- Inline source viewer (receipt photo expander, POS export inline, comp rule explainer)
- Settlement revision versioning preserving history
- Notification surface (in-app banner; later, email)
- GM re-approval flow for revised settlements

The prototype proves the structural foundation is right. The resolution UI is a clean follow-on sprint with no architectural debt — every event, state, and provenance link it needs already exists.

## Success metrics

**Primary metrics (90-day window after launch at pilot venues):**

| Metric | Baseline | Target |
|---|---|---|
| In-app settlement adoption | 18% | 50%+ |
| Settlement disputes per 100 shows | ~4 | <1 |
| Median time from show-end to wire-approved | 60+ hours | <24 hours |
| Median active settlement time at the table | 90 min | <15 min |

**Leading indicators (early signal):**

| Metric | Target |
|---|---|
| AI extraction field-level accuracy | ≥85% |
| Ambiguity detection precision (true positives) | ≥80% |
| Deals captured via new flow vs prose-only | 60%+ within 30 days |
| Agent confirmation rate on shared deal links | ≥50% |
| Production manager mobile expense entries per show | ≥3 |

**Counter-metrics (watch for unintended consequences):**

- Booker time spent in deal capture flow per deal (target: <5 min for known deal types)
- Agent NPS for venue (should rise; if it falls, the artifact UX is wrong)
- False-positive ambiguity rate (don't cry wolf; track booker overrides)

## In scope

- Deal capture with AI extraction from prose
- Ambiguity flagging with candidate readings and dollar impact
- Agent confirmation via magic link (deal terms + comments)
- Vs / % of net / flat / % of gross engine with trace output
- Live settlement ledger that updates throughout the week
- Walkthrough/confirmation mode with line-level acknowledgment
- Agent settlement artifact (mobile-responsive, signoff)
- Unified activity log
- Production manager mobile expense entry
- GM mobile wire approval

## Out of scope (cuts)

- Door deals (5.7% of deals; different physical workflow)
- Real email parsing and inbound routing (architecture described; mocked in prototype)
- Real receipt OCR (canned in prototype)
- Real authentication for share links (magic-link tokens only in prototype)
- Per-agency templated settlement artifacts (one default template only)
- Reporting page changes (downstream of having structured deals; future sprint)
- Multi-show fleet view
- Tour-side iOS app for TMs
- GM anomaly detection ML (rules-based in prototype)
- In-platform chat between Mariana and agents (replaced by clause-anchored comments)

## Dependencies and risks

**Dependencies:**
- Existing POS integration for ticket sales (no changes)
- Anthropic API access for production AI extraction (canned in prototype; gated by `ANTHROPIC_API_KEY` env var)
- Email infrastructure for production agent magic links (out-of-scope for prototype)

**Key risks:**

| Risk | Likelihood | Mitigation |
|---|---|---|
| Agents won't engage with magic-link confirmation | Medium | Make the link trivially low-friction; no login; pre-fill with venue's reading; fall back to email reply parsing |
| AI extraction accuracy below 85% target | Low | Conservative ambiguity defaults; human-in-the-loop confirm/edit before deal locks; canned demo for prototype |
| Production managers don't adopt mobile expense entry | Medium | Single-tap UX; no auth; venue Wi-Fi auto-resolves identity; works without learning new tool |
| The pre-show clarification email feels accusatory to agents | Low | Tone-first prompt (see `prompts/clarification.md`); leads with venue's reading; gives agent the rhetorical out |
| Schema migration breaks existing paid settlements | Low | All schema additions are nullable; engine version detection routes legacy data to existing renderer |

## Open questions for the team

1. **Agent magic-link expiry**: 7 days? 30 days? Indefinite with revocation?
2. **Comment threads on clauses**: do we ship with structured replies (like Linear) or free-text only?
3. **Per-agency settlement templates**: where does this sit in the roadmap relative to backfilling historical deals?
4. **Mobile expense entry — auth model**: venue Wi-Fi IP auth, magic link, or full SSO?
5. **Live ledger refresh cadence**: poll every minute? WebSocket? On-page-load only?
6. **Recoup positions beyond the four documented**: do we need a "custom" position with free-text explanation for edge cases?
7. **GM approval anomaly thresholds**: rules-based for v1; when do we invest in learned thresholds per venue?

## Validation plan (pre-launch)

Three tests, ordered by cost (per `MEMO.md`):

1. **Replay historic disputes** through the AI extraction. Measure: what fraction surface an ambiguity that would have prevented the dispute? Target ≥70%.
2. **Extraction accuracy at scale** on all 184 past vs deals. Booker spot-checks 50. Target ≥85% field-level accuracy.
3. **Time-to-settle stopwatch**: 3 vs deals via spreadsheet vs. walkthrough. Target 60%+ reduction.

## References

- `MEMO.md` — strategic framing, slice defense, what was cut and why
- `BUILD_PLAN.md` — phased implementation plan and engineering specs
- `prompts/extraction.md` — AI deal extraction system prompt with examples
- `prompts/clarification.md` — agent clarification email drafting prompt
- `data/dispute-thread.md` — Coastal Spell March 2025 dispute (the canonical case)
- `data/transcripts/` — user research with Mariana, Diego, Marcus, Sarah Kim
- `data/ceo-memo.md` — Q4 strategic frame from Pri Iyer
