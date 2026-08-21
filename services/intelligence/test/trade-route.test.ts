import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ChainlinkDataFeedProvider,
  CompositeMarketDataProvider,
  ControllableDemoMarketDataProvider,
  OkxTradeRouter,
  XLAYER_PAYMENT_TOKENS,
  type ChainlinkReader,
} from "@alive/market-data";

import { buildIntelligenceApp } from "../src/app.js";
import { EligibilitySigner } from "../src/attestations/eligibility-signer.js";
import { loadRwaCatalog } from "../src/catalog.js";
import { IntelligenceRepository } from "../src/repository.js";
import type { IntelligenceConfig } from "../src/config.js";

const NOW = new Date("2026-08-17T00:00:00.000Z");
const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);
const sourceDocumentsPath = fileURLToPath(
  new URL("../../../data/source-documents", import.meta.url),
);

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

function reader(): ChainlinkReader {
  return {
    async readFeed() {
      return {
        decimals: 6,
        description: "USTB NAV per Share",
        round: [1n, 11_177_748n, 1000n, 2000n, 1n] as const,
        blockNumber: 1n,
      };
    },
  };
}

function demoConfig(): IntelligenceConfig {
  return {
    host: "127.0.0.1",
    port: 4_200,
    databasePath: ":memory:",
    catalogPath,
    sourceDocumentsPath,
    allowedOrigins: ["http://localhost:3000"],
    llm: { provider: "disabled", timeoutMs: 1_000 },
    eligibilitySigner: { ttlSeconds: 900 },
    marketMonitorEnabled: false,
    marketMonitorIntervalSeconds: 300,
    demoMode: true,
  };
}

function markAssetAnalyzed(
  catalog: Awaited<ReturnType<typeof loadRwaCatalog>>,
  assetId: string,
): void {
  const asset = catalog.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`Test asset ${assetId} was not found.`);
  asset.extraction = {
    mode: "AI",
    model: "llama-3.3-70b-versatile",
    pipelineVersion: "2.0.0",
    promptVersion: "2.0.0",
    extractedAt: NOW.toISOString(),
  };
}

