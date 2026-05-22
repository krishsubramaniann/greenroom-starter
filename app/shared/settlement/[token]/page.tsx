import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  shareLinks,
  activityEvents,
  ticketSales as ticketSalesTable,
  expenses as expensesTable,
  comps as compsTable,
} from "@/db/schema";
import {
  resolveShareLinkContext,
  agentAttribution,
} from "@/lib/shareLinks";
import { calculateSettlementV2 } from "@/lib/dealMathV2";
import { AgentArtifact } from "./AgentArtifact";
import type { DetailsExpense } from "@/app/shows/[id]/settle/SettlementDetails";

export default async function SettlementSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await resolveShareLinkContext(token, "settlement");
  if (!ctx || ctx.resource.type !== "settlement") notFound();

  const { settlement, deal } = ctx.resource;
  const { name: agentName, role: agentRole } = agentAttribution(ctx);

  const [ticketSales, expenses, compsList] = await Promise.all([
    db.select().from(ticketSalesTable).where(eq(ticketSalesTable.showId, ctx.show.id)),
    db.select().from(expensesTable).where(eq(expensesTable.showId, ctx.show.id)),
    db.select().from(compsTable).where(eq(compsTable.showId, ctx.show.id)),
  ]);

  const result = calculateSettlementV2({
    deal,
    ticketSales,
    expenses,
    comps: compsList,
    venueCapacity: 650,
  });

  const initialExpenses: DetailsExpense[] = expenses.map((e) => ({
    id: e.id,
    category: e.category,
    amount: e.amount,
    description: e.description,
    approved: e.approved,
    absorbedByVenue: e.absorbedByVenue,
    source: (e.source ?? "manual") as "manual" | "pm_mobile",
    enteredAt: e.enteredAt.toISOString(),
    enteredByUserId: e.enteredByUserId,
    receiptPath: e.receiptPath ?? null,
  }));

  // First-touch: stamp accessedAt + write agent_opened
  if (!ctx.link.accessedAt) {
    const now = new Date();
    await db
      .update(shareLinks)
      .set({ accessedAt: now })
      .where(eq(shareLinks.id, token));
    await db.insert(activityEvents).values({
      id: `ae_${randomUUID()}`,
      dealId: deal.externalId,
      showId: ctx.show.id,
      settlementId: settlement.id,
      eventType: "agent_opened",
      actorType: "agent",
      actorName: agentName,
      actorRole: agentRole,
      summary: `${agentName} opened settlement preview link`,
      payloadJson: JSON.stringify({ via: "magic_link", resource: "settlement" }),
      occurredAt: now,
    });
  }

  return (
    <AgentArtifact
      token={token}
      deal={deal}
      show={ctx.show}
      artist={ctx.artist}
      settlement={settlement}
      result={result}
      agentName={agentName}
      agencyName={ctx.agency?.name ?? null}
      ticketSales={ticketSales}
      comps={compsList}
      initialExpenses={initialExpenses}
      signoffStatus={ctx.link.signoffStatus}
      signoffText={ctx.link.signoffText}
      signoffByName={ctx.link.signoffByName}
      signoffAt={ctx.link.signoffAt}
    />
  );
}
