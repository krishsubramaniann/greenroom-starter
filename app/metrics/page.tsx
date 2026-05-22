import { generateMockShows } from "@/lib/metrics/generateMockShows";
import { MetricsDashboard } from "./MetricsDashboard";

/**
 * /metrics — Phase 9 KPI dashboard. The Q4 story: pre-V2 settlement was a
 * 4-hour ritual; post-V2 it's a 38-minute confirmation. Powered by the
 * deterministic mock-data generator in lib/metrics/generateMockShows.ts.
 *
 * Server component pre-renders the data and hands the array down to a
 * client dashboard that owns filter state. No DB access — pure compute.
 */
export default function MetricsPage() {
  const shows = generateMockShows();
  return <MetricsDashboard shows={shows} />;
}