describe("X Layer Trading API Endpoints", () => {
  it("GET /api/trade/payment-tokens returns verified X Layer payment tokens", async () => {
    const repository = new IntelligenceRepository(":memory:");
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    repository.replaceCatalog(catalog.assets);

    const app = await buildIntelligenceApp(demoConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new CompositeMarketDataProvider(
        new ChainlinkDataFeedProvider(reader(), () => NOW),
        new ControllableDemoMarketDataProvider(),
      ),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/trade/payment-tokens",
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.tokens).toBeDefined();
    expect(json.tokens.length).toBeGreaterThanOrEqual(3);
    const usdc = json.tokens.find((t: any) => t.symbol === "USDC");
    expect(usdc).toMatchObject({
      chainId: 196,
      symbol: "USDC",
      contractAddress: XLAYER_PAYMENT_TOKENS.USDC!.contractAddress,
      decimals: 6,
    });
    await app.close();
  });

  it("GET /api/assets/:assetId/trade-availability returns NOT_ANALYZED when asset extraction is missing", async () => {
    const repository = new IntelligenceRepository(":memory:");
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    repository.replaceCatalog(catalog.assets);

    const app = await buildIntelligenceApp(demoConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new CompositeMarketDataProvider(
        new ChainlinkDataFeedProvider(reader(), () => NOW),
        new ControllableDemoMarketDataProvider(),
      ),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/assets/meta-xstock/trade-availability",
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.assetId).toBe("meta-xstock");
    expect(json.status).toBe("NOT_ANALYZED");
    await app.close();
  });

  it("GET /api/assets/:assetId/trade-availability resolves real route status for analyzed WMETAX", async () => {
    const repository = new IntelligenceRepository(":memory:");
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    markAssetAnalyzed(catalog, "meta-xstock");
    repository.replaceCatalog(catalog.assets);

    // Mock OkxTradeRouter with route
    const mockRouter = new OkxTradeRouter({
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({
          data: {
            attributes: {
              symbol: "wMETAx",
              decimals: 18,
              price_usd: "550.0",
              total_reserve_in_usd: "100000",
            },
          },
        }),
      })) as any,
    });

    const app = await buildIntelligenceApp(demoConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new CompositeMarketDataProvider(
        new ChainlinkDataFeedProvider(reader(), () => NOW),
        new ControllableDemoMarketDataProvider(),
      ),
      tradeRouter: mockRouter,
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/assets/meta-xstock/trade-availability",
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.assetId).toBe("meta-xstock");
    expect(json.status).toBe("AVAILABLE");
    expect(json.chainId).toBe(196);
    expect(json.tokenAddress.toLowerCase()).toBe(
      "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
    );
    await app.close();
  });

  it("GET /api/assets/:assetId/trade-availability returns NO_ROUTE honestly when pool is unseeded for analyzed SPYX", async () => {
    const repository = new IntelligenceRepository(":memory:");
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    markAssetAnalyzed(catalog, "spyx-xstock");
    repository.replaceCatalog(catalog.assets);

    // Mock OkxTradeRouter with 0 liquidity
    const mockRouter = new OkxTradeRouter({
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({
          data: {
            attributes: {
              symbol: "SPYx",
              decimals: 18,
              price_usd: null,
              total_reserve_in_usd: "0",
            },
          },
        }),
      })) as any,
    });

    const app = await buildIntelligenceApp(demoConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new CompositeMarketDataProvider(
        new ChainlinkDataFeedProvider(reader(), () => NOW),
        new ControllableDemoMarketDataProvider(),
      ),
      tradeRouter: mockRouter,
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/assets/spyx-xstock/trade-availability",
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.assetId).toBe("spyx-xstock");
    expect(json.status).toBe("NO_ROUTE");
    expect(json.reason).toContain("No active liquidity pool route");
    await app.close();
  });

  it("POST /api/trade/quote strictly resolves canonical target contract and returns normalized quote", async () => {
    const repository = new IntelligenceRepository(":memory:");
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    markAssetAnalyzed(catalog, "meta-xstock");
    repository.replaceCatalog(catalog.assets);

    const mockRouter = new OkxTradeRouter({
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({
          data: {
            attributes: {
              symbol: "wMETAx",
              decimals: 18,
              price_usd: "500.0",
              total_reserve_in_usd: "100000",
            },
          },
        }),
      })) as any,
    });

    const app = await buildIntelligenceApp(demoConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new CompositeMarketDataProvider(
        new ChainlinkDataFeedProvider(reader(), () => NOW),
        new ControllableDemoMarketDataProvider(),
      ),
      tradeRouter: mockRouter,
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trade/quote",
      payload: {
        assetId: "meta-xstock",
        fromTokenAddress: XLAYER_PAYMENT_TOKENS.USDC!.contractAddress,
        amount: "500",
        slippageBps: 50,
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.targetAsset.contractAddress.toLowerCase()).toBe(
      "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
    );
    expect(json.quote.hasRoute).toBe(true);
    expect(json.quote.fromToken.amount).toBe("500");
    expect(parseFloat(json.quote.toToken.estimatedAmount)).toBeCloseTo(1.0, 1);
    await app.close();
  });

  it("POST /api/trade/quote blocks source-unverified assets before requesting a route", async () => {
    const repository = new IntelligenceRepository(":memory:");
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    const metaAsset = catalog.assets.find((asset) => asset.id === "meta-xstock");
    if (!metaAsset) throw new Error("Test asset meta-xstock was not found.");
    const fixtureSupportedFields = [
      ...new Set(
        metaAsset.sources.flatMap((source) => source.supportedFields),
      ),
    ];
    metaAsset.dataMode = "DEMO";
    metaAsset.sources = [
      {
        id: "meta-xstock-test-fixture",
        title: "Meta xStock test fixture",
        sourceType: "DEMO_FIXTURE",
        fixtureId: "meta-xstock-test-fixture",
        disclaimer: "Synthetic test fixture; not live market data.",
        retrievedAt: NOW.toISOString(),
        supportedFields: fixtureSupportedFields,
      },
    ];
    repository.replaceCatalog(catalog.assets);

    let routerCalls = 0;
    const mockRouter = new OkxTradeRouter({
      fetchImpl: (async () => {
        routerCalls += 1;
        throw new Error("Trade router must not be called for an unavailable asset.");
      }) as any,
    });
    const app = await buildIntelligenceApp(demoConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new CompositeMarketDataProvider(
        new ChainlinkDataFeedProvider(reader(), () => NOW),
        new ControllableDemoMarketDataProvider(),
      ),
      tradeRouter: mockRouter,
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trade/quote",
      payload: {
        assetId: "meta-xstock",
        fromTokenAddress: XLAYER_PAYMENT_TOKENS.USDC!.contractAddress,
        amount: "500",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "NOT_VERIFIED" },
    });
    expect(routerCalls).toBe(0);
    await app.close();
  });

  it("POST /api/trade/transaction builds calldata without server keys", async () => {
    const repository = new IntelligenceRepository(":memory:");
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    markAssetAnalyzed(catalog, "meta-xstock");
    repository.replaceCatalog(catalog.assets);

    const mockRouter = new OkxTradeRouter({
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({
          data: {
            attributes: {
              symbol: "wMETAx",
              decimals: 18,
              price_usd: "500.0",
              total_reserve_in_usd: "100000",
            },
          },
        }),
      })) as any,
    });

    const app = await buildIntelligenceApp(demoConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new CompositeMarketDataProvider(
        new ChainlinkDataFeedProvider(reader(), () => NOW),
        new ControllableDemoMarketDataProvider(),
      ),
      tradeRouter: mockRouter,
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trade/transaction",
      payload: {
        assetId: "meta-xstock",
        fromTokenAddress: XLAYER_PAYMENT_TOKENS.USDC!.contractAddress,
        amount: "500",
        userWalletAddress: "0x1234567890123456789012345678901234567890",
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.transaction).toBeDefined();
    expect(json.transaction.chainId).toBe(196);
    expect(json.transaction.to.startsWith("0x")).toBe(true);
    expect(json.transaction.data.startsWith("0x")).toBe(true);
    await app.close();
  });

  it("POST /api/trade/transaction blocks policy-restricted assets before constructing calldata", async () => {
    const repository = new IntelligenceRepository(":memory:");
    const catalog = await loadRwaCatalog(catalogPath, () => NOW);
    const metaAsset = catalog.assets.find((asset) => asset.id === "meta-xstock");
    if (!metaAsset) throw new Error("Test asset meta-xstock was not found.");
    markAssetAnalyzed(catalog, "meta-xstock");
    metaAsset.issuer = "unapproved-test-issuer";
    repository.replaceCatalog(catalog.assets);

    let routerCalls = 0;
    const mockRouter = new OkxTradeRouter({
      fetchImpl: (async () => {
        routerCalls += 1;
        throw new Error("Trade router must not be called for an unavailable asset.");
      }) as any,
    });
    const app = await buildIntelligenceApp(demoConfig(), {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new CompositeMarketDataProvider(
        new ChainlinkDataFeedProvider(reader(), () => NOW),
        new ControllableDemoMarketDataProvider(),
      ),
      tradeRouter: mockRouter,
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trade/transaction",
      payload: {
        assetId: "meta-xstock",
        fromTokenAddress: XLAYER_PAYMENT_TOKENS.USDC!.contractAddress,
        amount: "500",
        userWalletAddress: "0x1234567890123456789012345678901234567890",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "NOT_ELIGIBLE" },
    });
    expect(routerCalls).toBe(0);
    await app.close();
  });
});
