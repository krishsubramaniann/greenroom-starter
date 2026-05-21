import { notFound } from "next/navigation";
import { eq, asc, like, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  shareLinks,
  clauseComments,
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

  // Trace-line questions (clauseRef = "trace.<step_key>") + general deal comments.
  const traceCommentsRaw = await db
    .select()
    .from(clauseComments)
    .where(
      and(
        eq(clauseComments.dealId, deal.id),
        like(clauseComments.clauseRef, "trace.%"),
      ),
    );

  // Activity log — every event for this show, ordered chronologically.
  const activity = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.showId, ctx.show.id))
    .orderBy(asc(activityEvents.occurredAt));

  // First-touch
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
      traceComments={traceCommentsRaw.map((c) => ({
        id: c.id,
        clauseRef: c.clauseRef,
        actorName: c.actorName,
        actorType: c.actorType as "user" | "agent" | "tour_manager",
        body: c.body,
        channel: c.channel,
        createdAt: c.createdAt,
      }))}
      activity={activity.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        actorType: e.actorType,
        actorName: e.actorName,
        actorRole: e.actorRole,
        summary: e.summary,
        occurredAt: e.occurredAt,
      }))}
      signoffStatus={ctx.link.signoffStatus}
      signoffText={ctx.link.signoffText}
      signoffByName={ctx.link.signoffByName}
      signoffAt={ctx.link.signoffAt}
    />
  );
}
