"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityLog } from "@/components/activity/ActivityLog";
import type { ActivityEvent } from "@/db/schema";

/**
 * Settle-page sidebar accordion that wraps the unified ActivityLog
 * component. Default state is collapsed (per Phase 7.5 spec — recent
 * activity is a nice-to-have, not the spine of the page).
 */
export function CollapsibleActivityCard({
  events,
  viewAllHref,
}: {
  events: ActivityEvent[];
  viewAllHref: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2"
        >
          <CardTitle className="text-[14px]">
            Recent activity{" "}
            <span className="text-ink-400 font-normal text-[11px]">
              · {events.length}
            </span>
          </CardTitle>
          {open ? (
            <ChevronUp className="size-3.5 text-ink-500" />
          ) : (
            <ChevronDown className="size-3.5 text-ink-500" />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          <ActivityLog
            events={events}
            variant="compact"
            limit={10}
            viewAllHref={viewAllHref}
            emptyMessage="No activity yet."
          />
        </CardContent>
      )}
    </Card>
  );
}
