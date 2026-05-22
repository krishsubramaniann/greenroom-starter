/**
 * Deterministic mock-data generator for the /metrics dashboard.
 *
 * Produces ~100 fake settled shows across the past 12 months for the
 * trend story Mariana's CEO bet rides on:
 *
 *   Era                       Window               Median   < 60 min
 *   -------------------------------------------------------------------
 *   Pre-V2  (legacy engine)   Jun – Sep 2025       4h 12m   12%
 *   Transition (mid-rollout)  Oct 2025 – Jan 2026  1h 45m   45%
 *   V2 era  (full coverage)   Feb 2026 – present   38m      78%
 *
 * Plus named anchors so the rest of the demo's shows show up in the
 * dashboard's "top fast settlements" list: Hollow Oak (24m), Coastal
 * Spell (31m), Pale Lake (28m), plus the five Phase 9 view-only fixtures.
 *
 * No database. Pure deterministic output keyed by a seeded RNG so the
 * dashboard renders the same numbers every time.
 */

export type MockShow = {
  id: string;
  artist: string;
  showId: string; // links to /shows/[id]/settle if a real fixture is named
  date: string; // YYYY-MM-DD
  dealType: "flat" | "vs" | "percentage_of_gross" | "percentage_of_net" | "tier_ratchet" | "walkout_pot";
  agency: "WME" | "CAA" | "UTA" | "Paradigm" | "independent";
  genre: "Indie folk" | "Indie rock" | "Electronic" | "Singer-songwriter";
  timeToSettleMin: number;
  /** True if the dispute happened during settlement (drives the dispute-rate stat). */
  disputed: boolean;
  /** Per-stage minutes that sum to timeToSettleMin. Phase 9.5 might use these. */
  stageMinutes: {
    showEndToExpenses: number;
    expensesToAgent: number;
    agentToGm: number;
  };
};

// Seeded RNG so re-renders are byte-identical
function makeRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const ARTISTS = [
  "Holm Glass", "Verdun Tide", "Quiet Ridge", "North Tower", "Mirror Frame",
  "Coastal Glass", "Ember Crest", "Pale Country", "South Field", "Open Window",
  "Hollow Echo", "River Stone", "Dust Lane", "Painted Sky", "Burrow Road",
  "Forecast", "Iron Tide", "Slow Hours", "Bright Earth", "Long Yard",
  "Wax Field", "Salt Range", "Apex Court", "Lower Bend", "Pine Cove",
  "High Window", "Marlow Drive", "Pier Light", "Granite Hill", "Side Yard",
  "Roving Hours", "Cedar Way", "Black Coast", "Open Garage", "Lever Pull",
  "Slow Engine", "Last Call", "Hard Pour", "Sunday Garage", "Cold Light",
  "Fern Hollow", "Birch Park", "Stone Mason", "Half Tone", "Even Keel",
  "Mosswood", "Long Run", "Quiet River", "Tin Roof", "Loose Yard",
  "Wide Boulevard", "Soft Ledge", "Iron Hour", "Belt Loop", "Spruce Bend",
  "Marsh Light", "South Track", "Pen Holder", "Cold Wax", "Dry Creek",
  "Inland Sea", "Brick Stream", "Old Filament", "Pale Engine", "Wedge Field",
  "Lake Bottom", "Far Coast", "Crown Range", "Open Ledger", "Side Glass",
  "Cedar Sound", "Wax Court", "Holm River", "Long Drive", "Wide Margin",
  "Side Cabin", "Loose Hours", "Field House", "Open Cellar", "Tied Loop",
  "Slate Coast", "Burrow Pine", "Cold Storage", "Apex Field", "Inland Loop",
];

