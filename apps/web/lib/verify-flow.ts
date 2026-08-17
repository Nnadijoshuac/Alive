import {
  RwaApiError,
  ingestAssetSource,
  ingestOfficialSources,
} from "./rwa-api";

export type VerifyStageKey = "identify" | "read" | "extract" | "sources" | "evaluate";

export type DocumentationSource = "official" | "demo-fixture";

/**
 * Loads the issuer documentation a real extraction needs. Tries ALIVE's own
 * known-good real official sources first (ttbill-b's Superstate/Invesco
 * USTB documents today); only for an asset with none registered does it
 * fall back to the legacy DEMO_FIXTURE filesystem path
 * (`data/source-documents/<assetId>.txt`). Never invents a fixture file and
 * never silently substitutes demo content for an asset that has real
 * sources.
 */
export async function loadAssetDocumentation(
  assetId: string,
  symbol: string,
): Promise<DocumentationSource> {
  try {
    await ingestOfficialSources(assetId);
    return "official";
  } catch (error) {
    if (error instanceof RwaApiError && error.code === "ASSET_HAS_NO_OFFICIAL_SOURCES") {
      await ingestAssetSource(assetId, `demo-doc-${assetId}`, "DEMO_FIXTURE", {
        kind: "fixture",
        fixtureId: assetId,
        title: `${symbol} fact sheet`,
      });
      return "demo-fixture";
    }
    throw error;
  }
}

const STAGE_FAILURE_HEADLINES: Record<VerifyStageKey, string> = {
  identify: "Could not identify this asset.",
  read: "Unable to load issuer documentation.",
  extract: "AI extraction failed.",
  sources: "Could not verify source provenance.",
  evaluate: "Could not evaluate eligibility.",
};

/**
 * A truthful, stage-specific failure headline. "The intelligence service
 * did not respond" is wrong whenever the service responded with an error
 * for a specific stage (e.g. a document-loading failure) -- this names
 * what actually failed instead of blaming connectivity by default.
 */
export function stageErrorMessage(stageKey: VerifyStageKey | undefined): string {
  if (!stageKey) return "The intelligence service did not respond.";
  return STAGE_FAILURE_HEADLINES[stageKey];
}
