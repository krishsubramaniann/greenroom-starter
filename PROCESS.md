# PROCESS.md

> The build process behind this prototype — how I used Claude Code, where AI accelerated, and where the product decisions came from. Submitted per the bonus deliverable.

---

## The relationship

I used Claude Code as an executor and a sounding board, not as a decision-maker. The product calls — which slice to cut, why the deal layer is upstream of every dispute, why the walkthrough overlay should be deleted, what the chain of authority for money looks like, how the cap protects the artist when adjustments hit — were mine. AI's role was to translate those decisions into working code faster than I could write it solo, and to flag implementation issues I'd miss.

The build ran across roughly twelve phases over ~6 days of focused work. Each phase started with a specification I wrote (after working through the product call with myself), got executed by Claude Code, came back with a verification report, and I reviewed/tested in the browser before moving on. Several phases produced surprises that changed the next phase's scope — those are captured in the "Judgment calls" section below.

Total prompts authored: ~30 build phases and refinement passes. The in-product AI prompts (extraction + clarification) were iterated separately against the case data — those live in `prompts/` and are part of the product itself.

---

## The build phases

Each row is one Claude Code session. Order is roughly chronological. Each was specified, executed, verified, and (where needed) refined before moving on.

| Phase | What it shipped | What product decision drove it |
|---|---|---|
| 1 | Schema deltas + canned extraction data | Establish the deal-as-source-of-truth foundation. AI extraction with confidence is the surface that earns trust upstream. |
| 2 | Deal capture flow (prose → structured terms → ambiguities → save) | The capture surface is where ambiguity gets surfaced. This had to feel right or the rest of the slice loses credibility. |
| 3 | V2 settlement engine (`dealMathV2.ts`) with TraceStep contract | Engine output had to be a single canonical artifact that renders for multiple audiences. Same data, different views. |
| 4 | Walkthrough overlay (later deleted in 7.5) | I initially designed the walkthrough as a separate UI. Building it taught me it was the wrong abstraction. |
| 5 | Agent magic-link shared surfaces (`/shared/settlement/[token]`) | Agents stay in their email. The artifact has to come to them, read-only, no auth. |
| 6 | Hollow Oak fixture + unified activity log + integrated demo wiring | The cold-start show fixture and the activity log unify all surfaces into one audit story. |
| 6.5 | Hollow Oak prose/extraction fix + agent reply UX redesign | The original simulate-agent-reply silently resolved ambiguities. I redesigned it so the agent's reply is *visible* to Mariana — resolution becomes an artifact, not a state change. |
| 7 | PM mobile expense entry + live polling on the walkthrough screen | The "no manila envelope at 2am" beat depends on data arriving live. PM mobile + 5-second polling makes this visceral. |
| 7.5 | Show detail page redesign + settle page restructure + remove walkthrough overlay | The big architectural cleanup. Walkthrough overlay deleted. Lifecycle pipeline renamed. Settlement Details restructured into 3 categorical sections (Ticket Sales / Expenses / Settlement to Artist). |
| 8 | GM mobile approval + UI cleanup | Authority chain: agent acknowledge ≠ Paid. Only GM approval marks Paid. |
| 8.5–8.8 | Polish pass: GM hold/release state, real receipt uploads, activity polling for all events, lifecycle state honesty, CTA state transitions (action → view mode after stage completes) | Demo testing surfaced edge cases that wouldn't have shown up in feature-spec mode. |
| 8.9 + 8.9.1–.4 | Dispute resolution loop. Single-line adjustment inside Section B. Cap re-evaluates over adjusted gross. Section C clean. Show detail page Expenses panel simplified. | Late-breaking realization: opening the dispute path without closing it leaves the audit-trail thesis incomplete. Worked through three math models (adjustment in Section C / adjustment as direct net delta / adjustment in Section B with cap re-evaluation) before locking in the structurally honest one. |
| 9 | Deal Types gallery (6 deal types, 5 view-only) + Metrics dashboard with North Star metric | The gallery proves engine breadth. The dashboard tells the trajectory story (12% → current). |
| 10 | Memo polish, DEMO.md, PROCESS.md (this file), Loom recording | Submission deliverables. |

---

## Sample phase prompts

Three representative phase prompts to show the level of specification work. These are not the only ones — they're the ones that best demonstrate the prompt-to-output discipline. Full Claude Code prompts available on request.

### Sample 1 — Phase 7 (PM mobile + live polling)

This was the centerpiece feature. The prompt had to specify: token-based auth, mobile form layout, API contract, polling cadence, the live-update UX on Mariana's side, and the cap warning behavior.

