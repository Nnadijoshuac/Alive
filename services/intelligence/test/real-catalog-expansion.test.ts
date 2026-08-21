import { fileURLToPath } from "node:url";

import { DemoMarketDataProvider } from "@alive/market-data";
import { describe, expect, it } from "vitest";

import {
  EligibilitySigner,
  IntelligenceRepository,
  buildIntelligenceApp,
  loadRwaCatalog,
  type IntelligenceConfig,
} from "../src/index.js";

function unconfiguredEligibilitySigner(): EligibilitySigner {
  return new EligibilitySigner({});
}

function disabledLlm() {
  return {
    name: "disabled" as const,
    async generatePolicyJson(): Promise<never> {
      throw new Error("offline");
    },
    health() {
      return { provider: "disabled" as const, configured: false, mode: "OFFLINE" as const, message: "offline" };
    },
  };
}

const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);
const sourceDocumentsPath = fileURLToPath(
  new URL("../../../data/source-documents", import.meta.url),
);
const NOW = new Date("2026-08-18T00:00:00.000Z");

function baseConfig(): IntelligenceConfig {
  return {
    host: "127.0.0.1",
    port: 4_200,
    databasePath: ":memory:",
    catalogPath,
    sourceDocumentsPath,
    allowedOrigins: ["http://localhost:3000"],
    llm: { provider: "disabled", timeoutMs: 1_000 },
    eligibilitySigner: { ttlSeconds: 900 },
    demoMode: false,
    marketMonitorIntervalSeconds: 300,
    marketMonitorEnabled: false,
  };
}

const DEMO_ONLY_ASSET_IDS = new Set([
  "tusdc",
  "ttbill-a",
  "ttbill-c",
  "tgold",
  "tsp500",
  "tnvda",
  "taapl",
]);

/**
 * REAL-ONLY != ALREADY-ANALYZED-ONLY: the catalog-expansion directive's
 * central invariant. A real, unanalyzed asset must present an honest
 * "not analyzed" state everywhere, never be mistaken for either a demo
 * asset or a RESTRICTED one just because ALIVE hasn't looked at it yet.
 */
describe("real catalog expansion", () => {
  it("the catalog carries a large real-asset universe alongside the small demo/testnet set", async () => {
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    expect(catalog.assets.length).toBeGreaterThanOrEqual(20);

    const realAssets = catalog.assets.filter((asset) => !DEMO_ONLY_ASSET_IDS.has(asset.id));
    expect(realAssets.length).toBeGreaterThanOrEqual(13);
    for (const asset of realAssets) {
      expect(asset.sources.some((source) => source.sourceType === "DEMO_FIXTURE")).toBe(false);
      expect(
        asset.sources.some((source) =>
          ["ISSUER_DOCUMENTATION", "OFFICIAL_TOKEN_DOCUMENTATION", "OFFICIAL_PROTOCOL_API", "CHAINLINK", "ONCHAIN", "REGULATORY_FILING"].includes(
            source.sourceType,
          ),
        ),
      ).toBe(true);
    }

    for (const id of DEMO_ONLY_ASSET_IDS) {
      const demoAsset = catalog.assets.find((asset) => asset.id === id);
      expect(demoAsset?.sources.some((source) => source.sourceType === "DEMO_FIXTURE")).toBe(true);
    }
  });

  it("a real, unanalyzed asset (ousg) has no invented risk/liquidity, and its eligibility check never crashes or reports missing-analysis as a documentation gap", async () => {
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const asset = await app.inject({ method: "GET", url: "/api/assets/ousg" });
    expect(asset.statusCode).toBe(200);
    const assetBody = asset.json() as { asset: { risk?: unknown; liquidity?: unknown; dataMode: string } };
    expect(assetBody.asset.risk).toBeUndefined();
    expect(assetBody.asset.liquidity).toBeUndefined();
    expect(assetBody.asset.dataMode).toBe("SNAPSHOT");

    // The deterministic engine still runs and may legitimately restrict
    // this asset for reasons unrelated to analysis status (e.g. its issuer
    // is not on this policy's approved list) -- that is a real policy
    // result, not a crash. It must never fail with DOCUMENTATION_INCOMPLETE
    // purely because ousg carries a real ISSUER_DOCUMENTATION source (the
    // same substitution that satisfies ttbill-b's demo-fixture requirement
    // applies here too), and it must never throw.
    const eligibility = await app.inject({ method: "GET", url: "/api/assets/ousg/eligibility" });
    expect(eligibility.statusCode).toBe(200);
    const body = eligibility.json() as { verdict: { reasons: { code: string }[] } };
    expect(body.verdict.reasons.map((r) => r.code)).not.toContain("DOCUMENTATION_INCOMPLETE");

    await app.close();
  });

  it("ingest-official-sources honestly reports no registered documents for an unanalyzed real asset, never silently substituting a demo fixture", async () => {
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/assets/ousg/ingest-official-sources",
    });
    expect(response.statusCode).toBe(404);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe("ASSET_HAS_NO_OFFICIAL_SOURCES");

    await app.close();
  });

  it("ttbill-a (the Attack Lab testnet harness) never carries a real source, keeping it out of the real-asset set", async () => {
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    const ttbillA = catalog.assets.find((asset) => asset.id === "ttbill-a");
    expect(
      ttbillA?.sources.every((source) => source.sourceType === "DEMO_FIXTURE"),
    ).toBe(true);
  });
});
