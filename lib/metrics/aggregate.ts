/**
 * Aggregations over the mock-show array. Pure functions — easy to test
 * if we ever wire real data through.
 */

import type { MockShow } from "./generateMockShows";

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** % of shows that settled in under 60 minutes. */
export function pctUnder60(shows: MockShow[]): number {
  if (shows.length === 0) return 0;
  const n = shows.filter((s) => s.timeToSettleMin < 60).length;
  return Math.round((n / shows.length) * 100);
}

/** Disputes per 100 settled shows. */
export function disputeRate(shows: MockShow[]): number {
  if (shows.length === 0) return 0;
  const n = shows.filter((s) => s.disputed).length;
  return Math.round((n / shows.length) * 1000) / 10; // one decimal
}

/** Group settle-time by month (YYYY-MM key). */
export function monthlyUnder60Pct(
  shows: MockShow[],
): Array<{ month: string; pct: number; count: number }> {
  const buckets = new Map<string, MockShow[]>();
  for (const s of shows) {
    const m = s.date.slice(0, 7); // YYYY-MM
    const arr = buckets.get(m) ?? [];
    arr.push(s);
    buckets.set(m, arr);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, list]) => ({
      month,
      pct: pctUnder60(list),
      count: list.length,
    }));
}

/** Per-stage median minutes across all shows. */
export function stageMedians(shows: MockShow[]) {
  return {
    showEndToExpenses: median(shows.map((s) => s.stageMinutes.showEndToExpenses)),
    expensesToAgent: median(shows.map((s) => s.stageMinutes.expensesToAgent)),
    agentToGm: median(shows.map((s) => s.stageMinutes.agentToGm)),
    total: median(shows.map((s) => s.timeToSettleMin)),
  };
}

/** Histogram of settle times — 12 bins from 0 to 240+. */
export function histogram(shows: MockShow[]) {
  const edges = [0, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480];
  const bins = edges
    .slice(0, -1)
    .map((lo, i) => ({ lo, hi: edges[i + 1], count: 0 }));
  bins.push({ lo: edges[edges.length - 1], hi: Infinity, count: 0 });
  for (const s of shows) {
    const t = s.timeToSettleMin;
    const idx = bins.findIndex((b) => t >= b.lo && t < b.hi);
    if (idx >= 0) bins[idx].count += 1;
    else bins[bins.length - 1].count += 1;
  }
  return bins;
}

/** Per-deal-type slice. */
export function byDealType(shows: MockShow[]) {
  const order: MockShow["dealType"][] = [
    "flat",
    "vs",
    "percentage_of_net",
    "percentage_of_gross",
    "tier_ratchet",
    "walkout_pot",
  ];
  return order.map((dt) => {
    const group = shows.filter((s) => s.dealType === dt);
    return {
      dealType: dt,
      count: group.length,
      median: median(group.map((s) => s.timeToSettleMin)),
      pctUnder60: pctUnder60(group),
      disputeRate: disputeRate(group),
    };
  });
}

/** Per-agency slice with a tiny last-6mo trend (just bucket counts). */
export function byAgency(shows: MockShow[]) {
  const agencies: MockShow["agency"][] = [
    "WME",
    "CAA",
    "UTA",
    "Paradigm",
    "independent",
  ];
  // Last 6 months: 6 monthly buckets of % under 60 min.
  return agencies
    .map((ag) => {
      const group = shows.filter((s) => s.agency === ag);
      const trend = monthlyUnder60Pct(group).slice(-6).map((m) => m.pct);
      return {
        agency: ag,
        count: group.length,
        median: median(group.map((s) => s.timeToSettleMin)),
        pctUnder60: pctUnder60(group),
        trend,
      };
    })
    .filter((row) => row.count > 0);
}

/** Top N fastest recent settlements. */
export function topFastSettlements(shows: MockShow[], n: number = 8) {
  return [...shows]
    .sort((a, b) => {
      // recency first, then speed
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return a.timeToSettleMin - b.timeToSettleMin;
    })
    .slice(0, n);
}
