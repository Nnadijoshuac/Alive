import { z } from "zod";
import { RwaRedemptionSchema } from "@alive/shared";

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
    issuerName: z.string().trim().min(1).max(200).optional(),
    underlying: z.string().trim().min(1).max(500).optional(),
    redemption: RwaRedemptionSchema.optional(),
    citations: CitationsSchema,
  })
  .strict();

export type ExtractedFacts = z.infer<typeof ExtractedFactsSchema>;

const FACT_FIELDS = ["issuerName", "underlying", "redemption"] as const;
type FactField = (typeof FACT_FIELDS)[number];

function isFactField(value: string): value is FactField {
  return (FACT_FIELDS as readonly string[]).includes(value);
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
