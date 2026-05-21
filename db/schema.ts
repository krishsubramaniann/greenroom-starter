/**
 * Greenroom database schema.
 *
 * The data model is deliberately simple but realistic enough to support
 * the settlement workflows. Mariana (the booker at The Crescent) is the
 * primary user. Other personas (tour managers, agents, the GM) appear
 * in the data but don't have UI here.
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// -------- Users (operator accounts at the venue) --------

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", {
    enum: ["booker", "gm", "production", "box_office"],
  }).notNull(),
  venueId: text("venue_id").notNull(),
});

// -------- Venues --------

export const venues = sqliteTable("venues", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
});

// -------- Agencies & Agents --------

export const agencies = sqliteTable("agencies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  agencyId: text("agency_id").references(() => agencies.id),
  email: text("email").notNull(),
  phone: text("phone"),
  preferencesNotes: text("preferences_notes"),
});

// -------- Artists --------

export const artists = sqliteTable("artists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  agentId: text("agent_id").references(() => agents.id),
  managerEmail: text("manager_email"),
  genre: text("genre"),
  priorShowCount: integer("prior_show_count").notNull().default(0),
});

// -------- Shows --------

export const shows = sqliteTable("shows", {
  id: text("id").primaryKey(),
  venueId: text("venue_id")
    .notNull()
    .references(() => venues.id),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id),
  date: text("date").notNull(),
  status: text("status", {
    enum: ["booked", "advanced", "day_of", "settled", "closed"],
  })
    .notNull()
    .default("booked"),
  doorsTime: text("doors_time"),
  setTime: text("set_time"),
  openerArtistId: text("opener_artist_id").references(() => artists.id),
  roomConfig: text("room_config", { enum: ["standing", "seated", "mixed"] })
    .notNull()
    .default("standing"),
  internalNotes: text("internal_notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// -------- Deals --------

/**
 * One deal per show. The structure here is deliberately split:
 *
 *  - `dealType` and the structured fields (guarantee, percentage, etc.)
 *    are what the in-app settlement tool reads.
 *  - `dealNotesFreetext` is what Mariana actually trusts.
 *  - `bonusesJson` exists in the schema but the in-app tool doesn't read it.
 *    It's been there since 2023, originally added by a now-departed PM. About
 *    half the deals that have bonus structures fill it in; the other half
 *    leave it empty and put the bonuses in the prose only. That mismatch
 *    is one of the case-study seams.
 *
 * bonusesJson schema (when present):
 *   [
 *     { type: "gross_threshold", label: string, threshold: number, amount: number, stacks?: boolean },
 *     { type: "sellout", label: string, amount: number },
 *     { type: "attendance_threshold", label: string, threshold: number, amount: number },
 *     { type: "tier_ratchet", label: string, tiers: [{ from, to|null, percentage }] }
 *   ]
 */
