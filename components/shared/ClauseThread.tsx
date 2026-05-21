"use client";

/**
 * Shared inline comment thread for a single clause (deal field or trace step).
 *
 * Used by:
 *   - DealConfirmation (agent surface) — readOnly=false, allows posting
 *   - DealCaptureFlow / SettlePageV2 (Mariana surfaces) — readOnly=true,
 *     just shows the agent's comments
 *
 * The component owns local optimistic state for fresh posts. Server data is
 * passed in as `initialComments`; subsequent posts are appended to the local
 * list and persisted via `onPost`.
 */

import { useState } from "react";
import { MessageSquare, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ClauseThreadComment = {
  id: string;
  actorName: string;
  actorType: "user" | "agent" | "tour_manager";
  body: string;
  channel: string;
  createdAt: Date | string;
};

type Props = {
  clauseRef: string;
  initialComments: ClauseThreadComment[];
  readOnly?: boolean;
  /** Used when readOnly is false. Returns the persisted comment so optimistic
   * updates can be replaced with the canonical version. */
  onPost?: (body: string) => Promise<ClauseThreadComment | null>;
  /** When true, render only the count badge (lets the parent own expansion). */
  badgeOnly?: boolean;
  className?: string;
};

const ACTOR_TONE: Record<
  ClauseThreadComment["actorType"],
  { bg: string; ring: string; fg: string }
> = {
  agent: { bg: "bg-sky-50", ring: "ring-sky-200/80", fg: "text-sky-900" },
  user: { bg: "bg-brand-50", ring: "ring-brand-200/80", fg: "text-brand-900" },
  tour_manager: { bg: "bg-amber-50", ring: "ring-amber-200/80", fg: "text-amber-900" },
};

function formatTimestamp(t: Date | string): string {
  const d = typeof t === "string" ? new Date(t) : t;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ClauseThread({
  clauseRef,
  initialComments,
  readOnly = false,
  onPost,
  badgeOnly = false,
  className,
}: Props) {
  const [comments, setComments] = useState<ClauseThreadComment[]>(initialComments);
  const [open, setOpen] = useState(comments.length > 0 && !badgeOnly);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  async function handlePost() {
    if (!draft.trim() || !onPost) return;
    setPosting(true);
    const optimistic: ClauseThreadComment = {
      id: `tmp_${Date.now()}`,
      actorName: "You",
      actorType: "agent",
      body: draft.trim(),
      channel: "magic_link_inline",
      createdAt: new Date(),
    };
    setComments((prev) => [...prev, optimistic]);
    const saved = draft.trim();
    setDraft("");
    try {
      const persisted = await onPost(saved);
      if (persisted) {
        setComments((prev) =>
          prev.map((c) => (c.id === optimistic.id ? persisted : c)),
        );
      }
    } catch {
      // Rollback the optimistic add
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      setDraft(saved);
    } finally {
      setPosting(false);
    }
  }

  if (badgeOnly) {
    if (comments.length === 0) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium",
          "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200/80",
          "hover:bg-sky-100 transition-colors",
          className,
        )}
        aria-label={`${comments.length} comment${comments.length === 1 ? "" : "s"} on ${clauseRef}`}
      >
        <MessageSquare className="size-2.5" />
        {comments.length}
      </button>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {comments.length > 0 || !readOnly ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] text-ink-500 hover:text-ink-800"
        >
          <MessageSquare className="size-3" />
          {comments.length === 0
            ? "Add a comment"
            : `${comments.length} comment${comments.length === 1 ? "" : "s"}`}
          {open ? " ·  hide" : ""}
        </button>
      ) : null}
      {open && (
        <div className="space-y-2 pl-1">
          {comments.map((c) => {
            const tone = ACTOR_TONE[c.actorType] ?? ACTOR_TONE.user;
            return (
              <div
                key={c.id}
                className={cn(
                  "rounded-md px-3 py-2 ring-1 ring-inset text-[12px]",
                  tone.bg,
                  tone.ring,
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-1.5 text-[10.5px] font-medium",
                    tone.fg,
                  )}
                >
                  <User className="size-2.5" />
                  {c.actorName}
                  <span className="text-ink-500 font-normal">
                    · {formatTimestamp(c.createdAt)}
                    {c.channel === "email_reply" && " · via email"}
                  </span>
                </div>
                <p className="mt-1 text-ink-800 whitespace-pre-wrap leading-relaxed">
                  {c.body}
                </p>
              </div>
            );
          })}
          {!readOnly && (
            <div className="flex gap-2 items-start pt-1">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="Leave a comment on this clause…"
                className="flex-1 px-3 py-2 text-[12px] rounded border border-ink-200 resize-none focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <Button
                onClick={handlePost}
                disabled={posting || !draft.trim()}
                size="sm"
                variant="brand"
                className="gap-1.5 shrink-0"
              >
                <Send className="size-3" />
                {posting ? "Posting…" : "Post"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
