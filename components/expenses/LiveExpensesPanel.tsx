"use client";

/**
 * Live-updating expense panel. Polls GET /api/expenses?showId=...&since=...
 * every 5 seconds; new rows appear with a "just now · from production
 * manager" pill and a brief background flash, then settle into the list.
 *
 * Mounted in two places:
 *   - inside the walkthrough overlay (variant="full") — the centerpiece of
 *     the Loom demo: PM uploads on his phone, expenses appear on Mariana's
 *     laptop while she's confirming each trace line
 *   - on the V2 settle-page sidebar (variant="compact") — running history
 *     when walkthrough isn't active
 *
 * Cap warning fires at >=80% of `expenseCap`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Receipt,
  Smartphone,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

const POLL_INTERVAL_MS = 5000;
/** How long a newly arrived row keeps its "just now" badge + highlight. */
const FRESH_WINDOW_MS = 60_000;

export type LiveExpense = {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  approved: boolean;
  absorbedByVenue: boolean;
  source: "manual" | "pm_mobile" | null;
  enteredAt: string;
  enteredByUserId: string | null;
};

type Props = {
  showId: string;
  initialExpenses: LiveExpense[];
  expenseCap: number | null;
  variant?: "full" | "compact";
  className?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  sound: "Sound",
  production: "Production",
  lights: "Lights",
  hospitality: "Hospitality",
  marketing: "Marketing",
  backline: "Backline",
  security: "Security",
  other: "Other",
};

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LiveExpensesPanel({
  showId,
  initialExpenses,
  expenseCap,
  variant = "full",
  className,
}: Props) {
  const [expenses, setExpenses] = useState<LiveExpense[]>(initialExpenses);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  // Track the latest `enteredAt` we've seen so we can do incremental polling.
  const latestAtRef = useRef<string>(
    initialExpenses.length > 0
      ? initialExpenses[initialExpenses.length - 1].enteredAt
      : new Date(0).toISOString(),
  );

  useEffect(() => {
    let stopped = false;

    async function tick() {
      try {
        const url = new URL("/api/expenses", window.location.origin);
        url.searchParams.set("showId", showId);
        url.searchParams.set("since", latestAtRef.current);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { expenses: LiveExpense[] };
        if (stopped || data.expenses.length === 0) return;
        setExpenses((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          const merged = [...prev];
          for (const e of data.expenses) {
            if (!seen.has(e.id)) merged.push(e);
          }
          merged.sort(
            (a, b) =>
              new Date(a.enteredAt).getTime() -
              new Date(b.enteredAt).getTime(),
          );
          return merged;
        });
        const newIds = data.expenses.map((e) => e.id);
        setFreshIds((prev) => {
          const next = new Set(prev);
          for (const id of newIds) next.add(id);
          return next;
        });
        // Roll the cursor forward
        latestAtRef.current =
          data.expenses[data.expenses.length - 1].enteredAt;
        // Expire each new row's "just now" pill after FRESH_WINDOW_MS
        for (const id of newIds) {
          setTimeout(() => {
            setFreshIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }, FRESH_WINDOW_MS);
        }
      } catch {
        // Swallow — polling is best-effort, will retry next interval.
      }
    }

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    // Independent timer just to refresh relative timestamps in the rendered
    // rows (keeps "Just now" text honest as time passes).
    const nowInterval = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      stopped = true;
      clearInterval(interval);
      clearInterval(nowInterval);
    };
  }, [showId]);

  const total = useMemo(
    () =>
      expenses
        .filter((e) => !e.absorbedByVenue)
        .reduce((s, e) => s + e.amount, 0),
    [expenses],
  );

  const capPct =
    expenseCap && expenseCap > 0 ? (total / expenseCap) * 100 : null;
  const overCap = capPct != null && capPct >= 100;
  const nearingCap = capPct != null && capPct >= 80 && !overCap;
  const lastPmEntryAt = useMemo(() => {
    const last = [...expenses]
      .reverse()
      .find((e) => e.source === "pm_mobile");
    return last?.enteredAt ?? null;
  }, [expenses]);

  const isCompact = variant === "compact";

  return (
    <section
      className={cn(
        "rounded-lg border bg-white overflow-hidden",
        overCap
          ? "border-rose-300"
          : nearingCap
            ? "border-amber-300"
            : "border-ink-200",
        className,
      )}
    >
      {/* Header — total + cap pill + live indicator */}
      <header className="px-4 py-3 border-b border-ink-100">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
              <Receipt className="size-3" /> Live expenses
              <span
                className="inline-flex items-center gap-1 text-[9.5px] text-brand-700 normal-case tracking-normal ml-1"
                title="Auto-polling every 5 seconds"
              >
                <Wifi className="size-2.5 animate-pulse" /> live
              </span>
            </div>
            <div className="font-mono tabular text-[22px] text-ink-900 mt-0.5 leading-none">
              {formatMoney(total)}
              {expenseCap != null && (
                <span className="text-[12px] text-ink-500 ml-2 font-sans">
                  of {formatMoney(expenseCap)}
                </span>
              )}
            </div>
          </div>
          {(nearingCap || overCap) && (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ring-1 ring-inset",
                overCap
                  ? "bg-rose-50 text-rose-900 ring-rose-200"
                  : "bg-amber-50 text-amber-900 ring-amber-200",
              )}
            >
              <AlertTriangle className="size-3" />
              {overCap
                ? `${capPct!.toFixed(0)}% — cap breached`
                : `${capPct!.toFixed(0)}% of cap`}
            </span>
          )}
        </div>
        {lastPmEntryAt && (
          <div className="text-[10.5px] text-brand-700/80 mt-2 inline-flex items-center gap-1">
            <Smartphone className="size-3" />
            Last PM upload {timeOnly(lastPmEntryAt)}
          </div>
        )}
      </header>

      {/* Expense list */}
      <ol
        className={cn(
          isCompact ? "max-h-[260px]" : "max-h-[420px]",
          "overflow-y-auto",
        )}
      >
        {expenses.length === 0 ? (
          <li className="px-4 py-6 text-center text-[12px] text-ink-500 italic">
            No expenses yet. Share the PM link to start receiving uploads.
          </li>
        ) : (
          expenses.map((e) => {
            const fresh = freshIds.has(e.id);
            const fromPm = e.source === "pm_mobile";
            const ageMs = now - new Date(e.enteredAt).getTime();
            const showJustNow = fresh && ageMs < FRESH_WINDOW_MS;
            const hasReceipt =
              e.description?.includes("📷") ?? false;
            return (
              <li
                key={e.id}
                className={cn(
                  "px-4 py-2.5 border-b border-ink-100 last:border-b-0",
                  "transition-colors duration-500",
                  fresh && fromPm && "bg-brand-50 animate-pulse-once",
                )}
                style={
                  fresh && fromPm
                    ? { animation: "flash-bg 1.5s ease-out 1" }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] font-medium text-ink-900">
                        {CATEGORY_LABELS[e.category] ?? e.category}
                      </span>
                      {hasReceipt && (
                        <Camera
                          className="size-3 text-ink-500"
                          aria-label="receipt attached"
                        />
                      )}
                      {showJustNow ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-100 text-brand-800 ring-1 ring-inset ring-brand-200">
                          just now · from production manager
                        </span>
                      ) : fromPm ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/60">
                          PM
                        </span>
                      ) : null}
                    </div>
                    {e.description && (
                      <div className="text-[11.5px] text-ink-600 mt-0.5 truncate">
                        {e.description}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular text-[13.5px] text-ink-900">
                      {formatMoney(e.amount)}
                    </div>
                    <div className="text-[10.5px] text-ink-500">
                      {timeOnly(e.enteredAt)}
                    </div>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ol>

      <style>{`
        @keyframes flash-bg {
          0% { background-color: rgb(220 252 231); }
          40% { background-color: rgb(220 252 231); }
          100% { background-color: transparent; }
        }
      `}</style>
    </section>
  );
}
