# Demo guide

> Greenroom V2 case-study prototype · how to run it, what to look for, and where to find each piece of craft.

---

## 5-minute setup

```bash
git clone <repo-url>
cd greenroom-starter
npm install
npm run db:reset
npm run dev
```

Open `http://localhost:3000`.

No API keys, no environment variables, no external services to configure. SQLite is local. The AI extraction is canned (the deal prose is real; the structured extraction is a pre-computed JSON to keep the demo deterministic for reviewers).

If you see 404s on routes that should exist, kill `npm run dev` and restart. The libsql client holds a stale file handle for a few seconds after `db:reset` — restarting `next dev` clears it.

---

## The 8-minute walkthrough (the live demo)

This is the recommended path. For the fullest effect, open multiple browser windows so you can see the live polling work across personas. A second window for the production manager, third for the agent, fourth for the GM is the full setup. You can also run it all in one window — just slower.

**Start cold:**

1. Open `http://localhost:3000/shows/show_hollow_oak_jun` — Hollow Oak is the show. Friday, June 19, 2026. The page is in **cold-start state**: no deal captured yet, no expenses, just the booking note from Mariana.

**Capture the deal:**

2. Click `[Capture deal terms →]` inside the Deal terms panel.
3. The booking email from Sarah Kim is in the source-prose pane on the left. Click `[Recapture]` to run the extraction.
4. The right pane fills with structured terms (Guarantee $4,000, 75% of net, $2,000 expense cap, $400 hospitality cap, $750 marketing recoup) — each with a confidence chip.
5. Two ambiguities are flagged below. Click `[Simulate agent reply]` on each — the agent's response appears as a quoted email, click `[Accept Sarah's reading]` to resolve.
6. Once both are resolved, click `[Save deal]`. The page auto-redirects back to the show detail page.

**Simulate the show ending:**

7. Click `[End of show]` in the top-right action bar. The box office numbers populate (400 tickets at $30 = $12,000 gross, 15 comps, ticketing fees deducted). `[View settlement]` becomes the primary CTA.

**Open settlement:**

8. Click `[View settlement]`. The settle page shows the **lifecycle pipeline** at the top — 7 stages: Deal draft → Deal submitted → Deal in review → Deal signed → Expenses → Finalized → Paid. The first four are already green because the deal flow is behind you.
9. The Settlement Details section shows three categories: Ticket Sales (populated), Expenses (empty — waiting on the PM), Settlement to Artist.

**Production manager logs expenses (second window):**

10. Click `[Send PM link]`. An inline panel appears with a QR code, a URL, and copy/open buttons.
11. Either scan the QR with your phone or click `[Open]` to open the URL in a second browser window: `http://localhost:3000/m/expense?token=pm-hollowoak-jun19`.
12. From that window, submit a few expenses: Security ($500), Hospitality ($400), Sound ($150), Production ($75). Use a real photo for any of them if you want — the receipt modal will display whatever you upload.
13. Switch back to Mariana's window. **Don't refresh.** Within 5 seconds, the expenses you just submitted should flash into Section B (Expenses) with a "from PM · just now" pill.

**PM signals done:**

14. Back in the PM window, click `[Expense Finalized · Ready for Review]`. The form replaces itself with a confirmation screen.
15. In Mariana's window (still don't refresh): a banner appears — "Production manager signaled expenses complete · ready for your review." The `[Confirm expenses received]` button enables.

**Mariana confirms:**

16. Click `[Confirm expenses received]`. Lifecycle stage 5 (Expenses) turns green. The `[Send to agent for review]` button enables.

**Agent acknowledges (third window):**

17. Click `[Send to agent for review]`. Another QR + URL panel. Open the URL in a third window: `http://localhost:3000/shared/settlement/stl-<token>`.
18. The agent sees a clean read-only one-pager — total to artist, deal terms, settlement details by section, and the approval-context timeline.
19. Click `[Acknowledge & accept]` (or `[Dispute / request changes]` to see the dispute branch).
20. Switch back to Mariana's window. Within 5 seconds: lifecycle stage 6 (Finalized) turns green. The `[Send to GM for wire approval]` button enables. The agent's button label on Mariana's side changes to `[View Settlement]` (view-mode, secondary style).

