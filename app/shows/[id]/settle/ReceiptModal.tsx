"use client";

/**
 * Receipt lightbox — opens when Mariana clicks [📎 View receipt] on an
 * expense row in Section B. Displays the canned SVG image (rendered as
 * an <img> for native zoom + accessibility) alongside expense metadata.
 * ESC, backdrop click, or [×] closes the modal.
 */

import { useEffect } from "react";
import { Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

const CATEGORY_LABELS: Record<string, string> = {
  sound: "Sound",
  production: "Production",
  lights: "Lights",
  hospitality: "Hospitality",
  marketing: "Marketing",
  backline: "Backline",
  security: "Security",
  other: "Other",
};

export type ReceiptModalData = {
  receiptPath: string;
  vendor: string;
  amount: number;
  category: string;
  submittedBy: string;
  submittedAt: string;
};

type Props = {
  data: ReceiptModalData | null;
  onClose: () => void;
};

export function ReceiptModal({ data, onClose }: Props) {
  useEffect(() => {
    if (!data) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [data, onClose]);

  if (!data) return null;

  const submittedAt = new Date(data.submittedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Receipt for ${data.vendor}`}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-ink-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Paperclip className="size-4 text-ink-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
                Receipt
              </div>
              <div className="text-[13px] font-medium text-ink-900 truncate mt-0.5">
                {data.vendor}
                <span className="text-ink-500 font-normal">
                  {" "}
                  · {formatMoney(data.amount)}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-500 hover:text-ink-800 p-1"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 bg-ink-50/40">
          <div className="max-w-md mx-auto bg-white rounded shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.receiptPath}
              alt={`Receipt for ${data.vendor}`}
              className="w-full h-auto block"
            />
          </div>
        </div>

        <footer
          className={cn(
            "px-5 py-3 border-t border-ink-200 grid grid-cols-2 gap-3 text-[11.5px]",
          )}
        >
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
              Category
            </div>
            <div className="text-ink-900 mt-0.5">
              {CATEGORY_LABELS[data.category] ?? data.category}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
              Submitted
            </div>
            <div className="text-ink-900 mt-0.5">
              {data.submittedBy} · {submittedAt}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
