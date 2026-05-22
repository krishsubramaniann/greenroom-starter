"use client";

/**
 * Settle-page sequential CTA bar — three gated states tied to the
 * post-show signoff flow:
 *
 *   1. [Send PM link]                — primary, always available
 *   2. [Confirm expenses received]   — enables when shows.pmExpensesFinalizedAt
 *                                      flips (banner appears here too)
 *   3. [Send to agent for review]    — enables once expensesConfirmedAt is set
 *
 * Polls /api/show-state every 5s so the banner + button enablement track
 * cross-actor state (PM mobile, agent magic link). The PM-link and agent-
 * link panels open inline as expanding sections, not modals.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  HelpCircle,
  Inbox,
  Mail,
  Smartphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  showId: string;
  pmExpenseUrl: string;
  agentShareUrl: string | null;
  initialPmExpensesFinalizedAt: string | null;
  initialExpensesConfirmedAt: string | null;
  initialAgentSignoffStatus: "open" | "agreed" | "questions" | null;
  initialAgentSignoffByName: string | null;
  initialAgentSignoffAt: string | null;
  initialAgentSignoffText: string | null;
};

const POLL_INTERVAL_MS = 5000;

export function SettleCtaBar({
  showId,
  pmExpenseUrl,
  agentShareUrl,
  initialPmExpensesFinalizedAt,
  initialExpensesConfirmedAt,
  initialAgentSignoffStatus,
  initialAgentSignoffByName,
  initialAgentSignoffAt,
  initialAgentSignoffText,
}: Props) {
  const router = useRouter();

  const [pmFinalizedAt, setPmFinalizedAt] = useState<string | null>(
    initialPmExpensesFinalizedAt,
  );
  const [expensesConfirmedAt, setExpensesConfirmedAt] = useState<string | null>(
    initialExpensesConfirmedAt,
  );
  const [agentSignoffStatus, setAgentSignoffStatus] = useState(
    initialAgentSignoffStatus,
  );
  const [agentSignoffByName, setAgentSignoffByName] = useState(
    initialAgentSignoffByName,
  );
  const [agentSignoffAt, setAgentSignoffAt] = useState(initialAgentSignoffAt);
  const [agentSignoffText, setAgentSignoffText] = useState(
    initialAgentSignoffText,
  );

  // Panel state
  const [pmPanelOpen, setPmPanelOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [pmCopied, setPmCopied] = useState(false);
  const [agentCopied, setAgentCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show a one-shot "PM just finalized" banner for 30s after the flip
  const [showJustFinalized, setShowJustFinalized] = useState(false);
  const lastSeenFinalizedAt = useRef<string | null>(initialPmExpensesFinalizedAt);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const res = await fetch(
          `/api/show-state?showId=${encodeURIComponent(showId)}`,
          { cache: "no-store" },
        );
        if (!res.ok || stopped) return;
        const data = await res.json();
        if (
          data.pmExpensesFinalizedAt &&
          data.pmExpensesFinalizedAt !== lastSeenFinalizedAt.current
        ) {
          setShowJustFinalized(true);
          setTimeout(() => setShowJustFinalized(false), 30_000);
          lastSeenFinalizedAt.current = data.pmExpensesFinalizedAt;
        }
        setPmFinalizedAt(data.pmExpensesFinalizedAt);
        setExpensesConfirmedAt(data.expensesConfirmedAt);
        setAgentSignoffStatus(data.agentSignoffStatus);
        setAgentSignoffByName(data.agentSignoffByName);
        setAgentSignoffAt(data.agentSignoffAt);
        setAgentSignoffText(data.agentSignoffText);
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

  async function copyTo(url: string, setFlag: (b: boolean) => void) {
    try {
      const full =
        typeof window !== "undefined"
          ? `${window.location.origin}${url}`
          : url;
      await navigator.clipboard.writeText(full);
      setFlag(true);
      setTimeout(() => setFlag(false), 1500);
    } catch {
      setFlag(false);
    }
  }

  async function handleConfirmExpenses() {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/confirm-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Confirm failed");
      }
      const data = await res.json();
      setExpensesConfirmedAt(data.expensesConfirmedAt);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  }

  const canConfirm = pmFinalizedAt != null && expensesConfirmedAt == null;
  const canSendAgent = expensesConfirmedAt != null;
  const agentResponded =
    agentSignoffStatus === "agreed" || agentSignoffStatus === "questions";

  return (
    <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">
      <header className="px-5 py-3 border-b border-ink-100">
        <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
          Next steps
        </div>
        <div className="text-[14px] text-ink-900 font-medium mt-0.5">
          {agentResponded
            ? `Agent responded · ${agentSignoffStatus === "agreed" ? "settlement finalized" : "settlement disputed"}`
            : canSendAgent
              ? "Send the preview to the agent for sign-off"
              : canConfirm
                ? "Cross-check the PM's submission, then confirm"
                : "Share the PM link to start collecting receipts"}
        </div>
      </header>

      {/* PM-finalized banner */}
      {pmFinalizedAt && !expensesConfirmedAt && (
        <div
          className={cn(
            "px-5 py-3 border-b border-brand-200 bg-brand-50/60 flex items-start gap-3",
            showJustFinalized && "animate-pulse",
          )}
        >
          <Inbox className="size-4 text-brand-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[12.5px] font-medium text-brand-900">
              Production manager signaled expenses complete · ready for your
              review
            </div>
            <div className="text-[11px] text-brand-700/80 mt-0.5">
              {showJustFinalized ? "just now" : `at ${formatTime(pmFinalizedAt)}`}
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-5 py-2 border-b border-rose-200 bg-rose-50 text-[12px] text-rose-800">
          {error}
        </div>
      )}

      {/* CTA row 1 — Send PM link (open inline panel) */}
      <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12px] text-ink-600 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex size-5 rounded-full items-center justify-center text-[11px] font-medium",
              pmFinalizedAt
                ? "bg-brand-100 text-brand-800"
                : "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200",
            )}
          >
            {pmFinalizedAt ? <Check className="size-3" /> : "1"}
          </span>
          <span>
            {pmFinalizedAt
              ? "PM finished logging"
              : "Share the PM expense link"}
          </span>
        </div>
        <Button
          variant={pmPanelOpen ? "secondary" : pmFinalizedAt ? "secondary" : "brand"}
          onClick={() => setPmPanelOpen((v) => !v)}
          className="gap-1.5"
        >
          <Smartphone className="size-3.5" />
          {pmPanelOpen ? "Hide PM link" : "Send PM link"}
        </Button>
      </div>
      {pmPanelOpen && (
        <ShareLinkPanel
          url={pmExpenseUrl}
          copied={pmCopied}
          onCopy={() => copyTo(pmExpenseUrl, setPmCopied)}
          onClose={() => setPmPanelOpen(false)}
          eyebrow="PM expense link"
          helpText="Text this to the production manager. Receipts show up in Section B above as they're logged."
        />
      )}

      {/* CTA row 2 — Confirm expenses */}
      <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12px] text-ink-600 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex size-5 rounded-full items-center justify-center text-[11px] font-medium",
              expensesConfirmedAt
                ? "bg-brand-100 text-brand-800"
                : canConfirm
                  ? "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
                  : "bg-ink-100 text-ink-500",
            )}
          >
            {expensesConfirmedAt ? <Check className="size-3" /> : "2"}
          </span>
          <span>
            {expensesConfirmedAt
              ? "You confirmed the PM submission"
              : "Confirm you've reviewed PM expenses"}
          </span>
        </div>
        <Button
          variant={canConfirm ? "brand" : "secondary"}
          disabled={!canConfirm || confirming}
          onClick={handleConfirmExpenses}
          className="gap-1.5"
        >
          <Check className="size-3.5" />
          {confirming ? "Confirming…" : "Confirm expenses received"}
        </Button>
      </div>

      {/* CTA row 3 — Send to agent */}
      <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12px] text-ink-600 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex size-5 rounded-full items-center justify-center text-[11px] font-medium",
              agentResponded
                ? "bg-brand-100 text-brand-800"
                : canSendAgent
                  ? "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
                  : "bg-ink-100 text-ink-500",
            )}
          >
            {agentResponded ? <Check className="size-3" /> : "3"}
          </span>
          <span>
            {agentResponded
              ? agentSignoffStatus === "agreed"
                ? `Agent accepted · ${agentSignoffByName ?? "Agent"}`
                : `Agent disputed · ${agentSignoffByName ?? "Agent"}`
              : "Send the preview to the agent"}
          </span>
        </div>
        <Button
          variant={canSendAgent && !agentPanelOpen ? "brand" : "secondary"}
          disabled={!canSendAgent || agentShareUrl == null}
          onClick={() => setAgentPanelOpen((v) => !v)}
          className="gap-1.5"
        >
          <Mail className="size-3.5" />
          {agentPanelOpen ? "Hide agent link" : "Send to agent for review"}
        </Button>
      </div>
      {agentPanelOpen && agentShareUrl && (
        <ShareLinkPanel
          url={agentShareUrl}
          copied={agentCopied}
          onCopy={() => copyTo(agentShareUrl, setAgentCopied)}
          onClose={() => setAgentPanelOpen(false)}
          eyebrow="Agent settlement preview"
          helpText="Email or text this to the agent. They'll see a read-only one-pager and can acknowledge or dispute."
          tone="agent"
        />
      )}

      {agentResponded && (
        <div
          className={cn(
            "px-5 py-3 flex items-start gap-3",
            agentSignoffStatus === "agreed"
              ? "bg-brand-50/60"
              : "bg-amber-50/60",
          )}
        >
          {agentSignoffStatus === "agreed" ? (
            <Check className="size-4 text-brand-700 mt-0.5 shrink-0" />
          ) : (
            <HelpCircle className="size-4 text-amber-700 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            <div
              className={cn(
                "text-[12.5px] font-medium",
                agentSignoffStatus === "agreed"
                  ? "text-brand-900"
                  : "text-amber-900",
              )}
            >
              {agentSignoffByName ?? "Agent"}{" "}
              {agentSignoffStatus === "agreed"
                ? "acknowledged & accepted the settlement"
                : "disputed / requested changes"}
              {agentSignoffAt && (
                <span className="text-ink-500 font-normal ml-1">
                  · {formatTime(agentSignoffAt)}
                </span>
              )}
            </div>
            {agentSignoffText && (
              <div className="text-[11.5px] text-ink-700 mt-1 italic">
                “{agentSignoffText}”
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function ShareLinkPanel({
  url,
  copied,
  onCopy,
  onClose,
  eyebrow,
  helpText,
  tone = "pm",
}: {
  url: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
  eyebrow: string;
  helpText: string;
  tone?: "pm" | "agent";
}) {
  const fullUrl =
    typeof window !== "undefined" ? `${window.location.origin}${url}` : url;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
    fullUrl,
  )}&size=120x120&margin=2`;

  return (
    <div
      className={cn(
        "border-b px-5 py-4 flex items-center gap-5 flex-wrap",
        tone === "agent"
          ? "border-sky-100 bg-sky-50/40"
          : "border-brand-100 bg-brand-50/40",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrSrc}
        alt={`QR code for ${eyebrow}`}
        width={96}
        height={96}
        className={cn(
          "rounded border bg-white shrink-0",
          tone === "agent" ? "border-sky-200" : "border-brand-200",
        )}
      />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div
          className={cn(
            "text-[11px] uppercase tracking-wider font-medium",
            tone === "agent" ? "text-sky-800" : "text-brand-800",
          )}
        >
          {eyebrow}
        </div>
        <p className="text-[12px] text-ink-700 leading-relaxed">{helpText}</p>
        <div className="rounded-md border border-ink-200 bg-white px-3 py-1.5 font-mono text-[11px] text-ink-700 break-all">
          {url}
        </div>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <Link href={url} target="_blank" rel="noreferrer">
          <Button variant="secondary" className="gap-1.5 w-full">
            <ExternalLink className="size-3.5" /> Open
          </Button>
        </Link>
        <Button onClick={onCopy} variant="brand" className="gap-1.5">
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
        <button
          type="button"
          onClick={onClose}
          className="text-[10.5px] text-ink-500 hover:text-ink-800 inline-flex items-center justify-center gap-1"
        >
          <X className="size-3" /> Hide
        </button>
      </div>
    </div>
  );
}