export const deals = sqliteTable("deals", {
  id: text("id").primaryKey(),
  showId: text("show_id")
    .notNull()
    .unique()
    .references(() => shows.id),

  dealType: text("deal_type", {
    enum: ["flat", "percentage_of_gross", "percentage_of_net", "vs", "door"],
  }).notNull(),
  guaranteeAmount: real("guarantee_amount"),
  percentage: real("percentage"),
  percentageBasis: text("percentage_basis", { enum: ["gross", "net"] }),
  expenseCap: real("expense_cap"),
  hospitalityCap: real("hospitality_cap"),

  bonusesJson: text("bonuses_json"),
  dealNotesFreetext: text("deal_notes_freetext"),

  // -------- V2 additions (case-study slice) --------
  // All nullable so legacy deals continue to render via the legacy engine.
  // `confirmedAt` is the routing flag — set means V2 engine, unset means legacy.
  recoupsJson: text("recoups_json"),
  ambiguitiesJson: text("ambiguities_json"),
  sourceProse: text("source_prose"),
  extractedAt: integer("extracted_at", { mode: "timestamp" }),
  confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
  compRulesJson: text("comp_rules_json"),
  externalId: text("external_id").unique(),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// -------- Ticket sales --------

export const ticketSales = sqliteTable("ticket_sales", {
  id: text("id").primaryKey(),
  showId: text("show_id")
    .notNull()
    .references(() => shows.id),
  qty: integer("qty").notNull(),
  gross: real("gross").notNull(),
  fees: real("fees").notNull(),
  capturedAt: integer("captured_at", { mode: "timestamp" }).notNull(),
});

// -------- Comps --------

/**
 * Comp tickets given away. A real source of dispute — agents sometimes argue
 * that certain comps "should have counted toward the gross" the artist's % is
 * calculated against. Most comps don't count, but the rules vary by category
 * and sometimes by deal.
 *
 * Stored as one row per category per show (aggregated count, not per-ticket).
 */
export const comps = sqliteTable("comps", {
  id: text("id").primaryKey(),
  showId: text("show_id")
    .notNull()
    .references(() => shows.id),
  category: text("category", {
    enum: [
      "artist_gl", // artist guest list
      "label", // label/management
      "press", // journalists, photographers
      "venue_staff", // venue staff and friends
      "sponsor", // sponsor reps
      "promo", // radio giveaways, 2-for-1s
      "other",
    ],
  }).notNull(),
  count: integer("count").notNull(),
  faceValue: real("face_value").notNull(),
  // Whether these comps count toward gross box office for settlement purposes.
  // Most categories don't, but the rules are inconsistent across deals.
  countsTowardGross: integer("counts_toward_gross", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes"),
});

// -------- Expenses --------

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  showId: text("show_id")
    .notNull()
    .references(() => shows.id),
  category: text("category", {
    enum: [
      "production",
      "sound",
      "lights",
      "hospitality",
      "marketing",
      "backline",
      "security",
      "other",
    ],
  }).notNull(),
  amount: real("amount").notNull(),
  description: text("description"),
  approved: integer("approved", { mode: "boolean" }).notNull().default(true),
  absorbedByVenue: integer("absorbed_by_venue", { mode: "boolean" })
    .notNull()
    .default(false),
  enteredByUserId: text("entered_by_user_id").references(() => users.id),
  enteredAt: integer("entered_at", { mode: "timestamp" }).notNull(),
  /**
   * Origin marker for the row: "manual" = entered by Mariana via desktop;
   * "pm_mobile" = pushed in from the production-manager magic-link form
   * (/m/expense?token=...). Drives the "from production manager · just now"
   * pill on the live walkthrough panel. Nullable for backward compat with
   * pre-Phase-7 rows.
   */
  source: text("source", { enum: ["manual", "pm_mobile"] }),
});

// -------- Settlements --------

/**
 * The post-show financial reconciliation. One per show.
 *
 * Settlement is a multi-party state machine: the venue calculates a number,
 * sends it to the artist's tour manager / agent for review, they sign or
 * dispute, revisions happen, eventually a final number is agreed and money
 * moves.
 *
 * Stage timestamps below capture each transition. `status` is the current
 * stage. Most past shows are `paid`; recent ones are still in-flight.
 *
 * recoupsJson schema (when present):
 *   [
 *     { id, category: "marketing"|"hospitality_overage"|"production_overage"|"prior_advance"|"damages"|"other",
 *       label: string, amount: number, status: "agreed"|"disputed"|"withdrawn" }
 *   ]
 *
 * Recoups are venue costs that come "off the top" before artist payment.
 * They differ from regular expenses in two ways:
 *   1. They're disputed more often — the deal email language about recoups
 *      is frequently ambiguous (see the Coastal Spell dispute).
 *   2. They have their own lifecycle independent of the rest of the
 *      settlement — a recoup can be disputed even after the rest of the
 *      math is signed.
 */
export const settlements = sqliteTable("settlements", {
  id: text("id").primaryKey(),
  showId: text("show_id")
    .notNull()
    .unique()
    .references(() => shows.id),

  status: text("status", {
    enum: [
      "draft", // booker is still doing math
      "submitted", // sent to artist team
      "in_review", // artist team has opened it
      "signed", // both parties agree
      "disputed", // line items contested
      "revised", // venue sent a revision after dispute
      "finalized", // signed after revision
      "paid", // money has moved
      "voided", // show cancelled or settlement scrapped
    ],
  })
    .notNull()
    .default("draft"),

  // Stage timestamps
  draftedAt: integer("drafted_at", { mode: "timestamp" }),
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
  reviewStartedAt: integer("review_started_at", { mode: "timestamp" }),
  signedAt: integer("signed_at", { mode: "timestamp" }),
  disputedAt: integer("disputed_at", { mode: "timestamp" }),
  revisedAt: integer("revised_at", { mode: "timestamp" }),
  finalizedAt: integer("finalized_at", { mode: "timestamp" }),
  paidAt: integer("paid_at", { mode: "timestamp" }),

  completedAt: integer("completed_at", { mode: "timestamp" }),
  completedByUserId: text("completed_by_user_id").references(() => users.id),

  grossBoxOffice: real("gross_box_office"),
  netBoxOffice: real("net_box_office"),
  totalExpenses: real("total_expenses"),
  totalToArtist: real("total_to_artist"),

  calculationJson: text("calculation_json"),
  recoupsJson: text("recoups_json"),

  signoffText: text("signoff_text"),
  notes: text("notes"),
});

// -------- V2 case-study tables --------

/**
 * Line-level acknowledgments captured during the walkthrough. Keyed by
 * `lineKey` matching the V2 engine's `TraceStep.key` (stable, deterministic).
 */
export const walkthroughAcks = sqliteTable("walkthrough_acks", {
  id: text("id").primaryKey(),
  settlementId: text("settlement_id")
    .notNull()
    .references(() => settlements.id),
  lineKey: text("line_key").notNull(),
  ackedByUserId: text("acked_by_user_id"),
  ackedByActorType: text("acked_by_actor_type", {
    enum: ["user", "tour_manager", "agent"],
  }),
  ackedByName: text("acked_by_name"),
  ackedAt: integer("acked_at", { mode: "timestamp" }).notNull(),
  disputeNote: text("dispute_note"),
});

/**
 * Magic-link share tokens for deals and settlements. The `id` is the URL slug
 * (a UUID-ish string). No real auth for the demo; production would use proper
 * magic-link email with expiry.
 */
export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(),
  resourceType: text("resource_type", {
    enum: ["deal", "settlement", "pm_expense"],
  }).notNull(),
  resourceId: text("resource_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  accessedAt: integer("accessed_at", { mode: "timestamp" }),
  signoffStatus: text("signoff_status", {
    enum: ["open", "agreed", "questions"],
  })
    .notNull()
    .default("open"),
  signoffText: text("signoff_text"),
  signoffByName: text("signoff_by_name"),
  signoffAt: integer("signoff_at", { mode: "timestamp" }),
});

