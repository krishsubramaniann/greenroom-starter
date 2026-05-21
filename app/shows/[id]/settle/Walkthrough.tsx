"use client";

/**
 * Walkthrough overlay — full-screen takeover triggered by ?walkthrough=1.
 *
 * Renders above SettlePageV2 (which stays mounted underneath). Each trace
 * line takes its turn in focus while the others dim to 40% opacity. The TM
 * (Coastal Spell TM is the hardcoded persona) clicks Acknowledge per line;
 * each ack POSTs to /api/walkthrough-ack and updates local state
 * optimistically. When every line is acked, the end screen offers the
 * agent preview link with a copy button + QR code.
 *
 * Exits — Esc, [Exit] button, or all-acked-then-close — call
 * router.refresh() so the underlying SettlePageV2 picks up persisted acks
 * without a remount.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  CornerDownLeft,
  HelpCircle,
  Keyboard,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TraceLine } from "@/components/settlement/TraceLine";
import type { TraceStep } from "@/lib/dealMathV2";
import type { WalkthroughAck } from "@/db/schema";

type AckRecord = {
  id?: string;
  lineKey: string;
  ackedAt: Date;
  ackedByName: string;
  ackedByActorType: "tour_manager" | "user" | "agent";
  disputeNote?: string | null;
};

type Props = {
  settlementId: string;
  showId: string;
  artistName: string;
  tourManagerName: string;
  trace: TraceStep[];
  initialAcks: WalkthroughAck[];
  shareUrl: string;
  exitHref: string;
};

function ackFromInitial(a: WalkthroughAck): AckRecord {
  return {
    id: a.id,
    lineKey: a.lineKey,
    ackedAt: a.ackedAt,
    ackedByName: a.ackedByName ?? "TM",
    ackedByActorType:
      (a.ackedByActorType as AckRecord["ackedByActorType"]) ?? "tour_manager",
    disputeNote: a.disputeNote,
  };
}

function ackRecordToWalkthroughAck(
  rec: AckRecord,
  settlementId: string,
): WalkthroughAck {
  return {
    id: rec.id ?? "optimistic",
    settlementId,
    lineKey: rec.lineKey,
    ackedByUserId: null,
    ackedByActorType: rec.ackedByActorType,
    ackedByName: rec.ackedByName,
    ackedAt: rec.ackedAt,
    disputeNote: rec.disputeNote ?? null,
  };
}

export function Walkthrough({
  settlementId,
  showId,
  artistName,
  tourManagerName,
  trace,
  initialAcks,
  shareUrl,
  exitHref,
}: Props) {
  const router = useRouter();

  const initialMap = useMemo(() => {
    const m = new Map<string, AckRecord>();
    for (const a of initialAcks) m.set(a.lineKey, ackFromInitial(a));
    return m;
  }, [initialAcks]);

  // Start focus on the first unacked line; if everything is already acked,
  // start at 0 and let the end screen take over.
  const initialFocus = useMemo(() => {
    const firstUnacked = trace.findIndex((s) => !initialMap.has(s.key));
    return firstUnacked === -1 ? 0 : firstUnacked;
  }, [trace, initialMap]);

  const [focusedIdx, setFocusedIdx] = useState(initialFocus);
  const [ackMap, setAckMap] = useState(initialMap);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [disputeOpen, setDisputeOpen] = useState<number | null>(null);
  const [disputeNote, setDisputeNote] = useState("");
  const [completing, setCompleting] = useState(false);
  const [endScreenUrl, setEndScreenUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showKeyHints, setShowKeyHints] = useState(true);

  const ackedCount = ackMap.size;
  const totalCount = trace.length;
  const allAcked = ackedCount === totalCount;

  // Auto-scroll the focused line into view.
  const focusedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    focusedRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [focusedIdx]);

  // ── Mutators ──────────────────────────────────────────────────────────
  function nextUnackedIdx(fromIdx: number): number {
    for (let i = fromIdx + 1; i < trace.length; i++) {
      if (!ackMap.has(trace[i].key)) return i;
    }
    // Wrap and look from the start in case earlier lines were skipped
    for (let i = 0; i < fromIdx; i++) {
      if (!ackMap.has(trace[i].key)) return i;
    }
    return fromIdx;
  }

  function prevUnackedIdx(fromIdx: number): number {
    for (let i = fromIdx - 1; i >= 0; i--) {
      if (!ackMap.has(trace[i].key)) return i;
    }
    for (let i = trace.length - 1; i > fromIdx; i--) {
      if (!ackMap.has(trace[i].key)) return i;
    }
    return fromIdx;
  }

  async function acknowledge(step: TraceStep, note?: string) {
    const optimistic: AckRecord = {
      lineKey: step.key,
      ackedAt: new Date(),
      ackedByName: tourManagerName,
      ackedByActorType: "tour_manager",
      disputeNote: note ?? null,
    };
    setAckMap((prev) => new Map(prev).set(step.key, optimistic));
    setPending((prev) => new Set(prev).add(step.key));

    try {
      const res = await fetch("/api/walkthrough-ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settlementId,
          lineKey: step.key,
          ackedByActorType: "tour_manager",
          ackedByName: tourManagerName,
          disputeNote: note,
        }),
      });
      if (!res.ok) throw new Error("ack failed");
      const data = await res.json();
      // Replace optimistic with persisted id
      setAckMap((prev) => {
        const m = new Map(prev);
        const cur = m.get(step.key);
        if (cur) m.set(step.key, { ...cur, id: data.ackId });
        return m;
      });
    } catch {
      setAckMap((prev) => {
        const m = new Map(prev);
        m.delete(step.key);
        return m;
      });
    } finally {
      setPending((prev) => {
        const s = new Set(prev);
        s.delete(step.key);
        return s;
      });
    }

    // Advance focus to next unacked. Use the map *with* the new ack applied.
    const nextMap = new Map(ackMap).set(step.key, optimistic);
    let next = -1;
    for (let i = focusedIdx + 1; i < trace.length; i++) {
      if (!nextMap.has(trace[i].key)) {
        next = i;
        break;
      }
    }
    if (next === -1) {
      for (let i = 0; i < focusedIdx; i++) {
        if (!nextMap.has(trace[i].key)) {
          next = i;
          break;
        }
      }
    }
    if (next !== -1) setFocusedIdx(next);
  }

  async function handleComplete() {
    if (completing) return;
    setCompleting(true);
    try {
      const res = await fetch("/api/walkthrough-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlementId, showId }),
      });
      if (res.ok) {
        const data = await res.json();
        setEndScreenUrl(data.shareUrl ?? shareUrl);
      } else {
        setEndScreenUrl(shareUrl);
      }
    } catch {
      setEndScreenUrl(shareUrl);
    } finally {
      setCompleting(false);
    }
  }

  function handleExit() {
    router.push(exitHref);
    // router.push to the same route with different query params won't
    // re-fetch server data — refresh forces SettlePageV2 to pick up
    // newly-persisted acks from the DB.
    router.refresh();
  }

  async function handleCopy(url: string) {
    try {
      const fullUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${url}`
          : url;
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  // ── Keyboard navigation ───────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // While the dispute textarea is open, let it own the keyboard.
      if (disputeOpen !== null) {
        if (e.key === "Escape") {
          setDisputeOpen(null);
          setDisputeNote("");
        }
        return;
      }
      // While the end screen is up, only Esc/exit and copy are relevant.
      if (endScreenUrl) {
        if (e.key === "Escape") handleExit();
        return;
      }
      if (e.key === "Escape") {
        handleExit();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setFocusedIdx((i) => nextUnackedIdx(i));
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusedIdx((i) => prevUnackedIdx(i));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const step = trace[focusedIdx];
        if (step && !ackMap.has(step.key)) acknowledge(step);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIdx, disputeOpen, endScreenUrl, ackMap, trace]);

  // ── Render ─────────────────────────────────────────────────────────────
  const progressPct = totalCount === 0 ? 0 : (ackedCount / totalCount) * 100;

  return (
    <div
      className="fixed inset-0 z-50 bg-canvas overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Settlement walkthrough for ${artistName}`}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-ink-200">
        <div className="max-w-4xl mx-auto px-8 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
              Walkthrough · {artistName} settlement
            </div>
            <div className="text-[16px] font-display text-ink-900 mt-0.5">
              {allAcked ? (
                <span className="text-brand-700">All {totalCount} lines acknowledged</span>
              ) : (
                <>
                  {ackedCount} of {totalCount} acknowledged
                  <span className="text-ink-500 text-[13px] font-sans ml-2">
                    · with {tourManagerName}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowKeyHints((v) => !v)}
              className="text-[11px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1"
              aria-label="Toggle keyboard shortcuts"
            >
              <Keyboard className="size-3.5" />
              {showKeyHints ? "Hide shortcuts" : "Shortcuts"}
            </button>
            <Button variant="ghost" onClick={handleExit} className="gap-1.5">
              <X className="size-3.5" /> Exit (Esc)
            </Button>
          </div>
        </div>
        {/* Progress strip */}
        <div className="h-1 bg-ink-100">
          <div
            className="h-full bg-brand-700 transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {showKeyHints && !endScreenUrl && (
          <div className="bg-ink-50/60 border-b border-ink-100">
            <div className="max-w-4xl mx-auto px-8 py-1.5 text-[11px] text-ink-500 flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-ink-200 rounded text-[10px] font-mono">↑↓</kbd>
                move
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-ink-200 rounded text-[10px] font-mono inline-flex items-center">
                  <CornerDownLeft className="size-2.5" />
                </kbd>
                acknowledge
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-ink-200 rounded text-[10px] font-mono">Esc</kbd>
                exit
              </span>
              <span className="text-ink-400">Acked lines are skipped during keyboard nav.</span>
            </div>
          </div>
        )}
      </header>

      {/* ── End screen ────────────────────────────────────────────── */}
      {endScreenUrl ? (
        <EndScreen
          artistName={artistName}
          totalAcked={ackedCount}
          totalCount={totalCount}
          shareUrl={endScreenUrl}
          onExit={handleExit}
          onCopy={handleCopy}
          copied={copied}
        />
      ) : (
        // ── Trace body ───────────────────────────────────────────
        <main className="max-w-4xl mx-auto px-8 py-12 space-y-3 pb-32">
          {trace.map((step, i) => {
            const isFocused = i === focusedIdx && !allAcked;
            const isAcked = ackMap.has(step.key);
            const isPending = pending.has(step.key);
            const ackRec = isAcked ? ackMap.get(step.key)! : null;

            return (
              <div
                key={step.key}
                ref={isFocused ? focusedRef : null}
                className={cn(
                  "rounded-lg border bg-white transition-all",
                  isFocused
                    ? "border-brand-300 shadow-md"
                    : "border-ink-200",
                )}
                onClick={() => !isAcked && setFocusedIdx(i)}
              >
                <TraceLine
                  step={step}
                  ackable={false}
                  ackedBy={
                    ackRec
                      ? ackRecordToWalkthroughAck(ackRec, settlementId)
                      : null
                  }
                  focused={isFocused}
                  dimmed={!isFocused && !isAcked}
                />
                {isFocused && !isAcked && (
                  <div className="px-4 py-3 border-t border-brand-100 bg-brand-50/30 flex items-center justify-end gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDisputeOpen(i);
                        setDisputeNote("");
                      }}
                      className="gap-1.5"
                    >
                      <HelpCircle className="size-3.5" /> Question this line
                    </Button>
                    <Button
                      variant="brand"
                      size="lg"
                      onClick={() => acknowledge(step)}
                      disabled={isPending}
                      className="gap-1.5 min-w-[160px]"
                    >
                      <Check className="size-4" />
                      {isPending ? "Saving…" : "Acknowledge"}
                    </Button>
                  </div>
                )}
                {isAcked && ackRec && (
                  <div className="px-4 py-2 border-t border-brand-100 bg-brand-50/40 text-[11px] text-brand-800 flex items-center gap-2">
                    <Check className="size-3" />
                    Acknowledged{" "}
                    {new Date(ackRec.ackedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    by {ackRec.ackedByName}
                    {ackRec.disputeNote && (
                      <span className="ml-2 italic text-amber-700">
                        · questioned: &ldquo;{ackRec.disputeNote}&rdquo;
                      </span>
                    )}
                  </div>
                )}
                {disputeOpen === i && !isAcked && (
                  <div className="px-4 py-3 border-t border-amber-200 bg-amber-50/40 space-y-2">
                    <label className="text-[11px] uppercase tracking-wider text-amber-900 font-medium">
                      Question note (captured with the ack)
                    </label>
                    <textarea
                      autoFocus
                      value={disputeNote}
                      onChange={(e) => setDisputeNote(e.target.value)}
                      rows={3}
                      placeholder="What doesn't match the TM's reading?"
                      className="w-full px-3 py-2 rounded border border-ink-200 text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setDisputeOpen(null);
                          setDisputeNote("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="default"
                        onClick={async () => {
                          await acknowledge(step, disputeNote || undefined);
                          setDisputeOpen(null);
                          setDisputeNote("");
                        }}
                      >
                        Save with note
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {allAcked && !endScreenUrl && (
            <div className="pt-8 flex flex-col items-center gap-4">
              <p className="text-[14px] text-ink-600 text-center">
                Every line acknowledged. Send the preview to the agent so they
                can sign off async.
              </p>
              <Button
                variant="brand"
                size="lg"
                onClick={handleComplete}
                disabled={completing}
                className="gap-1.5"
              >
                <Check className="size-4" />
                {completing ? "Sending…" : "Send to agent for review"}
              </Button>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function EndScreen({
  artistName,
  totalAcked,
  totalCount,
  shareUrl,
  onExit,
  onCopy,
  copied,
}: {
  artistName: string;
  totalAcked: number;
  totalCount: number;
  shareUrl: string;
  onExit: () => void;
  onCopy: (url: string) => void;
  copied: boolean;
}) {
  const fullUrl =
    typeof window !== "undefined" ? `${window.location.origin}${shareUrl}` : shareUrl;
  // External QR service — keeps deps zero. The Loom demo can scan it live.
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
    fullUrl,
  )}&size=200x200&margin=4`;

  return (
    <main className="max-w-2xl mx-auto px-8 py-16 text-center space-y-6">
      <div className="inline-flex items-center justify-center size-16 rounded-full bg-brand-100 text-brand-700">
        <Check className="size-8" />
      </div>
      <div>
        <h2 className="text-[28px] font-display text-ink-900">
          Walkthrough complete
        </h2>
        <p className="text-[13px] text-ink-600 mt-2">
          {totalAcked} of {totalCount} lines acknowledged for {artistName}. The
          agent preview link is ready to share.
        </p>
      </div>

      <div className="rounded-lg border border-ink-200 bg-white p-5 space-y-4 max-w-lg mx-auto">
        <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
          Agent preview link
        </div>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt="QR code for the agent preview link"
            width={200}
            height={200}
            className="rounded border border-ink-200 bg-white"
          />
        </div>
        <div className="font-mono text-[11px] text-ink-700 break-all text-left bg-ink-50 px-3 py-2 rounded">
          {shareUrl}
        </div>
        <div className="flex justify-center gap-2">
          <Link href={shareUrl} target="_blank" rel="noreferrer">
            <Button variant="secondary" className="gap-1.5">
              Open preview
            </Button>
          </Link>
          <Button
            variant="brand"
            onClick={() => onCopy(shareUrl)}
            className="gap-1.5"
          >
            {copied ? (
              <>
                <Check className="size-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5" /> Copy link
              </>
            )}
          </Button>
        </div>
      </div>

      <Button variant="ghost" onClick={onExit}>
        Back to settle page
      </Button>
    </main>
  );
}
