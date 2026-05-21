/**
 * Shared types for the deal-capture flow. Mirrors the shape of
 * lib/canned/coastal-spell-extraction.json.
 */

import type { Bonus } from "@/db/schema";
import type { Ambiguity as EngineAmbiguity, RecoupPosition } from "@/lib/dealMathV2";

export type CandidateReading = {
  label: string;
  interpretation: string;
  structured_value: string;
  estimated_impact: string;
};

export type ExtractionAmbiguity = {
  id: string;
  field: string;
  prose_span: string;
  description: string;
  candidate_readings: CandidateReading[];
  suggested_clarification: string;
  /** Present once the user picks a reading locally or the agent has replied. */
  resolution?: string;
  resolved_at?: string;
  resolved_by?: EngineAmbiguity["resolved_by"];
};

export type ExtractionRecoup = {
  category:
    | "marketing"
    | "hospitality_overage"
    | "production_overage"
    | "prior_advance"
    | "damages"
    | "other";
  amount: number;
  label: string;
  position: RecoupPosition;
  prose_span?: string;
};

export type ExtractionResponse = {
  source_prose: string;
  deal_type: "vs" | "percentage_of_net" | "flat" | "percentage_of_gross" | "door";
  guarantee_amount: number | null;
  percentage: number | null;
  percentage_basis: "gross" | "net" | null;
  expense_cap: number | null;
  hospitality_cap: number | null;
  bonuses: Bonus[];
  recoups: ExtractionRecoup[];
  comp_rules: Record<string, boolean> | null;
  ambiguities: ExtractionAmbiguity[];
  fields_confidence: Record<string, "high" | "medium" | "low">;
  prose_spans: Record<string, string>;
};

export type CaptureInitialState = {
  sourceProse: string;
  extraction: ExtractionResponse | null;
  confirmedAt: Date | null;
  dealId: string | null;
  showExternalId: string;
};
