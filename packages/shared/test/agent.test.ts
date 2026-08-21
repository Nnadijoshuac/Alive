import { describe, expect, it } from "vitest";
import {
  AgentContextSnapshotSchema,
  AgentInteractionSchema,
  AgentStrategySchema,
  AliveTradeRecordSchema,
  ProposedAgentActionSchema,
  StrategyRuleSchema,
  WalletBehaviorSchema,
  WalletCapabilitySchema,
  WalletContextSchema,
  WalletPositionSchema,
  WalletTradeSchema,
  WalletTransferSchema,
} from "../src/agent.js";

const VALID_ADDR = "0x74b7f16337b8972027f6196a17a631ac6de26d22" as const;
const VALID_SPENDER = "0x789b70868a2d10ae8ee438992ad367f08c3d6118" as const;
const VALID_TX = "0x4f128c7075c3db0811e53ecfe5d28b18a4f9116e000000000000000000000000" as const;

describe("Agent & Wallet Context Schemas", () => {
  it("validates a complete WalletPosition", () => {
    const position = {
      assetId: "wmetax",
      symbol: "wMETAx",
      name: "Wrapped Meta xStock",
      tokenAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
      decimals: 18,
      balanceRaw: "1500000000000000000",
      balanceFormatted: "1.5",
      valueUsd: 792.75,
      allocationBps: 3200,
      verificationStatus: "VERIFIED" as const,
      eligibilityStatus: "ELIGIBLE" as const,
      marketStatus: "LIVE" as const,
      xLayerDeployment: {
        address: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
        verified: true,
      },
      routeStatus: "AVAILABLE" as const,
    };

    const parsed = WalletPositionSchema.parse(position);
    expect(parsed.assetId).toBe("wmetax");
    expect(parsed.allocationBps).toBe(3200);
  });

  it("validates WalletTransfer and WalletTrade", () => {
    const transfer = {
      txHash: VALID_TX,
      chainId: 196,
      timestamp: new Date().toISOString(),
      tokenAddress: VALID_ADDR,
      tokenSymbol: "USDC",
      fromAddress: VALID_ADDR,
      toAddress: VALID_SPENDER,
      amount: "100000000",
      amountFormatted: "100.0",
      direction: "OUT" as const,
    };

    expect(WalletTransferSchema.parse(transfer).direction).toBe("OUT");

    const trade = {
      txHash: VALID_TX,
      chainId: 196,
      timestamp: new Date().toISOString(),
      fromToken: {
        address: VALID_ADDR,
        symbol: "USDC",
        decimals: 6,
      },
      toToken: {
        address: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
        symbol: "wMETAx",
        decimals: 18,
      },
      fromAmount: "260000000",
      toAmount: "492000000000000000",
      fromValueUsd: 260.0,
      toValueUsd: 259.8,
      direction: "BUY" as const,
      assetId: "wmetax",
      source: "ALIVE_EXECUTED" as const,
      confidence: "HIGH" as const,
    };

    const parsedTrade = WalletTradeSchema.parse(trade);
    expect(parsedTrade.source).toBe("ALIVE_EXECUTED");
    expect(parsedTrade.confidence).toBe("HIGH");
  });

  it("validates evidence-backed WalletBehavior metrics without psychology", () => {
    const behavior = {
      observedTradeCount: 8,
      observedBuyCount: 6,
      observedSellCount: 2,
      medianTradeSizeUsd: 260,
      averageTradeSizeUsd: 275,
      tradesLast7d: 3,
      tradesLast30d: 8,
      averageHoldingPeriodDays: 14.5,
      turnover30d: 0.32,
      historicallyHeldAssetIds: ["wmetax", "ttbill-b"],
      frequentlyUsedAssetIds: ["wmetax"],
      stablecoinAllocationHistory: [
        { timestamp: "2026-08-01T00:00:00Z", stablecoinPct: 35 },
        { timestamp: "2026-08-15T00:00:00Z", stablecoinPct: 28 },
      ],
    };

    const parsed = WalletBehaviorSchema.parse(behavior);
    expect(parsed.observedTradeCount).toBe(8);
    expect(parsed.medianTradeSizeUsd).toBe(260);
  });

  it("validates WalletCapability distinguishing executable routes from NO_ROUTE", () => {
    const wmetaCap = {
      assetId: "wmetax",
      canBuy: true,
      canSell: true,
      reason: null,
      balance: "1.5",
      spendableAmount: "500",
      sourceToken: VALID_ADDR,
      allowance: "1000",
      routeAvailable: true,
      verificationStatus: "VERIFIED",
      eligibilityStatus: "ELIGIBLE",
      marketStatus: "LIVE",
      walletChainCorrect: true,
      hasGas: true,
    };

    const spyxCap = {
      assetId: "spyx",
      canBuy: false,
      canSell: false,
      reason: "NO_ROUTE",
      balance: "0",
      spendableAmount: "0",
      sourceToken: null,
      allowance: null,
      routeAvailable: false,
      verificationStatus: "VERIFIED",
      eligibilityStatus: "ELIGIBLE",
      marketStatus: "LIVE",
      walletChainCorrect: true,
      hasGas: true,
    };

    expect(WalletCapabilitySchema.parse(wmetaCap).canBuy).toBe(true);
    expect(WalletCapabilitySchema.parse(spyxCap).canBuy).toBe(false);
    expect(WalletCapabilitySchema.parse(spyxCap).reason).toBe("NO_ROUTE");
  });

  it("validates AgentStrategy structured rules without arbitrary code", () => {
    const rule = {
      id: "rule-1",
      name: "Single asset concentration cap",
      conditionVariable: "portfolioAllocation" as const,
      operator: ">" as const,
      thresholdValue: 25,
      targetAssetId: "wmetax",
      action: "REBALANCE" as const,
      priority: 1,
    };

    expect(StrategyRuleSchema.parse(rule).conditionVariable).toBe("portfolioAllocation");

    const strategy = {
      id: "strat-rwa-balance-v1",
      name: "RWA Core Balance v1",
      description: "Maintains max 25% single-asset exposure with 20% stablecoin reserve floor.",
      author: "ALIVE Labs",
      pricing: {
        isPaid: false,
      },
      targetAssetClasses: ["EQUITY", "SOVEREIGN_DEBT"],
      rules: [rule],
      rebalanceThresholdBps: 500,
      targetAllocations: {
        wmetax: 2000,
        "ttbill-b": 5000,
      },
      publishedAt: new Date().toISOString(),
    };

    const parsedStrat = AgentStrategySchema.parse(strategy);
    expect(parsedStrat.pricing.isPaid).toBe(false);
    expect(parsedStrat.rules).toHaveLength(1);
  });

  it("validates AgentInteraction memory persistence", () => {
    const interaction = {
      id: "int-123",
      agentId: "agent-default",
      walletAddress: VALID_ADDR,
      actionId: "act-456",
      event: "DISMISSED" as const,
      originalAmount: "450",
      reason: "User rejected trade above $400",
      timestamp: new Date().toISOString(),
    };

    const parsed = AgentInteractionSchema.parse(interaction);
    expect(parsed.event).toBe("DISMISSED");
    expect(parsed.originalAmount).toBe("450");
  });
});
