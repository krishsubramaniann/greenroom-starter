/**
 * V2 settlement engine.
 *
 * The legacy `lib/dealMath.ts` returns a flat steps[] array and only handles
 * `flat` and `percentage_of_gross`. V2 emits a structured `trace: TraceStep[]`
 * that every downstream surface (settle page, walkthrough overlay, agent
 * magic-link artifact, GM approval view, activity log) renders off of.
 *
 * Coverage:
 *   - flat                  (artist-share base = guarantee; bonuses + recoups still apply)
 *   - percentage_of_gross   (single-branch, no expense deductions)
 *   - percentage_of_net     (single-branch, full expense + recoup pipeline)
 *   - vs                    (two-branch max of guarantee vs % of net)
 *   - door                  → { supported: false } per BUILD_PLAN
 *
 * Routing: V2 is invoked when `deal.confirmedAt` is set. Unconfirmed/legacy
 * deals continue to render via `lib/dealMath.ts` for backwards compatibility.
 *
 * Stable keys: every TraceStep.key is a pure function of the deal/recoup/comp
 * shape — no timestamps, no random IDs, no iteration-order dependency. This
 * is the contract the `walkthrough_acks.line_key` column joins against.
 */

import type {
  Deal,
  Expense,
  TicketSale,
  Comp,
  Bonus,
} from "@/db/schema";

// ===========================================================================
// Type contract
// ===========================================================================

export type TraceStepKind =
  | "gross"
  | "comp_adjustment"
  | "recoup"
  | "fee"
  | "expense"
  | "branch"
  | "bonus"
  | "result";

export type TraceStepFlag =
  | "ambiguity"
  | "absorbed_by_venue"
  | "forecast"
  | "not_triggered";

export type TraceSource =
  | { type: "ticketing"; refIds: string[]; detail?: string }
  | { type: "expense_row"; refIds: string[]; detail?: string }
  | { type: "comp_rule"; category: string }
  | { type: "deal_term"; field: string }
  | { type: "derived"; detail: string };

export type TraceStep = {
  key: string;
  label: string;
  value: number;
  kind: TraceStepKind;
  source: TraceSource;
  flag?: TraceStepFlag;
  formula?: string;
  detail?: string;
};

export type RecoupPosition =
  | "off_gross"
  | "inside_cap"
  | "off_net"
  | "off_artist_share"
  | "ambiguous";

export type RecoupV2 = {
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
  position: RecoupPosition;
  status: "agreed" | "disputed" | "withdrawn";
  prose_span?: string;
  position_resolved_by?: "agent" | "tour_manager" | "user";
  position_resolved_at?: string;
};

export type Ambiguity = {
  id: string;
  field: string;
  prose_span: string;
  candidate_readings: string[];
  resolution?: string;
  resolved_at?: string;
  resolved_by?: "agent" | "tour_manager" | "user";
  estimated_impact_usd?: number;
};

