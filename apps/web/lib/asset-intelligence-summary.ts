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
 * a real, cited source -- never the synthetic demo catalog (ttbill-a, the
 * Attack Lab harness, and the legacy policy-compiler test fixtures). This
 * is a structural predicate, not a hardcoded allowlist: any catalog asset
 * that carries at least one non-DEMO_FIXTURE source counts as real,
 * regardless of whether ALIVE has analyzed it yet. REAL-ONLY is not the
 * same as ALREADY-ANALYZED-ONLY -- an unanalyzed real asset still belongs
 * here, just in its honest "not analyzed" state.
 */
export function isRealAsset(asset: RwaAsset): boolean {
  return asset.sources.some((source) => source.sourceType !== "DEMO_FIXTURE");
}

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

  const realAssets = assets.filter(isRealAsset);

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
export type VerificationStatus = "VERIFIED" | "NOT_ANALYZED" | "UNVERIFIED";
export type EligibilityStatus = "ELIGIBLE" | "RESTRICTED" | "NOT_EVALUATED";
export type DataStatus = "LIVE" | "DEMO" | "UNAVAILABLE";

/**
 * "Has a real source" and "ALIVE has verified it" are different claims. A
 * catalog asset can carry a genuine issuer/product URL (its canonical
 * identity) before ALIVE has ever run AI extraction against it -- that
 * state is NOT_ANALYZED, not VERIFIED. Only an asset ALIVE has actually
 * extracted (cited facts against its real documents) is VERIFIED.
 */
export function verificationStatus(summary: AssetSummary): VerificationStatus {
  if (!isRealAsset(summary.asset)) return "UNVERIFIED";
  return summary.asset.extraction !== undefined ? "VERIFIED" : "NOT_ANALYZED";
}

/**
 * An asset ALIVE has not analyzed yet must never read as RESTRICTED. The
 * deterministic engine will still compute a real verdict against whatever
 * policy is configured (e.g. an unapproved-issuer check), but that verdict
 * is not a meaningful judgment of the asset until ALIVE has actually
 * extracted and validated its facts -- showing it as "restricted" would
 * misrepresent "we haven't looked at this yet" as "we checked and it
 * failed." Per the catalog-expansion directive: an unanalyzed asset is not
 * a bad asset.
 */
export function eligibilityStatus(summary: AssetSummary): EligibilityStatus {
  if (verificationStatus(summary) !== "VERIFIED") return "NOT_EVALUATED";
  if (summary.verdictError || !summary.verdict) return "NOT_EVALUATED";
  if (summary.verdict.status === "ELIGIBLE") return "ELIGIBLE";
  if (summary.verdict.status === "RESTRICTED") return "RESTRICTED";
  return "NOT_EVALUATED";
}

export function dataStatus(summary: AssetSummary): DataStatus {
  if (!summary.quote) return "UNAVAILABLE";
  return summary.quote.dataMode === "LIVE" ? "LIVE" : "DEMO";
}
