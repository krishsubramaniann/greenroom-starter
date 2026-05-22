"use client";

/**
 * Client wrapper around <LifecycleBar> that polls /api/show-state every
 * 5s and re-derives the LifecycleState so stage tones (especially the
 * outcome / paid stages) update without a page refresh.
 *
 * The bar itself stays server-renderable — this wrapper just owns the
 * polling timer + state and forwards the derived state down.
 */

import { useEffect, useState } from "react";
import {
  LifecycleBar,
  deriveLifecycleState,
  type LifecycleState,
} from "@/components/settlement/LifecycleBar";

const POLL_INTERVAL_MS = 5000;

type Input = {
  hasDeal: boolean;
  dealConfirmedAt: string | null;
  dealShareAccessedAt: string | null;
  expensesConfirmedAt: string | null;
  settlementStatus:
    | "draft"
    | "submitted"
    | "in_review"
    | "signed"
    | "disputed"
    | "revised"
    | "finalized"
    | "paid"
    | "voided"
    | null;
  paidAt: string | null;
  gmApprovedAt: string | null;
  gmHeldAt: string | null;
  gmHoldReason: string | null;
  /** Phase 8.9.1 — drives the stage 6 "In review" amber state when
   *  Mariana saved an adjustment + waiting for agent re-ack. */
  adjustmentSavedAt: string | null;
};

function asDate(s: string | null): Date | null {
  return s ? new Date(s) : null;
}

function derive(input: Input): LifecycleState {
  return deriveLifecycleState({
    hasDeal: input.hasDeal,
    dealConfirmedAt: asDate(input.dealConfirmedAt),
    dealShareAccessedAt: asDate(input.dealShareAccessedAt),
    expensesConfirmedAt: asDate(input.expensesConfirmedAt),
    settlementStatus: input.settlementStatus,
    paidAt: asDate(input.paidAt),
    gmApprovedAt: asDate(input.gmApprovedAt),
    gmHeldAt: asDate(input.gmHeldAt),
    gmHoldReason: input.gmHoldReason,
    adjustmentSavedAt: asDate(input.adjustmentSavedAt),
  });
}

type Props = {
  showId: string;
  initial: Input;
};

export function LifecycleBarPoll({ showId, initial }: Props) {
  const [input, setInput] = useState<Input>(initial);

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
        setInput((prev) => ({
          // hasDeal + dealConfirmedAt + dealShareAccessedAt aren't on
          // show-state today, so keep them from the initial server render.
          hasDeal: prev.hasDeal,
          dealConfirmedAt: prev.dealConfirmedAt,
          dealShareAccessedAt: prev.dealShareAccessedAt,
          expensesConfirmedAt: data.expensesConfirmedAt ?? null,
          settlementStatus: data.settlementStatus ?? null,
          paidAt: data.paidAt ?? null,
          gmApprovedAt: data.gmApprovedAt ?? null,
          gmHeldAt: data.gmHeldAt ?? null,
          gmHoldReason: data.gmHoldReason ?? null,
          adjustmentSavedAt: data.adjustmentSavedAt ?? null,
        }));
      } catch {
        // best-effort polling
      }
    }
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [showId]);

  return <LifecycleBar state={derive(input)} />;
}
