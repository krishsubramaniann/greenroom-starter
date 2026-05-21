# MEMO: Settlement, fixed at its root

**To:** Pri Iyer, Anil, Greenroom product team
**From:** [PM candidate]
**Re:** The slice I picked, why this one, and what I cut
**Status:** Case-study submission

---

## The slice

**A deal-to-wire workflow with the deal as the shared source of truth, and every event in between captured as a structured trace.** One causal chain across the lifecycle:

> prose deal email → structured deal record (AI-assisted, agent-confirmed) → live settlement ledger that fills in throughout the week → walkthrough that confirms rather than constructs → agent signoff via shared artifact → GM wire approval

The unifying surface is an **activity log** — every meaningful event (deal captured, agent commented, expense logged, TM acknowledged, agent signed) is timestamped, attributed, and addressable. The 2am settlement ritual becomes a 10-minute confirmation because the data is already there.

I picked this over the alternatives because the data and the transcripts both say the same thing: **settlement is failing upstream of where the product currently looks.** Every disputed settlement in the past two years — all 22 — has positive tour-manager signoff text. The TMs signed at the table. The agents disputed the next morning. Disputes aren't math errors; they're deal-interpretation errors that surface at the wrong layer of the org. Fixing the settle page without fixing the deal layer makes the dispute prettier when it surfaces. Fixing the deal layer prevents most of them from being born.

## Three phases, one workflow

The product today treats settlement as a **post-show construction event** — Mariana arrives at 2am and assembles the picture from scattered inputs. The new model treats settlement as a **continuously assembled artifact** across three phases:

**Phase 1 — Pre-show (T-3 months to T-week)**: deal terms captured structurally, agent confirms via shared link, ambiguities resolved cold. Fixed costs pre-populated.

**Phase 2 — During-show window (T-week through end of show)**: variable costs captured at the moment they occur. Production manager logs hospitality and overages via mobile. Ticket sales flow from POS. The live settlement ledger updates as data arrives.

**Phase 3 — Post-show (end of show through wire)**: settlement is *already* there. The walkthrough is a 5–10 minute confirmation, not a construction. Per-line TM acknowledgment captures the paper trail. Agent reviews async via shared link. GM approves wire from their phone.

The three phases are not three features. They're one workflow with one source of truth, rendered for different audiences at different moments.

## The five outcomes the prototype proves

The deliverable shows working capability for each:

1. **The 2am problem solved.** By show end, the trace is 95% complete. The TM walkthrough is 8–10 minutes, not 90. (Demo: open settle page at show end, math is already there.)
2. **Full audit trail.** Every event in a unified activity log — deal captured, agent commented, expense logged, TM acknowledged, GM approved. Timestamped, attributed, addressable. (Demo: scroll the activity feed on the Coastal Spell show page.)
3. **Transparency.** Same trace artifact rendered for booker, TM, agent, GM. Different audiences, one source of truth. (Demo: the agent magic-link viewer shows what Mariana sees.)
4. **Trust with TM and agent.** Comments-on-clauses for the agent (resolves ambiguity pre-show). Per-line acknowledgment for the TM. Provenance everywhere. (Demo: agent comment on marketing recoup → ambiguity resolved → math flips from $11,565 to $12,285 — before the show happens.)
5. **Expenses on time.** Production manager mobile capture with photo + OCR. Lands in the live ledger instantly. (Demo: phone-shaped UI, log hospitality $480 with a tap, watch Mariana's screen update.)

## Why this slice, not the others

The brief named six adjacent problems wearing one name. Here's what I considered and why I cut each:

**A vs-deal calculator alone** closes the 62.6% coverage gap (vs + % of net + door = 316 of 505 past deals) but leaves the dispute problem untouched. Mariana said directly: *"It would have to handle vs deals correctly AND it would have to feel like I trusted it with the math."* Coverage is necessary, not sufficient.

**Real-time prediction** addresses three stakeholders' top wishes (Diego's pre-review, Marcus's Wednesday foreknowledge, Sarah's async preview). But it's downstream of structured deal capture — you can't predict a vs deal if the engine can't compute one, and you can't predict deal quality if the deal isn't structured. Prediction is a *rendering* of the slice I picked, not a competing slice. The live ledger is what prediction becomes once the foundation is right.

