import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { shows, artists, deals, settlements } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { PlainBadge } from "@/components/ui/badge";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import { ShowsTabs } from "../ShowsTabs";

/**
 * /shows/deal-types — Phase 9 deal-type gallery.
 *
 * Six cards, one per supported deal-type model:
 *   1. Vs deal     → links to Hollow Oak (the interactive demo subject)
 *   2-6. Frozen view-only fixtures (Iron Field, Pine Bend, Echo Range,
 *        Maple Court, Slate Harbor) — each clicks through to its own
 *        settle page rendered in view-only mode (no CTAs, no polling,
 *        all 7 lifecycle dots green).
 *
 * The "why this is interesting" footnote on each card is the strategic
 * read for that deal type — the framing that earns the case-study its
 * "we know the engine handles real venue economics" claim.
 */

const FIXTURE_IDS = [
  "show_iron_field_apr",
  "show_pine_bend_mar",
  "show_echo_range_feb",
  "show_maple_court_apr",
  "show_slate_harbor_may",
] as const;

const ORDER = [
  "vs",
  "flat",
  "percentage_of_gross",
  "percentage_of_net",
  "tier_ratchet",
  "walkout_pot",
] as const;

type CardSpec = {
  key: (typeof ORDER)[number];
  label: string;
  blurb: string;
  showId: string;
  artistName: string | null;
  showDate: string;
  prose: string | null;
  terms: Array<[string, string]>;
  finalAmount: number | null;
  galleryNote: string;
  isInteractive?: boolean; // Hollow Oak is the lone interactive card
};

function buildCardsFromRows(
  rows: Array<{
    showId: string;
    artistName: string | null;
    showDate: string;
    deal: {
      dealType: string;
      dealTypeLabelOverride: string | null;
      guaranteeAmount: number | null;
      percentage: number | null;
      percentageBasis: string | null;
      expenseCap: number | null;
      hospitalityCap: number | null;
      sourceProse: string | null;
    } | null;
    totalToArtist: number | null;
  }>,
): CardSpec[] {
  // Helper to look up a row by showId.
  const byShowId = new Map(rows.map((r) => [r.showId, r]));

  const cards: CardSpec[] = [];

  // 1. Vs deal — Hollow Oak
  const ho = byShowId.get("show_hollow_oak_jun");
  if (ho) {
    cards.push({
      key: "vs",
      label: "Vs deal (guarantee vs %)",
      blurb:
        "Artist gets the higher of a fixed guarantee or a percentage of net. The most common deal type for mid-tier bookings.",
      showId: ho.showId,
      artistName: ho.artistName,
      showDate: ho.showDate,
      prose: ho.deal?.sourceProse ?? null,
      terms: ho.deal
        ? [
            ["Deal type", "Vs (guarantee vs %)"],
            [
              "Guarantee",
              ho.deal.guaranteeAmount != null
                ? formatMoney(ho.deal.guaranteeAmount)
                : "—",
            ],
            [
              "Percentage",
              ho.deal.percentage != null
                ? `${(ho.deal.percentage * 100).toFixed(0)}% of ${ho.deal.percentageBasis ?? "—"}`
                : "—",
            ],
            [
              "Expense cap",
              ho.deal.expenseCap != null
                ? formatMoney(ho.deal.expenseCap)
                : "—",
            ],
          ]
        : [],
      finalAmount: ho.totalToArtist,
      galleryNote:
        "This is the demo's live subject. Walk the cycle end-to-end — paste the deal email, resolve ambiguities, run end-of-show, watch PM expenses stream in, sign off through agent + GM.",
      isInteractive: true,
    });
  }

  // 2-6. Frozen fixtures
  const FROZEN: Array<{
    showId: string;
    key: (typeof ORDER)[number];
    label: string;
    blurb: string;
  }> = [
    {
      showId: "show_iron_field_apr",
      key: "flat",
      label: "Flat fee",
      blurb:
        "Artist gets a fixed amount regardless of attendance. No calculation surface — booker eats the upside and downside.",
    },
    {
      showId: "show_pine_bend_mar",
      key: "percentage_of_gross",
      label: "% of gross",
      blurb:
        "Artist takes a slice off the top. No expense math — venue absorbs operational risk at the gross percentage.",
    },
    {
      showId: "show_echo_range_feb",
      key: "percentage_of_net",
      label: "% of net",
      blurb:
        "Artist gets a percentage after expenses are paid. Risk-sharing — both sides watch the expense cap.",
    },
    {
      showId: "show_maple_court_apr",
      key: "tier_ratchet",
      label: "Tier ratchet",
      blurb:
        "Escalating percentage when attendance / gross thresholds are crossed. The boundary is an ambiguity hotspot.",
    },
    {
      showId: "show_slate_harbor_may",
      key: "walkout_pot",
      label: "Walkout pot",
      blurb:
        "Fixed base plus a share of overage above breakeven. Used to share risk on mid-tier curated bookings.",
    },
  ];

  for (const f of FROZEN) {
    const r = byShowId.get(f.showId);
    if (!r || !r.deal) continue;
    const isCapBased =
      r.deal.dealType === "percentage_of_net" || r.deal.dealType === "vs";
    const terms: Array<[string, string]> = [
      ["Deal type", r.deal.dealTypeLabelOverride ?? f.label],
    ];
    if (r.deal.guaranteeAmount != null) {
      terms.push(["Guarantee / base", formatMoney(r.deal.guaranteeAmount)]);
    }
    if (r.deal.percentage != null) {
      terms.push([
        "Percentage",
        `${(r.deal.percentage * 100).toFixed(0)}% of ${r.deal.percentageBasis ?? "—"}`,
      ]);
    }
    if (isCapBased && r.deal.expenseCap != null) {
      terms.push(["Expense cap", formatMoney(r.deal.expenseCap)]);
    }
    if (r.deal.hospitalityCap != null) {
      terms.push(["Hospitality cap", formatMoney(r.deal.hospitalityCap)]);
    }

    cards.push({
      key: f.key,
      label: f.label,
      blurb: f.blurb,
      showId: r.showId,
      artistName: r.artistName,
      showDate: r.showDate,
      prose: r.deal.sourceProse,
      terms,
      finalAmount: r.totalToArtist,
      galleryNote: getGalleryNote(f.key),
    });
  }

  // Sort by ORDER list so cards always render top→bottom in deal-type order.
  cards.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return cards;
}

