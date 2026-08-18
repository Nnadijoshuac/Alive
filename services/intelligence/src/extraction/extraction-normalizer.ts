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

function feesProvenanceFields(
  fees: ExtractedFacts["fees"],
): AssetProvenanceField[] {
  if (!fees) return [];
  const fields: AssetProvenanceField[] = [];
  if (fees.managementFeeBps !== undefined) fields.push("fees.managementFeeBps");
  if (fees.redemptionFeeBps !== undefined) fields.push("fees.redemptionFeeBps");
  return fields;
}

function marketHoursProvenanceFields(
  marketHours: ExtractedFacts["marketHours"],
): AssetProvenanceField[] {
  if (!marketHours) return [];
  const fields: AssetProvenanceField[] = ["marketHours.type"];
  if (marketHours.timezone !== undefined) fields.push("marketHours.timezone");
  return fields;
}

function fieldsClaimedBy(
  sourceId: string,
  facts: ExtractedFacts,
): AssetProvenanceField[] {
  const fields: AssetProvenanceField[] = [];
  if (facts.citations.productName?.includes(sourceId)) fields.push("name");
  if (facts.citations.assetClass?.includes(sourceId)) fields.push("assetClass");
  if (facts.citations.issuerName?.includes(sourceId)) fields.push("issuerName");
  if (facts.citations.underlying?.includes(sourceId)) fields.push("underlying");
  if (facts.citations.redemption?.includes(sourceId)) {
    fields.push(...redemptionProvenanceFields(facts.redemption));
  }
  if (facts.citations.fees?.includes(sourceId)) {
    fields.push(...feesProvenanceFields(facts.fees));
  }
  if (facts.citations.marketHours?.includes(sourceId)) {
    fields.push(...marketHoursProvenanceFields(facts.marketHours));
  }
  if (facts.citations.restrictions?.includes(sourceId)) fields.push("restrictions");
  if (facts.citations.jurisdiction?.includes(sourceId)) fields.push("jurisdiction");
  if (facts.citations.eligibleInvestors?.includes(sourceId))
    fields.push("eligibleInvestors");
  if (facts.citations.custody?.includes(sourceId)) fields.push("custody");
  if (facts.citations.documentEffectiveDate?.includes(sourceId))
    fields.push("documentEffectiveDate");
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
  if (facts.productName !== undefined) claimedFields.add("name");
  if (facts.assetClass !== undefined) claimedFields.add("assetClass");
  if (facts.issuerName !== undefined) claimedFields.add("issuerName");
  if (facts.underlying !== undefined) claimedFields.add("underlying");
  for (const field of redemptionProvenanceFields(facts.redemption)) {
    claimedFields.add(field);
  }
  for (const field of feesProvenanceFields(facts.fees)) claimedFields.add(field);
  for (const field of marketHoursProvenanceFields(facts.marketHours)) {
    claimedFields.add(field);
  }
  if (facts.restrictions !== undefined) claimedFields.add("restrictions");
  if (facts.jurisdiction !== undefined) claimedFields.add("jurisdiction");
  if (facts.eligibleInvestors !== undefined)
    claimedFields.add("eligibleInvestors");
  if (facts.custody !== undefined) claimedFields.add("custody");
  if (facts.documentEffectiveDate !== undefined)
    claimedFields.add("documentEffectiveDate");

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
    ...(facts.productName !== undefined ? { name: facts.productName } : {}),
    ...(facts.assetClass !== undefined ? { assetClass: facts.assetClass } : {}),
    ...(facts.issuerName !== undefined ? { issuerName: facts.issuerName } : {}),
    ...(facts.underlying !== undefined ? { underlying: facts.underlying } : {}),
    ...(facts.redemption !== undefined ? { redemption: facts.redemption } : {}),
    ...(facts.fees !== undefined ? { fees: facts.fees } : {}),
    ...(facts.marketHours !== undefined
      ? { marketHours: facts.marketHours }
      : {}),
    ...(facts.restrictions !== undefined
      ? { restrictions: facts.restrictions }
      : {}),
    ...(facts.jurisdiction !== undefined
      ? { jurisdiction: facts.jurisdiction }
      : {}),
    ...(facts.eligibleInvestors !== undefined
      ? { eligibleInvestors: facts.eligibleInvestors }
      : {}),
    ...(facts.custody !== undefined ? { custody: facts.custody } : {}),
    ...(facts.documentEffectiveDate !== undefined
      ? { documentEffectiveDate: facts.documentEffectiveDate }
      : {}),
    extraction,
    sources: [...retainedSources, ...newSources],
    lastUpdatedAt,
  };

  return RwaAssetSchema.parse(candidate);
}

const REAL_EXTERNAL_SOURCE_TYPES = new Set([
  "ISSUER_DOCUMENTATION",
  "OFFICIAL_TOKEN_DOCUMENTATION",
  "OFFICIAL_PROTOCOL_API",
  "CHAINLINK",
  "ONCHAIN",
  "REGULATORY_FILING",
]);

/**
 * A catalog-seeded DEMO asset is promoted out of demo mode only once it
 * has genuinely been analyzed from a real, external, non-demo document by
 * a real AI extraction run -- not merely because Groq returned HTTP 200.
 * Assets that never receive real official sources (ttbill-a, kept
 * deliberately demo-backed for the Attack Lab) can never satisfy this,
 * since officialSourcesForAsset only registers documents for assets ALIVE
 * has actually verified -- there is nothing to special-case per asset ID.
 */
export function promoteAssetIfGenuinelyLive(
  passport: RwaAsset,
  extraction: RwaExtractionMetadata,
): RwaAsset {
  if (passport.dataMode !== "DEMO") return passport;
  if (extraction.mode !== "AI") return passport;

  const hasRealExternalSource = passport.sources.some((source) =>
    REAL_EXTERNAL_SOURCE_TYPES.has(source.sourceType),
  );
  if (!hasRealExternalSource) return passport;

  const sources = passport.sources.map((source) => {
    if (source.sourceType !== "DEMO_FIXTURE") return source;
    // Retire the demo placeholder for a genuinely-analyzed asset, but keep
    // supporting whatever fields only it still supports -- ALIVE's own
    // computed risk/liquidity/yield figures, which document extraction
    // never claims -- so the schema's provenance requirement stays
    // satisfied honestly rather than by deleting a required source.
    return {
      id: source.id,
      title: "ALIVE risk & liquidity methodology",
      sourceType: "ALIVE_METHODOLOGY" as const,
      methodology: passport.risk?.methodology ?? "ALIVE_RISK_V1",
      retrievedAt: source.retrievedAt,
      supportedFields: source.supportedFields,
      disclaimer:
        "ALIVE's own computed risk, liquidity, and yield-estimate methodology output -- not a claim from any third-party document.",
    };
  });

  return RwaAssetSchema.parse({ ...passport, dataMode: "LIVE", sources });
}
