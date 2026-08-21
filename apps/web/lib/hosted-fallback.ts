import catalogData from "@/data/catalog.json";
import type { RwaAsset } from "@alive/shared";

const assetsList: RwaAsset[] = catalogData.assets as unknown as RwaAsset[];

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
    id: catalogData.catalogId,
    label: catalogData.label,
    dataMode: catalogData.dataMode === "SNAPSHOT" ? ("SNAPSHOT" as const) : ("DEMO" as const),
    asOf: catalogData.asOf,
    disclaimer: catalogData.disclaimer,
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
  const asset = assetsList.find(
    (a) => a.id === assetId || a.id === `${assetId}-xstock` || a.id.replace(/-xstock$/, "") === assetId
  );
  if (!asset) {
    return null;
  }
  return {
    asset,
    disclaimer: catalogData.disclaimer,
  };
}
