# MEMO: Settlement, fixed at its root

**To:** Pri Iyer, Anil, Greenroom product team
**From:** [PM candidate]
**Re:** The slice I picked, why this one, and what I cut
**Status:** Case-study submission

---

## The slice

**Deal capture as the source of truth + a walkthrough-aware settlement statement that becomes the agent-facing artifact.** One causal chain across four surfaces: prose deal → structured terms with flagged ambiguities → live settlement trace → shared artifact with the agent.

I picked this over the alternatives because the data and the transcripts both say the same thing: **settlement is failing upstream of where the product currently looks.** Every disputed settlement in the past two years — all 22 — has positive tour-manager signoff text in the database. The TMs signed at the table. The agents disputed the next morning. Disputes aren't math errors; they're deal-interpretation errors that surface at the wrong layer of the org. Fixing the settle page without fixing the deal layer makes the dispute prettier when it surfaces. Fixing the deal layer prevents most of them from being born.

## Why this slice, not the others

The brief named six adjacent problems wearing one name. Here's what I considered and why I cut each:

**A vs-deal calculator alone** closes the 62.6% coverage gap (vs + % of net + door = 316 of 505 past deals) but leaves the dispute problem untouched. Mariana said directly: *"It would have to handle vs deals correctly AND it would have to feel like I trusted it with the math."* Coverage is necessary, not sufficient.

**Real-time prediction** addresses three stakeholders' top wishes (Diego's pre-review, Marcus's Wednesday foreknowledge, Sarah's async preview). But it's downstream of structured deal capture — you can't predict a vs deal if the engine can't compute one, and you can't predict deal quality if the deal isn't structured. Prediction is a *rendering* of the pair I picked, not a competing slice. The memo's "what ships next" section treats it as a fast-follow.

**Dispute resolution UI** treats symptoms. Every dispute in the data is rooted in deal interpretation. A better resolution flow makes disputes easier to close, but doesn't reduce their incidence.

**Post-show agent communication** assumes the artifact already exists in the right shape. It doesn't; that's Sarah's "fait accompli" critique. The agent-facing artifact has to be built into the same engine output, not as a downstream PDF generator.

**Audit trails** is what the walkthrough-with-line-acknowledgment surface produces as a side effect. It's covered by the pair, not as a separate slice.

The chain of causation in the data points up the stack:

> Deal email is ambiguous → deal is captured as prose, structured fields abandoned → settlement math runs on incomplete inputs → TM signs without holding interpretation authority → agent disputes the next morning.

The only intervention that breaks the chain at the cause is step 1–2: structure the deal at capture, flag ambiguity early, render the math with provenance. Settlement is where the failure becomes visible, not where it originates.

## The evidence behind the cut

Four signals from the data and transcripts I'm leaning on most heavily:

**62.6% coverage gap maps to 87% of disputes.** Vs deals (36.4% of past deals) and % of net deals (20.4%) dispute at 7.1% and 6.8% respectively — 6–7× the rate of flat deals. The deal types the tool can't compute are the deal types that go wrong. Coverage and trust are not independent problems.

**Every disputed settlement has a positive TM signoff.** All 22, without exception. *"Looks good — TM."* *"OK wire monday."* *"👍."* The UI badge says Disputed; the underlying signoff field says approved. The system is recording two conversations that happen at different times with different people and rolling them up into one status field. This is the breadcrumb the brief specifically called out. It's the structural seam.

**51% of vs deals have empty `bonuses_json`.** 94 of 184. The structured fields the schema provides have been abandoned since 2023. The schema comment in `db/schema.ts` literally says *"`dealNotesFreetext` is what Mariana actually trusts."* The product team named the seam in their own code.

**99% of expense rows are entered after the show date.** 2,754 of 2,775. Mariana's "if you could just have all the expenses ready when I sat down to settle, that alone would change my life" is borne out by the data — she's reconstructing the cost picture at 2am because no system surfaces what's missing on Wednesday.

## Design opinions the prototype defends

Six design choices, each a bet:

**Prose is the source of truth; structure is a projection.** Mariana never edits structured fields directly. She pastes the deal email; AI extracts; she confirms or edits. The schema preserves the prose verbatim alongside the structured projection. This is the opposite of the 2023 PM's structured-form approach, which sits abandoned in the data. We're meeting bookers where they already are.

**AI is a confidence-tagging extractor, not an arbiter.** Every extracted field shows confidence (high / medium / low). Medium requires a glance; low requires explicit confirmation. The AI never silently resolves anything material.

**Ambiguity is a first-class output, not a side effect of low confidence.** Two different visual treatments, two different UX paths. Confidence asks "did I read it right?" Ambiguity asks "which reading do you want?" Most of the dispute data comes from the second category — and the current product has no place to surface it.

**Settlement is rendered as a trace, not a number.** Every line in the artifact knows its source — receipt, ticketing row, deal term, comp rule. The walkthrough surface, the agent artifact, and the GM approval view are all renderings of the same `TraceStep[]`. Sarah Kim's three-part test (itemization, provenance, tone) becomes computable.

**The walkthrough captures line-level acknowledgments.** The TM acknowledges each line at the table. The acks are written with timestamps and identities. This creates the paper trail Mariana explicitly asked for and that doesn't exist today. When a dispute fires, the system can point at which lines were agreed to and which were flagged.

