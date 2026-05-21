import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { shareLinks, clauseComments, activityEvents } from "@/db/schema";
import {
  resolveShareLinkContext,
  agentAttribution,
} from "@/lib/shareLinks";
import { DealConfirmation } from "./DealConfirmation";

export default async function DealSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await resolveShareLinkContext(token, "deal");
  if (!ctx) notFound();

  const deal =
    ctx.resource.type === "deal" ? ctx.resource.deal : ctx.resource.deal;
  const { name: agentName, role: agentRole } = agentAttribution(ctx);

  const comments = await db
    .select()
    .from(clauseComments)
    .where(eq(clauseComments.dealId, deal.id));

  // First-touch: write agent_opened + stamp accessedAt
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
      eventType: "agent_opened",
      actorType: "agent",
      actorName: agentName,
      actorRole: agentRole,
      summary: `${agentName} opened deal confirmation link`,
      payloadJson: JSON.stringify({ via: "magic_link", resource: "deal" }),
      occurredAt: now,
    });
  }

  return (
    <DealConfirmation
      token={token}
      deal={deal}
      show={ctx.show}
      artist={ctx.artist}
      agentName={agentName}
      agencyName={ctx.agency?.name ?? null}
      comments={comments.map((c) => ({
        id: c.id,
        clauseRef: c.clauseRef,
        actorName: c.actorName,
        actorType: c.actorType as "user" | "agent" | "tour_manager",
        body: c.body,
        channel: c.channel,
        createdAt: c.createdAt,
      }))}
      signoffStatus={ctx.link.signoffStatus}
      signoffText={ctx.link.signoffText}
      signoffByName={ctx.link.signoffByName}
      signoffAt={ctx.link.signoffAt}
    />
  );
}
