"use client";

/**
 * Settle-page sidebar activity card with live polling.
 *
 * Replaces the static CollapsibleActivityCard from Phase 7.5. Polls
 * /api/activity?since=<latest_event> every 5 seconds; new events
 * prepend to the rendered list with a one-shot background flash so
 * Mariana sees PM uploads, agent acks, GM holds, etc. arrive in real
 * time without refreshing.
 *
 * If the card is collapsed when new events arrive, a small "N new"
 * pill appears on the header until the user expands.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityEvent } from "@/components/activity/ActivityEvent";
import type { ActivityEvent as ActivityEventRow } from "@/db/schema";

const POLL_INTERVAL_MS = 5000;
const FRESH_WINDOW_MS = 30_000;

type Props = {
  showId: string;
  initialEvents: ActivityEventRow[];
  viewAllHref: string;
};

function eventDate(e: ActivityEventRow): number {
  return new Date(e.occurredAt).getTime();
}

export function ActivityPollCard({
  showId,
  initialEvents,
  viewAllHref,
}: Props) {
  const [events, setEvents] = useState<ActivityEventRow[]>(initialEvents);
  const [open, setOpen] = useState(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  // Track count of new events since the card was last expanded — this is
  // the "N new" pill on the collapsed header.
  const [unseenCount, setUnseenCount] = useState(0);

  const latestAtRef = useRef<number>(
    initialEvents.length > 0
      ? Math.max(...initialEvents.map(eventDate))
      : 0,
  );

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const sinceIso =
          latestAtRef.current > 0
            ? new Date(latestAtRef.current).toISOString()
            : new Date(0).toISOString();
        const res = await fetch(
          `/api/activity?showId=${encodeURIComponent(showId)}&since=${encodeURIComponent(sinceIso)}`,
          { cache: "no-store" },
        );
        if (!res.ok || stopped) return;
        const data = (await res.json()) as { events: ActivityEventRow[] };
        if (data.events.length === 0) return;
        const incoming = data.events.map((e) => ({
          ...e,
          occurredAt: new Date(e.occurredAt),
        }));
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          const merged = [...prev];
          for (const e of incoming) if (!seen.has(e.id)) merged.unshift(e);
          merged.sort((a, b) => eventDate(b) - eventDate(a));
          return merged;
        });
        const newIds = incoming.map((e) => e.id);
        setFreshIds((prev) => {
          const next = new Set(prev);
          for (const id of newIds) next.add(id);
          return next;
        });
        latestAtRef.current = Math.max(
          latestAtRef.current,
          ...incoming.map(eventDate),
        );
        // Bump the unseen-counter only if the card is currently collapsed.
        setUnseenCount((prev) =>
          openRef.current ? prev : prev + incoming.length,
        );
        for (const id of newIds) {
          setTimeout(() => {
            setFreshIds((p) => {
              const n = new Set(p);
              n.delete(id);
              return n;
            });
          }, FRESH_WINDOW_MS);
        }
      } catch {
        // Best-effort polling.
      }
    }
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [showId]);

  // Mirror `open` into a ref so the polling effect can read its latest
  // value without re-running on every toggle.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
    if (open) setUnseenCount(0);
  }, [open]);

  // Limit visible list to most recent 10 (matches CollapsibleActivityCard).
  const shown = useMemo(() => events.slice(0, 10), [events]);

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2"
        >
          <CardTitle className="text-[14px] flex items-center gap-2">
            Recent activity{" "}
            <span className="text-ink-400 font-normal text-[11px]">
              · {events.length}
            </span>
            {unseenCount > 0 && !open && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-100 text-brand-800 ring-1 ring-inset ring-brand-200 animate-pulse">
                {unseenCount} new
              </span>
            )}
          </CardTitle>
          {open ? (
            <ChevronUp className="size-3.5 text-ink-500" />
          ) : (
            <ChevronDown className="size-3.5 text-ink-500" />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 px-0">
          {shown.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-ink-500 italic">
              No activity yet.
            </div>
          ) : (
            <ol className="rounded-md border border-ink-200 mx-4 overflow-hidden">
              {shown.map((e) => {
                const fresh = freshIds.has(e.id);
                return (
                  <div
                    key={e.id}
                    className={fresh ? "" : ""}
                    style={
                      fresh
                        ? { animation: "flash-bg 1.5s ease-out 1" }
                        : undefined
                    }
                  >
                    <ActivityEvent event={e} />
                  </div>
                );
              })}
            </ol>
          )}
          {events.length > shown.length && (
            <div className="px-4 pt-2 text-[11px] text-ink-500 text-right">
              <a
                href={viewAllHref}
                className="hover:text-ink-800 underline underline-offset-2"
              >
                View all {events.length} events
              </a>
            </div>
          )}
          <style>{`
            @keyframes flash-bg {
              0% { background-color: rgb(220 252 231); }
              40% { background-color: rgb(220 252 231); }
              100% { background-color: transparent; }
            }
          `}</style>
        </CardContent>
      )}
    </Card>
  );
}
