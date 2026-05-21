"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  prose: string;
  onProseChange: (s: string) => void;
  /** Map of field key → exact prose substring that field was extracted from. */
  proseSpans: Record<string, string>;
  /** A field key that's currently hovered in the right column. Its span is emphasized. */
  hoveredFieldKey: string | null;
  /** Fires when the user hovers a span in the prose. */
  onHoverSpan: (fieldKey: string | null) => void;
  phase: "paste" | "extracting" | "review" | "saving" | "saved";
  onExtract: () => void;
  onRecapture: () => void;
  /** Placeholder prose shown in the empty textarea. Defaults to a generic
   *  hint; pass an artist-specific string for richer demos. */
  placeholder?: string;
};

const DEFAULT_PLACEHOLDER = `Hi Mariana,

Confirming <artist> for <date>.

Deal is $<guarantee> vs <pct>% of net after expenses. Expenses capped at $<cap>, marketing recoup of $<x> against gross. Hospitality cap $<h>. <bonuses>.

Best, <agent>`;

/**
 * Build a list of [start, end, fieldKey | null] segments from the prose and
 * the prose_spans map. Spans that don't appear verbatim are silently skipped.
 */
function tokenize(
  prose: string,
  proseSpans: Record<string, string>,
): Array<{ start: number; end: number; fieldKey: string | null }> {
  const matches: Array<{ start: number; end: number; fieldKey: string }> = [];
  for (const [key, span] of Object.entries(proseSpans)) {
    if (!span) continue;
    const idx = prose.indexOf(span);
    if (idx === -1) continue;
    matches.push({ start: idx, end: idx + span.length, fieldKey: key });
  }
  // Resolve overlaps by preferring the longer match.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const filtered: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }
  const segments: Array<{ start: number; end: number; fieldKey: string | null }> = [];
  let cursor = 0;
  for (const m of filtered) {
    if (m.start > cursor)
      segments.push({ start: cursor, end: m.start, fieldKey: null });
    segments.push({ start: m.start, end: m.end, fieldKey: m.fieldKey });
    cursor = m.end;
  }
  if (cursor < prose.length)
    segments.push({ start: cursor, end: prose.length, fieldKey: null });
  return segments;
}

export function ProseColumn({
  prose,
  onProseChange,
  proseSpans,
  hoveredFieldKey,
  onHoverSpan,
  phase,
  onExtract,
  onRecapture,
  placeholder = DEFAULT_PLACEHOLDER,
}: Props) {
  const isPaste = phase === "paste";
  const isExtracting = phase === "extracting";
  const isReview = phase === "review" || phase === "saving" || phase === "saved";

  if (isPaste || isExtracting) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium mb-2">
          Deal email · prose
        </div>
        <textarea
          value={prose}
          onChange={(e) => onProseChange(e.target.value)}
          placeholder={placeholder}
          disabled={isExtracting}
          className={cn(
            "flex-1 w-full p-4 rounded-lg border border-ink-200 bg-white",
            "font-mono text-[13px] leading-relaxed text-ink-800",
            "focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400",
            "resize-none min-h-[260px]",
            isExtracting && "opacity-60",
          )}
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[12px] text-ink-500">
            Paste the deal email. AI will extract structured terms and flag ambiguities.
          </p>
          <Button
            onClick={onExtract}
            disabled={isExtracting || prose.trim().length === 0}
            className="gap-1.5"
          >
            <Sparkles className="size-3.5" />
            {isExtracting ? "Extracting…" : "Extract"}
          </Button>
        </div>
      </div>
    );
  }

  // Review mode — render prose with <mark> spans
  const segments = tokenize(prose, proseSpans);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
          Source prose
        </div>
        {isReview && (
          <button
            onClick={onRecapture}
            className="text-[11px] text-ink-500 hover:text-ink-800 underline underline-offset-2"
          >
            Recapture
          </button>
        )}
      </div>
      <div
        className={cn(
          "flex-1 p-4 rounded-lg border border-ink-200 bg-white",
          "font-mono text-[13px] leading-relaxed text-ink-800",
          "whitespace-pre-wrap break-words overflow-auto",
        )}
      >
        {segments.map((seg, i) => {
          const text = prose.slice(seg.start, seg.end);
          if (!seg.fieldKey) return <span key={i}>{text}</span>;
          const isHovered = hoveredFieldKey === seg.fieldKey;
          return (
            <mark
              key={i}
              data-field-key={seg.fieldKey}
              onMouseEnter={() => onHoverSpan(seg.fieldKey)}
              onMouseLeave={() => onHoverSpan(null)}
              className={cn(
                "rounded px-0.5 -mx-0.5 cursor-pointer transition-colors",
                isHovered
                  ? "bg-brand-200 text-brand-900 ring-1 ring-brand-400"
                  : "bg-brand-50 hover:bg-brand-100",
              )}
            >
              {text}
            </mark>
          );
        })}
      </div>
    </div>
  );
}
