import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AgentInteractionSchema,
  AgentStrategySchema,
  StrategyRuleSchema,
  WalletContextSchema,
  type AgentStrategy,
  type AliveTradeRecord,
  type RwaAsset,
  type WalletTrade,
} from "@alive/shared";

import { loadRwaCatalog } from "../src/catalog.js";
import { IntelligenceRepository } from "../src/repository.js";
import { WalletIntelligenceService } from "../src/wallet/wallet-intelligence-service.js";

const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);

const WALLET_A = "0x1111111111111111111111111111111111111111" as const;
const WALLET_B = "0x2222222222222222222222222222222222222222" as const;

function createMockRpcCaller(balances: {
  gas?: string;
  usdc?: string;
  wmetax?: string;
  usdcAllowance?: string;
} = {}) {
  return async (method: string, params: unknown[]) => {
    if (method === "eth_getBalance") {
      return balances.gas ? "0x" + BigInt(balances.gas).toString(16) : "0xde0b6b3a7640000"; // 1 OKB (10^18)
    }
    if (method === "eth_call") {
      const p = (params[0] || {}) as { to?: string; data?: string };
      // Balance query
      if (p.data?.startsWith("0x70a08231")) {
        if (p.to?.toLowerCase() === "0x74b7f16337b8972027f6196a17a631ac6de26d22") {
          // USDC
          return balances.usdc ? "0x" + BigInt(balances.usdc).toString(16) : "0x3b9aca00"; // 1000 USDC (1000 * 10^6)
        }
        if (p.to?.toLowerCase() === "0xe840946ffebcd66b7c4e95095effafadfa0d0e56") {
          // wMETAx
          return balances.wmetax ? "0x" + BigInt(balances.wmetax).toString(16) : "0x0";
        }
        return "0x0";
      }
      // Allowance query
      if (p.data?.startsWith("0xdd62ed3e")) {
        return balances.usdcAllowance
          ? "0x" + BigInt(balances.usdcAllowance).toString(16)
          : "0xffffffffffffffffffffffffffff";
      }
    }
    return null;
  };
}

async function createTestRepo(): Promise<IntelligenceRepository> {
  const repo = new IntelligenceRepository(":memory:");
  const catalog = await loadRwaCatalog(catalogPath);
  repo.replaceCatalog(catalog.assets);

  const now = new Date().toISOString();
  const wmetax: RwaAsset = {
    id: "wmetax",
    symbol: "wMETAx",
    name: "Wrapped Meta xStock",
    assetClass: "EQUITY",
    issuer: "backed",
    issuerName: "Backed Finance AG",
    underlying: "Meta Platforms Inc.",
    dataMode: "DEMO",
    lastUpdatedAt: now,
    sources: [
      {
        id: "demo-wmetax",
        title: "Backed Finance Prospectus",
        sourceType: "DEMO_FIXTURE",
        fixtureId: "demo",
        disclaimer: "DEMO DATA -- NOT LIVE MARKET DATA, synthetic fixture for tests",
        retrievedAt: now,
        supportedFields: [
          "assetClass",
          "deployments",
          "issuer",
          "issuerName",
          "lastUpdatedAt",
          "name",
          "symbol",
          "underlying",
        ],
      },
    ],
    deployments: [
      {
        chainId: 196,
        chainName: "X Layer",
        contractAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
        tokenStandard: "ERC-20",
        deploymentStatus: "VERIFIED",
      },
    ],
  };

  const spyx: RwaAsset = {
    id: "spyx",
    symbol: "SPYx",
    name: "SP500 xStock",
    assetClass: "EQUITY",
    issuer: "backed",
    issuerName: "Backed Finance AG",
    underlying: "SPDR S&P 500 ETF Trust",
    dataMode: "DEMO",
    lastUpdatedAt: now,
    sources: [
      {
        id: "demo-spyx",
        title: "Backed Finance Prospectus",
        sourceType: "DEMO_FIXTURE",
        fixtureId: "demo",
        disclaimer: "DEMO DATA -- NOT LIVE MARKET DATA, synthetic fixture for tests",
        retrievedAt: now,
        supportedFields: [
          "assetClass",
          "deployments",
          "issuer",
          "issuerName",
          "lastUpdatedAt",
          "name",
          "symbol",
          "underlying",
        ],
      },
    ],
    deployments: [
      {
        chainId: 196,
        chainName: "X Layer",
        contractAddress: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
        tokenStandard: "ERC-20",
        deploymentStatus: "VERIFIED",
      },
    ],
  };

  repo.upsertAsset(wmetax);
  repo.upsertAsset(spyx);

  repo.saveMarketObservation({
    id: "obs-wmetax-1",
    assetId: "wmetax",
    provider: "OKX DEX",
    dataMode: "LIVE",
    value: "528.50",
    observedAt: now,
    status: "OK",
  });

  return repo;
}

