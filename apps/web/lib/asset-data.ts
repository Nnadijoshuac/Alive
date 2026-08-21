import {
  type RwaAsset,
  RwaAssetSchema,
} from "@alive/shared";
import { convexQuery } from "./convex-http";
import {
  getFallbackCatalog,
  getFallbackAsset,
} from "./hosted-fallback";

export type AssetCatalogFilters = {
  q?: string;
  chainId?: number;
  assetClass?: string;
  issuer?: string;
  verification?: "VERIFIED" | "NOT_ANALYZED" | "UNVERIFIED";
  page?: number;
  limit?: number;
};

const demoAssetIds = new Set(["tusdc", "ttbill-a", "ttbill-c", "tgold", "tsp500", "tnvda", "taapl"]);

export async function fetchAssetCatalog(filters: AssetCatalogFilters = {}): Promise<{
  assets: RwaAsset[];
  totalCount: number;
  dataMode: "SNAPSHOT" | "LIVE" | "DEMO";
  asOf: string;
}> {
  try {
    const canonicalAssets = await convexQuery<unknown[]>("assets:getCanonicalAssets", {});
    if (canonicalAssets && canonicalAssets.length > 0) {
      const validAssets: RwaAsset[] = [];
      for (const item of canonicalAssets) {
        const parsed = RwaAssetSchema.safeParse(item);
        if (parsed.success && !demoAssetIds.has(parsed.data.id)) {
          validAssets.push({
            ...parsed.data,
            dataMode: "LIVE",
          });
        }
      }
      if (validAssets.length > 0) {
        let assets = validAssets;

        // Apply filters
        if (filters.q) {
          const q = filters.q.toLowerCase();
          assets = assets.filter(
            (a) =>
              a.id.toLowerCase().includes(q) ||
              a.symbol.toLowerCase().includes(q) ||
              a.name.toLowerCase().includes(q),
          );
        }
        if (filters.assetClass) {
          assets = assets.filter((a) => a.assetClass === filters.assetClass);
        }
        if (filters.chainId) {
          assets = assets.filter((a) =>
            a.deployments?.some((d) => d.chainId === filters.chainId),
          );
        }
        if (filters.issuer) {
          assets = assets.filter((a) => {
            const issuerId = typeof a.issuer === "string" ? a.issuer : (a.issuer as unknown as { id?: string })?.id;
            return issuerId === filters.issuer;
          });
        }
        if (filters.verification) {
          if (filters.verification === "VERIFIED") {
            assets = assets.filter((a) => a.extraction !== undefined);
          } else if (filters.verification === "NOT_ANALYZED") {
            assets = assets.filter((a) => a.extraction === undefined);
          }
        }

        return {
          assets,
          totalCount: assets.length,
          dataMode: "LIVE",
          asOf: assets.reduce(
            (latest, asset) =>
              asset.lastUpdatedAt > latest ? asset.lastUpdatedAt : latest,
            new Date().toISOString(),
          ),
        };
      }
    }
  } catch (err) {
    console.warn("Convex fetchAssetCatalog fallback:", err);
  }

  // Hosted Fallback
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  const fallback = getFallbackCatalog(params);
  return {
    assets: fallback.assets,
    totalCount: fallback.pagination.totalCount,
    dataMode: "LIVE",
    asOf: fallback.catalog.asOf,
  };
}

export async function fetchAssetById(assetId: string): Promise<RwaAsset | null> {
  try {
    const asset = await convexQuery<unknown>("assets:getCanonicalAssetById", { assetId });
    if (asset) {
      return RwaAssetSchema.parse(asset);
    }
  } catch (err) {
    console.warn("Convex fetchAssetById fallback:", err);
  }

    const fallback = getFallbackAsset(assetId);
    if (fallback?.asset) {
      return RwaAssetSchema.parse(fallback.asset);
    }
    return null;
  }
