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

async function buildApp() {
  const catalog = await loadRwaCatalog(catalogPath, () => NOW);
  const repository = new IntelligenceRepository(":memory:");
  repository.replaceCatalog(catalog.assets);
  return buildIntelligenceApp(baseConfig(), {
    repository,
    catalog,
    llm: disabledLlm(),
    marketData: new DemoMarketDataProvider(undefined, () => NOW),
    eligibilitySigner: unconfiguredEligibilitySigner(),
    now: () => NOW,
  });
}

describe("GET /api/assets query filters", () => {
  it("with no filters, behaves exactly as before (full unpaginated catalog)", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/assets" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { assets: unknown[]; pagination: { totalCount: number } };
    expect(body.assets.length).toBe(body.pagination.totalCount);
    expect(body.assets.length).toBeGreaterThanOrEqual(20);
    await app.close();
  });

  it("chainId=1 (Ethereum) returns the real, VERIFIED-deployment assets", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/assets?chainId=1" });
    const body = response.json() as { assets: { id: string }[] };
    expect(body.assets.length).toBeGreaterThanOrEqual(13);
    expect(body.assets.some((a) => a.id === "ousg")).toBe(true);
    await app.close();
  });

  // The X Layer filter must answer honestly: ALIVE has zero verified
  // token deployments on chain 196 today. It must not be filled in with
  // enforcement-capable assets (ttbill-b) or Chainlink-mapped assets.
  it("chainId=196 (X Layer) returns zero assets -- no token deployment evidence exists", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/assets?chainId=196" });
    const body = response.json() as { assets: unknown[] };
    expect(body.assets).toHaveLength(0);
    await app.close();
  });

  it("assetClass filter narrows to the requested class only", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/assets?assetClass=CREDIT" });
    const body = response.json() as { assets: { id: string; assetClass: string }[] };
    expect(body.assets.length).toBeGreaterThan(0);
    for (const asset of body.assets) expect(asset.assetClass).toBe("CREDIT");
    await app.close();
  });

  it("q searches contract address, not just symbol/name", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/assets?q=0x1b19c19393e2d034d8ff31ff34c81252fcbbee92",
    });
    const body = response.json() as { assets: { id: string }[] };
    expect(body.assets.map((a) => a.id)).toEqual(["ousg"]);
    await app.close();
  });

  it("verification=NOT_ANALYZED includes real assets with no extraction yet, and verification=VERIFIED excludes them", async () => {
    const app = await buildApp();
    const notAnalyzed = await app.inject({
      method: "GET",
      url: "/api/assets?verification=NOT_ANALYZED",
    });
    const notAnalyzedIds = (notAnalyzed.json() as { assets: { id: string }[] }).assets.map(
      (a) => a.id,
    );
    // A fresh catalog load has never run Analyze on anything -- every real
    // asset, ttbill-b included, starts NOT_ANALYZED until extraction runs.
    expect(notAnalyzedIds).toContain("ousg");
    expect(notAnalyzedIds).toContain("ttbill-b");

    const verified = await app.inject({ method: "GET", url: "/api/assets?verification=VERIFIED" });
    const verifiedIds = (verified.json() as { assets: { id: string }[] }).assets.map((a) => a.id);
    expect(verifiedIds).toHaveLength(0);

    await app.close();
  });

  it("pagination: limit + page slice the (still-honest) totalCount", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/assets?limit=5&page=1" });
    const body = response.json() as { assets: unknown[]; pagination: { totalCount: number; page: number; limit: number } };
    expect(body.assets).toHaveLength(5);
    expect(body.pagination.totalCount).toBeGreaterThanOrEqual(20);
    await app.close();
  });
});
