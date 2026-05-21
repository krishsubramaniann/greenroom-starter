import Link from "next/link";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import type { Ambiguity } from "@/lib/dealMathV2";

type Props = {
  ambiguity: Ambiguity;
  showId: string;
};

/**
 * Compact, read-only ambiguity card for the V2 settle-page sidebar.
 *
 * Unlike the full AmbiguityRail card in the capture flow, this one doesn't
 * embed the resolve/draft/simulate affordances — it just surfaces the
 * unresolved ambiguity in context and links back to /shows/[id]/deal/capture
 * for resolution. The strategic point is that ambiguities *should* be
 * resolved upstream, not on settlement night.
 */
export function AmbiguityCard({ ambiguity, showId }: Props) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-3.5 text-amber-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-amber-900">
            {ambiguity.field}
          </div>
          <p className="text-[11.5px] text-ink-700 mt-1 font-mono leading-relaxed">
            “{ambiguity.prose_span}”
          </p>
          {ambiguity.candidate_readings.length > 0 && (
            <div className="mt-2 space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">
                Candidate readings
              </div>
              <ul className="text-[11px] text-ink-700 list-disc list-inside">
                {ambiguity.candidate_readings.map((r) => (
                  <li key={r}>{r.replace(/_/g, " ")}</li>
                ))}
              </ul>
            </div>
          )}
          {ambiguity.estimated_impact_usd != null && (
            <div className="text-[11px] text-amber-800 mt-1.5 italic">
              ~${ambiguity.estimated_impact_usd.toLocaleString()} impact
            </div>
          )}
          <Link
            href={`/shows/${showId}/deal/capture`}
            className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-brand-700 hover:text-brand-800"
          >
            Resolve upstream <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
