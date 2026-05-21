"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ActivityEvent } from "./ActivityEvent";
import type { ActivityEvent as ActivityEventRow } from "@/db/schema";

type Variant = "full" | "compact";

type Props = {
  events: ActivityEventRow[];
  variant?: Variant;
  /** Truncate the rendered list. Useful for the settle-page sidebar. */
  limit?: number;
  /** Only applies to variant="full". When false, renders an expander button
   *  that reveals the timeline. When true, renders the timeline directly. */
  defaultExpanded?: boolean;
  emptyMessage?: string;
  className?: string;
  /** Used by the compact variant — fallback target for "View all activity". */
  viewAllHref?: string;
};

export function ActivityLog({
  events,
  variant = "full",
  limit,
  defaultExpanded = false,
  emptyMessage = "No activity yet.",
  className,
  viewAllHref,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sorted = events; // caller controls ordering
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const truncated = limit ? sorted.length - shown.length : 0;

  if (sorted.length === 0) {
    if (variant === "compact") {
      return (
        <div className={cn("text-[12px] text-ink-500 italic", className)}>
          {emptyMessage}
        </div>
      );
    }
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-[14px]">Activity log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-[12px] text-ink-500 italic">{emptyMessage}</div>
        </CardContent>
      </Card>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("space-y-0", className)}>
        <ol className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          {shown.map((e) => (
            <ActivityEvent key={e.id} event={e} />
          ))}
        </ol>
        {truncated > 0 && viewAllHref && (
          <div className="text-[11px] text-ink-500 text-right mt-1.5">
            <a
              href={viewAllHref}
              className="hover:text-ink-800 underline underline-offset-2"
            >
              View all {sorted.length} events
            </a>
          </div>
        )}
      </div>
    );
  }

  // variant="full"
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-1">
          <div>
            <CardTitle>Activity log</CardTitle>
            <div className="text-[11px] text-ink-500 mt-0.5">
              {sorted.length} event{sorted.length === 1 ? "" : "s"} · every
              capture, comment, ack, and approval timestamped.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-800"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3.5" /> Collapse
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" /> View activity (
                {sorted.length})
              </>
            )}
          </button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="p-0">
          <ol className="max-h-[600px] overflow-y-auto">
            {shown.map((e) => (
              <ActivityEvent key={e.id} event={e} />
            ))}
          </ol>
        </CardContent>
      )}
    </Card>
  );
}
