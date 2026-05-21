"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlainBadge } from "@/components/ui/badge";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ClauseThread,
  type ClauseThreadComment,
} from "@/components/shared/ClauseThread";
import {
  parseDealRecoups,
  parseBonusesV2,
  type RecoupV2,
} from "@/lib/dealMathV2";
import type { Bonus, Deal, Show, Artist } from "@/db/schema";

type Props = {
  token: string;
  deal: Deal;
  show: Show;
  artist: Artist;
  agentName: string;
  agencyName: string | null;
  comments: Array<ClauseThreadComment & { clauseRef: string }>;
  signoffStatus: "open" | "agreed" | "questions";
  signoffText: string | null;
  signoffByName: string | null;
  signoffAt: Date | null;
};

type Clause = {
  ref: string;
  label: string;
  value: React.ReactNode;
  detail?: string;
};

function buildClauses(
  deal: Deal,
  recoups: RecoupV2[],
  bonuses: Bonus[],
): Clause[] {
  const out: Clause[] = [];
  out.push({
    ref: "deal_type",
    label: "Deal type",
    value:
      deal.dealType === "vs"
        ? "Vs (guarantee vs %)"
        : deal.dealType === "percentage_of_net"
          ? "Percentage of net"
          : deal.dealType === "percentage_of_gross"
            ? "Percentage of gross"
            : deal.dealType === "flat"
              ? "Flat guarantee"
              : deal.dealType,
  });
  if (deal.guaranteeAmount != null) {
    out.push({
      ref: "guarantee_amount",
      label: "Guarantee",
      value: formatMoney(deal.guaranteeAmount),
    });
  }
  if (deal.percentage != null) {
    out.push({
      ref: "percentage",
      label: `Percentage of ${deal.percentageBasis ?? "—"}`,
      value: `${(deal.percentage * 100).toFixed(0)}%`,
    });
  }
  if (deal.expenseCap != null) {
    out.push({
      ref: "expense_cap",
      label: "Expense cap",
      value: formatMoney(deal.expenseCap),
    });
  }
  if (deal.hospitalityCap != null) {
    out.push({
      ref: "hospitality_cap",
      label: "Hospitality cap",
      value: formatMoney(deal.hospitalityCap),
    });
  }
  recoups.forEach((r, i) => {
    out.push({
      ref: `recoups[${i}]`,
      label: `Recoup · ${r.category.replace(/_/g, " ")}`,
      value: (
        <span className="flex items-center gap-1.5">
          <span>{formatMoney(r.amount)} · {r.label}</span>
          <PlainBadge
            variant={r.position === "ambiguous" ? "amber" : "default"}
          >
            {r.position.replace(/_/g, " ")}
          </PlainBadge>
        </span>
      ),
      detail: r.prose_span,
    });
  });
  bonuses.forEach((b, i) => {
    out.push({
      ref: `bonuses[${i}]`,
      label: "Bonus",
      value: b.label,
    });
  });
  return out;
}

