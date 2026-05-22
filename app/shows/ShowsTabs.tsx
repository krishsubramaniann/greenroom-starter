"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Sub-tab nav between the live shows list and the Phase 9 Deal Types
 * gallery. Sits below the page header on both /shows and
 * /shows/deal-types. Active state derived from pathname.
 */
const tabs = [
  { href: "/shows", label: "All Shows" },
  { href: "/shows/deal-types", label: "Deal Types" },
] as const;

export function ShowsTabs() {
  const pathname = usePathname();
  return (
    <div className="border-b border-ink-200/80 -mt-6 mb-10">
      <nav className="flex items-center gap-1">
        {tabs.map((t) => {
          const active =
            t.href === "/shows"
              ? pathname === "/shows"
              : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-brand-700 text-ink-900"
                  : "border-transparent text-ink-500 hover:text-ink-800",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
