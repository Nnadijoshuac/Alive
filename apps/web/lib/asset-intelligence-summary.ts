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
 * One shared fetch for every page that needs a table of "all monitored
 * assets + their current status" (Overview's watchlist strip, Explore).
 * The catalog is small (~8 assets today), so N parallel eligibility
 * fetches client-side is simpler and cheaper than a new backend endpoint
 * -- avoids introducing an aggregate API purely for frontend convenience.
 */
export async function listAssetSummaries(): Promise<AssetSummary[]> {
  const [{ assets }, marketResult] = await Promise.all([
    listRwaAssets(),
    listRwaMarkets().catch(() => undefined),
  ]);
  const quotesById = new Map(
    (marketResult?.quotes ?? []).map((quote) => [quote.assetId, quote]),
  );

  return Promise.all(
    assets.map(async (asset) => {
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
