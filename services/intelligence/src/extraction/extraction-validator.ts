import { z } from "zod";
import {
  AssetClassSchema,
  IsoDateSchema,
  RwaFeesSchema,
  RwaMarketHoursSchema,
  RwaRedemptionSchema,
} from "@alive/shared";

export class ExtractionValidationError extends Error {
  constructor(
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = "ExtractionValidationError";
  }
}

const CitationsSchema = z.record(
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
);

const ExtractedFactsSchema = z
  .object({
    productName: z.string().trim().min(1).max(200).optional(),
    assetClass: AssetClassSchema.optional(),
    issuerName: z.string().trim().min(1).max(200).optional(),
    underlying: z.string().trim().min(1).max(500).optional(),
    redemption: RwaRedemptionSchema.optional(),
    fees: RwaFeesSchema.optional(),
    marketHours: RwaMarketHoursSchema.optional(),
    restrictions: z.array(z.string().trim().min(1).max(500)).min(1).optional(),
    jurisdiction: z.string().trim().min(1).max(120).optional(),
    eligibleInvestors: z.string().trim().min(1).max(300).optional(),
    custody: z.string().trim().min(1).max(300).optional(),
    documentEffectiveDate: IsoDateSchema.optional(),
    citations: CitationsSchema,
  })
  .strict();

export type ExtractedFacts = z.infer<typeof ExtractedFactsSchema>;

const FACT_FIELDS = [
  "productName",
  "assetClass",
  "issuerName",
  "underlying",
  "redemption",
  "fees",
  "marketHours",
  "restrictions",
  "jurisdiction",
  "eligibleInvestors",
  "custody",
  "documentEffectiveDate",
] as const;
type FactField = (typeof FACT_FIELDS)[number];

function isFactField(value: string): value is FactField {
  return (FACT_FIELDS as readonly string[]).includes(value);
}

/**
 * Counts, for the API-facing extraction summary. `cited` always equals
 * `extracted` for a value that passed `validateExtractedFacts` -- every
 * populated field is required to carry a citation to get this far -- kept
 * as a separate number anyway so the API contract states that explicitly
 * rather than assuming it.
 */
export function summarizeExtractedFacts(facts: ExtractedFacts): {
  extracted: number;
  cited: number;
  unknown: number;
} {
  const extracted = FACT_FIELDS.filter(
    (field) => facts[field] !== undefined,
  ).length;
  const cited = FACT_FIELDS.filter(
    (field) => facts[field] !== undefined && (facts.citations[field]?.length ?? 0) > 0,
  ).length;
  return { extracted, cited, unknown: FACT_FIELDS.length - extracted };
}

/**
 * Schema validation + anti-hallucination checks: every citation must point
 * at a source we actually supplied, and every populated fact must carry at
 * least one citation. This runs on both the AI path and the deterministic
 * fallback path — the deterministic extractor is required to cite itself
 * just like the AI is, so there is exactly one trusted boundary, not two.
 */
export function validateExtractedFacts(
  candidate: unknown,
  availableSourceIds: readonly string[],
): ExtractedFacts {
  let parsed: ExtractedFacts;
  try {
    parsed = ExtractedFactsSchema.parse(candidate);
  } catch (error) {
    throw new ExtractionValidationError(
      "Extracted candidate failed strict schema validation",
      error,
    );
  }

  const known = new Set(availableSourceIds);
  for (const [field, sourceIds] of Object.entries(parsed.citations)) {
    if (!isFactField(field)) {
      throw new ExtractionValidationError(
        `Citations reference an unknown field: ${field}`,
      );
    }
    for (const sourceId of sourceIds) {
      if (!known.has(sourceId)) {
        throw new ExtractionValidationError(
          `Citation for "${field}" references an unsupplied source: ${sourceId}`,
        );
      }
    }
  }

  for (const field of FACT_FIELDS) {
    if (parsed[field] !== undefined && !parsed.citations[field]?.length) {
      throw new ExtractionValidationError(
        `Field "${field}" was extracted without a source citation`,
      );
    }
  }

  return parsed;
}