**Dispute resolution UI** treats symptoms. Every dispute in the data is rooted in deal interpretation. A better resolution flow makes disputes easier to close, but doesn't reduce their incidence.

**Post-show agent communication** assumes the artifact already exists in the right shape. It doesn't; that's Sarah's "fait accompli" critique. The agent-facing artifact has to be built into the same engine output, not as a downstream PDF generator.

**Audit trails** is what the activity log produces as a side effect. It's covered by the slice as a unifying surface, not a separate feature.

The chain of causation in the data points up the stack:

> Deal email is ambiguous → deal is captured as prose, structured fields abandoned → settlement math runs on incomplete inputs → TM signs without holding interpretation authority → agent disputes the next morning.

The only intervention that breaks the chain at the cause is upstream: structure the deal at capture, flag ambiguity early, capture data as it happens, render the math with provenance. Settlement is where the failure becomes visible, not where it originates.

## The evidence behind the cut

Four signals from the data and transcripts I'm leaning on most heavily:

**62.6% coverage gap maps to 87% of disputes.** Vs deals (36.4% of past deals) and % of net deals (20.4%) dispute at 7.1% and 6.8% respectively — 6–7× the rate of flat deals. The deal types the tool can't compute are the deal types that go wrong.

**Every disputed settlement has a positive TM signoff.** All 22, without exception. The UI badge says Disputed; the underlying signoff field says approved. The system records two conversations that happen at different times with different people and rolls them up into one status field. This is the structural seam.

**51% of vs deals have empty `bonuses_json`.** The structured fields the schema provides have been abandoned since 2023. The schema comment in `db/schema.ts` literally says *"`dealNotesFreetext` is what Mariana actually trusts."* The product team named the seam in their own code.

**99% of expense rows are entered after the show date.** Mariana's *"if you could just have all the expenses ready when I sat down to settle, that alone would change my life"* is borne out by the data — she's reconstructing the cost picture at 2am because no system surfaces what's missing on Wednesday.

## Design opinions the prototype defends

Seven design choices, each a bet:

**Prose is the source of truth; structure is a projection.** Mariana never edits structured fields directly. She pastes the deal email; AI extracts; she confirms or edits. The schema preserves the prose verbatim alongside the structured projection.

**AI is a confidence-tagging extractor, not an arbiter.** Every extracted field shows confidence. Medium requires a glance; low requires explicit confirmation. The AI never silently resolves anything material.

**Ambiguity is a first-class output, not a side effect of low confidence.** Two different visual treatments, two different UX paths. Confidence asks "did I read it right?" Ambiguity asks "which reading do you want?" Most of the dispute data comes from the second category.

**The deal becomes a shared artifact, not a venue-internal record.** The agent gets a magic link, sees the structured terms, comments on specific clauses if they disagree. The deal stops being a ghost.

**Settlement is rendered as a trace, not a number.** Every line in the artifact knows its source — receipt, ticketing row, deal term, comp rule. The walkthrough surface, the agent artifact, and the GM approval view are all renderings of the same `TraceStep[]`. Sarah Kim's three-part test (itemization, provenance, tone) becomes computable.

**The agent stays in their email; we make their replies addressable.** No "agent dashboard." No "log into Greenroom." Comments on the magic link, or email replies routed via deal-anchored addresses, both flow into the same audit trail. We meet agents where they are; we don't ask them to switch tools.

**The activity log is the unifying surface.** Every event from every party — Mariana, agent, TM, production manager, GM, system — flows into one timestamped feed anchored to the deal. The product becomes the system of truth across the lifecycle, not just the venue's notepad.

## What I cut, and why

