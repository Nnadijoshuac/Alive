import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RwaAssetSchema,
  RwaCatalogSchema,
  type AssetProvenanceField,
} from "../src/index.js";

const coreFields: AssetProvenanceField[] = [
  "symbol",
  "name",
  "assetClass",
  "issuer",
  "issuerName",
  "underlying",
  "liquidity.score",
  "risk.score",
  "risk.issuerRisk",
  "risk.liquidityRisk",
  "risk.marketRisk",
  "risk.oracleRisk",
  "risk.redemptionRisk",
  "risk.productComplexityRisk",
  "risk.methodology",
  "lastUpdatedAt",
];

function validDemoAsset() {
  return {
    id: "ttbill-a",
    symbol: "tTBILL-A",
    name: "Demo Treasury A",
    assetClass: "TREASURY" as const,
    issuer: "demo-issuer-a",
    issuerName: "Demo Issuer A",
    underlying: "Synthetic Treasury reference basket",
    liquidity: { score: 90 },
    risk: {
      score: 22,
      issuerRisk: 20,
      liquidityRisk: 10,
      marketRisk: 18,
      oracleRisk: 25,
      redemptionRisk: 20,
      productComplexityRisk: 15,
      methodology: "ALIVE_DEMO_RISK_V1",
    },
    sources: [
      {
        id: "demo-source-ttbill-a",
        title: "ALIVE synthetic demo fixture",
        sourceType: "DEMO_FIXTURE" as const,
        fixtureId: "rwa-demo-2026-08-14",
        retrievedAt: "2026-08-14T12:00:00.000Z",
        supportedFields: [...coreFields],
        disclaimer: "Synthetic fixture; not live market data.",
      },
    ],
    lastUpdatedAt: "2026-08-14T12:00:00.000Z",
    dataMode: "DEMO" as const,
  };
}

describe("RWA asset provenance", () => {
  it("parses a source-complete asset", () => {
    expect(RwaAssetSchema.parse(validDemoAsset()).symbol).toBe("TTBILL-A");
  });

  it("rejects unprovenanced fields and source claims for omitted fields", () => {
    expect(
      RwaAssetSchema.safeParse({
        ...validDemoAsset(),
        yield: { type: "Synthetic estimate", estimatedAprBps: 475 },
      }).success,
    ).toBe(false);
    const asset = validDemoAsset();
    asset.sources[0]?.supportedFields.push("fees.managementFeeBps");
    expect(RwaAssetSchema.safeParse(asset).success).toBe(false);
  });

  it("rejects the UNKNOWN sentinel and strict extra fields", () => {
    expect(
      RwaAssetSchema.safeParse({ ...validDemoAsset(), underlying: "UNKNOWN" })
        .success,
    ).toBe(false);
    expect(
      RwaAssetSchema.safeParse({ ...validDemoAsset(), inventedFact: true })
        .success,
    ).toBe(false);
  });

  it("rejects partial token deployment coordinates", () => {
    expect(
      RwaAssetSchema.safeParse({ ...validDemoAsset(), network: "X Layer" })
        .success,
    ).toBe(false);
  });

  it("accepts a redemption fact when its provenance is declared", () => {
    const asset = validDemoAsset();
    asset.sources[0]?.supportedFields.push(
      "redemption.supported",
      "redemption.frequency",
    );
    const parsed = RwaAssetSchema.parse({
      ...asset,
      redemption: { supported: true, frequency: "Daily" },
    });
    expect(parsed.redemption).toEqual({ supported: true, frequency: "Daily" });
  });

  it("represents unknown redemption status explicitly rather than omitting it", () => {
    const asset = validDemoAsset();
    asset.sources[0]?.supportedFields.push("redemption.supported");
    const parsed = RwaAssetSchema.parse({
      ...asset,
      redemption: { supported: "unknown" },
    });
    expect(parsed.redemption?.supported).toBe("unknown");
  });

  it("rejects a redemption fact without matching source provenance", () => {
    expect(
      RwaAssetSchema.safeParse({
        ...validDemoAsset(),
        redemption: { supported: true },
      }).success,
    ).toBe(false);
  });

  it("accepts extraction metadata without requiring it to be source-provenanced", () => {
    const parsed = RwaAssetSchema.parse({
      ...validDemoAsset(),
      extraction: {
        pipelineVersion: "alive-passport-v1",
        extractedAt: "2026-08-15T00:00:00.000Z",
        mode: "DEMO_FIXTURE",
      },
    });
    expect(parsed.extraction?.mode).toBe("DEMO_FIXTURE");
  });

  // The catalog is a mixed SNAPSHOT, not a pure demo catalog: ttbill-b
  // carries its real, sourced identity and dataMode LIVE from boot (no
  // synthetic fallback), while every other entry stays an explicitly
  // labelled DEMO fixture.
  it("parses the catalog fixture: mixed real+demo, ttbill-b real and every other asset explicitly demo", () => {
    const fixturePath = fileURLToPath(
      new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
    );
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    const catalog = RwaCatalogSchema.parse(fixture);
    expect(catalog.dataMode).toBe("SNAPSHOT");
    expect(catalog.assets.length).toBeGreaterThanOrEqual(8);

    const ttbillB = catalog.assets.find((asset) => asset.id === "ttbill-b");
    expect(ttbillB?.dataMode).toBe("LIVE");
    expect(ttbillB?.sources.some((source) => source.sourceType === "DEMO_FIXTURE")).toBe(false);

    const otherAssets = catalog.assets.filter((asset) => asset.id !== "ttbill-b");
    expect(otherAssets.length).toBeGreaterThanOrEqual(7);
    for (const asset of otherAssets) {
      expect(asset.dataMode).toBe("DEMO");
      expect(asset.sources.some((source) => source.sourceType === "DEMO_FIXTURE")).toBe(true);
    }
  });
});
