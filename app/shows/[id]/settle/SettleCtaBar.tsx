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
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  showId: string;
  pmExpenseUrl: string;
  agentShareUrl: string | null;
  /** Magic-link URL Mariana texts to the GM for wire approval.
   *  Server lazy-creates the gm_approval share_link on settle-page load. */
  gmApprovalUrl: string | null;
  initialPmExpensesFinalizedAt: string | null;
  initialExpensesConfirmedAt: string | null;
  initialAgentSignoffStatus: "open" | "agreed" | "questions" | null;
  initialAgentSignoffByName: string | null;
  initialAgentSignoffAt: string | null;
  initialAgentSignoffText: string | null;
  initialGmApprovedAt: string | null;
  initialGmHeldAt: string | null;
  initialGmHoldReason: string | null;
};

const POLL_INTERVAL_MS = 5000;

export function SettleCtaBar({
  showId,
  pmExpenseUrl,
  agentShareUrl,
  gmApprovalUrl,
  initialPmExpensesFinalizedAt,
  initialExpensesConfirmedAt,
  initialAgentSignoffStatus,
  initialAgentSignoffByName,
  initialAgentSignoffAt,
  initialAgentSignoffText,
  initialGmApprovedAt,
  initialGmHeldAt,
  initialGmHoldReason,
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

  const [gmApprovedAt, setGmApprovedAt] = useState<string | null>(
    initialGmApprovedAt,
  );
  const [gmHeldAt, setGmHeldAt] = useState<string | null>(initialGmHeldAt);
  const [gmHoldReason, setGmHoldReason] = useState<string | null>(
    initialGmHoldReason,
  );

  // Panel state
  const [pmPanelOpen, setPmPanelOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [gmPanelOpen, setGmPanelOpen] = useState(false);
  const [pmCopied, setPmCopied] = useState(false);
  const [agentCopied, setAgentCopied] = useState(false);
  const [gmCopied, setGmCopied] = useState(false);
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
        setGmApprovedAt(data.gmApprovedAt ?? null);
        setGmHeldAt(data.gmHeldAt ?? null);
        setGmHoldReason(data.gmHoldReason ?? null);
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
  const agentAcknowledged = agentSignoffStatus === "agreed";
  const canSendGm = agentAcknowledged && gmApprovalUrl != null;
  const gmApproved = gmApprovedAt != null;
  const gmHeld = gmHeldAt != null;

  return (
    <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">
      <header className="px-5 py-3 border-b border-ink-100">
        <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
          Next steps
        </div>
        <div className="text-[14px] text-ink-900 font-medium mt-0.5">
          {gmApproved
            ? "Paid · wire scheduled"
            : gmHeld
              ? "Wire on hold by GM"
              : canSendGm
                ? "Send to GM for wire approval"
                : agentResponded && !agentAcknowledged
                  ? "Settlement disputed · address before next step"
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

      {/* CTA row 1 — PM expense link. After Mariana confirms expenses the
          button demotes to a secondary [View PM link] with a check icon
          (the panel still opens — same URL, audit-friendly). */}
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
          variant={
            expensesConfirmedAt != null
              ? "secondary"
              : pmPanelOpen
                ? "secondary"
                : "brand"
          }
          onClick={() => setPmPanelOpen((v) => !v)}
          className="gap-1.5"
        >
          {expensesConfirmedAt != null ? (
            <Check className="size-3.5 text-brand-700" />
          ) : (
            <Smartphone className="size-3.5" />
          )}
          {pmPanelOpen
            ? expensesConfirmedAt != null
              ? "Hide PM link"
              : "Hide PM link"
            : expensesConfirmedAt != null
              ? "View PM link"
              : "Send PM link"}
        </Button>
      </div>
      {pmPanelOpen && (
        <ShareLinkPanel
          url={pmExpenseUrl}
          copied={pmCopied}
          onCopy={() => copyTo(pmExpenseUrl, setPmCopied)}
          onClose={() => setPmPanelOpen(false)}
          eyebrow={
            expensesConfirmedAt != null
              ? `PM expense link · confirmed${
                  pmFinalizedAt
                    ? ` · PM finalized ${formatTime(pmFinalizedAt)}`
                    : ""
                }`
              : "PM expense link"
          }
          helpText={
            expensesConfirmedAt != null
              ? "You've already confirmed PM expenses. The URL is here for audit / re-share if needed."
              : "Text this to the production manager. Receipts show up in Section B above as they're logged."
          }
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
          variant={
            agentAcknowledged
              ? "secondary"
              : canSendAgent && !agentPanelOpen
                ? "brand"
                : "secondary"
          }
          disabled={!canSendAgent || agentShareUrl == null}
          onClick={() => setAgentPanelOpen((v) => !v)}
          className="gap-1.5"
        >
          {agentAcknowledged ? (
            <Check className="size-3.5 text-brand-700" />
          ) : (
            <Mail className="size-3.5" />
          )}
          {agentPanelOpen
            ? agentAcknowledged
              ? "Hide settlement"
              : "Hide agent link"
            : agentAcknowledged
              ? "View Settlement"
              : "Send to agent for review"}
        </Button>
      </div>
      {agentPanelOpen && agentShareUrl && (
        <ShareLinkPanel
          url={agentShareUrl}
          copied={agentCopied}
          onCopy={() => copyTo(agentShareUrl, setAgentCopied)}
          onClose={() => setAgentPanelOpen(false)}
          eyebrow={
            agentAcknowledged
              ? `Agent settlement preview · acknowledged${
                  agentSignoffByName ? ` · ${agentSignoffByName}` : ""
                }${agentSignoffAt ? ` · ${formatTime(agentSignoffAt)}` : ""}`
              : agentSignoffStatus === "questions"
                ? `Agent settlement preview · disputed${
                    agentSignoffByName ? ` · ${agentSignoffByName}` : ""
                  }`
                : "Agent settlement preview"
          }
          helpText={
            agentAcknowledged
              ? "Already signed off — open the URL or copy it for the record. The agent's view is read-only on their end."
              : agentSignoffStatus === "questions"
                ? "Resolve the dispute on your side, then re-share the same URL — the agent picks up where they left off."
                : "Email or text this to the agent. They'll see a read-only one-pager and can acknowledge or dispute."
          }
          tone="agent"
        />
      )}

      {agentResponded && (
        <div
          className={cn(
            "px-5 py-3 flex items-start gap-3 border-b border-ink-100",
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

      {/* CTA row 4 — GM wire approval (gated on agent acknowledgement) */}
      {(agentAcknowledged || gmApproved || gmHeld) && (
        <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12px] text-ink-600 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex size-5 rounded-full items-center justify-center text-[11px] font-medium",
                gmApproved
                  ? "bg-brand-100 text-brand-800"
                  : canSendGm
                    ? "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
                    : "bg-ink-100 text-ink-500",
              )}
            >
              {gmApproved ? <Check className="size-3" /> : "4"}
            </span>
            <span>
              {gmApproved
                ? "GM approved · wire scheduled"
                : gmHeld
                  ? "GM placed wire on hold"
                  : "Send to GM for wire approval"}
            </span>
          </div>
          <Button
            variant={
              canSendGm && !gmPanelOpen && !gmApproved ? "brand" : "secondary"
            }
            disabled={!canSendGm || gmApprovalUrl == null || gmApproved}
            onClick={() => setGmPanelOpen((v) => !v)}
            className="gap-1.5"
          >
            <ShieldCheck className="size-3.5" />
            {gmApproved
              ? "Approved"
              : gmPanelOpen
                ? "Hide GM link"
                : "Send to GM for wire approval"}
          </Button>
        </div>
      )}
      {gmPanelOpen && gmApprovalUrl && !gmApproved && (
        <ShareLinkPanel
          url={gmApprovalUrl}
          copied={gmCopied}
          onCopy={() => copyTo(gmApprovalUrl, setGmCopied)}
          onClose={() => setGmPanelOpen(false)}
          eyebrow="GM wire approval"
          helpText="Text this to the GM. They'll see the totals + approval context and click Approve to release the wire."
          tone="gm"
        />
      )}

      {gmHeld && gmHoldReason && (
        <div className="px-5 py-3 flex items-start gap-3 bg-amber-50/60 border-b border-ink-100">
          <HelpCircle className="size-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[12.5px] font-medium text-amber-900">
              GM placed wire on hold
              {gmHeldAt && (
                <span className="text-ink-500 font-normal ml-1">
                  · {formatTime(gmHeldAt)}
                </span>
              )}
            </div>
            <div className="text-[11.5px] text-ink-700 mt-1 italic">
              “{gmHoldReason}”
            </div>
          </div>
        </div>
      )}

      {gmApproved && (
        <div className="px-5 py-3 flex items-start gap-3 bg-brand-50/60">
          <Check className="size-4 text-brand-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[12.5px] font-medium text-brand-900">
              Paid · approved by Marcus Chen, GM, The Crescent
              {gmApprovedAt && (
                <span className="text-ink-500 font-normal ml-1">
                  · {formatTime(gmApprovedAt)}
                </span>
              )}
            </div>
            <div className="text-[11.5px] text-brand-700/80 mt-0.5">
              Wire scheduled for release
            </div>
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
  tone?: "pm" | "agent" | "gm";
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
          : tone === "gm"
            ? "border-emerald-100 bg-emerald-50/40"
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
          tone === "agent"
            ? "border-sky-200"
            : tone === "gm"
              ? "border-emerald-200"
              : "border-brand-200",
        )}
      />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div
          className={cn(
            "text-[11px] uppercase tracking-wider font-medium",
            tone === "agent"
              ? "text-sky-800"
              : tone === "gm"
                ? "text-emerald-800"
                : "text-brand-800",
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