**In-platform chat between Mariana and the agent.** Agents won't adopt new chat tools — Sarah's transcript confirms this directly. The architecture that works is comments-on-clauses (anchored, ephemeral) plus email-to-deal routing (uses the agent's existing tool). Chat would be empty rooms.

**Door deals.** 29 of 505 deals (5.7%). Different physical workflow (artist takes the box office directly with no percentage math), not the highest-leverage place to spend extraction prompt iteration.

**Real authentication on share links.** Long random UUID tokens are good enough for the demo. Production would need proper agent-side auth (probably magic-link email with periodic refresh).

**Templated artifacts per agency.** Sarah said *"some agents have their own template they want me to fill out"* and the data confirms it (Tom Neary at Wasserman: *"has his own settlement template he wants filled in"*). The prototype ships with one default template. Per-agency templating is the second sprint.

**Real email parsing / SMTP.** The prototype shows mocked email events in the activity log (agent comment via "email," TM advance request via "email"). The full architecture is described in the memo. Production would use Mailgun/SES inbound + Nylas or Gmail OAuth for inbox sync.

**Multi-show fleet view.** Not in the slice. Reporting page is downstream of structured deals existing in the first place — fix the input, then improve the aggregations.

**Real OCR on receipts.** The mobile expense form has a "take photo" affordance and pre-fills the amount, but the OCR is canned for the demo. Production would use Google Vision or AWS Textract.

## What I'd ship next, in order

1. **Backfill historical deals through the extraction pass.** Once the new flow works, run it over the 537 past deals so the reporting page can speak in structured terms (margin variance, dispute root cause, agency-level signal). This unblocks Marcus's predicted-vs-actual reconciliation ask.

2. **Real email integration.** Deal-anchored reply addresses with Mailgun inbound; Gmail OAuth for inbox sync with AI classification for stray emails. Closes the "email is the agent's tool of choice" loop properly.

3. **Real OCR for production manager receipts.** Tap a photo, structured expense entry confirmed. Closes the manual-entry friction.

4. **Per-agency settlement templates.** Configurable template applied to the same trace data — solves the "Tom Neary wants his own template" problem without rebuilding the engine.

5. **Wednesday risk forecast (full).** The prototype's risk surface is a simple rule based on unresolved ambiguities and high-dispute recoup categories. A second sprint trains a model against historical disputes for predicted dispute likelihood.

6. **Tour-side mobile-native artifact.** Diego pulls up the artifact in the van today. The next step is a TM-side iOS app that pre-reviews settlements across the tour with push notifications when each venue's artifact is ready.

7. **Deal capture as input to advance.** Pri's memo named the advance workspace as the second craft bet. Once deals are structured, the advance flow can pre-populate from them. Same data, new surface.

## How I'd validate the bet

Three tests, ordered by cost:

**Replay the 22 disputes.** Run each historical disputed settlement's deal prose through the new capture flow. Measure: what fraction surface an ambiguity that, if resolved upstream, would have prevented the dispute? *Target: ≥70%.* If most disputes wouldn't have been flagged, the slice doesn't address the root cause and we should rethink.

**Extraction accuracy at scale.** Run the prompt over all 184 past vs deals. Have Mariana spot-check 50. Measure: per-field accuracy, ambiguity precision (true ambiguity vs noise). *Target: ≥85% field-level accuracy, ≤2 ambiguity flags per deal on average.*

**Time-to-settle stopwatch.** Mariana settles 3 vs deals with her spreadsheet and 3 with the walkthrough. *Target: 60%+ reduction in active settlement time, with no fidelity loss.*

The longer-running validations — dispute rate over 6 months, in-app adoption shift over a quarter, agent NPS — we don't get to in 6–8 hours. But the three above can be run on the prototype against historical data, which is enough to know whether the bet is real before we scale.

## The strategic frame

Pri's Q4 memo named settlement as the Q1 craft bet. She said two things mattered: *"the most trust-critical moment in the relationship"* and *"82% of our base is going around our product."* The slice attacks both. Trust is built upstream — at the deal layer — and the walkthrough plus shared artifact rebuilds the artifact bookers stopped trusting. Coverage closes the 62.6% gap that drives the spreadsheet workflow.

Marcus's strategic argument is the ROI story. *"The dollars on the night are the smallest part. The bigger thing is whether we lose the relationship."* He named an $80K example of an agent who quietly stopped routing through The Crescent after a bad settlement experience. The slice is, structurally, about preserving agency routing decisions by making settlement quality visible and disputable upstream. That's what protects the lease in March 2027.

We are not building a better calculator. We are rebuilding the connective tissue between three roles — booker, tour manager, agent — that the product today fails to connect. The 2am ritual exists because that tissue is missing. The slice puts it back.