/**
 * Clause-level comments on a deal. `clauseRef` is a JSON-pointer-ish string
 * like "recoups[0].position". Channels include the magic-link inline UI,
 * agent email replies (routed via deal-anchored reply addresses), and
 * future in-app comments.
 */
export const clauseComments = sqliteTable("clause_comments", {
  id: text("id").primaryKey(),
  dealId: text("deal_id")
    .notNull()
    .references(() => deals.id),
  clauseRef: text("clause_ref").notNull(),
  actorType: text("actor_type", {
    enum: ["user", "agent", "tour_manager"],
  }).notNull(),
  actorName: text("actor_name").notNull(),
  body: text("body").notNull(),
  channel: text("channel", {
    enum: ["magic_link_inline", "email_reply", "in_app"],
  }).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/**
 * Unified activity feed across the deal lifecycle. Renders on /shows/[id] and
 * /shows/[id]/settle. `dealId` is the human-readable externalId (e.g.,
 * "CRES-COA-2025-03-14"); join via `deals.externalId`, not `deals.id`. Soft
 * references (no FK) so events can outlive deletions and so external systems
 * (email, OCR) can write events before the deal row exists.
 */
export const activityEvents = sqliteTable("activity_events", {
  id: text("id").primaryKey(),
  dealId: text("deal_id"),
  showId: text("show_id"),
  settlementId: text("settlement_id"),
  eventType: text("event_type", {
    enum: [
      "deal_captured",
      "ai_extracted",
      "ambiguity_flagged",
      "confirmation_sent",
      "agent_opened",
      "agent_commented",
      "agent_replied",
      "ambiguity_resolved",
      "deal_locked",
      "deal_revised",
      "expense_logged",
      "comp_logged",
      "ticket_milestone",
      "settlement_drafted",
      "walkthrough_started",
      "trace_line_acked",
      "walkthrough_completed",
      "settlement_sent",
      "agent_signed_off",
      "agent_questioned",
      "gm_approved",
      "wire_sent",
      "settlement_paid",
      "email_received",
      "email_sent",
    ],
  }).notNull(),
  actorType: text("actor_type", {
    enum: ["user", "agent", "tour_manager", "system", "production_manager"],
  }).notNull(),
  actorId: text("actor_id"),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role"),
  payloadJson: text("payload_json"),
  summary: text("summary").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
});

// -------- Type exports for convenience --------

export type User = typeof users.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Agency = typeof agencies.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Artist = typeof artists.$inferSelect;
export type Show = typeof shows.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type TicketSale = typeof ticketSales.$inferSelect;
export type Comp = typeof comps.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type WalkthroughAck = typeof walkthroughAcks.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
export type ClauseComment = typeof clauseComments.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;

// -------- Decoded JSON helpers --------

export type Bonus =
  | {
      type: "gross_threshold";
      label: string;
      threshold: number;
      amount: number;
      stacks?: boolean;
    }
  | { type: "sellout"; label: string; amount: number }
  | {
      type: "attendance_threshold";
      label: string;
      threshold: number;
      amount: number;
    }
  | {
      type: "tier_ratchet";
      label: string;
      tiers: { from: number; to: number | null; percentage: number }[];
      /**
       * How the ratchet applies once a tier threshold is crossed.
       *   - "split":         net is sliced across tiers (each tier paid at its own rate)
       *   - "flat_ratchet":  the highest crossed tier's % applies to the entire net
       *   - "ambiguous":     extraction couldn't pick one; engine defaults to "split"
       *                      and emits an ambiguity flag on the branch trace step
       * Absent on legacy bonuses — V2 engine treats undefined as "split".
       */
      reading?: "split" | "flat_ratchet" | "ambiguous";
    };

export type Recoup = {
  id: string;
  category:
    | "marketing"
    | "hospitality_overage"
    | "production_overage"
    | "prior_advance"
    | "damages"
    | "other";
  label: string;
  amount: number;
  status: "agreed" | "disputed" | "withdrawn";
};

export type SettlementStage = Settlement["status"];
