"use client";

/**
 * Metrics dashboard client. Owns filter state, computes aggregates from
 * the mock-show array, renders hero metrics + simple SVG charts + slice
 * tables. No external chart library — bespoke SVG keeps the bundle tiny
 * and the visual language consistent with the rest of the app.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  byAgency,
  byDealType,
  disputeRate,
  histogram,
  median,
  monthlyUnder60Pct,
  pctUnder60,
  stageMedians,
  topFastSettlements,
} from "@/lib/metrics/aggregate";
import type { MockShow } from "@/lib/metrics/generateMockShows";
import { cn } from "@/lib/utils";

const DEAL_TYPE_LABELS: Record<MockShow["dealType"], string> = {
  flat: "Flat fee",
  vs: "Vs deal",
  percentage_of_gross: "% of gross",
  percentage_of_net: "% of net",
  tier_ratchet: "Tier ratchet",
  walkout_pot: "Walkout pot",
};

type GroupBy = "deal_type" | "agency";

type RangeKey = "7d" | "30d" | "quarter" | "ytd" | "all";

function applyRangeFilter(shows: MockShow[], range: RangeKey): MockShow[] {
  if (range === "all") return shows;
  // Anchor "now" to the latest show date so the demo is stable.
  const latest = shows
    .map((s) => s.date)
    .sort()
    .reverse()[0];
  const today = new Date(latest);
  const daysMap: Record<RangeKey, number> = {
    "7d": 7,
    "30d": 30,
    quarter: 90,
    ytd: 0, // handled below
    all: 0,
  };
  if (range === "ytd") {
    const start = new Date(today.getFullYear(), 0, 1);
    return shows.filter((s) => new Date(s.date) >= start);
  }
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - daysMap[range]);
  return shows.filter((s) => new Date(s.date) >= cutoff);
}

type Props = { shows: MockShow[] };

export function MetricsDashboard({ shows }: Props) {
  const [range, setRange] = useState<RangeKey>("all");
  const [dealFilter, setDealFilter] = useState<"all" | MockShow["dealType"]>(
    "all",
  );
  const [groupBy, setGroupBy] = useState<GroupBy>("deal_type");

  const filtered = useMemo(() => {
    let xs = applyRangeFilter(shows, range);
    if (dealFilter !== "all") xs = xs.filter((s) => s.dealType === dealFilter);
    return xs;
  }, [shows, range, dealFilter]);

  const heroUnder60 = pctUnder60(filtered);
  const heroMedian = median(filtered.map((s) => s.timeToSettleMin));
  const heroDispute = disputeRate(filtered);

  // Pre-V2 comparison for the delta callouts (Jan 2024 → present).
  // Anchored numbers per the spec.
  const PRE_V2_UNDER60 = 12;
  const PRE_V2_DISPUTE = 14.7;
  const deltaUnder60 = heroUnder60 - PRE_V2_UNDER60;
  const deltaDispute =
    Math.round((PRE_V2_DISPUTE - heroDispute) * 10) / 10;

  const monthlyTrend = useMemo(() => monthlyUnder60Pct(filtered), [filtered]);
  const stages = useMemo(() => stageMedians(filtered), [filtered]);
  const bins = useMemo(() => histogram(filtered), [filtered]);
  const dealRows = useMemo(() => byDealType(filtered), [filtered]);
  const agencyRows = useMemo(() => byAgency(filtered), [filtered]);
  const topFast = useMemo(() => topFastSettlements(filtered, 8), [filtered]);

  return (
    <div className="px-12 py-10 max-w-7xl space-y-10">
      <div>
        <div className="eyebrow mb-3">The Crescent · settlement KPIs</div>
        <h1
          className="font-display text-[52px] font-medium text-ink-900 leading-[1.02]"
          style={{ letterSpacing: "-0.025em", fontOpticalSizing: "auto" }}
        >
          Metrics
        </h1>
        <p className="text-[14px] text-ink-500 mt-3 max-w-2xl leading-relaxed">
          Settlement velocity, dispute rate, and per-segment slices. The
          numbers Mariana&apos;s craft bet rides on.
        </p>
      </div>

      {/* Filters row */}
      <Filters
        range={range}
        setRange={setRange}
        dealFilter={dealFilter}
        setDealFilter={setDealFilter}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
      />

      {/* Hero metrics row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HeroCard
          value={`${heroUnder60}%`}
          label="< 60 min settles"
          delta={`${deltaUnder60 >= 0 ? "↑" : "↓"} ${Math.abs(deltaUnder60)}pts vs Q1 2024`}
          good={deltaUnder60 >= 0}
        />
        <HeroCard
          value={`${heroMedian} min`}
          label="Median settlement time"
          delta="show end → paid"
          good
        />
        <HeroCard
          value={`${heroDispute} per 100`}
          label="Dispute rate"
          delta={`${deltaDispute >= 0 ? "↓" : "↑"} from ${PRE_V2_DISPUTE} pre-V2`}
          good={deltaDispute >= 0}
        />
      </div>

      {/* Trend chart */}
      <Card title="% settlements under 60 min · monthly">
        <TrendChart points={monthlyTrend} />
      </Card>

      {/* Stage breakdown */}
      <Card title="Time-per-stage breakdown (median)">
        <StageBars stages={stages} />
      </Card>

      {/* Histogram */}
      <Card title="Settlement-time distribution (filtered shows)">
        <Histogram bins={bins} />
      </Card>

      {/* Slices */}
      <Card title={`Slice by ${groupBy === "deal_type" ? "deal type" : "agency"}`}>
        {groupBy === "deal_type" ? (
          <table className="w-full text-[12.5px]">
            <thead className="text-ink-500">
              <tr className="border-b border-ink-200">
                <th className="text-left py-2 font-medium">Deal type</th>
                <th className="text-right py-2 font-medium">Shows</th>
                <th className="text-right py-2 font-medium">Median</th>
                <th className="text-right py-2 font-medium">{"<"} 60 min</th>
                <th className="text-right py-2 font-medium">Disputes / 100</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {dealRows.map((r) => (
                <tr key={r.dealType}>
                  <td className="py-2.5">{DEAL_TYPE_LABELS[r.dealType]}</td>
                  <td className="py-2.5 text-right font-mono tabular">{r.count}</td>
                  <td className="py-2.5 text-right font-mono tabular">
                    {r.median} min
                  </td>
                  <td className="py-2.5 text-right font-mono tabular">
                    {r.pctUnder60}%
                  </td>
                  <td
                    className={cn(
                      "py-2.5 text-right font-mono tabular",
                      r.disputeRate >= 5 ? "text-rose-700" : "",
                    )}
                  >
                    {r.disputeRate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="text-ink-500">
              <tr className="border-b border-ink-200">
                <th className="text-left py-2 font-medium">Agency</th>
                <th className="text-right py-2 font-medium">Shows</th>
                <th className="text-right py-2 font-medium">Median</th>
                <th className="text-right py-2 font-medium">{"<"} 60 min</th>
                <th className="text-right py-2 font-medium">Trend (6mo)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {agencyRows.map((r) => (
                <tr key={r.agency}>
                  <td className="py-2.5">{r.agency}</td>
                  <td className="py-2.5 text-right font-mono tabular">{r.count}</td>
                  <td className="py-2.5 text-right font-mono tabular">
                    {r.median} min
                  </td>
                  <td className="py-2.5 text-right font-mono tabular">
                    {r.pctUnder60}%
                  </td>
                  <td className="py-2.5 text-right">
                    <Sparkline values={r.trend} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Top fast settlements */}
      <Card title="Top fast settlements · recent">
        <ul className="divide-y divide-ink-100">
          {topFast.map((s) => {
            const linkable = s.showId.startsWith("show_");
            const inner = (
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                  <span className="text-[13px] font-medium text-ink-900 truncate">
                    {s.artist}
                  </span>
                  <span className="text-[11.5px] text-ink-500">
                    · {s.date} · {DEAL_TYPE_LABELS[s.dealType]} · {s.agency}
                  </span>
                </div>
                <span className="text-[13px] font-mono tabular text-ink-700 shrink-0">
                  {s.timeToSettleMin} min · paid
                </span>
              </div>
            );
            return (
              <li key={s.id}>
                {linkable ? (
                  <Link
                    href={`/shows/${s.showId}/settle`}
                    className="block hover:bg-ink-50/60 px-2 -mx-2 rounded transition-colors"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="px-2 -mx-2">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white">
      <header className="px-5 py-3 border-b border-ink-100">
        <h2 className="text-[12.5px] uppercase tracking-wider text-ink-500 font-medium">
          {title}
        </h2>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Filters({
  range,
  setRange,
  dealFilter,
  setDealFilter,
  groupBy,
  setGroupBy,
}: {
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  dealFilter: "all" | MockShow["dealType"];
  setDealFilter: (d: "all" | MockShow["dealType"]) => void;
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-700">
      <FilterPill label="Range">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
          className="bg-transparent border-none focus:outline-none text-[12.5px] font-medium"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="quarter">Last quarter</option>
          <option value="ytd">YTD</option>
          <option value="all">All time</option>
        </select>
      </FilterPill>
      <FilterPill label="Deal type">
        <select
          value={dealFilter}
          onChange={(e) =>
            setDealFilter(e.target.value as "all" | MockShow["dealType"])
          }
          className="bg-transparent border-none focus:outline-none text-[12.5px] font-medium"
        >
          <option value="all">All</option>
          <option value="flat">Flat fee</option>
          <option value="vs">Vs deal</option>
          <option value="percentage_of_net">% of net</option>
          <option value="percentage_of_gross">% of gross</option>
          <option value="tier_ratchet">Tier ratchet</option>
          <option value="walkout_pot">Walkout pot</option>
        </select>
      </FilterPill>
      <FilterPill label="Group by">
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="bg-transparent border-none focus:outline-none text-[12.5px] font-medium"
        >
          <option value="deal_type">Deal type</option>
          <option value="agency">Agency</option>
        </select>
      </FilterPill>
    </div>
  );
}

function FilterPill({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-1.5 shadow-sm">
      <span className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
        {label}
      </span>
      {children}
    </div>
  );
}

function HeroCard({
  value,
  label,
  delta,
  good,
}: {
  value: string;
  label: string;
  delta: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-5 py-4">
      <div className="text-[40px] font-display tabular text-ink-900 leading-none">
        {value}
      </div>
      <div className="text-[12px] text-ink-500 mt-1.5">{label}</div>
      <div
        className={cn(
          "text-[11.5px] mt-0.5",
          good ? "text-brand-700" : "text-rose-700",
        )}
      >
        {delta}
      </div>
    </div>
  );
}

function TrendChart({
  points,
}: {
  points: Array<{ month: string; pct: number; count: number }>;
}) {
  if (points.length === 0) {
    return (
      <div className="text-[12px] text-ink-500 italic py-12 text-center">
        No data in this range.
      </div>
    );
  }
  const W = 760;
  const H = 200;
  const PAD = { top: 16, right: 16, bottom: 28, left: 30 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const xStep = points.length > 1 ? innerW / (points.length - 1) : 0;
  const xy = (i: number, pct: number) => {
    const x = PAD.left + i * xStep;
    const y = PAD.top + innerH - (pct / 100) * innerH;
    return { x, y };
  };
  const path = points
    .map((p, i) => {
      const { x, y } = xy(i, p.pct);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Monthly trend of under-60-minute settlements"
    >
      {/* gridlines */}
      {[0, 25, 50, 75, 100].map((g) => {
        const y = PAD.top + innerH - (g / 100) * innerH;
        return (
          <g key={g}>
            <line
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={y}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x={PAD.left - 4}
              y={y + 3}
              textAnchor="end"
              fontSize="9"
              fill="#9ca3af"
            >
              {g}%
            </text>
          </g>
        );
      })}
      {/* x axis labels — every other */}
      {points.map((p, i) => {
        if (i % Math.max(1, Math.ceil(points.length / 8)) !== 0) return null;
        const { x } = xy(i, p.pct);
        return (
          <text
            key={p.month}
            x={x}
            y={H - 8}
            textAnchor="middle"
            fontSize="9"
            fill="#9ca3af"
          >
            {p.month.slice(5)}/{p.month.slice(2, 4)}
          </text>
        );
      })}
      {/* line */}
      <path d={path} fill="none" stroke="#16a34a" strokeWidth="2" />
      {/* points */}
      {points.map((p, i) => {
        const { x, y } = xy(i, p.pct);
        return (
          <circle
            key={p.month}
            cx={x}
            cy={y}
            r="2.5"
            fill="#16a34a"
          />
        );
      })}
    </svg>
  );
}

function StageBars({
  stages,
}: {
  stages: {
    showEndToExpenses: number;
    expensesToAgent: number;
    agentToGm: number;
    total: number;
  };
}) {
  const max = Math.max(
    stages.showEndToExpenses,
    stages.expensesToAgent,
    stages.agentToGm,
    1,
  );
  const rows = [
    {
      label: "Show end → Expenses confirmed",
      v: stages.showEndToExpenses,
    },
    { label: "→ Agent acknowledged", v: stages.expensesToAgent },
    { label: "→ GM approved (Paid)", v: stages.agentToGm },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-[12.5px]">
          <div className="w-64 text-ink-700 shrink-0">{r.label}</div>
          <div className="flex-1 h-5 rounded bg-ink-50">
            <div
              className="h-5 rounded bg-brand-600"
              style={{ width: `${(r.v / max) * 100}%` }}
            />
          </div>
          <div className="w-16 text-right font-mono tabular text-ink-900 shrink-0">
            {r.v} min
          </div>
        </div>
      ))}
      <div className="border-t border-ink-200 pt-2.5 flex items-center justify-between text-[12.5px]">
        <span className="text-ink-700 font-medium">Total median</span>
        <span className="font-mono tabular text-ink-900">{stages.total} min</span>
      </div>
    </div>
  );
}

function Histogram({
  bins,
}: {
  bins: Array<{ lo: number; hi: number; count: number }>;
}) {
  const max = Math.max(...bins.map((b) => b.count), 1);
  const W = 760;
  const H = 160;
  const PAD = { top: 8, right: 8, bottom: 24, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const barW = innerW / bins.length;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Settlement-time histogram"
    >
      {bins.map((b, i) => {
        const h = (b.count / max) * innerH;
        const x = PAD.left + i * barW;
        const y = PAD.top + innerH - h;
        return (
          <g key={i}>
            <rect
              x={x + 2}
              y={y}
              width={barW - 4}
              height={h}
              fill="#16a34a"
              opacity={b.count === 0 ? 0.15 : 1}
            />
            <text
              x={x + barW / 2}
              y={H - 10}
              textAnchor="middle"
              fontSize="9"
              fill="#9ca3af"
            >
              {b.hi === Infinity ? `${b.lo}+` : `${b.lo}`}
            </text>
            {b.count > 0 && (
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                fontSize="9"
                fill="#374151"
              >
                {b.count}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <span className="text-ink-300 text-[10px]">—</span>;
  }
  const W = 64;
  const H = 18;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const xy = (i: number, v: number) => ({
    x: (i / Math.max(1, values.length - 1)) * W,
    y: H - ((v - min) / range) * H,
  });
  const path = values
    .map((v, i) => {
      const { x, y } = xy(i, v);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="inline-block"
      aria-hidden
    >
      <path d={path} fill="none" stroke="#16a34a" strokeWidth="1.5" />
    </svg>
  );
}
