"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlainBadge } from "@/components/ui/badge";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TraceLine } from "@/components/settlement/TraceLine";
import {
  ClauseThread,
  type ClauseThreadComment,
} from "@/components/shared/ClauseThread";
import { ActivityLog } from "@/components/activity/ActivityLog";
import type { SettlementResultV2 } from "@/lib/dealMathV2";
import type {
  Deal,
  Show,
  Artist,
  Settlement,
  ActivityEvent,
} from "@/db/schema";

type Props = {
  token: string;
  deal: Deal;
  show: Show;
  artist: Artist;
  settlement: Settlement;
  result: SettlementResultV2;
  agentName: string;
  agencyName: string | null;
  traceComments: Array<ClauseThreadComment & { clauseRef: string }>;
  activity: ActivityEvent[];
  signoffStatus: "open" | "agreed" | "questions";
  signoffText: string | null;
  signoffByName: string | null;
  signoffAt: Date | null;
};

export function AgentArtifact({
  token,
  deal,
  show,
  artist,
  settlement,
  result,
  agentName,
  agencyName,
  traceComments,
  activity,
  signoffStatus,
  signoffText,
  signoffByName,
  signoffAt,
}: Props) {
  const traceCommentsByKey = useMemo(() => {
    const m = new Map<string, ClauseThreadComment[]>();
    for (const c of traceComments) {
      const key = c.clauseRef.replace(/^trace\./, "");
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }
    return m;
  }, [traceComments]);

  const [dealPanelOpen, setDealPanelOpen] = useState(false);
  const [questionFor, setQuestionFor] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [signoffMode, setSignoffMode] = useState<"none" | "questions">("none");
  const [signoffDraft, setSignoffDraft] = useState("");
  const [status, setStatus] = useState(signoffStatus);
  const [stamp, setStamp] = useState<{
    name: string | null;
    at: Date | null;
    text: string | null;
  }>({ name: signoffByName, at: signoffAt, text: signoffText });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!result.supported) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-[20px] font-display text-ink-900">
            Settlement not available
          </h1>
          <p className="text-[13px] text-ink-600">{result.reason}</p>
        </div>
      </div>
    );
  }

  async function postQuestion(stepKey: string, body: string) {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clause-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          clauseRef: `trace.${stepKey}`,
          body: body.trim(),
        }),
      });
      if (!res.ok) throw new Error("failed");
      setQuestionFor(null);
      setQuestionDraft("");
      // Force a server re-fetch on the next visit by Mariana — for the
      // agent page itself we don't need a refresh; just clear UI state.
      // The ClauseThread will re-render on the next page load with the
      // persisted comment.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Posting failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitSignoff(
    submitStatus: "agreed" | "questions",
    text?: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-signoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signoffStatus: submitStatus,
          signoffText: text,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "signoff failed");
      }
      const data = await res.json();
      setStatus(submitStatus);
      setStamp({
        name: data.link.signoffByName,
        at: new Date(data.link.signoffAt),
        text: data.link.signoffText,
      });
      setSignoffMode("none");
      setSignoffDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signoff failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="bg-white border-b border-ink-200">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-5 sm:py-6">
          <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
            The Crescent · settlement preview
          </div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <h1 className="text-[22px] sm:text-[26px] font-display text-ink-900 leading-tight">
              {artist.name}
            </h1>
            <span className="text-ink-500 text-[14px]">
              · {formatShowDateFull(show.date)}
            </span>
          </div>
          <div className="mt-3 font-mono tabular text-[32px] sm:text-[40px] text-ink-900 leading-none">
            {formatMoney(result.totalToArtist)}
          </div>
          <div className="text-[12px] text-ink-500 mt-1">
            Total to artist · settlement preview for {agentName}
            {agencyName ? ` (${agencyName})` : ""}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-6 space-y-5 pb-40">
        {/* Deal terms panel — collapsible */}
        <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setDealPanelOpen((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left"
          >
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
                Deal terms
              </div>
              <div className="text-[13px] text-ink-900 mt-0.5">
                {deal.dealType === "vs" ? "Vs" : deal.dealType} ·{" "}
                {deal.guaranteeAmount != null
                  ? formatMoney(deal.guaranteeAmount)
                  : "—"}{" "}
                /{" "}
                {deal.percentage != null
                  ? `${(deal.percentage * 100).toFixed(0)}% of ${deal.percentageBasis ?? "—"}`
                  : "—"}{" "}
                · cap {formatMoney(deal.expenseCap)}
              </div>
            </div>
            {dealPanelOpen ? (
              <ChevronUp className="size-4 text-ink-500" />
            ) : (
              <ChevronDown className="size-4 text-ink-500" />
            )}
          </button>
          {dealPanelOpen && (
            <div className="px-4 pb-4 border-t border-ink-100 grid grid-cols-2 gap-3 pt-3">
              <FieldMini label="Deal type" value={deal.dealType} />
              <FieldMini label="Guarantee" value={formatMoney(deal.guaranteeAmount)} />
              <FieldMini
                label="Percentage"
                value={
                  deal.percentage
                    ? `${(deal.percentage * 100).toFixed(0)}%`
                    : "—"
                }
              />
              <FieldMini label="Expense cap" value={formatMoney(deal.expenseCap)} />
              <FieldMini
                label="Hospitality cap"
                value={formatMoney(deal.hospitalityCap)}
              />
              {deal.externalId && (
                <FieldMini label="Deal ID" value={deal.externalId} mono />
              )}
            </div>
          )}
        </section>

        {/* Trace */}
        <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <header className="px-4 py-3 border-b border-ink-100">
            <h2 className="text-[13px] font-medium text-ink-900">
              Settlement trace
            </h2>
            <div className="text-[11px] text-ink-500 mt-0.5">
              Every line sources back to a receipt, ticketing row, deal term,
              or comp rule. Tap any source pill for detail.
            </div>
          </header>
          <div>
            {result.trace.map((step) => {
              const stepComments = traceCommentsByKey.get(step.key) ?? [];
              const isQuestioning = questionFor === step.key;
              return (
                <div key={step.key} className="border-b border-ink-100 last:border-b-0">
                  <TraceLine step={step} ackable={false} />
                  {(stepComments.length > 0 || isQuestioning || status === "open") && (
                    <div className="px-4 pb-3">
                      {stepComments.length > 0 && (
                        <ClauseThread
                          clauseRef={`trace.${step.key}`}
                          initialComments={stepComments}
                          readOnly
                        />
                      )}
                      {status === "open" && !isQuestioning && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuestionFor(step.key);
                            setQuestionDraft("");
                          }}
                          className="mt-1 text-[11px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1"
                        >
                          <HelpCircle className="size-3" /> Question this line
                        </button>
                      )}
                      {isQuestioning && (
                        <div className="mt-2 space-y-2">
                          <textarea
                            autoFocus
                            value={questionDraft}
                            onChange={(e) => setQuestionDraft(e.target.value)}
                            rows={3}
                            placeholder="What doesn't match your read?"
                            className="w-full px-3 py-2 text-[13px] rounded border border-ink-200 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setQuestionFor(null);
                                setQuestionDraft("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="default"
                              onClick={() => postQuestion(step.key, questionDraft)}
                              disabled={busy || !questionDraft.trim()}
                            >
                              Post question
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Activity log — full timeline, collapsed by default */}
        <ActivityLog events={activity} variant="full" defaultExpanded={false} />


        {error && (
          <div className="text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Sticky footer — signoff actions */}
      <footer className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-ink-200">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-3">
          {status === "open" ? (
            signoffMode === "none" ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[12px] text-ink-500 max-w-[55%]">
                  Your review goes back to Mariana. The settlement isn&apos;t
                  finalized until you agree.
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSignoffMode("questions")}
                    className="gap-1.5"
                  >
                    <HelpCircle className="size-3.5" /> I have questions
                  </Button>
                  <Button
                    variant="brand"
                    size="lg"
                    onClick={() => submitSignoff("agreed")}
                    disabled={busy}
                    className="gap-1.5"
                  >
                    <Check className="size-4" />
                    {busy ? "Signing…" : "I agree"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-medium text-amber-900">
                    What&apos;s the question?
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignoffMode("none")}
                    aria-label="Close"
                    className="text-ink-500 hover:text-ink-800"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <textarea
                  autoFocus
                  value={signoffDraft}
                  onChange={(e) => setSignoffDraft(e.target.value)}
                  rows={3}
                  placeholder="Summarize what doesn't match your read."
                  className="w-full px-3 py-2 text-[13px] rounded border border-ink-200 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setSignoffMode("none")}>
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => submitSignoff("questions", signoffDraft)}
                    disabled={busy || !signoffDraft.trim()}
                  >
                    Send to Mariana
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap text-[12px]">
              <div
                className={cn(
                  "inline-flex items-center gap-2",
                  status === "agreed" ? "text-brand-800" : "text-amber-800",
                )}
              >
                <Check className="size-3.5" />
                <span>
                  {status === "agreed" ? "Signed off" : "Questions raised"} by{" "}
                  <strong>{stamp.name ?? agentName}</strong>
                  {stamp.at && (
                    <>
                      {" "}
                      · {new Date(stamp.at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </>
                  )}
                </span>
                {stamp.text && (
                  <span className="text-ink-600 italic">
                    · &ldquo;{stamp.text}&rdquo;
                  </span>
                )}
              </div>
              <PlainBadge variant={status === "agreed" ? "brand" : "amber"}>
                {agencyName ?? "Agent"}
              </PlainBadge>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

function FieldMini({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
        {label}
      </div>
      <div
        className={cn(
          "text-[12.5px] text-ink-900 mt-0.5",
          mono && "font-mono tabular",
        )}
      >
        {value}
      </div>
    </div>
  );
}