**GM approves the wire (fourth window):**

21. Click `[Send to GM for wire approval]`. Same QR/URL pattern.
22. Open the URL in a fourth window (mobile viewport ideally): `http://localhost:3000/m/gm-approve/gm-<token>`.
23. The GM sees a mobile-optimized approval screen: big total, summary card, four green checks for the approval context (Deal signed / Show complete / Expenses confirmed / Agent acknowledged), and two CTAs: `[Approve & release wire]` and `[Hold for review]`.
24. Try the hold path first: click `[Hold for review]`, enter a reason like "Need to verify hospitality with sound co", submit.
25. Switch back to Mariana's window. Within 5 seconds: stage 7 dot turns **amber** with label "On hold" and the reason rendered below. The Next Steps panel shows a "Wire on hold by GM" banner.
26. Back in the GM window, click the URL again, then `[Approve & release wire]`. Confirmation screen.
27. Mariana's window: stage 7 flips from amber to **green** with label "Paid". The Wire Approval card in the right rail shows "Paid · approved by Marcus Chen, GM, The Crescent · [timestamp]".

**The activity log:**

28. The Recent Activity dropdown in the right rail (collapsed by default — click to expand) shows the full chronological flow: `deal_captured (Mariana)` → `show_complete (Greenroom)` → 4× `expense_logged (Production manager)` → `pm_expenses_finalized (PM)` → `expenses_confirmed (Mariana)` → `agent_acknowledged (Sarah Kim, WME)` → `gm_held (Marcus Chen)` → `gm_approved (Marcus Chen)`. Every event is timestamped and attributed.

---

## What to look for

- **AI extraction with confidence chips.** Every field traces back to a real substring in the source prose. The marketing recoup row has a "position?" pill — that's an ambiguity surfaced *before* settlement night, not discovered at 2am.
- **Resolution as artifact.** When you click `[Simulate agent reply]`, the agent's response is rendered as a quoted email with timestamp and agent name. Resolving an ambiguity isn't a silent state change — it's a visible exchange Mariana can point to later.
- **The auto-redirect after deal save.** Small UX detail, but it matters: the deal capture page doesn't leave you stranded on a "Saved ✓" screen. The navigation is the confirmation.
- **Live polling without refresh.** Mariana's window updates within 5 seconds of any action by PM, agent, or GM. The lifecycle pipeline, the expense list, the next-steps panel, and the activity log all refresh in real time. This is the structural rebuttal to the 2am settlement ritual.
- **CTA state transitions.** Once a stage is complete, its button transitions from action mode (primary green, "Send X") to view mode (secondary outline, "View Y"). The page becomes an audit artifact after Paid, not a half-functional set of dangling CTAs.
- **GM hold vs. GM approve.** Stage 7 (Paid) does not go green until the GM specifically approves the wire. Agent acknowledgement marks Finalized; only GM approval marks Paid. The system correctly models a chain of authority, not a chain of clicks.
- **Receipt viewing.** Click `[📎 View receipt]` on any expense row — if the PM uploaded a real photo, you see that photo. If they didn't, a canned category-matched receipt is displayed as fallback. The receipt is an artifact of the expense, not just a filename.
- **Every line in the settlement details traces back.** Click into Settlement Details and notice that every row has a source: ticketing rows, deal-term clauses, expense receipts, comp rules. Nothing is unsourced.

---

## Exploring beyond the demo

**Deal Types gallery (`/shows/deal-types`)**

