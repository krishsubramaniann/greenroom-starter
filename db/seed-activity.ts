/**
 * Activity log seed events for the Coastal Spell case-study demo.
 *
 * These events populate the unified activity log that renders on /shows/[id]
 * and /shows/[id]/settle for show_coastal_spell_dispute. They cover the full
 * lifecycle: deal capture → agent comment → ambiguity resolution → expenses
 * → walkthrough → agent signoff → GM approval.
 *
 * Insert into a new `activity_events` table during db:seed. The activity log
 * component reads from this table, joined with users/agents for actor info.
 *
 * For "fresh deal" demo moments (where Mariana captures a deal live in the
 * Loom), the events are written in real time by the app — no seeding needed.
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const activityEvents = sqliteTable("activity_events", {
  id: text("id").primaryKey(),
  dealId: text("deal_id"),                       // CRES-COA-2026-03-14 style
  showId: text("show_id"),
  settlementId: text("settlement_id"),
  eventType: text("event_type", {
    enum: [
      "deal_captured", "ai_extracted", "ambiguity_flagged",
      "confirmation_sent", "agent_opened", "agent_commented", "ambiguity_resolved",
      "deal_locked", "deal_revised",
      "expense_logged", "comp_logged", "ticket_milestone",
      "settlement_drafted", "walkthrough_started", "trace_line_acked", "walkthrough_completed",
      "settlement_sent", "agent_signed_off", "agent_questioned",
      "gm_approved", "wire_sent", "settlement_paid",
      "email_received", "email_sent",
    ],
  }).notNull(),
  actorType: text("actor_type", { enum: ["user", "agent", "tour_manager", "system", "production_manager"] }).notNull(),
  actorId: text("actor_id"),                     // FK to users/agents/etc.
  actorName: text("actor_name").notNull(),       // denormalized for fast render
  actorRole: text("actor_role"),                  // "Booker", "GM", "TM (Coastal Spell)", "Agent (WME)"
  payloadJson: text("payload_json"),              // structured event detail
  summary: text("summary").notNull(),             // human-readable single-line
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// Coastal Spell — full lifecycle events (Dec 12 2024 → Mar 16 2025)
// ---------------------------------------------------------------------------

const COASTAL_SPELL_DEAL_ID = "CRES-COA-2025-03-14";
const COASTAL_SPELL_SHOW_ID = "show_coastal_spell_dispute";

export const coastalSpellActivitySeed = [
  // ── DEAL CAPTURE PHASE (T-3 months) ──────────────────────────────────────
  {
    id: "ae_cs_001",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "email_received",
    actorType: "agent",
    actorName: "Andrea Pelletier",
    actorRole: "Agent (WME)",
    summary: "Deal email received: \"Confirming Coastal Spell for 3/14. Deal is $5,000 vs 80% of net…\"",
    payloadJson: JSON.stringify({
      channel: "email",
      from: "apelletier@wme.com",
      subject: "Coastal Spell 3/14",
      preview: "Deal is $5,000 vs 80% of net after expenses. Expenses capped at $2,500...",
    }),
    occurredAt: new Date("2024-12-12T14:08:00-06:00"),
  },
  {
    id: "ae_cs_002",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "deal_captured",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Captured deal via AI extraction from email prose",
    payloadJson: JSON.stringify({
      source: "email_paste",
      extracted_fields: 7,
      ambiguities_flagged: 1,
    }),
    occurredAt: new Date("2024-12-12T15:42:00-06:00"),
  },
  {
    id: "ae_cs_003",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "ambiguity_flagged",
    actorType: "system",
    actorName: "Greenroom AI",
    actorRole: "Extraction",
    summary: "1 ambiguity flagged: marketing recoup position (off-gross vs inside-cap)",
    payloadJson: JSON.stringify({
      ambiguity_id: "recoup_position_marketing_0",
      candidate_readings: ["off_gross", "inside_cap"],
      estimated_impact_usd: 720,
    }),
    occurredAt: new Date("2024-12-12T15:42:03-06:00"),
  },
  {
    id: "ae_cs_004",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "confirmation_sent",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Sent deal confirmation link to Andrea Pelletier (WME)",
    payloadJson: JSON.stringify({
      to: "apelletier@wme.com",
      reply_to: "coa-2025-03-14@deals.greenroom.app",
      subject: "[CRES-COA-2025-03-14] Deal confirmation — Coastal Spell 3/14",
      magic_link: "/shared/deal/cs-mar14-abc123",
    }),
    occurredAt: new Date("2024-12-12T15:45:00-06:00"),
  },
  {
    id: "ae_cs_005",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "agent_opened",
    actorType: "agent",
    actorName: "Andrea Pelletier",
    actorRole: "Agent (WME)",
    summary: "Opened deal confirmation link",
    payloadJson: JSON.stringify({ via: "magic_link" }),
    occurredAt: new Date("2024-12-13T09:15:00-06:00"),
  },
  {
    id: "ae_cs_006",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "agent_commented",
    actorType: "agent",
    actorName: "Andrea Pelletier",
    actorRole: "Agent (WME)",
    summary: "Commented on clause \"Marketing recoup position\": \"We read this as inside the $2,500 cap.\"",
    payloadJson: JSON.stringify({
      clause_ref: "recoups[0].position",
      body: "We read this as inside the $2,500 cap, not in addition to it. That was always the intent — single cap on all venue-charged costs.",
      channel: "magic_link_inline",
    }),
    occurredAt: new Date("2024-12-13T09:18:00-06:00"),
  },
  {
    id: "ae_cs_007",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "ambiguity_resolved",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Resolved ambiguity \"marketing recoup position\" → inside_cap (confirmed by Andrea)",
    payloadJson: JSON.stringify({
      ambiguity_id: "recoup_position_marketing_0",
      resolution: "inside_cap",
      resolved_with_agent: true,
    }),
    occurredAt: new Date("2024-12-13T10:22:00-06:00"),
  },
  {
    id: "ae_cs_008",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "deal_locked",
    actorType: "system",
    actorName: "Greenroom",
    actorRole: "System",
    summary: "Deal locked. All ambiguities resolved. Structured terms agreed by both parties.",
    payloadJson: JSON.stringify({
      total_fields: 8,
      ambiguities_resolved: 1,
      time_to_lock_hours: 19,
    }),
    occurredAt: new Date("2024-12-13T10:22:30-06:00"),
  },

  // ── PRE-SHOW WEEK (Mar 10 – Mar 14, 2025) ────────────────────────────────
  {
    id: "ae_cs_010",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "expense_logged",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Logged Marketing expense: $900 (Spotify pre-show ad spend)",
    payloadJson: JSON.stringify({
      category: "marketing",
      amount: 900,
      description: "Spotify pre-show ad spend (recoup-tagged)",
      receipt_attached: true,
    }),
    occurredAt: new Date("2025-03-08T11:14:00-06:00"),
  },
  {
    id: "ae_cs_011",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "expense_logged",
    actorType: "production_manager",
    actorName: "Mike Chen",
    actorRole: "Production Manager",
    summary: "Logged Sound expense: $400",
    payloadJson: JSON.stringify({ category: "sound", amount: 400, source: "mobile" }),
    occurredAt: new Date("2025-03-13T16:42:00-06:00"),
  },
  {
    id: "ae_cs_012",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "expense_logged",
    actorType: "production_manager",
    actorName: "Mike Chen",
    actorRole: "Production Manager",
    summary: "Logged Lights expense: $220",
    payloadJson: JSON.stringify({ category: "lights", amount: 220, source: "mobile" }),
    occurredAt: new Date("2025-03-13T16:45:00-06:00"),
  },

  // ── SHOW NIGHT (Mar 14) ──────────────────────────────────────────────────
  {
    id: "ae_cs_020",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "ticket_milestone",
    actorType: "system",
    actorName: "POS integration",
    actorRole: "System",
    summary: "Final ticket sales: 620 tickets, $19,840 gross (95% of capacity)",
    payloadJson: JSON.stringify({ tickets: 620, gross: 19840, capacity: 650 }),
    occurredAt: new Date("2025-03-14T22:14:00-06:00"),
  },
  {
    id: "ae_cs_021",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "expense_logged",
    actorType: "production_manager",
    actorName: "Mike Chen",
    actorRole: "Production Manager",
    summary: "Logged Hospitality expense: $480 (receipt attached, $80 over $400 cap)",
    payloadJson: JSON.stringify({
      category: "hospitality",
      amount: 480,
      description: "Green room hospitality — beer, spirits, food",
      receipt_attached: true,
      ocr_confidence: 0.97,
      flag: "over_cap",
      cap: 400,
      overage: 80,
      source: "mobile",
    }),
    occurredAt: new Date("2025-03-14T23:31:12-06:00"),
  },
  {
    id: "ae_cs_022",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    eventType: "expense_logged",
    actorType: "production_manager",
    actorName: "Mike Chen",
    actorRole: "Production Manager",
    summary: "Logged Backline + Production add-ons: $500 total",
    payloadJson: JSON.stringify({
      items: [
        { category: "backline", amount: 220 },
        { category: "production", amount: 280 },
      ],
      source: "mobile",
    }),
    occurredAt: new Date("2025-03-14T23:38:00-06:00"),
  },
  {
    id: "ae_cs_023",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    settlementId: "set_coastal_spell_dispute",
    eventType: "settlement_drafted",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Settlement assembled — total to artist: $12,285",
    payloadJson: JSON.stringify({
      total_to_artist: 12285,
      branches: { guarantee: 5000, percentage: 12285, winner: "percentage" },
      trace_lines: 12,
    }),
    occurredAt: new Date("2025-03-14T23:42:00-06:00"),
  },
  {
    id: "ae_cs_024",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    settlementId: "set_coastal_spell_dispute",
    eventType: "walkthrough_started",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Started walkthrough with TM",
    payloadJson: JSON.stringify({ tm_name: "Coastal Spell TM" }),
    occurredAt: new Date("2025-03-14T23:48:00-06:00"),
  },
  {
    id: "ae_cs_025",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    settlementId: "set_coastal_spell_dispute",
    eventType: "trace_line_acked",
    actorType: "tour_manager",
    actorName: "Coastal Spell TM",
    actorRole: "TM (Coastal Spell)",
    summary: "Acknowledged all 12 trace lines during walkthrough (8 minutes total)",
    payloadJson: JSON.stringify({
      lines_acked: 12,
      questioned: 0,
      duration_minutes: 8,
    }),
    occurredAt: new Date("2025-03-14T23:56:00-06:00"),
  },
  {
    id: "ae_cs_026",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    settlementId: "set_coastal_spell_dispute",
    eventType: "walkthrough_completed",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Walkthrough completed. Signoff text: \"OK — but flag any future marketing recoup deals.\"",
    payloadJson: JSON.stringify({
      signoff_text: "OK — but flag any future marketing recoup deals.",
      total_to_artist: 12285,
    }),
    occurredAt: new Date("2025-03-14T23:56:30-06:00"),
  },
  {
    id: "ae_cs_027",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    settlementId: "set_coastal_spell_dispute",
    eventType: "settlement_sent",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Sent settlement to Andrea Pelletier (WME) for async review",
    payloadJson: JSON.stringify({
      to: "apelletier@wme.com",
      magic_link: "/shared/settlement/cs-mar14-stl-xyz789",
    }),
    occurredAt: new Date("2025-03-15T07:02:00-06:00"),
  },

  // ── POST-SHOW (Mar 15-16) ────────────────────────────────────────────────
  {
    id: "ae_cs_030",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    settlementId: "set_coastal_spell_dispute",
    eventType: "agent_opened",
    actorType: "agent",
    actorName: "Andrea Pelletier",
    actorRole: "Agent (WME)",
    summary: "Opened settlement link for review",
    occurredAt: new Date("2025-03-15T08:42:00-06:00"),
  },
  {
    id: "ae_cs_031",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    settlementId: "set_coastal_spell_dispute",
    eventType: "agent_signed_off",
    actorType: "agent",
    actorName: "Andrea Pelletier",
    actorRole: "Agent (WME)",
    summary: "Signed off settlement: \"Looks clean. Thanks for the heads-up on the hospitality overage.\"",
    payloadJson: JSON.stringify({
      status: "agreed",
      signoff_text: "Looks clean. Thanks for the heads-up on the hospitality overage.",
      total_agreed: 12285,
    }),
    occurredAt: new Date("2025-03-15T08:47:00-06:00"),
  },
  {
    id: "ae_cs_032",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    settlementId: "set_coastal_spell_dispute",
    eventType: "gm_approved",
    actorType: "user",
    actorName: "Marcus Holland",
    actorRole: "GM",
    summary: "Approved wire: $12,285 to Coastal Spell. Note: \"Wired Monday morning.\"",
    payloadJson: JSON.stringify({
      decision: "approved",
      approved_amount: 12285,
      note: "Wired Monday morning.",
    }),
    occurredAt: new Date("2025-03-16T09:14:00-06:00"),
  },
  {
    id: "ae_cs_033",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    settlementId: "set_coastal_spell_dispute",
    eventType: "wire_sent",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Wire sent: $12,285 to Coastal Spell via ACH",
    payloadJson: JSON.stringify({ amount: 12285, method: "ach" }),
    occurredAt: new Date("2025-03-17T10:30:00-06:00"),
  },
  {
    id: "ae_cs_034",
    dealId: COASTAL_SPELL_DEAL_ID,
    showId: COASTAL_SPELL_SHOW_ID,
    settlementId: "set_coastal_spell_dispute",
    eventType: "settlement_paid",
    actorType: "system",
    actorName: "Greenroom",
    actorRole: "System",
    summary: "Settlement marked paid. Lifecycle complete.",
    payloadJson: JSON.stringify({
      total_elapsed_hours_from_show_end: 59,
      ambiguities_at_dispute: 0,
      dispute_fired: false,
      dispute_prevented_estimate_usd: 720,
    }),
    occurredAt: new Date("2025-03-17T10:31:00-06:00"),
  },
];

// ---------------------------------------------------------------------------
// Optional: a second show in "deal locked, week-of" state for risk-card demo
// ---------------------------------------------------------------------------

// Pale Lake April 23 2026 — gives the Loom a "future show, clean state" example
// to contrast against Coastal Spell's full lifecycle. Only ~6 events needed.

export const paleLakeActivitySeed = [
  {
    id: "ae_pl_001",
    dealId: "CRES-PL-2026-04-23",
    showId: "show_pale_lake_apr",
    eventType: "deal_captured",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Captured deal via AI extraction",
    occurredAt: new Date("2026-02-10T14:22:00-06:00"),
  },
  {
    id: "ae_pl_002",
    dealId: "CRES-PL-2026-04-23",
    showId: "show_pale_lake_apr",
    eventType: "deal_locked",
    actorType: "system",
    actorName: "Greenroom",
    actorRole: "System",
    summary: "Deal locked — all terms structured, no ambiguities",
    occurredAt: new Date("2026-02-11T09:15:00-06:00"),
  },
  {
    id: "ae_pl_003",
    dealId: "CRES-PL-2026-04-23",
    showId: "show_pale_lake_apr",
    eventType: "email_received",
    actorType: "tour_manager",
    actorName: "Diego Velasquez",
    actorRole: "TM (Pale Lake)",
    summary: "Diego (TM) emailed re: production add — drum riser, ~$150",
    payloadJson: JSON.stringify({
      ai_classified: true,
      confidence: 0.88,
      auto_linked: true,
    }),
    occurredAt: new Date("2026-04-09T15:30:00-06:00"),
  },
  {
    id: "ae_pl_004",
    dealId: "CRES-PL-2026-04-23",
    showId: "show_pale_lake_apr",
    eventType: "expense_logged",
    actorType: "user",
    actorName: "Mariana Reyes",
    actorRole: "Booker",
    summary: "Added pre-noted production recoup: $150 (drum riser, TM-requested)",
    occurredAt: new Date("2026-04-09T15:32:00-06:00"),
  },
];
