import { describe, it, expect } from "vitest";
import { CANONICAL_CATALOG } from "../convex/lib/canonicalCatalog";
import { RwaAssetSchema } from "@alive/shared";
import { fetchAssetCatalog, fetchAssetById } from "../lib/asset-data";

describe("Convex Canonical Asset Persistence & Adapter", () => {
  it("includes all canonical assets in canonical catalog", () => {
    expect(CANONICAL_CATALOG.assets.length).toBeGreaterThanOrEqual(27);
  });

  it("validates all canonical assets against RwaAssetSchema", () => {
    for (const asset of CANONICAL_CATALOG.assets) {
      const parsed = RwaAssetSchema.safeParse(asset);
      expect(parsed.success, `Asset ${asset.id} failed validation: ${JSON.stringify(parsed.error)}`).toBe(true);
    }
  });

  it("preserves ttbill-b, meta-xstock, and spyx-xstock identities", () => {
    const ids = CANONICAL_CATALOG.assets.map((a) => a.id);
    expect(ids).toContain("ttbill-b");
    expect(ids).toContain("meta-xstock");
    expect(ids).toContain("spyx-xstock");
  });

  it("preserves X Layer deployment chainId 196 on xStock assets without confusion with testnet 1952", () => {
    const metaXstock = CANONICAL_CATALOG.assets.find((a) => a.id === "meta-xstock");
    expect(metaXstock).toBeDefined();
    const xlayerDep = metaXstock?.deployments?.find((d) => d.chainId === 196);
    expect(xlayerDep).toBeDefined();
    expect(xlayerDep?.contractAddress).toBe("0xe840946ffebcd66b7c4e95095effafadfa0d0e56");
    expect(xlayerDep?.chainId).toBe(196);

    const spyxXstock = CANONICAL_CATALOG.assets.find((a) => a.id === "spyx-xstock");
    expect(spyxXstock).toBeDefined();
    const spyxDep = spyxXstock?.deployments?.find((d) => d.chainId === 196);
    expect(spyxDep).toBeDefined();
    expect(spyxDep?.contractAddress).toBe("0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48");
    expect(spyxDep?.chainId).toBe(196);
  });

  it("fetches catalog via asset-data adapter with fallback resilience", async () => {
    const catalogResult = await fetchAssetCatalog();
    expect(catalogResult.assets.length).toBeGreaterThanOrEqual(18);
    expect(["SNAPSHOT", "LIVE"]).toContain(catalogResult.dataMode);
  }, 15000);

  it("fetches individual asset by id via asset-data adapter", async () => {
    const asset = await fetchAssetById("meta-xstock");
    expect(asset).not.toBeNull();
    expect(asset?.symbol).toBe("WMETAX");
    expect(asset?.name).toBe("Wrapped Meta xStock");
  }, 15000);

  it("filters catalog by search query and asset class correctly", async () => {
    const equityResults = await fetchAssetCatalog({ assetClass: "EQUITY" });
    expect(equityResults.assets.every((a) => a.assetClass === "EQUITY")).toBe(true);

    const searchResults = await fetchAssetCatalog({ q: "treasury" });
    expect(searchResults.assets.length).toBeGreaterThan(0);
  }, 15000);
});
