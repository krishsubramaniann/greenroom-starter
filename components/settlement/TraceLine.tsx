"use client";

import { useState } from "react";
import {
  Ticket,
  Users,
  Receipt,
  ArrowDownRight,
  GitBranch,
  Sparkles,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type {
  TraceStep,
  TraceStepKind,
  TraceStepFlag,
} from "@/lib/dealMathV2";
import type { WalkthroughAck } from "@/db/schema";

const KIND_ICON: Record<TraceStepKind, React.ComponentType<{ className?: string }>> = {
  gross: Ticket,
  comp_adjustment: Users,
  recoup: ArrowDownRight,
  fee: Receipt,
  expense: Receipt,
  branch: GitBranch,
  bonus: Sparkles,
  result: Trophy,
};

const FLAG_STYLES: Record<
  TraceStepFlag,
  { label: string; bg: string; fg: string; ring: string }
> = {
  ambiguity: {
    label: "Ambiguity",
    bg: "bg-amber-50",
    fg: "text-amber-800",
    ring: "ring-amber-200/80",
  },
  absorbed_by_venue: {
    label: "Absorbed by venue",
    bg: "bg-sky-50",
    fg: "text-sky-800",
    ring: "ring-sky-200/80",
  },
  forecast: {
    label: "Forecast",
    bg: "bg-ink-100",
    fg: "text-ink-600",
    ring: "ring-ink-200/80",
  },
  not_triggered: {
    label: "Not triggered",
    bg: "bg-ink-50",
    fg: "text-ink-500",
    ring: "ring-ink-200/80",
  },
};

function SourcePill({ step }: { step: TraceStep }) {
  const [open, setOpen] = useState(false);
  let label = "Derived";
  let detail: string | undefined = step.source.type === "derived" ? step.source.detail : undefined;

  switch (step.source.type) {
    case "ticketing":
      label = `Ticketing · ${step.source.refIds.length} row${step.source.refIds.length === 1 ? "" : "s"}`;
      detail = step.source.detail;
      break;
    case "expense_row":
      label = `Expenses · ${step.source.refIds.length} row${step.source.refIds.length === 1 ? "" : "s"}`;
      detail = step.source.detail;
      break;
    case "comp_rule":
      label = `Comp rule · ${step.source.category}`;
      break;
    case "deal_term":
      label = `Deal term · ${step.source.field}`;
      break;
  }

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "text-[10px] font-medium px-1.5 py-0.5 rounded",
        "bg-ink-50 text-ink-600 ring-1 ring-inset ring-ink-200/80",
        "hover:bg-ink-100 transition-colors",
      )}
      title={detail ?? step.formula}
    >
      <span>{label}</span>
      {open && detail && (
        <span className="ml-1.5 text-ink-500 font-normal">· {detail}</span>
      )}
    </button>
  );
}

type Props = {
  step: TraceStep;
  ackable?: boolean;
  ackedBy?: WalkthroughAck | null;
  onAck?: (disputeNote?: string) => void;
};

export function TraceLine({ step, ackable, ackedBy, onAck }: Props) {
  const Icon = KIND_ICON[step.kind] ?? Circle;
  const flag = step.flag ? FLAG_STYLES[step.flag] : null;
  const isNegative = step.value < 0;
  const isResult = step.kind === "result";
  const isNet = step.key === "net";
  const dim = step.flag === "not_triggered";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 border-b border-ink-100 last:border-b-0",
        isResult && "bg-brand-50/40 border-b-0",
        isNet && "bg-ink-50/60",
        dim && "opacity-60",
      )}
      data-trace-key={step.key}
    >
      {/* Kind icon */}
      <div
        className={cn(
          "size-7 rounded-md flex items-center justify-center shrink-0",
          isResult ? "bg-brand-100 text-brand-700" : "bg-ink-50 text-ink-500",
        )}
      >
        <Icon className="size-3.5" />
      </div>

      {/* Label + source + formula */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-[13px]",
              isResult ? "text-brand-900 font-medium" : "text-ink-900",
            )}
          >
            {step.label}
          </span>
          <SourcePill step={step} />
          {flag && (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset",
                flag.bg,
                flag.fg,
                flag.ring,
              )}
            >
              {step.flag === "ambiguity" && <AlertTriangle className="size-2.5" />}
              {flag.label}
            </span>
          )}
        </div>
        {step.formula && (
          <div className="text-[11px] text-ink-500 mt-0.5 font-mono">
            {step.formula}
          </div>
        )}
      </div>

      {/* Value */}
      <div
        className={cn(
          "font-mono tabular text-[13.5px] shrink-0 min-w-[100px] text-right",
          isResult && "text-brand-900 font-medium text-[15px]",
          isNegative && !isResult && "text-rose-700",
          !isNegative && !isResult && "text-ink-800",
        )}
      >
        {formatMoney(step.value)}
      </div>

      {/* Ack toggle / state */}
      {ackable ? (
        <button
          type="button"
          onClick={() => onAck?.()}
          className={cn(
            "size-6 rounded-full flex items-center justify-center shrink-0",
            "transition-colors",
            ackedBy
              ? "bg-brand-100 text-brand-700"
              : "bg-ink-50 text-ink-400 hover:bg-ink-100",
          )}
          aria-label={ackedBy ? "Acknowledged" : "Acknowledge"}
        >
          {ackedBy ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <Circle className="size-3.5" />
          )}
        </button>
      ) : ackedBy ? (
        <div
          className="text-[10px] text-brand-700 inline-flex items-center gap-1 shrink-0"
          title={`Acknowledged by ${ackedBy.ackedByName ?? "TM"}`}
        >
          <CheckCircle2 className="size-3" />
          {ackedBy.ackedByName?.split(" ")[0] ?? "TM"}
        </div>
      ) : (
        <div className="w-6 shrink-0" />
      )}
    </div>
  );
}
