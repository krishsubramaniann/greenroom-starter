import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { shareLinks, shows, artists, expenses } from "@/db/schema";
import { sql } from "drizzle-orm";
import { ExpenseForm } from "./ExpenseForm";

/**
 * /m/expense?token=<token>
 *
 * Mobile-optimized expense entry surface for the production manager. No
 * auth — the token is a pm_expense share_link generated server-side and
 * texted to the PM by Mariana. Token resolves to a showId; submissions go
 * to /api/log-expense.
 *
 * Renders a brief context header (artist, show date) so the PM can confirm
 * he's logging against the right show, then hands off to the client form.
 */
export default async function PmExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token;
  if (!token) notFound();

  const [link] = await db
    .select()
    .from(shareLinks)
    .where(
      and(eq(shareLinks.id, token), eq(shareLinks.resourceType, "pm_expense")),
    );
  if (!link) notFound();

  const [show] = await db.select().from(shows).where(eq(shows.id, link.resourceId));
  if (!show) notFound();
  const [artist] = await db
    .select()
    .from(artists)
    .where(eq(artists.id, show.artistId));

  // Count of expenses already on this show — initial value for the
  // "Logged ✓ · N receipts so far" success indicator.
  const countRows = await db
    .select({ n: sql<number>`count(*)`.as("n") })
    .from(expenses)
    .where(eq(expenses.showId, show.id));
  const initialCount = countRows[0]?.n ?? 0;

  return (
    <div className="min-h-screen bg-ink-900 text-white">
      <div className="mx-auto max-w-[420px] px-4 py-5">
        <div className="text-[10.5px] uppercase tracking-wider text-ink-400 font-medium">
          The Crescent · expense entry
        </div>
        <h1 className="text-[20px] font-display text-white mt-1 leading-tight">
          {artist?.name ?? "Show"} · {show.date}
        </h1>
        <p className="text-[12px] text-ink-400 mt-1">
          Log receipts as they happen. They show up on Mariana&apos;s settle
          screen instantly.
        </p>

        <div className="mt-6">
          <ExpenseForm
            token={token}
            artistName={artist?.name ?? "Show"}
            initialCount={initialCount}
          />
        </div>

        <div className="mt-6 text-[10.5px] text-ink-500">
          Logged in as Production manager — magic link, no password needed.
        </div>
      </div>
    </div>
  );
}
