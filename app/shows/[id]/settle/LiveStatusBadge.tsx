"use client";

/**
 * Client-side polling wrapper for the top-of-page status badge on the
 * settle page. Polls /api/show-state every 5s + re-derives the
 * display status so reviewers see "Disputed" / "In review" /
 * "Finalized" / "Settled" flip in real time during a demo without
 * needing a full page refresh.
 */

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/badge";
import {
  deriveDisplayStatus,
  type DisplayStatus,
} from "@/lib/settlementStage";

const POLL_INTERVAL_MS = 5000;

type Props = {
  showId: string;
  initial: DisplayStatus;
  /** The booking pipeline status from `shows.status` — falls through
   *  when the settlement has no in-flight state yet. */
  showStatus: "booked" | "advanced" | "day_of" | "settled" | "closed";
};

function asDate(s: string | null | undefined): Date | null {
  return s ? new Date(s) : null;
}

export function LiveStatusBadge({ showId, initial, showStatus }: Props) {
  const [status, setStatus] = useState<DisplayStatus>(initial);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const res = await fetch(
          `/api/show-state?showId=${encodeURIComponent(showId)}`,
          { cache: "no-store" },
        );
        if (!res.ok || stopped) return;
        const data = await res.json();
        const next = deriveDisplayStatus({
          showStatus,
          settlement: {
            status: data.settlementStatus,
            gmApprovedAt: asDate(data.gmApprovedAt),
            // /api/show-state doesn't expose finalizedAt directly — we
            // infer "agent re-ack happened after adjustment" via the
            // settlementStatus flip back to "finalized" + the absence
            // of agentDisputedAt (which agent-acknowledge clears).
            finalizedAt:
              data.settlementStatus === "finalized" ||
              data.settlementStatus === "paid"
                ? new Date()
                : null,
            disputedAt: asDate(data.agentDisputedAt),
            adjustmentSavedAt: asDate(data.adjustmentSavedAt),
          },
        });
        setStatus(next);
      } catch {
        // best-effort polling
      }
    }
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [showId, showStatus]);

  return <StatusBadge status={status} />;
}
