"use client";

import { cn } from "@/lib/utils";

export type Confidence = "high" | "medium" | "low";

const styles: Record<
  Confidence,
  { ring: string; dot: string; fg: string; bg: string; symbol: string; label: string }
> = {
  high: {
    ring: "ring-brand-200/80",
    dot: "bg-brand-600",
    fg: "text-brand-800",
    bg: "bg-brand-50",
    symbol: "✓",
    label: "High",
  },
  medium: {
    ring: "ring-amber-200/80",
    dot: "bg-amber-600",
    fg: "text-amber-800",
    bg: "bg-amber-50",
    symbol: "?",
    label: "Medium",
  },
  low: {
    ring: "ring-rose-200/80",
    dot: "bg-rose-600",
    fg: "text-rose-800",
    bg: "bg-rose-50",
    symbol: "⚠",
    label: "Low",
  },
};

export function ConfidenceChip({
  level,
  className,
}: {
  level: Confidence;
  className?: string;
}) {
  const s = styles[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded",
        "text-[10px] font-medium ring-1 ring-inset",
        s.bg,
        s.fg,
        s.ring,
        className,
      )}
      title={`${s.label} confidence`}
    >
      <span className={cn("inline-block size-1.5 rounded-full", s.dot)} />
      <span>{s.label}</span>
    </span>
  );
}
