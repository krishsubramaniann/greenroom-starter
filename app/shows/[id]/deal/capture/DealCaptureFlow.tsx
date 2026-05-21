"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlainBadge } from "@/components/ui/badge";
import { ProseColumn } from "./ProseColumn";
import { FieldsColumn } from "./FieldsColumn";
import { AmbiguityRail } from "./AmbiguityRail";
import type { CaptureInitialState, ExtractionResponse } from "./types";

type Phase = "paste" | "extracting" | "review" | "saving" | "saved";

type Props = {
  initial: CaptureInitialState;
  showId: string;
  artistName: string;
  agentName: string;
  showDate: string;
};

export function DealCaptureFlow({
  initial,
  showId,
  artistName,
  agentName,
  showDate,
}: Props) {
  const router = useRouter();
  const hadInitialExtraction = initial.extraction !== null;

  const [phase, setPhase] = useState<Phase>(
    hadInitialExtraction ? "review" : "paste",
  );
  const [prose, setProse] = useState(initial.sourceProse);
  const [extraction, setExtraction] = useState<ExtractionResponse | null>(
    initial.extraction,
  );
  const [hoveredFieldKey, setHoveredFieldKey] = useState<string | null>(null);
  const [hoveredProseSpan, setHoveredProseSpan] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function handleExtract() {
    setError(null);
    setPhase("extracting");
    try {
      const res = await fetch("/api/extract-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prose }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Extraction failed: ${res.status}`);
      }
      const data = (await res.json()) as ExtractionResponse;
      setExtraction(data);
      // Keep the prose the user pasted — but if it's empty, use the canned
      // source_prose so the highlight spans still resolve.
      if (!prose.trim()) setProse(data.source_prose);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
      setPhase("paste");
    }
  }

  function handleRecapture() {
    setExtraction(null);
    setResolutions({});
    setPhase("paste");
  }

  function handleLocalResolve(ambiguityId: string, resolution: string) {
    setResolutions((prev) => ({ ...prev, [ambiguityId]: resolution }));
  }

  // Convert field-key hover (e.g. "guarantee_amount") to the matching prose span
  // for highlighting on the left.
  function handleHoverField(fieldKey: string | null) {
    setHoveredFieldKey(fieldKey);
  }
  function handleHoverProseSpan(fieldKey: string | null) {
    // ProseColumn already passes the field key (it knows the span→field mapping).
    setHoveredFieldKey(fieldKey);
  }

  async function handleSimulateAgent(
    ambiguityId: string,
    resolution: string,
  ) {
    if (!initial.dealId || !extraction) {
      // No persisted deal yet — apply locally only.
      handleLocalResolve(ambiguityId, resolution);
      return;
    }
    const ambig = extraction.ambiguities.find((a) => a.id === ambiguityId);
    const clauseRef = ambig?.field ?? "recoups[0].position";

    const res = await fetch("/api/simulate-agent-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealId: initial.dealId,
        ambiguityId,
        resolution,
        agentName,
        clauseRef,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Simulate failed: ${res.status}`);
      return;
    }
    const data = await res.json();
    // Mirror the DB mutation into the local extraction state.
    setExtraction((prev) =>
      prev
        ? {
            ...prev,
            ambiguities: prev.ambiguities.map((a) => {
              const updated = data.updatedDeal.ambiguities.find(
                (x: { id: string }) => x.id === a.id,
              );
              return updated ? { ...a, ...updated } : a;
            }),
          }
        : prev,
    );
    handleLocalResolve(ambiguityId, resolution);
  }

  async function handleSave() {
    if (!extraction) return;
    setPhase("saving");
    setError(null);
    try {
      const res = await fetch("/api/save-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showId,
          externalId: initial.showExternalId,
          sourceProse: prose,
          extraction,
          resolutions,
          ambiguitiesFlaggedCount: extraction.ambiguities.length,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed: ${res.status}`);
      }
      setPhase("saved");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setPhase("review");
    }
  }

  const unresolvedAmbiguities =
    extraction?.ambiguities.filter(
      (a) => !a.resolution && !resolutions[a.id],
    ) ?? [];
  const allResolved =
    extraction !== null && unresolvedAmbiguities.length === 0;

  return (
    <div className="space-y-6">
      {/* Initial-state hint banner */}
      {hadInitialExtraction && phase === "review" && (
        <div className="flex items-center gap-2 text-[12px] text-brand-800 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
          <Check className="size-3.5 text-brand-700" />
          Deal captured
          {initial.confirmedAt && (
            <span>· confirmed {initial.confirmedAt.toLocaleDateString()}</span>
          )}
          <span className="ml-auto text-brand-700">Read-only · click Recapture to overwrite</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Two-column split */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 min-h-[420px]">
            <ProseColumn
              prose={prose}
              onProseChange={setProse}
              proseSpans={extraction?.prose_spans ?? {}}
              hoveredFieldKey={hoveredFieldKey}
              onHoverSpan={handleHoverProseSpan}
              phase={phase}
              onExtract={handleExtract}
              onRecapture={handleRecapture}
            />
            {extraction ? (
              <FieldsColumn
                extraction={extraction}
                hoveredProseSpan={hoveredProseSpan}
                onHoverField={handleHoverField}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 flex items-center justify-center text-[12px] text-ink-500 italic">
                {phase === "extracting"
                  ? "Extracting structured terms…"
                  : "Extracted terms appear here after you click Extract."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ambiguity rail */}
      {extraction && extraction.ambiguities.length > 0 && (
        <AmbiguityRail
          ambiguities={extraction.ambiguities}
          agentName={agentName}
          artistName={artistName}
          showDate={showDate}
          dealId={initial.dealId}
          dealExternalId={initial.showExternalId}
          resolutions={resolutions}
          onLocalResolve={handleLocalResolve}
          onSimulateAgent={handleSimulateAgent}
        />
      )}

      {/* Footer */}
      {extraction && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-[12px] text-ink-500">
            {allResolved ? (
              <span className="text-brand-700 inline-flex items-center gap-1">
                <Check className="size-3.5" /> All ambiguities resolved — ready to lock
              </span>
            ) : (
              <>
                <PlainBadge variant="amber">
                  {unresolvedAmbiguities.length} unresolved
                </PlainBadge>{" "}
                Saving with unresolved ambiguities keeps the deal in draft (legacy engine).
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={phase === "saving"}
              variant="brand"
              className="gap-1.5"
            >
              <Save className="size-3.5" />
              {phase === "saving"
                ? "Saving…"
                : phase === "saved"
                  ? "Saved ✓"
                  : allResolved
                    ? "Save & lock deal"
                    : "Save draft"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
