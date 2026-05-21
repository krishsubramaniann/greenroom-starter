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
  artistName: string;
  initialCount: number;
};

export function ExpenseForm({ token, artistName, initialCount }: Props) {
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("sound");
  const [notes, setNotes] = useState("");
  const [receiptFilename, setReceiptFilename] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(initialCount);
  const [showToast, setShowToast] = useState(false);

  const canSubmit =
    vendor.trim().length > 0 && parseFloat(amount) > 0 && !submitting;

  function reset() {
    setVendor("");
    setAmount("");
    setCategory("sound");
    setNotes("");
    setReceiptFilename(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/log-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          vendor: vendor.trim(),
          amount: parseFloat(amount),
          category,
          notes: notes.trim() || undefined,
          receiptFilename,
        }),
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
            receiptFilename
              ? "border-brand-400 bg-brand-700/20 text-white"
              : "border-ink-600 bg-ink-800/60 text-ink-400",
          )}
        >
          <Camera className="size-4" />
          <span className="text-[13px] truncate">
            {receiptFilename ?? "Tap to attach"}
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
            setReceiptFilename(f ? f.name : null);
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
          Logged ✓ · {count} receipt{count === 1 ? "" : "s"} so far
        </div>
      </div>
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
