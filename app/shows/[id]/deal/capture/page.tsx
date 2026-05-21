import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clauseComments } from "@/db/schema";
import { getShowById } from "@/lib/queries";
import {
  parseDealAmbiguities,
  parseDealRecoups,
} from "@/lib/dealMathV2";
import { formatShowDateFull } from "@/lib/format";
import { DealCaptureFlow } from "./DealCaptureFlow";
import type {
  CaptureInitialState,
  ExtractionResponse,
  ExtractionAmbiguity,
} from "./types";
import type { Deal, Bonus } from "@/db/schema";
import type { ClauseThreadComment } from "@/components/shared/ClauseThread";

function buildExternalIdFallback(showId: string, date: string) {
  // Best-effort externalId synthesis when none is stored yet.
  // Format: CRES-<3-letter-show-slug>-YYYY-MM-DD
  const slug = showId.replace(/^show_/, "").split("_")[0]?.slice(0, 3).toUpperCase();
  return `CRES-${slug ?? "DEAL"}-${date}`;
}

/**
 * Build an ExtractionResponse from an already-captured deal so the capture
 * page can show the prior extraction in read-only mode. Confidence chips
 * default to "high" since the data has been confirmed; ambiguities carry
 * their resolution state forward.
 */
function buildExtractionFromDeal(deal: Deal | null): ExtractionResponse | null {
  if (!deal || !deal.sourceProse) return null;

  const recoups = parseDealRecoups(deal);
  const ambiguities = parseDealAmbiguities(deal);
  const bonuses: Bonus[] = deal.bonusesJson
    ? (() => {
        try {
          return JSON.parse(deal.bonusesJson) as Bonus[];
        } catch {
          return [];
        }
      })()
    : [];

  // Synthesize prose_spans from recoup.prose_span where available.
  const prose_spans: Record<string, string> = {};
  recoups.forEach((r, i) => {
    if (r.prose_span) prose_spans[`recoups[${i}]`] = r.prose_span;
  });

  // Reshape engine ambiguities into the capture-flow shape. Resolved ones
  // carry their resolution through; unresolved ones get default candidate
  // readings reconstructed from candidate_readings (already on the type).
  const capAmbiguities: ExtractionAmbiguity[] = ambiguities.map((a) => ({
    id: a.id,
    field: a.field,
    prose_span: a.prose_span,
    description: a.estimated_impact_usd
      ? `Resolved positioning — ~$${a.estimated_impact_usd} impact at typical gross.`
      : "Resolved positioning.",
    candidate_readings: a.candidate_readings.map((value) => ({
      label: value === "inside_cap" ? "Inside cap" : value === "off_gross" ? "Off gross" : value,
      interpretation:
        value === "inside_cap"
          ? "Counts toward the expense cap."
          : value === "off_gross"
            ? "Deducted from gross in addition to the cap."
            : value,
      structured_value: value,
      estimated_impact: a.estimated_impact_usd
        ? `~$${a.estimated_impact_usd} impact`
        : "—",
    })),
    suggested_clarification: "",
    resolution: a.resolution,
    resolved_at: a.resolved_at,
    resolved_by: a.resolved_by,
  }));

  return {
    source_prose: deal.sourceProse,
    deal_type: deal.dealType,
    guarantee_amount: deal.guaranteeAmount,
    percentage: deal.percentage,
    percentage_basis: deal.percentageBasis,
    expense_cap: deal.expenseCap,
    hospitality_cap: deal.hospitalityCap,
    bonuses,
    recoups: recoups.map((r) => ({
      category: r.category,
      amount: r.amount,
      label: r.label,
      position: r.position,
      prose_span: r.prose_span,
    })),
    comp_rules: deal.compRulesJson
      ? (() => {
          try {
            return JSON.parse(deal.compRulesJson);
          } catch {
            return null;
          }
        })()
      : null,
    ambiguities: capAmbiguities,
    fields_confidence: {
      deal_type: "high",
      guarantee_amount: "high",
      percentage: "high",
      percentage_basis: "high",
      expense_cap: "high",
      hospitality_cap: "high",
    },
    prose_spans,
  };
}

export default async function DealCapturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getShowById(id);
  if (!data) notFound();

  const { show, artist, agent, deal } = data;

  const externalId =
    deal?.externalId ?? buildExternalIdFallback(id, show.date);

  // Pull all clause_comments anchored to this deal so the capture flow can
  // surface agent comments inline next to the matching clause.
  const dealComments: Array<ClauseThreadComment & { clauseRef: string }> = deal
    ? (
        await db
          .select()
          .from(clauseComments)
          .where(eq(clauseComments.dealId, deal.id))
      ).map((c) => ({
        id: c.id,
        clauseRef: c.clauseRef,
        actorName: c.actorName,
        actorType: c.actorType as "user" | "agent" | "tour_manager",
        body: c.body,
        channel: c.channel,
        createdAt: c.createdAt,
      }))
    : [];

  const initial: CaptureInitialState = {
    sourceProse: deal?.sourceProse ?? "",
    extraction: buildExtractionFromDeal(deal),
    confirmedAt: deal?.confirmedAt ?? null,
    dealId: deal?.id ?? null,
    showExternalId: externalId,
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div>
        <Link
          href={`/shows/${id}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="size-3.5" /> Back to show
        </Link>
        <div className="mt-3 flex items-baseline gap-3">
          <h1 className="text-2xl font-display font-medium text-ink-900">
            Capture deal · {artist?.name ?? "Unknown artist"}
          </h1>
          <span className="text-[12px] text-ink-500">
            {formatShowDateFull(show.date)} · {externalId}
          </span>
        </div>
        <p className="text-[13px] text-ink-600 mt-1">
          Paste the deal email — AI projects prose into structured terms, flags any
          ambiguities, and routes the deal to the V2 engine once locked.
        </p>
      </div>

      <DealCaptureFlow
        initial={initial}
        showId={id}
        artistName={artist?.name ?? "Artist"}
        agentName={agent?.name ?? "Agent"}
        showDate={formatShowDateFull(show.date)}
        clauseComments={dealComments}
      />
    </div>
  );
}