```
Task: Phase 7 — Production manager mobile expense entry with live receipts

This is the centerpiece of the integrated demo. While Mariana is doing her
walkthrough on the laptop, the production manager on stage is uploading
receipts from his phone, and they appear in real time on Mariana's screen.

Scope:
1. /m/expense?token=<short_token> — mobile-optimized page, no auth.
2. ExpenseForm.tsx — vendor, amount, category (5 options), photo, submit.
3. /api/log-expense endpoint inserts expense row + activityEvent.
4. Live polling on Mariana's walkthrough screen: poll /api/expenses every 5s,
   new expenses appear with "just now · from production manager" pill + flash
   animation.
5. Token generation: auto-create shareLinks row on first [Send PM link] click.
   Display URL + QR code via api.qrserver.com.

Fixture seeds:
- Add Hollow Oak shareLinks row for pm_expense (token: pm-hollowoak-jun19)

Verification:
- Open walkthrough on laptop, open PM mobile in second window
- Submit new expense from PM screen
- Within 5s the expense appears on laptop with "just now" pill + flash
- Push total expenses near cap, verify cap warning pill flips amber at 80%
```

Claude Code returned a working implementation in ~25 minutes including verification. The fix-prompts that followed (in 8.5, for receipt viewing) were small targeted iterations against this base.

### Sample 2 — Phase 8.9.2 (dispute resolution math fix)

This is the prompt that taught me the most. I'd specified Phase 8.9 with the adjustment as a Section C line. Once I saw the rendered settlement, the math was double-counting — capped expenses ($2,000) plus the adjustment (-$500) effectively charged the artist $2,500. The right fix was to move adjustment inside Section B and re-evaluate cap over adjusted gross. We worked through three interpretations before locking the model.

```
Task: Phase 8.9.2 — Adjustment lives in Section B; cap re-evaluates on
adjusted gross; Section C is clean

The math model (canonical):
1. Sum of expense line items                           = Original gross
2. Original gross + adjustmentAmount (signed)          = Adjusted gross
3. If adjusted gross > cap:
     Cap absorbed by venue = adjusted gross − cap
     Net expense = cap
   Else:
     Cap absorbed by venue = 0
     Net expense = adjusted gross
4. Net expense flows into Section C as the single Net Expenses value

Worked example (Hollow Oak, adjustment -$500):
  Step 1: Original gross = $2,650
  Step 2: Adjusted gross = $2,650 + (-$500) = $2,150
  Step 3: $2,150 > $2,000 cap by $150 → venue absorbs $150 → Net = $2,000
  Step 4: Section C: $11,640 - $2,000 = $9,640 → 75% = $7,230

In Hollow Oak's specific case the artist total is unchanged from the
pre-dispute baseline because the cap was already binding. This is the
correct outcome — the cap protected the artist from the duplicate
hospitality charge. The adjustment benefits the venue (they absorb $500
less, from $650 to $150).

Engine changes:
- calculateSettlementV2 accepts adjustment input
- Trace step kinds: gross_expenses_subtotal, adjustment,
  adjusted_gross_subtotal, cap_absorbed, net_expense
- All five surfaces (settle, agent, GM, show detail, metrics) read
  single canonical total_to_artist

Activity payload on settlement_adjusted should carry the structural diff
(originalGross, adjustedGross, capAbsorbedBefore/After, netExpenseBefore/
After, totalToArtistBefore/After) so the audit trail proves the
"cap protected the artist" narrative.
```

The interesting thing about this prompt: I had to think about what "the right answer" is *for the product narrative*, not just the math. The honest-cap-logic interpretation produces an unchanged artist total — which felt anti-climactic — but it's the truth. The demo gets a stronger story from "the cap worked" than from "I made the adjustment matter by hand-waving the cap away."

### Sample 3 — Phase 8.9.3 (show detail expense panel mirrors settlement Section B)

This was a small phase but it illustrates a design pattern that Claude Code surfaced. I'd asked for the show detail page expenses panel to "match the settlement page." Claude Code came back with a refactor that extracted a shared `ExpensesBreakdown.tsx` component with a `variant: "live" | "readonly" | "summary"` prop. Both pages now render the same component with different behavior. One source of truth, three different display modes.

I would not have thought to factor it that way solo on the first pass. AI made the engineering call cleaner than I'd have made it; that's the senior-teammate dynamic the case study was asking about.

---

## Judgment calls captured

Five moments where the product call shaped what got built — or what got *un*-built.

### 1. Deleting the walkthrough overlay I'd already built

Phase 4 shipped a full walkthrough overlay — its own UI, its own state, its own polish. Phase 7.5 deleted it.

**The reasoning:** the walkthrough overlay reinforced the wrong mental model — that settlement is a "thing you do at the end." If the slice's thesis is that settlement is a continuously-assembled artifact, then a separate "now we walk through" mode is structurally inconsistent. The fix isn't a better walkthrough UI. It's that walkthrough shouldn't exist as a separate concept.

**Why this was hard:** sunk cost. I'd already specified, verified, and polished the overlay. Throwing it away felt like waste. The harder call was to recognize that working code in the wrong abstraction is technical debt, not value.

