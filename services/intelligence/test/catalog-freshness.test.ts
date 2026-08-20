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
const CATALOG_FIXTURE_DATE = new Date("2026-08-14T12:00:00.000Z");

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

describe("catalog freshness", () => {
  it("stamps every catalog asset's lastUpdatedAt to load time, not the fixture file's frozen date", async () => {
    const loadedAt = new Date("2026-09-01T00:00:00.000Z");
    const catalog = await loadRwaCatalog(catalogPath, () => loadedAt);
    expect(catalog.assets.length).toBeGreaterThan(0);
    for (const asset of catalog.assets) {
      expect(asset.lastUpdatedAt).toBe(loadedAt.toISOString());
      expect(asset.lastUpdatedAt).not.toBe(CATALOG_FIXTURE_DATE.toISOString());
    }
  });

  it("defaults to the real clock when no now() override is supplied", async () => {
    const before = Date.now();
    const catalog = await loadRwaCatalog(catalogPath);
    const after = Date.now();
    const stampedAt = Date.parse(catalog.assets[0]!.lastUpdatedAt);
    expect(stampedAt).toBeGreaterThanOrEqual(before);
    expect(stampedAt).toBeLessThanOrEqual(after);
  });

  // Regression: with the fixture's static 2026-08-14 lastUpdatedAt served
  // verbatim, any run more than 24h later (the eligibility policy's
  // maxNavAgeSeconds) made every never-analyzed catalog asset fail
  // SOURCE_DATA_TOO_OLD and show RESTRICTED -- a false "everything is
  // broken" first impression, not a real product/policy failure.
  it("a catalog-seeded, never-analyzed asset is not falsely RESTRICTED for source staleness days after the fixture was written", async () => {
    const runNow = new Date("2026-08-20T00:00:00.000Z"); // 6 days after the fixture date
    const catalog = await loadRwaCatalog(catalogPath, () => runNow);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new DemoMarketDataProvider(undefined, () => runNow),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => runNow,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/assets/taapl/eligibility",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      verdict: { status: string; reasons: { code: string }[] };
    };
    expect(body.verdict.reasons.map((r) => r.code)).not.toContain("SOURCE_DATA_TOO_OLD");
    expect(body.verdict.status).not.toBe("RESTRICTED");

    await app.close();
  });
});
