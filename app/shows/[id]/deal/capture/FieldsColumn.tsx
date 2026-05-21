"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ConfidenceChip, type Confidence } from "./ConfidenceChip";
import { formatMoney } from "@/lib/format";
import type { ExtractionResponse } from "./types";
import {
  ClauseThread,
  type ClauseThreadComment,
} from "@/components/shared/ClauseThread";

type Props = {
  extraction: ExtractionResponse;
  hoveredProseSpan: string | null;
  onHoverField: (fieldKey: string | null) => void;
  /** Agent comments to surface inline next to each clause. Read-only for Mariana. */
  clauseComments?: Array<ClauseThreadComment & { clauseRef: string }>;
};

function FieldRow({
  fieldKey,
  label,
  value,
  confidence,
  hovered,
  onHoverField,
  comments,
}: {
  fieldKey: string;
  label: string;
  value: React.ReactNode;
  confidence: Confidence | undefined;
  hovered: boolean;
  onHoverField: (k: string | null) => void;
  comments?: ClauseThreadComment[];
}) {
  return (
    <div
      data-field-key={fieldKey}
      onMouseEnter={() => onHoverField(fieldKey)}
      onMouseLeave={() => onHoverField(null)}
      className={cn(
        "px-3 py-2 rounded-md cursor-default",
        "border border-transparent transition-colors",
        hovered ? "bg-brand-50 border-brand-200" : "hover:bg-ink-50/60",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
            {label}
          </div>
          <div className="text-[13px] text-ink-900 font-medium mt-0.5 truncate">
            {value}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {comments && comments.length > 0 && (
            <ClauseThread
              clauseRef={fieldKey}
              initialComments={comments}
              badgeOnly
              readOnly
            />
          )}
          {confidence && <ConfidenceChip level={confidence} />}
        </div>
      </div>
      {comments && comments.length > 0 && (
        <div className="mt-2">
          <ClauseThread
            clauseRef={fieldKey}
            initialComments={comments}
            readOnly
          />
        </div>
      )}
    </div>
  );
}

function fmtPct(p: number | null) {
  if (p == null) return "—";
  return `${(p * 100).toFixed(0)}%`;
}

export function FieldsColumn({
  extraction,
  hoveredProseSpan,
  onHoverField,
  clauseComments = [],
}: Props) {
  const conf = extraction.fields_confidence ?? {};
  // The hovered prose span is a substring — match it back to a field key.
  const hoveredFieldFromSpan = hoveredProseSpan
    ? Object.entries(extraction.prose_spans ?? {}).find(
        ([, span]) => span === hoveredProseSpan,
      )?.[0] ?? null
    : null;

  const isHovered = (k: string) => hoveredFieldFromSpan === k;

  // Bucket agent comments by their clauseRef so each FieldRow can pluck its own.
  const commentsByRef = useMemo(() => {
    const m = new Map<string, ClauseThreadComment[]>();
    for (const c of clauseComments) {
      const arr = m.get(c.clauseRef) ?? [];
      arr.push(c);
      m.set(c.clauseRef, arr);
    }
    return m;
  }, [clauseComments]);

  return (
    <div className="flex flex-col h-full">
      <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium mb-2">
        Extracted deal terms
      </div>
      <div className="flex-1 rounded-lg border border-ink-200 bg-white overflow-auto">
        <div className="p-2 space-y-1">
          <FieldRow
            fieldKey="deal_type"
            label="Deal type"
            value={extraction.deal_type === "vs" ? "Vs (guarantee vs %)" : extraction.deal_type}
            confidence={conf.deal_type as Confidence}
            hovered={isHovered("deal_type")}
            onHoverField={onHoverField}
            comments={commentsByRef.get("deal_type")}
          />
          <FieldRow
            fieldKey="guarantee_amount"
            label="Guarantee"
            value={formatMoney(extraction.guarantee_amount)}
            confidence={conf.guarantee_amount as Confidence}
            hovered={isHovered("guarantee_amount")}
            onHoverField={onHoverField}
            comments={commentsByRef.get("guarantee_amount")}
          />
          <FieldRow
            fieldKey="percentage"
            label={`Percentage of ${extraction.percentage_basis ?? "—"}`}
            value={fmtPct(extraction.percentage)}
            confidence={conf.percentage as Confidence}
            hovered={isHovered("percentage")}
            onHoverField={onHoverField}
            comments={commentsByRef.get("percentage")}
          />
          <FieldRow
            fieldKey="expense_cap"
            label="Expense cap"
            value={formatMoney(extraction.expense_cap)}
            confidence={conf.expense_cap as Confidence}
            hovered={isHovered("expense_cap")}
            onHoverField={onHoverField}
            comments={commentsByRef.get("expense_cap")}
          />
          <FieldRow
            fieldKey="hospitality_cap"
            label="Hospitality cap"
            value={formatMoney(extraction.hospitality_cap)}
            confidence={conf.hospitality_cap as Confidence}
            hovered={isHovered("hospitality_cap")}
            onHoverField={onHoverField}
            comments={commentsByRef.get("hospitality_cap")}
          />
          {extraction.bonuses?.map((b, i) => (
            <FieldRow
              key={`bonus_${i}`}
              fieldKey={`bonuses[${i}]`}
              label="Bonus"
              value={b.label}
              confidence={conf[`bonuses[${i}]`] as Confidence}
              hovered={isHovered(`bonuses[${i}]`)}
              onHoverField={onHoverField}
              comments={commentsByRef.get(`bonuses[${i}]`)}
            />
          ))}
          {extraction.recoups?.map((r, i) => (
            <FieldRow
              key={`recoup_${i}`}
              fieldKey={`recoups[${i}]`}
              label={`Recoup · ${r.category}`}
              value={
                <span className="flex items-center gap-1.5">
                  <span>
                    {formatMoney(r.amount)} · {r.label}
                  </span>
                  {r.position === "ambiguous" && (
                    <span className="text-[10px] text-amber-800 bg-amber-50 ring-1 ring-amber-200/80 ring-inset px-1.5 py-0.5 rounded">
                      position?
                    </span>
                  )}
                </span>
              }
              confidence={conf[`recoups[${i}].amount`] as Confidence}
              hovered={isHovered(`recoups[${i}]`)}
              onHoverField={onHoverField}
              comments={commentsByRef.get(`recoups[${i}]`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