function getGalleryNote(key: (typeof ORDER)[number]): string {
  switch (key) {
    case "flat":
      return "Cleanest deal type to settle — no calculation surface, no expense cap math, no agent dispute risk. Bookers default to this for sub-tier-A artists where they're not gambling on attendance.";
    case "percentage_of_gross":
      return "Gross deals shift expense risk to the venue. Booker chooses this when they're confident attendance will be strong — they keep more upside but eat any expense overruns themselves.";
    case "percentage_of_net":
      return "Net deals share risk — both sides pay attention to the expense cap because both feel the math. Settles clean when the agent signed off on every line item before the show.";
    case "tier_ratchet":
      return "The tier boundary is an ambiguity hotspot — booker and agent often disagree on whether tier 1 is forfeited entirely at the crossover or layered under the tier 2 percentage. The extractor flags this at deal capture so it never reaches settlement night.";
    case "walkout_pot":
      return "Walkout pot deals are the venue's lever for risk-sharing on mid-tier shows. The base protects the artist; the percentage rewards the booker's curation when the show overperforms.";
    default:
      return "";
  }
}

export default async function DealTypesPage() {
  // Pull the gallery rows: Hollow Oak + the 5 frozen fixtures.
  const showIds = ["show_hollow_oak_jun", ...FIXTURE_IDS];
  const rawShows = await db
    .select()
    .from(shows)
    .where(inArray(shows.id, showIds));
  const rawDeals = await db
    .select()
    .from(deals)
    .where(inArray(deals.showId, showIds));
  const rawSettlements = await db
    .select()
    .from(settlements)
    .where(inArray(settlements.showId, showIds));
  const rawArtists = await db
    .select()
    .from(artists)
    .where(
      inArray(
        artists.id,
        rawShows.map((s) => s.artistId),
      ),
    );

  const artistById = new Map(rawArtists.map((a) => [a.id, a.name]));
  const dealByShow = new Map(rawDeals.map((d) => [d.showId, d]));
  const settlementByShow = new Map(
    rawSettlements.map((s) => [s.showId, s]),
  );

  const rows = rawShows.map((s) => {
    const d = dealByShow.get(s.id) ?? null;
    const stl = settlementByShow.get(s.id);
    return {
      showId: s.id,
      artistName: artistById.get(s.artistId) ?? null,
      showDate: s.date,
      deal: d
        ? {
            dealType: d.dealType,
            dealTypeLabelOverride: d.dealTypeLabelOverride ?? null,
            guaranteeAmount: d.guaranteeAmount,
            percentage: d.percentage,
            percentageBasis: d.percentageBasis,
            expenseCap: d.expenseCap,
            hospitalityCap: d.hospitalityCap,
            sourceProse: d.sourceProse,
          }
        : null,
      totalToArtist: stl?.totalToArtist ?? null,
    };
  });

  const cards = buildCardsFromRows(rows);

  return (
    <div className="px-12 py-10 max-w-5xl">
      <div className="mb-14">
        <div className="eyebrow mb-3">The Crescent · engine showcase</div>
        <h1
          className="font-display text-[52px] font-medium text-ink-900 leading-[1.02]"
          style={{ letterSpacing: "-0.025em", fontOpticalSizing: "auto" }}
        >
          Deal Types
        </h1>
        <p className="text-[14px] text-ink-500 mt-3 max-w-2xl leading-relaxed">
          The six deal-type models the V2 engine covers, each shown on a real
          settled artifact. One is the live demo (Hollow Oak); the other five
          are frozen view-only examples that render the final paid state.
        </p>
      </div>

      <ShowsTabs />

      <div className="space-y-6">
        {cards.map((c) => (
          <GalleryCard key={c.key} card={c} />
        ))}
      </div>
    </div>
  );
}

