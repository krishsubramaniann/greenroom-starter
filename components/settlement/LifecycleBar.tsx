import { cn } from "@/lib/utils";
import {
  STAGE_LABELS,
  stageHistory,
} from "@/lib/settlementStage";
import type { Settlement, SettlementStage } from "@/db/schema";

/**
 * 7-stop settlement lifecycle bar for the V2 settle page.
 *
 * Signed and Disputed are first-class siblings (the legacy page rolled
 * Disputed into a badge; V2 surfaces it as a stop so the trace artifact
 * can show "settled cleanly, no dispute" or "dispute fired here" with
 * equal weight). `voided` is rendered as a banner above the bar by the
 * caller, never inline.
 */
const STOPS: SettlementStage[] = [
  "draft",
  "submitted",
  "in_review",
  "signed",
  "disputed",
  "finalized",
  "paid",
];

type Props = {
  settlement: Settlement | null;
};

export function LifecycleBar({ settlement }: Props) {
  const reached = new Set<SettlementStage>();
  const stampedAt = new Map<SettlementStage, Date>();
  if (settlement) {
    for (const h of stageHistory(settlement)) {
      reached.add(h.stage);
      stampedAt.set(h.stage, h.at);
    }
    reached.add(settlement.status);
  }
  const current = settlement?.status ?? "draft";

  return (
    <ol className="flex items-center gap-2 w-full overflow-x-auto py-2">
      {STOPS.map((stop, idx) => {
        const isReached = reached.has(stop);
        const isCurrent = stop === current;
        const isDispute = stop === "disputed";
        const skippedDispute =
          stop === "disputed" && !reached.has("disputed") && reached.has("paid");

        // Visual tones
        let dotClass = "bg-ink-200";
        let textClass = "text-ink-400";
        if (isReached && !skippedDispute) {
          dotClass = isDispute ? "bg-rose-600" : "bg-brand-700";
          textClass = isDispute ? "text-rose-800" : "text-brand-800";
        }
        if (isCurrent) {
          dotClass = isDispute
            ? "bg-rose-600 ring-2 ring-rose-200"
            : "bg-brand-700 ring-2 ring-brand-200";
          textClass = isDispute ? "text-rose-900" : "text-brand-900";
        }
        if (skippedDispute) {
          dotClass = "bg-ink-100 border border-dashed border-ink-300";
          textClass = "text-ink-400";
        }

        const ts = stampedAt.get(stop);

        return (
          <li
            key={stop}
            className="flex items-center gap-2 min-w-fit"
          >
            <div className="flex flex-col items-center min-w-[78px]">
              <span
                className={cn(
                  "size-3 rounded-full shrink-0",
                  dotClass,
                  isCurrent && "shadow-sm",
                )}
                aria-current={isCurrent ? "step" : undefined}
              />
              <span
                className={cn(
                  "mt-1.5 text-[11px] font-medium whitespace-nowrap",
                  textClass,
                )}
              >
                {STAGE_LABELS[stop]}
                {skippedDispute && (
                  <span className="ml-1 text-ink-400">(skipped)</span>
                )}
              </span>
              {ts && (
                <span className="text-[10px] text-ink-400 mt-0.5 whitespace-nowrap">
                  {ts.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
            {idx < STOPS.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1 min-w-[20px]",
                  isReached && reached.has(STOPS[idx + 1])
                    ? "bg-brand-300"
                    : "bg-ink-200",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
