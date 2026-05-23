/**
 * Thin router for the settle page.
 *
 * Dispatches between the V2 implementation (when deal.confirmedAt is set) and
 * the legacy implementation (everything else). Both implementations live in
 * sibling files and accept a pre-loaded `data` object so the data fetch
 * happens once here.
 */
import { notFound } from "next/navigation";
import { getShowById } from "@/lib/queries";
import { SettlePageV2 } from "./SettlePageV2";
import { SettlePageLegacy } from "./SettlePageLegacy";

export default async function SettlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ walkthrough?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await getShowById(id);
  if (!data) notFound();

  // Route to V2 when the deal has been explicitly confirmed via the
  // capture flow, OR when the show is a view-only legacy artifact —
  // Phase 8.9.5 wants those rendered through V2's clean read-only
  // path rather than the SettlePageLegacy "vs deals not supported yet"
  // panel from the pre-V2 era.
  const useV2 =
    data.deal?.confirmedAt != null || data.show.isViewOnlyExample === true;

  return useV2 ? (
    <SettlePageV2 data={data} searchParams={sp} />
  ) : (
    <SettlePageLegacy data={data} />
  );
}
