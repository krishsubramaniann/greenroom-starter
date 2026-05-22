import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  shareLinks,
  settlements,
  shows,
  artists,
  venues,
  deals,
} from "@/db/schema";
import {
  calculateSettlementV2,
  type SettlementResultV2,
} from "@/lib/dealMathV2";
import {
  ticketSales as ticketSalesTable,
  expenses as expensesTable,
  comps as compsTable,
} from "@/db/schema";
import { GmApprovalView } from "./GmApprovalView";

/**
 * /m/gm-approve/[token]
 *
 * GM mobile approval surface. Token resolves to a gm_approval share_link
 * whose resourceId is a settlement.id. Higher-level than the agent
 * surface — GM sees totals + approval context, not the line-by-line trace.
 */
export default async function GmApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.id, token),
        eq(shareLinks.resourceType, "gm_approval"),
      ),
    );
  if (!link) notFound();

  const [settlement] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.id, link.resourceId));
  if (!settlement) notFound();

  const [show] = await db
    .select()
    .from(shows)
    .where(eq(shows.id, settlement.showId));
  if (!show) notFound();

  const [artist] = await db
    .select()
    .from(artists)
    .where(eq(artists.id, show.artistId));
  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, show.venueId));
  const [deal] = await db
    .select()
    .from(deals)
    .where(eq(deals.showId, show.id));
  if (!deal) notFound();

  const [ticketSales, expenses, compsList] = await Promise.all([
    db
      .select()
      .from(ticketSalesTable)
      .where(eq(ticketSalesTable.showId, show.id)),
    db.select().from(expensesTable).where(eq(expensesTable.showId, show.id)),
    db.select().from(compsTable).where(eq(compsTable.showId, show.id)),
  ]);

  const result: SettlementResultV2 = calculateSettlementV2({
    deal,
    ticketSales,
    expenses,
    comps: compsList,
    venueCapacity: 650,
  });

  // Agent signoff context for the approval-context checklist.
  const [agentShareLink] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.resourceType, "settlement"),
        eq(shareLinks.resourceId, settlement.id),
      ),
    );

  return (
    <GmApprovalView
      token={token}
      show={show}
      artist={artist}
      venue={venue}
      deal={deal}
      settlement={settlement}
      result={result}
      agentSignoffByName={agentShareLink?.signoffByName ?? null}
      agentSignoffAt={agentShareLink?.signoffAt ?? null}
      initialApprovedAt={settlement.gmApprovedAt ?? null}
      initialHeldAt={settlement.gmHeldAt ?? null}
      initialHoldReason={settlement.gmHoldReason ?? null}
    />
  );
}