### 2. GM hold-to-release flow

Phase 8 shipped GM mobile approval with a hold path. After demo testing, I noticed there was no defined way to *release* the hold and approve. The GM was stuck — Mariana saw "Wire on hold by GM" but had no clear CTA.

Phase 8.8 fixed this: same magic link stays valid throughout; visiting it shows the current state (pending / on hold / approved) with appropriate CTAs for each. Mariana's CTA changes from "Send to GM" to "Re-share GM link for review" while in hold state.

**The product principle:** every state in the workflow needs a defined exit path. Opening a path without closing it leaves the audit trail incomplete.

### 3. Adjustment math model

Phase 8.9 originally put the adjustment as a separate line in Section C ("+ Other adjustments: -$500"). The math was double-counting: capped expenses ($2,000) plus the adjustment (-$500) effectively charged the artist $2,500. I worked through three models before locking in the right one:

- **Model A:** Adjustment is post-cap delta to net (`net = capped_net + adjustment`). Simple but bypasses cap logic entirely.
- **Model B:** Adjustment is pre-cap delta to gross; cap doesn't re-bind. Produces unusual results when adjustment crosses cap threshold.
- **Model C (chosen):** Adjustment is pre-cap delta to gross; cap RE-evaluates over adjusted gross. Net = min(adjusted_gross, cap). Mathematically honest. Cap was protecting the artist all along.

Model C produces an "anti-climactic" demo outcome in some scenarios (artist total unchanged when cap is binding), but it's the structurally honest answer. The "cap worked" narrative is a stronger product story than "I made the adjustment matter by suppressing the cap." The Section B walkthrough during the live demo shows this end to end.

### 4. Sign convention for adjustment amount

The adjustment editor accepts a signed amount. Originally the helper text said "positive = more to artist." A user-test (myself) entered -$500 with description "removing duplicate hospitality" — meaning "remove $500 of charges, artist gets back $X" — and the system interpreted it as "$500 less to artist."

Sign convention rewritten to: "Negative = remove or refund a charge (e.g., enter -500 to remove $500 of duplicate hospitality). Positive = add an additional charge. The adjustment changes the gross expense total, then cap logic re-evaluates."

**The point:** UX language has to map to the user's mental model, not the data model. Easy to get wrong even when the math is right.

### 5. View-only mode for the Deal Types gallery

When designing the Deal Types gallery, I initially wired up all six deal types as live interactive shows. After thinking about the demo narrative, only Hollow Oak (vs deal) needed to be live; the other five (Flat / % of gross / % of net / Tier ratchet / Walkout pot) just needed to demonstrate "the engine handles this type, here's what the final settlement looks like."

So I added a `isViewOnlyExample` flag to the show fixture and a `variant="summary"` mode on the settle page. The other five show final paid state with no action CTAs and no live polling. They're frozen artifacts.

**The product principle:** demo surfaces should match demo purposes. Five interactive shows when one is the demo and five are evidence is just unnecessary surface area to maintain.

---

## In-product AI prompts

The two AI prompts that ARE the product (not the build) live in the repo:

- `prompts/extraction.md` — the deal extraction system prompt. Iterated against the case data with six few-shot examples covering clean vs deals, tier ratchets, recoup ambiguity, flat deals, walkout pots, and the "bonuses referenced but not specified" case. Includes the schema for confidence chips and ambiguity flagging.
- `prompts/clarification.md` — the agent clarification email prompt. Four worked examples. Tone principles (collaborative, not adversarial).

These are part of the product surface. They're versioned, reviewed, and ship with the codebase. The Claude Code build prompts (described above) are scaffolding — they got us to the artifact but they aren't the artifact.

---

## What I learned

A few takeaways from this case build that I'd carry into Greenroom:

**1. AI's posture toward uncertainty is itself a product decision.** Whether AI surfaces ambiguity or silently resolves it is the difference between trust-building and trust-destroying. The case study's "22 of 22 disputes have positive TM signoff" data point is exactly this — a system silently resolved ambiguity, and the dispute lived on as a structural seam between signoff and reality.

**2. Working code can be technical debt.** The walkthrough overlay was working when I deleted it. Working ≠ correct abstraction. Senior product work means having the discipline to delete what shipped if the architecture wants different.

**3. AI is best at execution velocity, weakest at architectural taste.** Across these phases, Claude Code consistently delivered correct implementations of well-specified work. It occasionally surfaced cleaner factorings I hadn't considered (the shared `ExpensesBreakdown` component is the best example). It never told me "you're optimizing the wrong layer" — that judgment was always mine.

**4. The case study's "use AI like a senior teammate" criterion is literally about this dynamic.** AI didn't decide what to build. I decided what to build, then AI helped me build it faster than I could solo. That's the relationship. The submission is structured to make that visible.