export type CalcInputV2 = {
  deal: Deal;
  ticketSales: TicketSale[];
  expenses: Expense[];
  comps: Comp[];
  venueCapacity: number;
  ticketsSold?: number;
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

// ===========================================================================
// Parser helpers (exported)
// ===========================================================================

/** Read `deal.recoupsJson`. Returns [] on null/parse-error. */
export function parseDealRecoups(deal: Deal): RecoupV2[] {
  if (!deal.recoupsJson) return [];
  try {
    const parsed = JSON.parse(deal.recoupsJson);
    return Array.isArray(parsed) ? (parsed as RecoupV2[]) : [];
  } catch {
    return [];
  }
}

/** Read `deal.ambiguitiesJson`. Returns [] on null/parse-error. */
export function parseDealAmbiguities(deal: Deal): Ambiguity[] {
  if (!deal.ambiguitiesJson) return [];
  try {
    const parsed = JSON.parse(deal.ambiguitiesJson);
    return Array.isArray(parsed) ? (parsed as Ambiguity[]) : [];
  } catch {
    return [];
  }
}

/** Read `deal.bonusesJson`. Returns [] on null/parse-error. */
export function parseBonusesV2(deal: Deal): Bonus[] {
  if (!deal.bonusesJson) return [];
  try {
    const parsed = JSON.parse(deal.bonusesJson);
    return Array.isArray(parsed) ? (parsed as Bonus[]) : [];
  } catch {
    return [];
  }
}

/** Read `deal.compRulesJson`. Returns null on null/parse-error. */
export function parseCompRules(deal: Deal): Record<string, boolean> | null {
  if (!deal.compRulesJson) return null;
  try {
    const parsed = JSON.parse(deal.compRulesJson);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// ===========================================================================
// Stable-key helpers
// ===========================================================================

const KEY_GROSS = "gross";
const KEY_FEES = "fees";
const KEY_EXPENSES = "expenses";
const KEY_NET = "net";
const KEY_BRANCH = "branch";
const KEY_RESULT = "result";

const compAdjustmentKey = (category: string) => `comp_adjustment_${category}`;
const recoupKey = (recoup: RecoupV2) => `recoup_${recoup.id}`;
const bonusKey = (bonus: Bonus, idx: number) =>
  // Bonuses have no id in schema; index gives stability within a deal.
  `bonus_${idx}_${bonus.type}`;

// ===========================================================================
// Money helpers
// ===========================================================================

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtMoney = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const fmtSigned = (n: number) => (n >= 0 ? "+" : "−") + fmtMoney(n);
const fmtPct = (p: number) => `${(p * 100).toFixed(0)}%`;

// ===========================================================================
// Public entry
// ===========================================================================

export function calculateSettlementV2(
  input: CalcInputV2,
): SettlementResultV2 {
  const { deal, ticketSales, expenses, comps, venueCapacity, ticketsSold } =
    input;

  if (deal.dealType === "door") {
    return {
      supported: false,
      dealType: "door",
      reason:
        "Door deals use a different physical workflow (artist takes box office directly) — not supported in the V2 engine.",
    };
  }

  const recoups = parseDealRecoups(deal);
  const bonuses = parseBonusesV2(deal);
  const ambiguities = parseDealAmbiguities(deal);
  const compRules = parseCompRules(deal);

  // Unresolved ambiguities only — resolved ones are historical record.
  const unresolvedAmbiguities = ambiguities.filter((a) => !a.resolution);

  const tickets =
    ticketsSold ?? ticketSales.reduce((sum, t) => sum + (t.qty ?? 0), 0);

  const trace: TraceStep[] = [];

  // ── 1. Gross box office ───────────────────────────────────────────────────
  const grossFromTickets = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  trace.push({
    key: KEY_GROSS,
    label: "Gross box office",
    value: grossFromTickets,
    kind: "gross",
    source: {
      type: "ticketing",
      refIds: ticketSales.map((t) => t.id),
      detail: `${tickets.toLocaleString()} tickets`,
    },
    formula: `${tickets} tickets → ${fmtMoney(grossFromTickets)}`,
  });

  let runningGross = grossFromTickets;

  // ── 2. Comp adjustments ──────────────────────────────────────────────────
  // Group comps by category and apply per-category rule (compRules override
  // beats comp.countsTowardGross default).
  const compsByCategory = new Map<string, Comp[]>();
  for (const c of comps) {
    const arr = compsByCategory.get(c.category) ?? [];
    arr.push(c);
    compsByCategory.set(c.category, arr);
  }
  for (const [category, arr] of compsByCategory) {
    const override = compRules?.[category];
    const counts = override !== undefined ? override : arr[0].countsTowardGross;
    if (!counts) continue;
    const totalCount = arr.reduce((s, c) => s + c.count, 0);
    const totalAdj = arr.reduce((s, c) => s + c.count * c.faceValue, 0);
    if (totalAdj === 0) continue;
    runningGross += totalAdj;
    trace.push({
      key: compAdjustmentKey(category),
      label: `Comp adjustment (${category})`,
      value: totalAdj,
      kind: "comp_adjustment",
      source: { type: "comp_rule", category },
      formula: `${totalCount} comps × ${fmtMoney(arr[0].faceValue)} (${
        override !== undefined ? "deal override" : "venue default"
      })`,
    });
  }

  // ── 3. Off-gross recoups ─────────────────────────────────────────────────
  // Treat position="ambiguous" recoups as inside_cap (favorable to artist)
  // and surface the ambiguity flag elsewhere — so they do NOT come off here.
  for (const r of recoups) {
    if (r.position !== "off_gross") continue;
    runningGross -= r.amount;
    trace.push({
      key: recoupKey(r),
      label: r.label,
      value: -r.amount,
      kind: "recoup",
      source: { type: "deal_term", field: `recoups.${r.id}` },
      formula: `Off-gross recoup: ${fmtSigned(-r.amount)}`,
      detail: r.prose_span,
    });
  }

  // ── 4. Fees ───────────────────────────────────────────────────────────────
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  trace.push({
    key: KEY_FEES,
    label: "Ticketing fees",
    value: -totalFees,
    kind: "fee",
    source: {
      type: "ticketing",
      refIds: ticketSales.map((t) => t.id),
    },
    formula: `Ticketing fees: ${fmtSigned(-totalFees)}`,
  });
  const adjustedGross = runningGross - totalFees;

  // ── 5. Operational expenses + inside-cap recoups (single capped line) ────
  // Hospitality is sub-capped first; overage is absorbed by venue and removed
  // from the operational pool entirely. Then the overall expense cap binds.
  const operational = expenses.filter((e) => !e.absorbedByVenue);

  const hospitalityExpenses = operational.filter(
    (e) => e.category === "hospitality",
  );
  const nonHospitality = operational.filter(
    (e) => e.category !== "hospitality",
  );

  const rawHospitality = hospitalityExpenses.reduce(
    (s, e) => s + e.amount,
    0,
  );
  const hospitalityCap = deal.hospitalityCap ?? Infinity;
  const chargedHospitality = Math.min(rawHospitality, hospitalityCap);
  const hospitalityAbsorbed = rawHospitality - chargedHospitality;

  const operationalTotal =
    nonHospitality.reduce((s, e) => s + e.amount, 0) + chargedHospitality;

  // Inside-cap recoups (incl. ambiguous, which the engine treats as inside_cap).
  const insideCapRecoups = recoups.filter(
    (r) => r.position === "inside_cap" || r.position === "ambiguous",
  );
  const insideCapRecoupsTotal = insideCapRecoups.reduce(
    (s, r) => s + r.amount,
    0,
  );

  const totalCappable = operationalTotal + insideCapRecoupsTotal;
  const expenseCap = deal.expenseCap ?? Infinity;
  const cappedTotal = Math.min(totalCappable, expenseCap);
  const overageAbsorbed = totalCappable - cappedTotal;
  const totalAbsorbed = hospitalityAbsorbed + overageAbsorbed;

  const expenseFlag: TraceStepFlag | undefined = insideCapRecoups.some(
    (r) => r.position === "ambiguous",
  )
    ? "ambiguity"
    : totalAbsorbed > 0
      ? "absorbed_by_venue"
      : undefined;

  const expenseFormulaParts: string[] = [];
  if (nonHospitality.length > 0)
    expenseFormulaParts.push(
      `ops ${fmtMoney(nonHospitality.reduce((s, e) => s + e.amount, 0))}`,
    );
  if (rawHospitality > 0)
    expenseFormulaParts.push(
      hospitalityAbsorbed > 0
        ? `hospitality ${fmtMoney(chargedHospitality)} (${fmtMoney(
            hospitalityAbsorbed,
          )} absorbed)`
        : `hospitality ${fmtMoney(chargedHospitality)}`,
    );
  for (const r of insideCapRecoups) {
    expenseFormulaParts.push(
      `${r.label} ${fmtMoney(r.amount)}${
        r.position === "ambiguous" ? " ⚑" : ""
      }`,
    );
  }
  if (overageAbsorbed > 0)
    expenseFormulaParts.push(`cap binds at ${fmtMoney(expenseCap)}`);

  trace.push({
    key: KEY_EXPENSES,
    label: "Expenses + inside-cap recoups",
    value: -cappedTotal,
    kind: "expense",
    source: {
      type: "expense_row",
      refIds: operational.map((e) => e.id),
      detail: insideCapRecoups
        .map((r) => `(+) ${r.label} via deal term`)
        .join("; "),
    },
    flag: expenseFlag,
    formula: expenseFormulaParts.join(" + ") + ` = ${fmtMoney(cappedTotal)}`,
    detail:
      totalAbsorbed > 0
        ? `Venue absorbed ${fmtMoney(totalAbsorbed)} (${
            hospitalityAbsorbed > 0
              ? `${fmtMoney(hospitalityAbsorbed)} hospitality`
              : ""
          }${hospitalityAbsorbed > 0 && overageAbsorbed > 0 ? " + " : ""}${
            overageAbsorbed > 0
              ? `${fmtMoney(overageAbsorbed)} over expense cap`
              : ""
          })`
        : undefined,
  });

  let net = adjustedGross - cappedTotal;

  // ── 6. Off-net recoups ───────────────────────────────────────────────────
  for (const r of recoups) {
    if (r.position !== "off_net") continue;
    net -= r.amount;
    trace.push({
      key: recoupKey(r),
      label: r.label,
      value: -r.amount,
      kind: "recoup",
      source: { type: "deal_term", field: `recoups.${r.id}` },
      formula: `Off-net recoup: ${fmtSigned(-r.amount)}`,
      detail: r.prose_span,
    });
  }

  // Net subtotal step — not strictly required but the walkthrough wants it.
  trace.push({
    key: KEY_NET,
    label: "Net to artist pool",
    value: net,
    kind: "expense",
    source: { type: "derived", detail: "adjusted gross − expenses − off-net recoups" },
    formula: `Net = ${fmtMoney(net)}`,
  });

  // ── 7. Branch computation ────────────────────────────────────────────────
  const guaranteeBranch = deal.guaranteeAmount ?? 0;
  const { value: percentageBranch, ambiguous: percentageBranchAmbiguous } =
    computePercentageBranch(net, deal, bonuses);

  let base: number;
  let winner: "guarantee" | "percentage" | "neither";
  let branchFormula: string;

  switch (deal.dealType) {
    case "vs":
      base = Math.max(guaranteeBranch, percentageBranch);
      winner =
        percentageBranch > guaranteeBranch
          ? "percentage"
          : guaranteeBranch > 0
            ? "guarantee"
            : "neither";
      branchFormula = `max(guarantee ${fmtMoney(guaranteeBranch)}, percentage ${fmtMoney(percentageBranch)}) = ${fmtMoney(base)} (${winner})`;
      break;
    case "percentage_of_net":
      base = percentageBranch;
      winner = percentageBranch > 0 ? "percentage" : "neither";
      branchFormula = `${fmtPct(deal.percentage ?? 0)} of net ${fmtMoney(net)} = ${fmtMoney(percentageBranch)}`;
      break;
    case "percentage_of_gross":
      // percentage_of_gross ignores the expense pipeline — recompute against
      // the gross-after-comp/off-gross-recoup pool (i.e. before fees & exp).
      // The trace still shows the expense line for transparency.
      base = round2(runningGross * (deal.percentage ?? 0));
      winner = "percentage";
      branchFormula = `${fmtPct(deal.percentage ?? 0)} of gross ${fmtMoney(runningGross)} = ${fmtMoney(base)}`;
      break;
    case "flat":
      base = guaranteeBranch;
      winner = guaranteeBranch > 0 ? "guarantee" : "neither";
      branchFormula = `Flat guarantee = ${fmtMoney(guaranteeBranch)}`;
      break;
    default:
      // Should be unreachable — `door` returned earlier.
      return {
        supported: false,
        dealType: deal.dealType,
        reason: `Unsupported deal type: ${deal.dealType}`,
      };
  }

  trace.push({
    key: KEY_BRANCH,
    label:
      deal.dealType === "vs"
        ? "Higher of guarantee or percentage"
        : deal.dealType === "flat"
          ? "Guarantee"
          : "Percentage",
    value: base,
    kind: "branch",
    source: { type: "deal_term", field: "settlement_base" },
    formula: branchFormula,
    flag: percentageBranchAmbiguous ? "ambiguity" : undefined,
  });

  // ── 8. Bonuses (excluding tier_ratchet — that's consumed by branch) ──────
  // tier_ratchet bonuses define the percentage structure, they are not
  // additive on top of the branch. Filter them out of the bonus pass.
  let bonusTotal = 0;
  for (let i = 0; i < bonuses.length; i++) {
    const b = bonuses[i];
    if (b.type === "tier_ratchet") continue;
    const step = evaluateBonus(b, i, {
      gross: grossFromTickets,
      net,
      tickets,
      capacity: venueCapacity,
    });
    trace.push(step);
    if (step.flag !== "not_triggered") bonusTotal += step.value;
  }

  // ── 9. Off-artist-share recoups ──────────────────────────────────────────
  let artistTake = base + bonusTotal;
  for (const r of recoups) {
    if (r.position !== "off_artist_share") continue;
    artistTake -= r.amount;
    trace.push({
      key: recoupKey(r),
      label: r.label,
      value: -r.amount,
      kind: "recoup",
      source: { type: "deal_term", field: `recoups.${r.id}` },
      formula: `Off-artist-share recoup: ${fmtSigned(-r.amount)}`,
      detail: r.prose_span,
    });
  }

  // ── Result ───────────────────────────────────────────────────────────────
  const totalToArtist = round2(artistTake);

  trace.push({
    key: KEY_RESULT,
    label: "Total to artist",
    value: totalToArtist,
    kind: "result",
    source: { type: "derived", detail: "settlement base + bonuses − off-artist-share recoups" },
    formula: `Total to artist = ${fmtMoney(totalToArtist)}`,
  });

  return {
    supported: true,
    trace,
    totalToArtist,
    branches: {
      guarantee: round2(guaranteeBranch),
      percentage: round2(percentageBranch),
      winner,
    },
    ambiguities: unresolvedAmbiguities,
    grossBoxOffice: round2(grossFromTickets),
    netBoxOffice: round2(net),
    totalExpenses: round2(cappedTotal),
  };
}

// ===========================================================================
// Branch computation
// ===========================================================================

/**
 * Compute the percentage branch of the deal. Handles flat percentage as well
 * as tier_ratchet bonuses (which redefine the percentage structure). Tier
 * ratchets with reading="ambiguous" default to "split" (conservative for the
 * venue) and the caller is signaled via `ambiguous: true`.
 */
function computePercentageBranch(
  net: number,
  deal: Deal,
  bonuses: Bonus[],
): { value: number; ambiguous: boolean } {
  // Tier ratchets supersede deal.percentage when present.
  const ratchet = bonuses.find((b) => b.type === "tier_ratchet") as
    | Extract<Bonus, { type: "tier_ratchet" }>
    | undefined;

  if (ratchet) {
    const reading = ratchet.reading ?? "split";
    const ambiguous = reading === "ambiguous";
    const effectiveReading = ambiguous ? "split" : reading;

    if (effectiveReading === "flat_ratchet") {
      // Find the highest tier whose `from` threshold the net crosses, and
      // apply that tier's percentage to the entire net.
      const highest = [...ratchet.tiers]
        .sort((a, b) => a.from - b.from)
        .filter((t) => net >= t.from)
        .pop();
      const pct = highest?.percentage ?? ratchet.tiers[0]?.percentage ?? 0;
      return { value: round2(net * pct), ambiguous };
    }

    // "split" — slice net across tiers
    const sorted = [...ratchet.tiers].sort((a, b) => a.from - b.from);
    let remaining = net;
    let total = 0;
    let allocFrom = 0;
    for (const tier of sorted) {
      if (remaining <= 0) break;
      const tierStart = tier.from;
      const tierEnd = tier.to ?? Infinity;
      // Net allocated to this tier = min(remaining, tierEnd − max(tierStart, allocFrom))
      const tierFloor = Math.max(tierStart, allocFrom);
      const inTier = Math.min(remaining, Math.max(0, tierEnd - tierFloor));
      if (inTier > 0) {
        total += inTier * tier.percentage;
        remaining -= inTier;
        allocFrom = tierFloor + inTier;
      }
    }
    return { value: round2(total), ambiguous };
  }

  // No ratchet — use flat percentage.
  const pct = deal.percentage ?? 0;
  return { value: round2(net * pct), ambiguous: false };
}

// ===========================================================================
// Bonus evaluation
// ===========================================================================

function evaluateBonus(
  bonus: Bonus,
  index: number,
  ctx: { gross: number; net: number; tickets: number; capacity: number },
): TraceStep {
  const key = bonusKey(bonus, index);
  const baseStep = {
    key,
    label: bonus.type === "tier_ratchet" ? bonus.label : bonus.label,
    kind: "bonus" as const,
    source: { type: "deal_term" as const, field: `bonuses[${index}]` },
  };

  if (bonus.type === "gross_threshold") {
    const fires = ctx.gross >= bonus.threshold;
    return {
      ...baseStep,
      value: fires ? bonus.amount : 0,
      flag: fires ? undefined : "not_triggered",
      formula: fires
        ? `Gross ${fmtMoney(ctx.gross)} ≥ ${fmtMoney(bonus.threshold)} → +${fmtMoney(bonus.amount)}`
        : `Gross ${fmtMoney(ctx.gross)} < ${fmtMoney(bonus.threshold)} (not triggered)`,
    };
  }

  if (bonus.type === "sellout") {
    const fires = ctx.tickets >= ctx.capacity * 0.95;
    return {
      ...baseStep,
      value: fires ? bonus.amount : 0,
      flag: fires ? undefined : "not_triggered",
      formula: fires
        ? `${ctx.tickets}/${ctx.capacity} sold ≥ 95% → +${fmtMoney(bonus.amount)}`
        : `${ctx.tickets}/${ctx.capacity} sold (sellout = ≥95%, not triggered)`,
    };
  }

  if (bonus.type === "attendance_threshold") {
    const fires = ctx.tickets >= bonus.threshold;
    return {
      ...baseStep,
      value: fires ? bonus.amount : 0,
      flag: fires ? undefined : "not_triggered",
      formula: fires
        ? `${ctx.tickets} attendees ≥ ${bonus.threshold} → +${fmtMoney(bonus.amount)}`
        : `${ctx.tickets} attendees < ${bonus.threshold} (not triggered)`,
    };
  }

  // tier_ratchet is filtered out before reaching here — but emit a safe step
  // in case it ever leaks through, so the trace stays well-formed.
  return {
    ...baseStep,
    value: 0,
    flag: "not_triggered",
    formula: `Tier ratchet — consumed by percentage computation`,
  };
}