// Anchor real shows (interactive Hollow Oak + Coastal Spell history + the
// 5 frozen view-only gallery fixtures). Each has a hand-picked time.
const ANCHORS: MockShow[] = [
  {
    id: "anchor_hollow_oak",
    artist: "Hollow Oak",
    showId: "show_hollow_oak_jun",
    date: "2026-06-19",
    dealType: "vs",
    agency: "WME",
    genre: "Indie folk",
    timeToSettleMin: 24,
    disputed: false,
    stageMinutes: { showEndToExpenses: 10, expensesToAgent: 9, agentToGm: 5 },
  },
  {
    id: "anchor_coastal_spell",
    artist: "Coastal Spell",
    showId: "show_coastal_spell_dispute",
    date: "2025-03-14",
    dealType: "vs",
    agency: "WME",
    genre: "Indie folk",
    timeToSettleMin: 31,
    disputed: false,
    stageMinutes: { showEndToExpenses: 13, expensesToAgent: 12, agentToGm: 6 },
  },
  {
    id: "anchor_pale_lake",
    artist: "Pale Lake",
    showId: "show_pale_lake_apr",
    date: "2026-04-23",
    dealType: "percentage_of_net",
    agency: "WME",
    genre: "Indie rock",
    timeToSettleMin: 28,
    disputed: false,
    stageMinutes: { showEndToExpenses: 12, expensesToAgent: 10, agentToGm: 6 },
  },
  {
    id: "anchor_maple_court",
    artist: "Maple Court",
    showId: "show_maple_court_apr",
    date: "2026-04-12",
    dealType: "tier_ratchet",
    agency: "WME",
    genre: "Indie rock",
    timeToSettleMin: 33,
    disputed: false,
    stageMinutes: { showEndToExpenses: 14, expensesToAgent: 12, agentToGm: 7 },
  },
  {
    id: "anchor_iron_field",
    artist: "Iron Field",
    showId: "show_iron_field_apr",
    date: "2026-04-08",
    dealType: "flat",
    agency: "CAA",
    genre: "Indie folk",
    timeToSettleMin: 19,
    disputed: false,
    stageMinutes: { showEndToExpenses: 8, expensesToAgent: 7, agentToGm: 4 },
  },
  {
    id: "anchor_pine_bend",
    artist: "Pine Bend",
    showId: "show_pine_bend_mar",
    date: "2026-03-22",
    dealType: "percentage_of_gross",
    agency: "WME",
    genre: "Electronic",
    timeToSettleMin: 31,
    disputed: false,
    stageMinutes: { showEndToExpenses: 13, expensesToAgent: 12, agentToGm: 6 },
  },
  {
    id: "anchor_echo_range",
    artist: "Echo Range",
    showId: "show_echo_range_feb",
    date: "2026-02-17",
    dealType: "percentage_of_net",
    agency: "CAA",
    genre: "Singer-songwriter",
    timeToSettleMin: 35,
    disputed: false,
    stageMinutes: { showEndToExpenses: 15, expensesToAgent: 13, agentToGm: 7 },
  },
  {
    id: "anchor_slate_harbor",
    artist: "Slate Harbor",
    showId: "show_slate_harbor_may",
    date: "2026-05-10",
    dealType: "walkout_pot",
    agency: "CAA",
    genre: "Singer-songwriter",
    timeToSettleMin: 41,
    disputed: false,
    stageMinutes: { showEndToExpenses: 18, expensesToAgent: 15, agentToGm: 8 },
  },
];

const AGENCY_WEIGHTS: Array<[MockShow["agency"], number]> = [
  ["WME", 0.4],
  ["CAA", 0.35],
  ["UTA", 0.15],
  ["Paradigm", 0.05],
  ["independent", 0.05],
];

const GENRE_WEIGHTS: Array<[MockShow["genre"], number]> = [
  ["Indie folk", 0.35],
  ["Indie rock", 0.3],
  ["Electronic", 0.15],
  ["Singer-songwriter", 0.2],
];

const DEAL_TYPE_DISTRIBUTION: Array<[MockShow["dealType"], number]> = [
  // Roughly matches the spec's per-deal-type counts when scaled to 100.
  ["flat", 0.18],
  ["vs", 0.42],
  ["percentage_of_net", 0.14],
  ["percentage_of_gross", 0.08],
  ["tier_ratchet", 0.12],
  ["walkout_pot", 0.06],
];

