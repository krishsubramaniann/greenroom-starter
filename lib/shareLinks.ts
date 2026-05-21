/**
 * Server-side helpers for the agent magic-link surfaces.
 *
 * Centralizes the share-link → resource → agent resolution so the API
 * routes and the shared/deal + shared/settlement page components all
 * agree on actor attribution. Anything that needs to know "who is on
 * the other end of this magic link" calls resolveShareLinkContext.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  shareLinks,
  deals,
  settlements,
  shows,
  artists,
  agents,
  agencies,
  type ShareLink,
  type Deal,
  type Settlement,
  type Show,
  type Artist,
  type Agent,
  type Agency,
} from "@/db/schema";

export type ShareLinkContext = {
  link: ShareLink;
  resource:
    | { type: "deal"; deal: Deal }
    | { type: "settlement"; settlement: Settlement; deal: Deal };
  show: Show;
  artist: Artist;
  agent: Agent | null;
  agency: Agency | null;
};

/**
 * Resolve a share-link token into the full resource graph + the agent
 * identity that signed-off / commented attribution should fall back to.
 * Returns null if the token doesn't exist or the underlying resource is
 * orphaned — callers should `notFound()` in that case.
 */
export async function resolveShareLinkContext(
  token: string,
  expectedType?: "deal" | "settlement",
): Promise<ShareLinkContext | null> {
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.id, token));
  if (!link) return null;
  if (expectedType && link.resourceType !== expectedType) return null;

  let showId: string;
  let resource: ShareLinkContext["resource"];

  if (link.resourceType === "deal") {
    const [deal] = await db.select().from(deals).where(eq(deals.id, link.resourceId));
    if (!deal) return null;
    showId = deal.showId;
    resource = { type: "deal", deal };
  } else {
    const [settlement] = await db
      .select()
      .from(settlements)
      .where(eq(settlements.id, link.resourceId));
    if (!settlement) return null;
    showId = settlement.showId;
    const [deal] = await db.select().from(deals).where(eq(deals.showId, showId));
    if (!deal) return null;
    resource = { type: "settlement", settlement, deal };
  }

  const [show] = await db.select().from(shows).where(eq(shows.id, showId));
  if (!show) return null;
  const [artist] = await db
    .select()
    .from(artists)
    .where(eq(artists.id, show.artistId));
  if (!artist) return null;

  let agent: Agent | null = null;
  let agency: Agency | null = null;
  if (artist.agentId) {
    const [a] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, artist.agentId));
    agent = a ?? null;
    if (agent?.agencyId) {
      const [g] = await db
        .select()
        .from(agencies)
        .where(eq(agencies.id, agent.agencyId));
      agency = g ?? null;
    }
  }

  return { link, resource, show, artist, agent, agency };
}

/** Resolve a display name + role for the agent on this share link. */
export function agentAttribution(ctx: ShareLinkContext): {
  name: string;
  role: string;
} {
  const name = ctx.agent?.name ?? ctx.link.signoffByName ?? "Agent";
  const role = ctx.agency ? `Agent (${ctx.agency.name})` : "Agent";
  return { name, role };
}
