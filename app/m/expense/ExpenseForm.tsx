"use client";

/**
 * Mobile expense form. Single screen, thumb-friendly. After a successful
 * submit the form resets and a "Logged ✓ · N receipts so far" toast fades
 * over ~3s. The receipt photo is captured by filename only — the demo
 * doesn't persist the file itself (no storage backend).
 */

import { useState } from "react";
import { Camera, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Category = "sound" | "hospitality" | "security" | "production" | "other";

const CATEGORY_OPTIONS: Array<{ value: Category; label: string }> = [
  { value: "sound", label: "Sound tech" },
  { value: "hospitality", label: "Hospitality" },
  { value: "security", label: "Security" },
  { value: "production", label: "Production" },
  { value: "other", label: "Other" },
];

type Props = {
  token: string;
  showId: string;
  artistName: string;
  initialCount: number;
  initialFinalizedAt: string | null;
};

export function ExpenseForm({
  token,
  showId,
  artistName,
  initialCount,
  initialFinalizedAt,
}: Props) {
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("sound");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(initialCount);
  const [showToast, setShowToast] = useState(false);
  /** "form" = normal entry mode. "done" = finalized; collapse to a thank-
   *  you screen with a "Need to add one more?" escape hatch. */
  const [mode, setMode] = useState<"form" | "done">(
    initialFinalizedAt ? "done" : "form",
  );
  const [finalizing, setFinalizing] = useState(false);
  const [finalizedAt, setFinalizedAt] = useState<string | null>(
    initialFinalizedAt,
  );
  // Phase 8.9.6 — distinguish the two "we're done" paths so the
  // post-submit confirmation screen can show the right copy. Also
  // controls visibility of the "No expenses to report" CTA.
  const [noExpensesReported, setNoExpensesReported] = useState(false);

  const canSubmit =
    vendor.trim().length > 0 && parseFloat(amount) > 0 && !submitting;

  function reset() {
    setVendor("");
    setAmount("");
    setCategory("sound");
    setNotes("");
    setReceiptFile(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // FormData (not JSON) so the actual image bytes round-trip to the
      // server and end up under /public/uploads/. No file attached →
      // server falls back to a canned SVG by category.
      const fd = new FormData();
      fd.append("token", token);
      fd.append("vendor", vendor.trim());
      fd.append("amount", String(parseFloat(amount)));
      fd.append("category", category);
      if (notes.trim()) fd.append("notes", notes.trim());
      if (receiptFile) fd.append("receipt", receiptFile);

      const res = await fetch("/api/log-expense", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Submit failed: ${res.status}`);
      }
      reset();
      setCount((c) => c + 1);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinalize() {
    if (count === 0 || finalizing) return;
    setFinalizing(true);
    setError(null);
    try {
      const res = await fetch("/api/finalize-pm-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, showId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Finalize failed");
      }
      const data = await res.json();
      setFinalizedAt(data.finalizedAt);
      setMode("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Finalize failed");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleNoExpenses() {
    if (count !== 0 || finalizing) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Confirm: no operational expenses for this show. This will signal Mariana that you're done — same as clicking Expense Finalized after submitting expenses. Continue?",
      )
    ) {
      return;
    }
    setFinalizing(true);
    setError(null);
    try {
      const res = await fetch("/api/finalize-pm-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, showId, noExpensesToReport: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Finalize failed");
      }
      const data = await res.json();
      setFinalizedAt(data.finalizedAt);
      setNoExpensesReported(true);
      setMode("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Finalize failed");
    } finally {
      setFinalizing(false);
    }
  }

  // Done mode: thank-you screen with "Need to add one more?" escape hatch.
  if (mode === "done") {
    const wasNoExpensesPath = noExpensesReported || (count === 0 && finalizedAt);
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-brand-700/40 bg-brand-900/30 px-5 py-6 text-center">
          <div className="inline-flex items-center justify-center size-12 rounded-full bg-brand-600 text-white">
            <Check className="size-6" />
          </div>
          <div className="text-[17px] text-white font-medium mt-3">
            {wasNoExpensesPath
              ? "Confirmed — no expenses for this show"
              : "Submitted to Mariana for review"}
          </div>
          <div className="text-[12px] text-ink-300 mt-1">
            {wasNoExpensesPath
              ? "Mariana has been notified."
              : `${count} receipt${count === 1 ? "" : "s"} logged · You're done — thanks!`}
          </div>
          {finalizedAt && (
            <div className="text-[10.5px] text-ink-500 mt-2 font-mono">
              {new Date(finalizedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMode("form")}
          className="w-full text-[12.5px] text-ink-400 hover:text-white underline underline-offset-2"
        >
          Need to add one more? Re-open the form
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Vendor" htmlFor="vendor">
        <input
          id="vendor"
          type="text"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          autoComplete="off"
          placeholder="The Bluebird Cafe"
          className="w-full h-11 px-3 rounded-lg bg-ink-800 text-white text-[15px] border border-ink-700 placeholder-ink-500 focus:outline-none focus:border-brand-400"
        />
      </Field>

      <Field label="Amount" htmlFor="amount">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[15px]">
            $
          </span>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full h-11 pl-7 pr-3 rounded-lg bg-ink-800 text-white text-[15px] border border-ink-700 placeholder-ink-500 focus:outline-none focus:border-brand-400"
          />
        </div>
      </Field>

      <Field label="Category" htmlFor="category">
        <div className="grid grid-cols-2 gap-2">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCategory(opt.value)}
              className={cn(
                "h-11 rounded-lg text-[13px] font-medium border transition-colors",
                category === opt.value
                  ? "border-brand-400 bg-brand-700/30 text-white"
                  : "border-ink-700 bg-ink-800 text-ink-300",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Receipt photo" htmlFor="receipt">
        <label
          htmlFor="receipt"
          className={cn(
            "flex items-center gap-2 h-11 px-3 rounded-lg border border-dashed cursor-pointer transition-colors",
            receiptFile
              ? "border-brand-400 bg-brand-700/20 text-white"
              : "border-ink-600 bg-ink-800/60 text-ink-400",
          )}
        >
          <Camera className="size-4" />
          <span className="text-[13px] truncate">
            {receiptFile
              ? `${receiptFile.name} · ${(receiptFile.size / 1024).toFixed(0)} KB`
              : "Tap to attach (optional)"}
          </span>
        </label>
        <input
          id="receipt"
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setReceiptFile(f ?? null);
          }}
        />
      </Field>

      <Field label="Notes (optional)" htmlFor="notes">
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Anything Mariana should know?"
          className="w-full px-3 py-2 rounded-lg bg-ink-800 text-white text-[14px] border border-ink-700 placeholder-ink-500 focus:outline-none focus:border-brand-400 resize-none"
        />
      </Field>

      {error && (
        <div className="text-[12px] text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className={cn(
          "w-full h-12 rounded-lg text-[15px] font-medium flex items-center justify-center gap-2 transition-colors",
          canSubmit
            ? "bg-brand-600 hover:bg-brand-500 text-white"
            : "bg-ink-700 text-ink-500",
        )}
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Sending to Mariana…
          </>
        ) : (
          <>Log expense for {artistName}</>
        )}
      </button>

      <div
        className={cn(
          "transition-opacity duration-500",
          showToast ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <div className="flex items-center gap-2 rounded-lg bg-brand-900/40 border border-brand-700 text-brand-100 px-3 py-2 text-[13px]">
          <Check className="size-4 text-brand-300" />
          Logged ✓ · {count} expense{count === 1 ? "" : "s"} so far
        </div>
      </div>

      {/* Session-end action — disabled until at least one expense submitted. */}
      <div className="pt-3 border-t border-ink-800">
        <div className="text-[10.5px] uppercase tracking-wider text-ink-400 font-medium mb-1.5">
          Done logging?
        </div>
        <p className="text-[12px] text-ink-400 mb-2">
          Tap when every receipt is in. Mariana will get a banner saying
          you&apos;re ready for review.
        </p>
        <button
          type="button"
          onClick={handleFinalize}
          disabled={count === 0 || finalizing}
          className={cn(
            "w-full h-12 rounded-lg text-[14px] font-medium flex items-center justify-center gap-2 transition-colors",
            count > 0 && !finalizing
              ? "bg-brand-700 hover:bg-brand-600 text-white"
              : "bg-ink-800 text-ink-500",
          )}
        >
          {finalizing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Check className="size-4" />
              Expenses Finalized · Ready for Review
            </>
          )}
        </button>
      </div>

      {/* Phase 8.9.6 — no-expenses-to-report path. Only relevant before
           any expense has been submitted; once an expense exists, the
           normal Finalize path applies. */}
      {count === 0 && (
        <div className="pt-3 border-t border-ink-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-ink-700" />
            <span className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
              or
            </span>
            <div className="flex-1 h-px bg-ink-700" />
          </div>
          <p className="text-[12px] text-ink-400 mb-2">
            This show had no PM-logged expenses to report.
          </p>
          <button
            type="button"
            onClick={handleNoExpenses}
            disabled={finalizing}
            className={cn(
              "w-full h-11 rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 transition-colors border",
              finalizing
                ? "border-ink-700 bg-ink-800 text-ink-500"
                : "border-ink-700 bg-ink-900 hover:bg-ink-800 text-ink-200",
            )}
          >
            <Check className="size-4" />
            No expenses to report
          </button>
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[10.5px] uppercase tracking-wider text-ink-400 font-medium mb-1.5"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
