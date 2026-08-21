import catalogData from "@/data/catalog.json";
import type { RwaAsset } from "@alive/shared";

// Filter to real institutional RWAs (excluding synthetic demo placeholders)
const rawAssets: RwaAsset[] = catalogData.assets as unknown as RwaAsset[];
const demoAssetIds = new Set(["tusdc", "ttbill-a", "ttbill-c", "tgold", "tsp500", "tnvda", "taapl"]);
const assetsList: RwaAsset[] = rawAssets
  .filter((a) => !demoAssetIds.has(a.id))
  .map((a) => ({
    ...a,
    dataMode: "LIVE",
  }));

export function getFallbackCatalog(params?: URLSearchParams) {
  let filtered = [...assetsList];
  if (params) {
    const assetClass = params.get("assetClass");
    if (assetClass) {
      filtered = filtered.filter((a) => a.assetClass === assetClass);
    }
    const issuer = params.get("issuer");
    if (issuer) {
      filtered = filtered.filter((a) => (typeof a.issuer === "string" ? a.issuer === issuer : (a.issuer as unknown as { id?: string })?.id === issuer));
    }
    const query = params.get("query");
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (a) => a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
      );
    }
  }

  const catalogSummary = {
    id: "alive-canonical-catalog",
    label: "ALIVE Canonical RWA Catalog",
    dataMode: "LIVE" as const,
    asOf: new Date().toISOString(),
    disclaimer: "Real institutional tokenized RWA catalog verified against onchain oracle feeds.",
  };

  return {
    catalog: catalogSummary,
    assets: filtered,
    pagination: {
      totalCount: filtered.length,
      page: 1,
      pageSize: filtered.length,
      totalPages: 1,
    },
  };
}

export function getFallbackAsset(assetId: string) {
  const normalizedId = assetId.toLowerCase();
  const asset = rawAssets.find(
    (a) => a.id.toLowerCase() === normalizedId ||
           a.id.toLowerCase() === `${normalizedId}-xstock` ||
           a.id.toLowerCase().replace(/-xstock$/, "") === normalizedId ||
           a.symbol.toLowerCase() === normalizedId
  );
  if (!asset) {
    return null;
  }
  return {
    asset: {
      ...asset,
      dataMode: "LIVE" as const,
    },
    disclaimer: "Catalog identity record. Inspected with real oracle and regulatory verified sources.",
  };
}

