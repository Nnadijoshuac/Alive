import {
  RwaApiError,
  ingestAssetSource,
  ingestOfficialSources,
} from "./rwa-api";

export type VerifyStageKey = "identify" | "read" | "extract" | "sources" | "evaluate";

export type DocumentationSource = "official" | "demo-fixture";

/**
 * Loads the issuer documentation a real extraction needs. Tries ALIVE's own
 * known-good real official sources first; only for a legacy demo-catalog
 * asset (ttbill-a, the Attack Lab harness -- opted in via
 * `allowDemoFixtureFallback`) does it fall back to the DEMO_FIXTURE
 * filesystem path (`data/source-documents/<assetId>.txt`). A real catalog
 * asset ALIVE has not yet registered official documents for must fail
 * honestly here, never silently substitute demo content: "real but
 * unanalyzed" is not the same as "demo."
 */
export async function loadAssetDocumentation(
  assetId: string,
  symbol: string,
  options: { allowDemoFixtureFallback?: boolean } = {},
): Promise<DocumentationSource> {
  try {
    await ingestOfficialSources(assetId);
    return "official";
  } catch (error) {
    if (error instanceof RwaApiError && error.code === "ASSET_HAS_NO_OFFICIAL_SOURCES") {
      if (!options.allowDemoFixtureFallback) {
        throw new RwaApiError(
          "ANALYSIS_NOT_YET_AVAILABLE",
          `ALIVE has not yet registered official documents to analyze for ${symbol}. Its real catalog identity is shown; deep AI analysis for this asset is coming soon.`,
          error.status,
        );
      }
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
