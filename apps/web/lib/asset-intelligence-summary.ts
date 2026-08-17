import type { EligibilityVerdict, RwaAsset } from "@alive/shared";
import {
  getAssetEligibility,
  listRwaAssets,
  listRwaMarkets,
  type RwaMarketQuote,
} from "./rwa-api";

export type AssetSummary = {
  asset: RwaAsset;
  quote?: RwaMarketQuote;
  verdict?: EligibilityVerdict;
  verdictError?: unknown;
};

/**
 * Overview/Explore show only assets with a genuine real-world identity and
 * real sources -- not the synthetic demo catalog. ttbill-b is the only
 * asset that currently qualifies (real Superstate/Invesco documentation,
 * real Chainlink NAV). The other 7 catalog entries remain reachable by ID
 * (they still back the Attack Lab / policy-compiler test harness), just
 * not surfaced as if they were real, investable products. A smaller real
 * list is preferred over a larger fabricated-looking one.
 */
export const REAL_CATALOG_ASSET_IDS = new Set(["ttbill-b"]);

/**
 * One shared fetch for every page that needs a table of "all real assets +
 * their current status" (Overview's watchlist strip, Explore). The catalog
 * is small, so N parallel eligibility fetches client-side is simpler and
 * cheaper than a new backend endpoint -- avoids introducing an aggregate
 * API purely for frontend convenience.
 */
export async function listAssetSummaries(): Promise<AssetSummary[]> {
  const [{ assets }, marketResult] = await Promise.all([
    listRwaAssets(),
    listRwaMarkets().catch(() => undefined),
  ]);
  const quotesById = new Map(
    (marketResult?.quotes ?? []).map((quote) => [quote.assetId, quote]),
  );

  const realAssets = assets.filter((asset) => REAL_CATALOG_ASSET_IDS.has(asset.id));

  return Promise.all(
    realAssets.map(async (asset) => {
      const quote = quotesById.get(asset.id);
      try {
        const { verdict } = await getAssetEligibility(asset.id);
        return { asset, ...(quote ? { quote } : {}), verdict };
      } catch (verdictError) {
        return { asset, ...(quote ? { quote } : {}), verdictError };
      }
    }),
  );
}

export function summaryPrimaryValue(summary: AssetSummary): string | undefined {
  return summary.quote?.price;
}

/**
 * Verification, eligibility, and data-freshness are three distinct
 * questions ALIVE can answer about an asset, and conflating them into one
 * status pill hides real information: an asset can be VERIFIED (real,
 * cited source documents exist) yet still RESTRICTED (it fails a policy
 * rule), or ELIGIBLE with only a demo/synthetic data source behind it.
 */
export type VerificationStatus = "VERIFIED" | "UNVERIFIED";
export type EligibilityStatus = "ELIGIBLE" | "RESTRICTED" | "NOT_EVALUATED";
export type DataStatus = "LIVE" | "DEMO" | "UNAVAILABLE";

export function verificationStatus(summary: AssetSummary): VerificationStatus {
  const hasRealSource = summary.asset.sources.some(
    (source) => source.sourceType !== "DEMO_FIXTURE",
  );
  return hasRealSource ? "VERIFIED" : "UNVERIFIED";
}

export function eligibilityStatus(summary: AssetSummary): EligibilityStatus {
  if (summary.verdictError || !summary.verdict) return "NOT_EVALUATED";
  if (summary.verdict.status === "ELIGIBLE") return "ELIGIBLE";
  if (summary.verdict.status === "RESTRICTED") return "RESTRICTED";
  return "NOT_EVALUATED";
}

export function dataStatus(summary: AssetSummary): DataStatus {
  if (!summary.quote) return "UNAVAILABLE";
  return summary.quote.dataMode === "LIVE" ? "LIVE" : "DEMO";
}