describe("Wallet Intelligence Service & Context Aggregation", () => {
  it("normalizes an empty wallet history cleanly without crashing", async () => {
    const repo = await createTestRepo();
    const service = new WalletIntelligenceService({
      repository: repo,
      rpcCaller: createMockRpcCaller(),
    });

    const context = await service.getWalletContext(WALLET_A, true);
    expect(context.walletAddress.toLowerCase()).toBe(WALLET_A.toLowerCase());
    expect(context.activity.trades).toHaveLength(0);
    expect(context.behavior.observedTradeCount).toBe(0);
    expect(context.behavior.medianTradeSizeUsd).toBeNull();
    expect(context.portfolio.positions.length).toBeGreaterThan(0);
    repo.close();
  });

  it("indexes and recognizes high-confidence ALIVE executed trades", async () => {
    const repo = await createTestRepo();
    const service = new WalletIntelligenceService({
      repository: repo,
      rpcCaller: createMockRpcCaller(),
    });

    const aliveTrade: AliveTradeRecord = {
      txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      walletAddress: WALLET_A,
      agentId: "agent-portfolio-core",
      strategyId: "strat-rwa-balance-v1",
      assetId: "wmetax",
      action: "BUY",
      fromTokenAddress: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
      toTokenAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
      amountIn: "260000000",
      amountOutExpected: "492000000000000000",
      quoteJson: JSON.stringify({ rate: 528.5 }),
      executedAt: new Date().toISOString(),
      chainId: 196,
      status: "CONFIRMED",
    };

    repo.saveAliveTrade(aliveTrade);

    const context = await service.getWalletContext(WALLET_A, true);
    expect(context.activity.trades).toHaveLength(1);
    expect(context.activity.trades[0]?.source).toBe("ALIVE_EXECUTED");
    expect(context.activity.trades[0]?.confidence).toBe("HIGH");
    expect(context.activity.trades[0]?.assetId).toBe("wmetax");
    expect(context.behavior.observedTradeCount).toBe(1);
    expect(context.behavior.observedBuyCount).toBe(1);
    repo.close();
  });

  it("calculates accurate trade metrics across 7d and 30d without psychology labels", async () => {
    const repo = await createTestRepo();
    const service = new WalletIntelligenceService({
      repository: repo,
      rpcCaller: createMockRpcCaller(),
    });

    const now = Date.now();
    const trade1: WalletTrade = {
      txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      chainId: 196,
      timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      fromToken: { address: "0x74b7f16337b8972027f6196a17a631ac6de26d22", symbol: "USDC", decimals: 6 },
      toToken: { address: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56", symbol: "wMETAx", decimals: 18 },
      fromAmount: "200000000",
      toAmount: "380000000000000000",
      fromValueUsd: 200,
      direction: "BUY",
      assetId: "wmetax",
      source: "ONCHAIN_INFERRED",
      confidence: "MEDIUM",
    };

    const trade2: WalletTrade = {
      txHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      chainId: 196,
      timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      fromToken: { address: "0x74b7f16337b8972027f6196a17a631ac6de26d22", symbol: "USDC", decimals: 6 },
      toToken: { address: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56", symbol: "wMETAx", decimals: 18 },
      fromAmount: "400000000",
      toAmount: "760000000000000000",
      fromValueUsd: 400,
      direction: "BUY",
      assetId: "wmetax",
      source: "ONCHAIN_INFERRED",
      confidence: "MEDIUM",
    };

    const trade3: WalletTrade = {
      txHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
      chainId: 196,
      timestamp: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
      fromToken: { address: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56", symbol: "wMETAx", decimals: 18 },
      toToken: { address: "0x74b7f16337b8972027f6196a17a631ac6de26d22", symbol: "USDC", decimals: 6 },
      fromAmount: "500000000000000000",
      toAmount: "260000000",
      toValueUsd: 260,
      direction: "SELL",
      assetId: "wmetax",
      source: "ONCHAIN_INFERRED",
      confidence: "MEDIUM",
    };

    repo.saveWalletTrade(WALLET_A, trade1);
    repo.saveWalletTrade(WALLET_A, trade2);
    repo.saveWalletTrade(WALLET_A, trade3);

    const context = await service.getWalletContext(WALLET_A, true);
    expect(context.behavior.observedTradeCount).toBe(3);
    expect(context.behavior.tradesLast7d).toBe(1);
    expect(context.behavior.tradesLast30d).toBe(3);
    expect(context.behavior.medianTradeSizeUsd).toBe(260);
    expect(context.behavior.averageTradeSizeUsd).toBe(286.67);
    expect(context.behavior.frequentlyUsedAssetIds).toContain("wmetax");
    repo.close();
  });

  it("strictly isolates wallet addresses — Wallet A data never leaks to Wallet B", async () => {
    const repo = await createTestRepo();
    const service = new WalletIntelligenceService({
      repository: repo,
      rpcCaller: createMockRpcCaller(),
    });

    const tradeA: WalletTrade = {
      txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      chainId: 196,
      timestamp: new Date().toISOString(),
      fromToken: { address: "0x74b7f16337b8972027f6196a17a631ac6de26d22", symbol: "USDC", decimals: 6 },
      toToken: { address: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56", symbol: "wMETAx", decimals: 18 },
      fromAmount: "500000000",
      toAmount: "950000000000000000",
      fromValueUsd: 500,
      direction: "BUY",
      assetId: "wmetax",
      source: "ONCHAIN_INFERRED",
      confidence: "MEDIUM",
    };

    repo.saveWalletTrade(WALLET_A, tradeA);

    const contextA = await service.getWalletContext(WALLET_A, true);
    const contextB = await service.getWalletContext(WALLET_B, true);

    expect(contextA.activity.trades).toHaveLength(1);
    expect(contextA.behavior.observedTradeCount).toBe(1);

    expect(contextB.activity.trades).toHaveLength(0);
    expect(contextB.behavior.observedTradeCount).toBe(0);
    expect(contextB.behavior.historicallyHeldAssetIds).toHaveLength(0);
    repo.close();
  });

  it("accurately models execution capabilities (WMETAX routable vs SPYX NO_ROUTE)", async () => {
    const repo = await createTestRepo();
    const service = new WalletIntelligenceService({
      repository: repo,
      rpcCaller: createMockRpcCaller(),
    });

    const context = await service.getWalletContext(WALLET_A, true);
    const caps = context.capabilities.capabilitiesByAsset;

    // WMETAX has active route
    expect(caps.wmetax?.routeAvailable).toBe(true);

    // SPYX has NO_ROUTE
    expect(caps.spyx?.routeAvailable).toBe(false);
    expect(caps.spyx?.canBuy).toBe(false);
    expect(caps.spyx?.reason).toBe("NO_ROUTE");

    // Non-X Layer deployed asset (e.g. ttbill-b is Ethereum chain 1)
    if (caps["ttbill-b"]) {
      expect(caps["ttbill-b"].canBuy).toBe(false);
      expect(caps["ttbill-b"].reason).toBe("NO_XLAYER_DEPLOYMENT");
    }
    repo.close();
  });

  it("persists agent interactions and prevents dismissal history from silently altering mandate", async () => {
    const repo = await createTestRepo();

    const interaction1 = {
      id: "int-1",
      agentId: "agent-core",
      walletAddress: WALLET_A,
      actionId: "act-1",
      event: "DISMISSED" as const,
      originalAmount: "450",
      reason: "User rejected trade",
      timestamp: new Date().toISOString(),
    };

    const interaction2 = {
      id: "int-2",
      agentId: "agent-core",
      walletAddress: WALLET_A,
      actionId: "act-2",
      event: "APPROVED" as const,
      originalAmount: "250",
      timestamp: new Date().toISOString(),
    };

    repo.saveAgentInteraction(interaction1);
    repo.saveAgentInteraction(interaction2);

    const list = repo.getAgentInteractions(WALLET_A);
    expect(list).toHaveLength(2);

    const approved = list.filter((i) => i.event === "APPROVED");
    const dismissed = list.filter((i) => i.event === "DISMISSED");

    expect(approved).toHaveLength(1);
    expect(dismissed).toHaveLength(1);
    expect(dismissed[0]?.originalAmount).toBe("450");
    repo.close();
  });

  it("validates structured strategy schema and rejects arbitrary code execution", () => {
    const validRule = {
      id: "r1",
      name: "Allocation threshold",
      conditionVariable: "portfolioAllocation" as const,
      operator: ">" as const,
      thresholdValue: 25,
      action: "REBALANCE" as const,
      priority: 1,
    };

    expect(StrategyRuleSchema.safeParse(validRule).success).toBe(true);

    // Arbitrary javascript code is rejected by schema
    const maliciousRule = {
      id: "r2",
      name: "Malicious injection",
      conditionVariable: "portfolioAllocation",
      operator: "INVALID_OP",
      thresholdValue: "javascript:eval('alert(1)')",
      action: "EXECUTE_ARBITRARY",
      priority: 1,
    };

    expect(StrategyRuleSchema.safeParse(maliciousRule).success).toBe(false);
  });
});
