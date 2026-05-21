"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Mail,
  MessageSquareReply,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExtractionAmbiguity } from "./types";

/** Payload returned by /api/simulate-agent-reply when Sarah replies. */
export type SimulatedReply = {
  id: string;
  text: string;
  agentName: string;
  agency: string;
  actorName: string;
  timestamp: string;
};

type Props = {
  ambiguities: ExtractionAmbiguity[];
  agentName: string;
  agencyName: string | null;
  artistName: string;
  showDate: string;
  dealId: string | null;
  dealExternalId: string;
  /** Magic-link token for the deal share. Interpolated into the clarification
   *  email body so the agent has a clickable URL. */
  dealShareToken: string | null;
  /** Local pre-save resolutions: ambiguityId → resolution value. */
  resolutions: Record<string, string>;
  onLocalResolve: (ambiguityId: string, resolution: string) => void;
  /** Generate a canned agent reply for this (ambiguity, reading) pair.
   *  Persists the reply + writes an agent_replied activity event, but does
   *  NOT mark the ambiguity resolved. */
  onSimulateAgent: (
    ambiguityId: string,
    resolution: string,
  ) => Promise<SimulatedReply | null>;
  /** Accept Sarah's reading. Resolves the ambiguity with
   *  resolvedBy="agent_confirmed_via_email" anchored to the reply. */
  onAcceptReading: (
    ambiguityId: string,
    resolution: string,
    replyId: string,
  ) => Promise<void>;
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function AmbiguityCard({
  ambiguity,
  agentName,
  agencyName,
  artistName,
  showDate,
  dealExternalId,
  dealShareToken,
  localResolution,
  onLocalResolve,
  onSimulateAgent,
  onAcceptReading,
}: {
  ambiguity: ExtractionAmbiguity;
  agentName: string;
  agencyName: string | null;
  artistName: string;
  showDate: string;
  dealExternalId: string;
  dealShareToken: string | null;
  localResolution: string | undefined;
  onLocalResolve: (resolution: string) => void;
  onSimulateAgent: (
    resolution: string,
  ) => Promise<SimulatedReply | null>;
  onAcceptReading: (
    resolution: string,
    replyId: string,
  ) => Promise<void>;
}) {
  const resolved = ambiguity.resolution ?? localResolution;
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftSent, setDraftSent] = useState(false);
  const [selectedReading, setSelectedReading] = useState<string>(
    ambiguity.candidate_readings[0]?.structured_value ?? "",
  );
  const [simBusy, setSimBusy] = useState(false);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [reply, setReply] = useState<SimulatedReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Resolved card ───────────────────────────────────────────────────────
  if (resolved) {
    const reading =
      ambiguity.candidate_readings.find((r) => r.structured_value === resolved)
        ?.label ?? resolved;
    const resolvedByLabel: Record<string, string> = {
      user: "by you",
      agent: `by ${agentName}`,
      agent_simulated: `by ${agentName} (simulated)`,
      agent_confirmed_via_email: `agent confirmed · accepted by you`,
      tour_manager: "by tour manager",
    };
    const byLabel = ambiguity.resolved_by
      ? (resolvedByLabel[ambiguity.resolved_by] ?? `via ${ambiguity.resolved_by}`)
      : "(unsaved)";
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-brand-200 bg-brand-50">
        <Check className="size-4 text-brand-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-brand-900 font-medium">
            Resolved: {reading}
          </div>
          <div className="text-[11px] text-brand-700/80 truncate">
            {ambiguity.prose_span}
          </div>
        </div>
        <span className="text-[10px] text-brand-700/80 shrink-0">
          {byLabel}
        </span>
      </div>
    );
  }

  // ── Mutators ────────────────────────────────────────────────────────────
  async function handleRequestDraft() {
    setDraftLoading(true);
    setDraftOpen(true);
    try {
      const reading = ambiguity.candidate_readings.find(
        (r) => r.structured_value === selectedReading,
      );
      const alt = ambiguity.candidate_readings.find(
        (r) => r.structured_value !== selectedReading,
      );
      const magicLinkUrl =
        dealShareToken && typeof window !== "undefined"
          ? `${window.location.origin}/shared/deal/${dealShareToken}`
          : dealShareToken
            ? `/shared/deal/${dealShareToken}`
            : null;
      const res = await fetch("/api/draft-clarification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ambiguityId: ambiguity.id,
          dealExternalId,
          context: {
            venue_name: "The Crescent",
            booker_name: "Mariana",
            agent_name: agentName,
            artist_name: artistName,
            show_date: showDate,
            prose_span: ambiguity.prose_span,
            venue_reading: reading?.interpretation ?? "",
            alternative_reading: alt?.interpretation ?? "",
            estimated_dollar_impact: reading?.estimated_impact ?? "",
            magic_link_url: magicLinkUrl,
          },
        }),
      });
      const data = await res.json();
      setDraftSubject(data.subject ?? "");
      setDraftBody(data.body ?? "");
    } finally {
      setDraftLoading(false);
    }
  }

  function handleSendDraft() {
    setDraftSent(true);
    setDraftOpen(false);
  }

  async function handleSimulate() {
    setSimBusy(true);
    setError(null);
    try {
      const r = await onSimulateAgent(selectedReading);
      if (r) setReply(r);
      else setError("Could not load Sarah's reply. Try a different reading.");
    } finally {
      setSimBusy(false);
    }
  }

  async function handleAccept() {
    if (!reply) return;
    setAcceptBusy(true);
    setError(null);
    try {
      await onAcceptReading(selectedReading, reply.id);
    } catch {
      setError("Could not accept reading. Try again.");
    } finally {
      setAcceptBusy(false);
    }
  }

  function handlePushBack() {
    // Demo placeholder. Real version would open a reply composer or flip the
    // card into a counter-proposal state.
    setError(
      "Push-back flow not implemented in the demo. Pick a different reading and simulate again to see the alternative.",
    );
  }

  // ── State derivation ────────────────────────────────────────────────────
  // The card has three action-area states, in priority order:
  //   1. replyShown   — Sarah has replied; awaiting accept / push back
  //   2. waitingReply — clarification sent; awaiting reply (with sim affordance)
  //   3. default      — original three-button action row
  const replyShown = reply !== null;
  const waitingReply = !replyShown && draftSent;

  const selectedReadingLabel =
    ambiguity.candidate_readings.find(
      (r) => r.structured_value === selectedReading,
    )?.label ?? selectedReading;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200 flex items-start gap-3">
        <AlertTriangle className="size-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-amber-900">
            Ambiguity flagged · {ambiguity.field}
          </div>
          <div className="text-[12px] text-ink-700 mt-1 font-mono">
            “{ambiguity.prose_span}”
          </div>
          <p className="text-[12px] text-ink-600 mt-2">{ambiguity.description}</p>
        </div>
      </div>

      {/* Candidate readings — read-only once a reply is in flight, so the
          user can see what was selected when the agent answered. */}
      <div className="px-4 py-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
          Candidate readings
          {(replyShown || waitingReply) && (
            <span className="ml-2 normal-case tracking-normal text-ink-400">
              (locked to selected reading)
            </span>
          )}
        </div>
        {ambiguity.candidate_readings.map((r) => {
          const isSelected = selectedReading === r.structured_value;
          const isDimmed = (replyShown || waitingReply) && !isSelected;
          return (
            <label
              key={r.structured_value}
              className={cn(
                "flex items-start gap-3 px-3 py-2 rounded-md border",
                replyShown || waitingReply
                  ? "cursor-default"
                  : "cursor-pointer",
                isSelected
                  ? "border-brand-400 bg-brand-50"
                  : "border-ink-200 hover:bg-ink-50",
                isDimmed && "opacity-50",
              )}
            >
              <input
                type="radio"
                name={`ambig_${ambiguity.id}`}
                value={r.structured_value}
                checked={isSelected}
                onChange={() => {
                  if (!replyShown && !waitingReply) {
                    setSelectedReading(r.structured_value);
                  }
                }}
                disabled={replyShown || waitingReply}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-ink-900">
                  {r.label}
                </div>
                <div className="text-[12px] text-ink-600 mt-0.5">
                  {r.interpretation}
                </div>
                <div className="text-[11px] text-ink-500 mt-1 italic">
                  {r.estimated_impact}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Sarah's reply — shown after simulate. The visual is deliberately
          email-like: sky-tinted left border, header with name/agency/time. */}
      {replyShown && reply && (
        <div className="px-4 pb-3">
          <div className="rounded-md border border-sky-200 bg-sky-50/60 border-l-4 border-l-sky-500 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px]">
              <Mail className="size-3 text-sky-700" />
              <span className="font-medium text-sky-900">
                {reply.agentName}
              </span>
              {reply.agency && (
                <span className="text-sky-700/80">· {reply.agency}</span>
              )}
              <span className="text-sky-700/60">
                · {formatTime(reply.timestamp)}
              </span>
              <span className="ml-auto text-[10px] text-sky-700/70 bg-white/70 px-1.5 py-0.5 rounded">
                simulated
              </span>
            </div>
            <p className="text-[12.5px] text-ink-800 mt-2 whitespace-pre-wrap leading-relaxed">
              {reply.text}
            </p>
          </div>
        </div>
      )}

      {/* Error banner — inline */}
      {error && (
        <div className="mx-4 mb-3 text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Action row — three states */}
      <div className="px-4 py-3 border-t border-amber-200 bg-white flex items-center justify-between gap-3 flex-wrap">
        {replyShown ? (
          <>
            <div className="text-[11px] text-ink-500">
              Sarah confirmed · accept to lock the resolution
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePushBack}
                disabled={acceptBusy}
                className="gap-1.5"
              >
                Push back
              </Button>
              <Button
                variant="brand"
                onClick={handleAccept}
                disabled={acceptBusy}
                className="gap-1.5"
              >
                <Check className="size-3.5" />
                {acceptBusy ? "Accepting…" : `Accept ${reply.agentName.split(" ")[0]}'s reading`}
              </Button>
            </div>
          </>
        ) : waitingReply ? (
          <>
            <div className="flex items-center gap-2 text-[11px] text-amber-800">
              <Clock className="size-3.5 animate-pulse" />
              <span>
                Waiting for {agentName.split(" ")[0]}&apos;s reply…
              </span>
              <span className="text-ink-400">
                (In production: inbound email auto-resolves this)
              </span>
            </div>
            <Button
              variant="outline"
              onClick={handleSimulate}
              disabled={simBusy}
              className="gap-1.5"
            >
              <MessageSquareReply className="size-3.5" />
              {simBusy ? "Sarah is typing…" : `Simulate ${agentName.split(" ")[0]}'s reply`}
            </Button>
          </>
        ) : (
          <>
            <div className="text-[11px] text-ink-500">
              Lock in by picking a reading, or send a clarification to the agent.
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => onLocalResolve(selectedReading)}
                className="gap-1.5"
              >
                <Check className="size-3.5" /> Lock in reading
              </Button>
              <Button
                variant="outline"
                onClick={handleRequestDraft}
                disabled={draftSent}
                className="gap-1.5"
              >
                <Mail className="size-3.5" />
                {draftSent ? "Sent" : "Send clarification to agent"}
              </Button>
              <Button
                variant="outline"
                onClick={handleSimulate}
                disabled={simBusy}
                className="gap-1.5"
              >
                <Wand2 className="size-3.5" />
                {simBusy
                  ? "Simulating…"
                  : `Simulate agent reply: ${selectedReadingLabel}`}
              </Button>
            </div>
          </>
        )}
      </div>

      {draftOpen && (
        <div className="fixed inset-0 z-50 bg-ink-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="px-5 py-3 border-b border-ink-200 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-500">
                  Clarification email · draft
                </div>
                <div className="text-[13px] font-medium text-ink-900 mt-0.5">
                  To {agentName}
                </div>
              </div>
              <button
                onClick={() => setDraftOpen(false)}
                className="text-ink-500 hover:text-ink-800"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
              {draftLoading ? (
                <div className="text-[13px] text-ink-500 italic">
                  Drafting…
                </div>
              ) : (
                <>
                  <input
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-ink-200 text-[13px] font-medium"
                  />
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={12}
                    className="w-full px-3 py-2 rounded border border-ink-200 text-[13px] leading-relaxed font-mono resize-none"
                  />
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-ink-200 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraftOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendDraft} disabled={draftLoading}>
                Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AmbiguityRail({
  ambiguities,
  agentName,
  agencyName,
  artistName,
  showDate,
  dealExternalId,
  dealShareToken,
  resolutions,
  onLocalResolve,
  onSimulateAgent,
  onAcceptReading,
}: Props) {
  if (!ambiguities || ambiguities.length === 0) return null;

  const unresolvedCount = ambiguities.filter(
    (a) => !a.resolution && !resolutions[a.id],
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[14px] font-medium text-ink-900">
          Ambiguities{" "}
          {unresolvedCount > 0 && (
            <span className="text-amber-700">· {unresolvedCount} unresolved</span>
          )}
        </h2>
        <span className="text-[11px] text-ink-500">
          Resolve upstream — before settlement night.
        </span>
      </div>
      <div className="space-y-3">
        {ambiguities.map((a) => (
          <AmbiguityCard
            key={a.id}
            ambiguity={a}
            agentName={agentName}
            agencyName={agencyName}
            artistName={artistName}
            showDate={showDate}
            dealExternalId={dealExternalId}
            dealShareToken={dealShareToken}
            localResolution={resolutions[a.id]}
            onLocalResolve={(r) => onLocalResolve(a.id, r)}
            onSimulateAgent={(r) => onSimulateAgent(a.id, r)}
            onAcceptReading={(r, replyId) => onAcceptReading(a.id, r, replyId)}
          />
        ))}
      </div>
    </div>
  );
}