**The agent-facing artifact is the same trace, async-readable on mobile.** Diego pulls it up on his phone between load-out and the back office. Sarah opens it the next morning and the source pills are expandable. No new PDF, no separate document — the same artifact Mariana renders is what the agent reads. This dismantles Sarah's "asymmetric document" objection at the structural level.

## What I cut, and why

**Door deals.** 29 of 505 deals (5.7%). Different physical workflow (artist takes the box office directly with no percentage math), not the highest-leverage place to spend extraction prompt iteration.

**Per-line comment threads on the agent artifact.** Slack-for-settlement is its own product. The prototype ships with "I agree" / "I have questions" → free-text response, which captures 80% of the value at 10% of the build. The full collaborative comment thread is the right next step.

**Real authentication on the share link.** Long random UUID tokens are good enough for the demo. Production would need proper agent-side auth (probably magic-link email).

**Templated artifacts per agency.** Sarah said *"some agents have their own template they want me to fill out"* and the data confirms it (Tom Neary at Wasserman's agent notes: *"has his own settlement template he wants filled in"*). The right answer is configurable templates keyed by agency. The wrong answer is to skip it; the right cut is to build one default template now and treat per-agency customization as the second sprint.

**GM-side approval anomaly detection.** Marcus signs the wire from his couch with no visibility. The pair gets him a legible artifact to look at, which is a meaningful improvement, but anomaly detection ("absorbed $612 over cap — is that intentional?") is downstream work. Worth doing next.

**Multi-show fleet view.** Not in the slice. Reporting page is downstream of structured deals existing in the first place — fix the input, then improve the aggregations.

**Real SMTP / inbound email parsing.** The clarification flow ships with `[Simulate agent reply]` for the demo. Production would route the email and parse the structured reply with a second AI pass. Mocking it is honest and doesn't change the user-visible flow.

## What I'd ship next, in order

1. **Backfill historical deals through the extraction pass.** Once the new flow works, run it over the 537 past deals so the reporting page can speak in structured terms (margin variance, dispute root cause, agency-level signal). This unblocks Marcus's predicted-vs-actual reconciliation ask.

2. **Real agent reply parsing.** Inbound email webhook → second AI pass that maps the reply to a structured resolution. Today's `[Simulate]` button becomes real.

3. **GM-side approval anomaly view.** Marcus signs the wire from his phone; the system flags anything unusual ("$612 absorbed", "ambiguity still open"). His "I sign blind" pain.

4. **Per-agency templated artifact.** Configurable template applied to the same trace data — solves the "Tom Neary wants his own template" problem without rebuilding the engine.

5. **Wednesday risk forecast extended.** The prototype's risk card is a static rule. A second sprint trains a model against historical disputes — actual dispute likelihood given deal shape, agency, recoup category, and ambiguity load.

6. **Tour-side mobile-native view.** Diego pulls up the artifact in the van today. The next step is a TM-side iOS app that pre-reviews settlements across the tour, with notifications when a venue's artifact is ready.

7. **Deal capture as input to advance.** Pri's memo named the advance workspace as the second craft bet. Once deals are structured, the advance flow can pre-populate from them. Same data, new surface.

## How I'd validate the bet

Three tests, ordered by cost:

**Replay the 22 disputes.** Run each historical disputed settlement's deal prose through the new capture flow. Measure: what fraction surface an ambiguity that, if resolved upstream, would have prevented the dispute? *Target: ≥70%.* If most disputes wouldn't have been flagged, the slice doesn't address the root cause and we should rethink.

**Extraction accuracy at scale.** Run the prompt over all 184 past vs deals. Have Mariana spot-check 50. Measure: per-field accuracy, ambiguity precision (true ambiguity vs noise). *Target: ≥85% field-level accuracy, ≤2 ambiguity flags per deal on average.* If extraction is noisy, the booker stops trusting it and we revert to the 18% adoption baseline.

**Time-to-settle stopwatch.** Mariana settles 3 vs deals with her spreadsheet and 3 with the walkthrough. *Target: 60%+ reduction in active settlement time, with no fidelity loss.* If the walkthrough is slower or equally slow, the structural argument has to do the heavy lifting on adoption, which is a harder sell.

The longer-running validations — dispute rate over 6 months, in-app adoption shift over a quarter, agent NPS — we don't get to in 6–8 hours. But the three above can be run on the prototype against historical data, which is enough to know whether the bet is real before we scale.

## The strategic frame

Pri's Q4 memo named settlement as the Q1 craft bet. She said two things mattered: *"the most trust-critical moment in the relationship"* and *"82% of our base is going around our product."* The pair attacks both. Trust is built upstream — at the deal layer — and the walkthrough plus shared artifact rebuilds the artifact bookers stopped trusting. Coverage closes the 62.6% gap that drives the spreadsheet workflow.

Marcus's strategic argument is the ROI story. *"The dollars on the night are the smallest part. The bigger thing is whether we lose the relationship."* He named an $80K example of an agent who quietly stopped routing through The Crescent after a bad settlement experience. The slice is, structurally, about preserving agency routing decisions by making settlement quality visible and disputable upstream. That's what protects the lease in March 2027.

We are not building a better calculator. We are rebuilding the connective tissue between three roles — booker, tour manager, agent — that the product today fails to connect. The 2am ritual exists because that tissue is missing. The slice puts it back.