function GalleryCard({ card }: { card: CardSpec }) {
  return (
    <Card>
      <CardContent className="px-6 py-5 space-y-4">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
              {card.label}
            </div>
            <h2 className="text-[18px] font-display text-ink-900 mt-0.5">
              {card.artistName ?? card.showId}{" "}
              <span className="text-ink-400 font-normal text-[14px]">
                · {formatShowDateFull(card.showDate)}
              </span>
            </h2>
            <p className="text-[12.5px] text-ink-600 mt-1 max-w-prose">
              {card.blurb}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {card.isInteractive ? (
              <PlainBadge variant="brand">Live demo</PlainBadge>
            ) : (
              <PlainBadge variant="amber">View-only</PlainBadge>
            )}
            <Link
              href={`/shows/${card.showId}/settle`}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800"
            >
              View example <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {card.prose && (
            <Subpanel title="Source prose">
              <pre className="text-[11.5px] text-ink-700 font-mono whitespace-pre-wrap leading-relaxed">
                {card.prose}
              </pre>
            </Subpanel>
          )}
          <Subpanel title="Extracted terms">
            <dl className="space-y-1.5">
              {card.terms.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-2 text-[12px]"
                >
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="text-ink-900 font-mono tabular text-right">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </Subpanel>
          <Subpanel title="Final settlement">
            <div className="text-[10.5px] uppercase tracking-wider text-brand-700 font-medium">
              Total to artist
            </div>
            <div className="font-mono tabular text-[26px] text-ink-900 leading-none mt-1">
              {card.finalAmount != null
                ? formatMoney(card.finalAmount)
                : "—"}
            </div>
            <Link
              href={`/shows/${card.showId}/settle`}
              className="text-[11px] text-ink-500 hover:text-ink-800 underline underline-offset-2 mt-3 inline-block"
            >
              See the trace →
            </Link>
          </Subpanel>
        </div>

        <p className="text-[12px] text-ink-600 italic border-t border-ink-100 pt-3 max-w-prose">
          <span className="text-ink-500 not-italic font-medium">
            Why this one&apos;s interesting:{" "}
          </span>
          {card.galleryNote}
        </p>
      </CardContent>
    </Card>
  );
}

function Subpanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-ink-200 bg-ink-50/30 p-3">
      <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}
