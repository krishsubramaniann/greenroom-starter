"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  X,
  Copy,
  Check,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  showId: string;
  shareUrl: string;          // /shared/settlement/<token>
  isWalkthroughActive: boolean;
};

export function SettleActionBar({
  showId,
  shareUrl,
  isWalkthroughActive,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function toggleWalkthrough() {
    const p = new URLSearchParams(searchParams);
    if (isWalkthroughActive) {
      p.delete("walkthrough");
    } else {
      p.set("walkthrough", "1");
    }
    router.push(`/shows/${showId}/settle?${p.toString()}`);
  }

  async function handleCopy() {
    const fullUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${shareUrl}`
        : shareUrl;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-ink-200/80">
        <div className="max-w-7xl mx-auto px-12 py-3 flex items-center justify-between gap-3">
          <div className="text-[11px] text-ink-500">
            {isWalkthroughActive
              ? "Walkthrough mode active — each line shows an ack toggle."
              : "Review the trace, then walk it with the TM or share with the agent."}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={isWalkthroughActive ? "brand" : "secondary"}
              onClick={toggleWalkthrough}
              className="gap-1.5"
            >
              <ScanLine className="size-3.5" />
              {isWalkthroughActive ? "Exit walkthrough" : "Walkthrough mode"}
            </Button>
            <Button
              variant="default"
              onClick={() => setShareOpen(true)}
              className="gap-1.5"
            >
              <Eye className="size-3.5" /> Send to agent for preview
            </Button>
          </div>
        </div>
      </div>

      {shareOpen && (
        <div className="fixed inset-0 z-50 bg-ink-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-5 py-3 border-b border-ink-200 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-500">
                  Agent preview link
                </div>
                <div className="text-[13px] font-medium text-ink-900 mt-0.5">
                  Magic-link · settlement
                </div>
              </div>
              <button
                onClick={() => setShareOpen(false)}
                className="text-ink-500 hover:text-ink-800"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-md border border-ink-200 bg-ink-50/60 px-3 py-2 font-mono text-[12px] text-ink-700 break-all">
                {shareUrl}
              </div>
              <p className="text-[11px] text-ink-500">
                The agent sees the same trace + deal terms, read-only, with{" "}
                <em>I agree</em> / <em>I have questions</em> on the bottom.
                Resolved upstream → no surprises at signoff.
              </p>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" onClick={() => setShareOpen(false)}>
                  Close
                </Button>
                <Link href={shareUrl} target="_blank" rel="noreferrer">
                  <Button variant="secondary" className="gap-1.5">
                    Open preview
                  </Button>
                </Link>
                <Button
                  variant="brand"
                  onClick={handleCopy}
                  className="gap-1.5"
                >
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