Six cards showing the six deal types the V2 engine handles. The first (Vs deal) links to the live Hollow Oak walkthrough above. The other five (Flat fee · Iron Field, % of gross · Pine Bend, % of net · Echo Range, Tier ratchet · Maple Court, Walkout pot · Slate Harbor) are **view-only frozen artifacts** showing the final paid state. No action CTAs, no live polling — just "here's how the engine handled this deal type, end-to-end."

Use the Tier ratchet (Maple Court) example to see the most interesting case: the engine correctly applies the tier-2 percentage (70% of net) because attendance crossed the 300-paid threshold, and the trace shows the math explicitly.

**Metrics dashboard (`/metrics`)**

Top-level nav item. The CEO view. Three hero metrics — % of settlements completed in under 60 minutes (the North Star), median settlement time, dispute rate per 100. Trend chart from January 2024 showing the climb from ~12% to current. Slices by deal type (tier ratchets are slower; flat fees are fastest), by agency, by recency. Top fast settlements list with Hollow Oak anchored as the most recent.

These numbers are mock, generated deterministically from a seed so reads are consistent across refreshes. They tell the trajectory story: settlement velocity is improving, dispute rate is dropping, the slice is delivering against the North Star.

---

## If something looks off

- **404s after `npm run db:reset`** — kill and restart `npm run dev`. The libsql client holds a stale file handle.
- **Want to reset the demo for another take?** Either run `npm run db:reset` again, or use the `[Reset show state]` link near `[Show complete ✓]` on Hollow Oak's show detail page — that reverts to pre-end-of-show without touching the deal.
- **PM expense submissions aren't appearing on Mariana's settle page** — confirm she's on `/shows/show_hollow_oak_jun/settle` and the page is not paused (some browsers throttle background tabs). Polling runs every 5 seconds. If still missing, check that the PM URL token matches what was generated (cold-start tokens are deterministic: `pm-hollowoak-jun19`).
- **The agent or GM magic link expired** — tokens are persisted and don't expire in the demo. If the URL fails, regenerate it from Mariana's settle page (the share link panels remember their state).
- **Receipt modal shows a canned image instead of your upload** — confirm the PM mobile form successfully POSTed the file. Real uploads land in `public/uploads/receipts/<showId>/`; if you don't see your file there, the upload didn't go through and the system fell back to the canned per-category SVG.

---

## Architecture notes (for technical reviewers)

- **Stack:** Next.js 15 (App Router, RSC), Drizzle ORM, SQLite via libsql, TypeScript, Tailwind.
- **Settlement engine:** `lib/dealMathV2.ts` — single function that consumes a structured deal + ticket sales + expenses + comps, returns a `TraceStep[]`. Same engine output renders for booker (full trace), agent (one-pager), and GM (summary card).
- **Schema:** V2 added 4 tables (`walkthroughAcks`, `shareLinks`, `clauseComments`, `activityEvents`) and a handful of nullable columns on `deals` and `settlements`. All additive — legacy fixtures still resolve.
- **Magic links:** lazy-created share links with random tokens. No auth on the artifact-viewing surfaces (PM/agent/GM are all token-routed); reproduces the production "agent's inbox is their tool of choice" pattern without building auth.
- **Live polling:** the settle page polls two endpoints every 5 seconds: `/api/show-state` (returns the show's full lifecycle state) and `/api/activity?since=<timestamp>` (returns new activity events). Both reads are heavily denormalized for speed.
- **AI extraction:** the demo uses a canned JSON response that mirrors the shape produced by the extraction prompt at `prompts/extraction.md`. Toggle to live extraction by setting `ANTHROPIC_API_KEY` and the demo will route through the real model. Confidence chips and ambiguity flags are part of the response contract, not a UI layer.
- **Activity log:** unified `activityEvents` table with `kind`, `actor`, `surface`, `payload`. Every meaningful action by every party writes one row. Rendered in the right-rail dropdown on the settle page, prepended in real time as new events arrive via polling.

The full strategic frame, design rationale, and what-I'd-ship-next are in the strategic memo and lightweight PRD, sent separately with the submission email.
