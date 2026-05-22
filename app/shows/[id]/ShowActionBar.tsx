"use client";

/**
 * Top-right action bar on the show detail page. Three slots, sequentially
 * gated:
 *
 *   [Capture deal] / [Recapture deal]   — always available; primary until
 *                                         a deal exists, then demotes
 *   [End of show]                       — primary once a deal exists,
 *                                         disabled before. Becomes
 *                                         [Show complete ✓] after click,
 *                                         with a tiny [Reset] demo link
 *   [View settlement]                   — primary once endOfShowAt is
 *                                         set, disabled before
 *
 * End-of-show + reset trigger /api/end-of-show + /api/reset-show-state
 * respectively, then router.refresh() so the server-rendered shell picks
 * up the new state.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  showId: string;
  hasDeal: boolean;
  endOfShowAt: Date | string | null;
};

export function ShowActionBar({ showId, hasDeal, endOfShowAt }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"endShow" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEnded = endOfShowAt != null;

  async function handleEndShow() {
    setBusy("endShow");
    setError(null);
    try {
      const res = await fetch("/api/end-of-show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to end show");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleReset() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Reset show state? Clears expenses, box office, comps, settlement, and agent signoff. Deal stays captured.",
      )
    ) {
      return;
    }
    setBusy("reset");
    setError(null);
    try {
      const res = await fetch("/api/reset-show-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to reset");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 mt-6 shrink-0">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Slot 1 — Capture deal */}
        <Link href={`/shows/${showId}/deal/capture`}>
          <Button
            variant={hasDeal ? "secondary" : "brand"}
            size={hasDeal ? "default" : "lg"}
            className="gap-1.5"
          >
            <Sparkles className="size-3.5" />
            {hasDeal ? "Recapture deal" : "Capture deal"}
          </Button>
        </Link>

        {/* Slot 2 — End of show */}
        {isEnded ? (
          <Button
            variant="secondary"
            size="default"
            disabled
            className="gap-1.5"
          >
            <Check className="size-3.5" /> Show complete
          </Button>
        ) : (
          <Button
            variant={hasDeal ? "brand" : "secondary"}
            size={hasDeal ? "lg" : "default"}
            onClick={handleEndShow}
            disabled={!hasDeal || busy !== null}
            className="gap-1.5"
          >
            {busy === "endShow" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            End of show
          </Button>
        )}

        {/* Slot 3 — View settlement */}
        {isEnded ? (
          <Link href={`/shows/${showId}/settle`}>
            <Button variant="brand" size="lg" className="gap-1.5">
              <FileSpreadsheet className="size-3.5" /> View settlement
            </Button>
          </Link>
        ) : (
          <Button
            variant="secondary"
            size="default"
            disabled
            className="gap-1.5"
          >
            <FileSpreadsheet className="size-3.5" /> View settlement
          </Button>
        )}
      </div>

      {/* Reset link — only when the show has ended, since it only makes
          sense in the post-show state. */}
      {isEnded && (
        <button
          type="button"
          onClick={handleReset}
          disabled={busy !== null}
          className="text-[11px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1 disabled:opacity-50"
        >
          <RotateCcw className="size-3" />
          {busy === "reset" ? "Resetting…" : "Reset show state (demo)"}
        </button>
      )}

      {error && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  );
}