export function DealConfirmation({
  token,
  deal,
  show,
  artist,
  agentName,
  agencyName,
  comments: initialComments,
  signoffStatus,
  signoffText,
  signoffByName,
  signoffAt,
}: Props) {
  const recoups = useMemo(() => parseDealRecoups(deal), [deal]);
  const bonuses = useMemo(() => parseBonusesV2(deal), [deal]);
  const clauses = useMemo(
    () => buildClauses(deal, recoups, bonuses),
    [deal, recoups, bonuses],
  );

  // Group comments by clauseRef so each clause renders its own thread.
  const commentsByRef = useMemo(() => {
    const m = new Map<string, ClauseThreadComment[]>();
    for (const c of initialComments) {
      const arr = m.get(c.clauseRef) ?? [];
      arr.push(c);
      m.set(c.clauseRef, arr);
    }
    return m;
  }, [initialComments]);

  const [proseOpen, setProseOpen] = useState(false);
  const [status, setStatus] = useState(signoffStatus);
  const [stamp, setStamp] = useState<{
    name: string | null;
    at: Date | null;
    text: string | null;
  }>({
    name: signoffByName,
    at: signoffAt,
    text: signoffText,
  });
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function postComment(clauseRef: string, body: string) {
    const res = await fetch("/api/clause-comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, clauseRef, body }),
    });
    if (!res.ok) throw new Error("post failed");
    const data = await res.json();
    return data.comment as ClauseThreadComment;
  }

  async function handleConfirm() {
    setSigning(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-signoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signoffStatus: "agreed",
          signoffText: null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "signoff failed");
      }
      const data = await res.json();
      setStatus("agreed");
      setStamp({
        name: data.link.signoffByName,
        at: new Date(data.link.signoffAt),
        text: data.link.signoffText,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signoff failed");
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="bg-white border-b border-ink-200">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
            The Crescent · deal confirmation
          </div>
          <h1 className="text-[24px] font-display text-ink-900 mt-1 leading-tight">
            {artist.name}
            <span className="text-ink-400 font-normal"> · </span>
            <span className="text-ink-500 text-[18px] font-normal align-middle">
              {formatShowDateFull(show.date)}
            </span>
          </h1>
          <p className="text-[13px] text-ink-600 mt-2 max-w-prose">
            Hi {agentName.split(" ")[0]} — Mariana asked me to confirm the
            structured terms we extracted from your deal email. Review the
            clauses below; comment on any that don&apos;t match your intent.
            Confirm at the bottom when you&apos;re happy with the read.
          </p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6 pb-32">
        {/* Original prose */}
        {deal.sourceProse && (
          <div className="rounded-lg border border-ink-200 bg-white">
            <button
              type="button"
              onClick={() => setProseOpen((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <span className="text-[12px] font-medium text-ink-900">
                Original deal email
              </span>
              {proseOpen ? (
                <ChevronUp className="size-3.5 text-ink-500" />
              ) : (
                <ChevronDown className="size-3.5 text-ink-500" />
              )}
            </button>
            {proseOpen && (
              <pre className="px-4 pb-4 text-[12px] text-ink-700 font-mono whitespace-pre-wrap leading-relaxed">
                {deal.sourceProse}
              </pre>
            )}
          </div>
        )}

        {/* Clauses */}
        <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <header className="px-4 py-3 border-b border-ink-100">
            <h2 className="text-[13px] font-medium text-ink-900">Deal terms</h2>
            <div className="text-[11px] text-ink-500 mt-0.5">
              Tap any clause to add a comment. Comments route directly to the
              activity log Mariana sees.
            </div>
          </header>
          <ul>
            {clauses.map((c) => {
              const clauseComments = commentsByRef.get(c.ref) ?? [];
              return (
                <li
                  key={c.ref}
                  className="px-4 py-3 border-b border-ink-100 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
                        {c.label}
                      </div>
                      <div className="text-[14px] text-ink-900 mt-0.5">
                        {c.value}
                      </div>
                      {c.detail && (
                        <p className="text-[11px] text-ink-500 mt-1 italic font-mono">
                          “{c.detail}”
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2">
                    <ClauseThread
                      clauseRef={c.ref}
                      initialComments={clauseComments}
                      readOnly={status !== "open"}
                      onPost={(body) => postComment(c.ref, body)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Error banner */}
        {error && (
          <div className="text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <footer className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-ink-200">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          {status === "open" ? (
            <>
              <div className="text-[12px] text-ink-500 max-w-[60%]">
                Once you confirm, the structured terms become the source of
                truth — settlement will be calculated against them.
              </div>
              <Button
                variant="brand"
                size="lg"
                onClick={handleConfirm}
                disabled={signing}
                className="gap-1.5"
              >
                <Check className="size-3.5" />
                {signing ? "Confirming…" : "Confirm deal"}
              </Button>
            </>
          ) : (
            <div
              className={cn(
                "flex items-center gap-2 text-[12px]",
                status === "agreed" ? "text-brand-800" : "text-amber-800",
              )}
            >
              <Check className="size-3.5" />
              <span>
                {status === "agreed" ? "Confirmed" : "Pending questions"} by{" "}
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
