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

  const useV2 = data.deal?.confirmedAt != null;

  return useV2 ? (
    <SettlePageV2 data={data} searchParams={sp} />
  ) : (
    <SettlePageLegacy data={data} />
  );
}
