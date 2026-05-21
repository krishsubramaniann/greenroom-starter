"use client";

import { useState } from "react";
import {
  Settings,
  Mail,
  Receipt,
  Check,
  Briefcase,
  User,
  Circle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityEvent as ActivityEventRow } from "@/db/schema";

type EventCategory = "system" | "external" | "capture" | "ack" | "approval" | "agent" | "default";

function categorize(e: ActivityEventRow): EventCategory {
  if (e.actorType === "system") return "system";
  if (
    e.eventType === "email_received" ||
    e.eventType === "email_sent" ||
    e.eventType === "confirmation_sent"
  )
    return "external";
  if (e.eventType === "expense_logged" || e.eventType === "ticket_milestone")
    return "capture";
  if (
    e.eventType === "trace_line_acked" ||
    e.eventType === "walkthrough_completed" ||
    e.eventType === "ambiguity_resolved" ||
    e.eventType === "deal_locked"
  )
    return "ack";
  if (
    e.eventType === "gm_approved" ||
    e.eventType === "wire_sent" ||
    e.eventType === "settlement_paid"
  )
    return "approval";
  if (
    e.eventType === "agent_commented" ||
    e.eventType === "agent_opened" ||
    e.eventType === "agent_signed_off" ||
    e.eventType === "agent_questioned"
  )
    return "agent";
  return "default";
}

const CATEGORY_STYLES: Record<
  EventCategory,
  { icon: React.ComponentType<{ className?: string }>; ring: string; bg: string; fg: string }
> = {
  system: {
    icon: Settings,
    ring: "ring-ink-200/80",
    bg: "bg-ink-50",
    fg: "text-ink-700",
  },
  external: {
    icon: Mail,
    ring: "ring-sky-200/80",
    bg: "bg-sky-50",
    fg: "text-sky-800",
  },
  capture: {
    icon: Receipt,
    ring: "ring-brand-200/80",
    bg: "bg-brand-50",
    fg: "text-brand-800",
  },
  ack: {
    icon: Check,
    ring: "ring-brand-200/80",
    bg: "bg-brand-50",
    fg: "text-brand-800",
  },
  approval: {
    icon: Briefcase,
    ring: "ring-brand-200/80",
    bg: "bg-brand-50",
    fg: "text-brand-900",
  },
  agent: {
    icon: User,
    ring: "ring-sky-200/80",
    bg: "bg-sky-50",
    fg: "text-sky-800",
  },
  default: {
    icon: Circle,
    ring: "ring-ink-200/80",
    bg: "bg-white",
    fg: "text-ink-700",
  },
};

function formatTimestamp(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prettyPayload(json: string | null): string | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return json;
  }
}

type Props = {
  event: ActivityEventRow;
  expandable?: boolean;
};

export function ActivityEvent({ event, expandable = true }: Props) {
  const category = categorize(event);
  const style = CATEGORY_STYLES[category];
  const Icon = style.icon;
  const [open, setOpen] = useState(false);
  const payloadText = prettyPayload(event.payloadJson);
  const hasDetail = expandable && payloadText;

  return (
    <li className="flex items-start gap-3 px-4 py-3 border-b border-ink-100 last:border-b-0">
      <div
        className={cn(
          "size-7 rounded-md flex items-center justify-center shrink-0 ring-1 ring-inset",
          style.bg,
          style.ring,
        )}
      >
        <Icon className={cn("size-3.5", style.fg)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10.5px] text-ink-500 font-mono shrink-0">
            {formatTimestamp(event.occurredAt)}
          </span>
          <span className="text-[12px] font-medium text-ink-900">
            {event.actorName}
          </span>
          {event.actorRole && (
            <span className="text-[10.5px] text-ink-500">· {event.actorRole}</span>
          )}
        </div>
        <div className="text-[12.5px] text-ink-800 mt-0.5 leading-snug">
          {event.summary}
        </div>
        {hasDetail && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1 text-[11px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1"
          >
            {open ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
            {open ? "Hide payload" : "Show payload"}
          </button>
        )}
        {open && payloadText && (
          <pre className="mt-2 px-3 py-2 bg-ink-50 rounded text-[10.5px] text-ink-700 font-mono whitespace-pre-wrap break-words leading-relaxed">
            {payloadText}
          </pre>
        )}
      </div>
    </li>
  );
}
