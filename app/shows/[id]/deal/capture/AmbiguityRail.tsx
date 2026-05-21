"use client";

import { useState } from "react";
import { AlertTriangle, Check, Mail, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExtractionAmbiguity } from "./types";

type Props = {
  ambiguities: ExtractionAmbiguity[];
  agentName: string;
  artistName: string;
  showDate: string;
  dealId: string | null;
  dealExternalId: string;
  /** Local pre-save resolutions: ambiguityId → resolution value. */
  resolutions: Record<string, string>;
  onLocalResolve: (ambiguityId: string, resolution: string) => void;
  /**
   * Fires when the user simulates the agent's reply. Mutates the DB via
   * /api/simulate-agent-reply and applies the same resolution locally.
   */
  onSimulateAgent: (
    ambiguityId: string,
    resolution: string,
  ) => Promise<void>;
};

function AmbiguityCard({
  ambiguity,
  agentName,
  artistName,
  showDate,
  dealExternalId,
  localResolution,
  onLocalResolve,
  onSimulateAgent,
}: {
  ambiguity: ExtractionAmbiguity;
  agentName: string;
  artistName: string;
  showDate: string;
  dealExternalId: string;
  localResolution: string | undefined;
  onLocalResolve: (resolution: string) => void;
  onSimulateAgent: (resolution: string) => Promise<void>;
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

  if (resolved) {
    const reading =
      ambiguity.candidate_readings.find((r) => r.structured_value === resolved)
        ?.label ?? resolved;
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
        {ambiguity.resolved_by && (
          <span className="text-[10px] text-brand-700/80">
            via {ambiguity.resolved_by}
          </span>
        )}
      </div>
    );
  }

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
    try {
      await onSimulateAgent(selectedReading);
    } finally {
      setSimBusy(false);
    }
  }

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

      <div className="px-4 py-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
          Candidate readings
        </div>
        {ambiguity.candidate_readings.map((r) => (
          <label
            key={r.structured_value}
            className={cn(
              "flex items-start gap-3 px-3 py-2 rounded-md cursor-pointer border",
              selectedReading === r.structured_value
                ? "border-brand-400 bg-brand-50"
                : "border-ink-200 hover:bg-ink-50",
            )}
          >
            <input
              type="radio"
              name={`ambig_${ambiguity.id}`}
              value={r.structured_value}
              checked={selectedReading === r.structured_value}
              onChange={() => setSelectedReading(r.structured_value)}
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
        ))}
      </div>

      <div className="px-4 py-3 border-t border-amber-200 bg-white flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-ink-500">
          {draftSent ? (
            <span className="text-brand-700">
              ✉︎ Clarification sent to {agentName} — waiting on reply
            </span>
          ) : (
            <>Lock in by picking a reading, or send a clarification to the agent.</>
          )}
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
            {simBusy ? "Simulating…" : `Simulate agent reply: ${ambiguity.candidate_readings.find((r) => r.structured_value === selectedReading)?.label}`}
          </Button>
        </div>
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
  artistName,
  showDate,
  dealExternalId,
  resolutions,
  onLocalResolve,
  onSimulateAgent,
}: Props) {
  if (!ambiguities || ambiguities.length === 0) return null;

  const unresolvedCount = ambiguities.filter(
    (a) => !a.resolution && !resolutions[a.id],
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[14px] font-medium text-ink-900">
          Ambiguities {unresolvedCount > 0 && <span className="text-amber-700">· {unresolvedCount} unresolved</span>}
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
            artistName={artistName}
            showDate={showDate}
            dealExternalId={dealExternalId}
            localResolution={resolutions[a.id]}
            onLocalResolve={(r) => onLocalResolve(a.id, r)}
            onSimulateAgent={(r) => onSimulateAgent(a.id, r)}
          />
        ))}
      </div>
    </div>
  );
}
