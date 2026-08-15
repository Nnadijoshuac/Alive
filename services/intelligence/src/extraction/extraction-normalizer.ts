import {
  RwaAssetSchema,
  type AssetProvenanceField,
  type AssetSource,
  type RwaAsset,
  type RwaExtractionMetadata,
} from "@alive/shared";

import type { SourceDocument } from "../ingestion/ingestion-service.js";
import type { ExtractedFacts } from "./extraction-validator.js";

function redemptionProvenanceFields(
  redemption: ExtractedFacts["redemption"],
): AssetProvenanceField[] {
  if (!redemption) return [];
  const fields: AssetProvenanceField[] = ["redemption.supported"];
  if (redemption.frequency !== undefined) fields.push("redemption.frequency");
  if (redemption.settlementPeriod !== undefined)
    fields.push("redemption.settlementPeriod");
  if (redemption.minimum !== undefined) fields.push("redemption.minimum");
  return fields;
}

function fieldsClaimedBy(
  sourceId: string,
  facts: ExtractedFacts,
): AssetProvenanceField[] {
  const fields: AssetProvenanceField[] = [];
  if (facts.citations.issuerName?.includes(sourceId)) fields.push("issuerName");
  if (facts.citations.underlying?.includes(sourceId)) fields.push("underlying");
  if (facts.citations.redemption?.includes(sourceId)) {
    fields.push(...redemptionProvenanceFields(facts.redemption));
  }
  return fields;
}

function toAssetSource(
  document: SourceDocument,
  supportedFields: AssetProvenanceField[],
): AssetSource {
  if (document.sourceType === "DEMO_FIXTURE") {
    return {
      id: document.sourceId,
      title: document.title,
      sourceType: "DEMO_FIXTURE",
      fixtureId: document.sourceId,
      retrievedAt: document.retrievedAt,
      supportedFields,
      disclaimer: "Synthetic fixture; not live market data.",
    };
  }
  return {
    id: document.sourceId,
    title: document.title,
    sourceType: document.sourceType,
    sourceUrl: document.uri ?? "https://example.invalid/no-source-url-supplied",
    retrievedAt: document.retrievedAt,
    supportedFields,
  };
}

/**
 * Merges extracted, cited facts into an already-known passport (from the
 * demo catalog), moving each newly-claimed field's provenance from the old
 * catalog-fixture source to the newly ingested document source(s) that
 * actually support it. The result is re-validated end to end through
 * RwaAssetSchema, so a citation/field mismatch fails loudly here rather
 * than producing a passport that silently violates its own provenance
 * contract.
 */
export function mergeExtractedFactsIntoPassport(params: {
  existing: RwaAsset;
  facts: ExtractedFacts;
  sourceDocuments: readonly SourceDocument[];
  extraction: RwaExtractionMetadata;
  lastUpdatedAt: string;
}): RwaAsset {
  const { existing, facts, sourceDocuments, extraction, lastUpdatedAt } =
    params;

  const citedSourceIds = new Set(Object.values(facts.citations).flat());
  const usedDocuments = sourceDocuments.filter((document) =>
    citedSourceIds.has(document.sourceId),
  );

  const claimedFields = new Set<AssetProvenanceField>();
  if (facts.issuerName !== undefined) claimedFields.add("issuerName");
  if (facts.underlying !== undefined) claimedFields.add("underlying");
  for (const field of redemptionProvenanceFields(facts.redemption)) {
    claimedFields.add(field);
  }

  const retainedSources = existing.sources
    .map((source) => ({
      ...source,
      supportedFields: source.supportedFields.filter(
        (field) => !claimedFields.has(field),
      ),
    }))
    .filter((source) => source.supportedFields.length > 0) as AssetSource[];

  const newSources = usedDocuments
    .map((document) =>
      toAssetSource(document, fieldsClaimedBy(document.sourceId, facts)),
    )
    .filter((source) => source.supportedFields.length > 0);

  const candidate = {
    ...existing,
    ...(facts.issuerName !== undefined ? { issuerName: facts.issuerName } : {}),
    ...(facts.underlying !== undefined ? { underlying: facts.underlying } : {}),
    ...(facts.redemption !== undefined ? { redemption: facts.redemption } : {}),
    extraction,
    sources: [...retainedSources, ...newSources],
    lastUpdatedAt,
  };

  return RwaAssetSchema.parse(candidate);
}