function weightedPick<T>(rnd: () => number, options: Array<[T, number]>): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of options) {
    r -= w;
    if (r <= 0) return v;
  }
  return options[options.length - 1][0];
}

// Log-normal-ish sampler — mean is approximate.
function lognormal(rnd: () => number, medianMin: number): number {
  // log-normal with sigma~0.6 gives a long right tail
  const u = Math.max(1e-6, rnd());
  const v = Math.max(1e-6, rnd());
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(8, Math.round(medianMin * Math.exp(0.6 * z)));
}

function dateNDaysAgo(daysAgo: number, today: Date): string {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const ANCHOR_DATE = new Date("2026-06-20"); // pinned "today" for the dashboard

export function generateMockShows(): MockShow[] {
  const rnd = makeRng(0x9b1a37c4);
  const out: MockShow[] = [...ANCHORS];

  // 25 pre-V2 shows (Jun–Sep 2025) — slow median, long tail.
  // Date range ~360..275 days ago.
  for (let i = 0; i < 25; i++) {
    const daysAgo = 360 - Math.floor(rnd() * 85);
    const t = lognormal(rnd, 252); // 4h 12m median
    out.push(buildShow(rnd, i, daysAgo, t, "pre"));
  }
  // 30 transition shows (Oct 2025 – Jan 2026) — bimodal, blended median.
  for (let i = 0; i < 30; i++) {
    const daysAgo = 274 - Math.floor(rnd() * 120);
    const fast = rnd() < 0.45;
    const t = fast
      ? Math.round(35 + rnd() * 40) // 35-75 min
      : lognormal(rnd, 180); // ~3h median for the slow half
    out.push(buildShow(rnd, 25 + i, daysAgo, t, "transition"));
  }
  // 45 V2 shows (Feb 2026 – present) — tight cluster.
  for (let i = 0; i < 45; i++) {
    const daysAgo = 154 - Math.floor(rnd() * 130);
    const fast = rnd() < 0.78;
    const t = fast
      ? Math.round(20 + rnd() * 40) // 20-60 min
      : Math.round(70 + rnd() * 90); // 70-160 min for the long tail
    out.push(buildShow(rnd, 55 + i, daysAgo, t, "v2"));
  }

  return out;

  function buildShow(
    rnd2: () => number,
    idx: number,
    daysAgo: number,
    time: number,
    era: "pre" | "transition" | "v2",
  ): MockShow {
    const agency = weightedPick(rnd2, AGENCY_WEIGHTS);
    const genre = weightedPick(rnd2, GENRE_WEIGHTS);
    const dealType = weightedPick(rnd2, DEAL_TYPE_DISTRIBUTION);
    // Tier ratchet + walkout add ~40% to settle time.
    const adj =
      dealType === "tier_ratchet" || dealType === "walkout_pot"
        ? Math.round(time * 1.4)
        : time;
    // Dispute rate scales with complexity + era.
    const baseDisputeRate =
      era === "pre" ? 0.147 : era === "transition" ? 0.06 : 0.023;
    const complexityBump =
      dealType === "tier_ratchet" || dealType === "walkout_pot" ? 0.02 : 0;
    const disputed = rnd2() < baseDisputeRate + complexityBump;
    const showEndToExpenses = Math.round(adj * 0.36);
    const expensesToAgent = Math.round(adj * 0.42);
    const agentToGm = adj - showEndToExpenses - expensesToAgent;
    const artist = ARTISTS[idx % ARTISTS.length];
    const date = dateNDaysAgo(daysAgo, ANCHOR_DATE);
    return {
      id: `mock_${idx}`,
      artist,
      showId: `mock_${idx}`, // not linkable
      date,
      dealType,
      agency,
      genre,
      timeToSettleMin: adj,
      disputed,
      stageMinutes: {
        showEndToExpenses,
        expensesToAgent,
        agentToGm: Math.max(2, agentToGm),
      },
    };
  }
}
