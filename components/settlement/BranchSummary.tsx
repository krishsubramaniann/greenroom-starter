import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { Deal } from "@/db/schema";

type Branches = {
  guarantee: number;
  percentage: number;
  winner: "guarantee" | "percentage" | "neither";
};

type Props = {
  branches: Branches;
  dealType: Deal["dealType"];
};

function BranchPanel({
  label,
  value,
  isWinner,
  tone,
}: {
  label: string;
  value: number;
  isWinner: boolean;
  tone: "brand" | "ink";
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg border px-4 py-3 transition-colors",
        isWinner
          ? "border-brand-300 bg-brand-50/60"
          : "border-ink-200 bg-white",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[10.5px] uppercase tracking-wider font-medium",
            isWinner ? "text-brand-700" : "text-ink-500",
          )}
        >
          {label}
        </span>
        {isWinner && (
          <span className="text-[10px] font-medium text-brand-700 bg-brand-100 ring-1 ring-inset ring-brand-200 px-1.5 py-0.5 rounded">
            Winner
          </span>
        )}
      </div>
      <div
        className={cn(
          "mt-1 font-mono tabular text-[18px]",
          isWinner ? "text-brand-900 font-medium" : "text-ink-700",
          tone === "ink" && !isWinner && "text-ink-500",
        )}
      >
        {formatMoney(value)}
      </div>
    </div>
  );
}

export function BranchSummary({ branches, dealType }: Props) {
  // Single-branch deals collapse into a one-liner.
  if (dealType === "flat") {
    return (
      <div className="text-[12px] text-ink-600">
        Flat guarantee · {formatMoney(branches.guarantee)}
      </div>
    );
  }
  if (dealType === "percentage_of_gross" || dealType === "percentage_of_net") {
    return (
      <div className="text-[12px] text-ink-600">
        Percentage only ·{" "}
        <span className="text-ink-900 font-medium">
          {formatMoney(branches.percentage)}
        </span>
      </div>
    );
  }

  // vs deal: two side-by-side panels
  return (
    <div className="grid grid-cols-2 gap-3">
      <BranchPanel
        label="Guarantee"
        value={branches.guarantee}
        isWinner={branches.winner === "guarantee"}
        tone="ink"
      />
      <BranchPanel
        label="Percentage"
        value={branches.percentage}
        isWinner={branches.winner === "percentage"}
        tone="brand"
      />
    </div>
  );
}
