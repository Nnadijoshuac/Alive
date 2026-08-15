import {
  MarketQuoteSchema,
  PortfolioPolicySchema,
  RwaAssetSchema,
  type AssetClass,
  type MarketQuote,
  type PortfolioPolicy,
  type RwaAsset,
} from "@alive/shared";
import { describe, expect, it } from "vitest";

import {
  detectPolicyDrift,
  optimizePortfolio,
  proposeRebalance,
  type Allocation,
  type OptimizationInput,
} from "../src/index.js";

const AS_OF = "2026-08-14T20:00:00.000Z";
const SUPPORTED_FIELDS = [
  "symbol",
  "name",
  "assetClass",
  "issuer",
  "issuerName",
  "underlying",
  "yield.type",
  "yield.estimatedAprBps",
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
] as const;

function asset(input: {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  issuer: string;
  risk: number;
  apr: number;
  liquidity?: number;
}): RwaAsset {
  return RwaAssetSchema.parse({
    id: input.id,
    symbol: input.symbol,
    name: `${input.symbol} demo asset`,
    assetClass: input.assetClass,
    issuer: input.issuer,
    issuerName: `${input.issuer} demo issuer`,
    underlying: "Synthetic optimizer fixture",
    yield: { type: "Synthetic estimate", estimatedAprBps: input.apr },
    liquidity: { score: input.liquidity ?? 90 },
    risk: {
      score: input.risk,
      issuerRisk: input.risk,
      liquidityRisk: input.risk,
      marketRisk: input.risk,
      oracleRisk: input.risk,
      redemptionRisk: input.risk,
      productComplexityRisk: input.risk,
      methodology: "Deterministic test fixture",
    },
    sources: [
      {
        id: `source:${input.id}`,
        title: "Optimizer unit fixture",
        retrievedAt: AS_OF,
        supportedFields: SUPPORTED_FIELDS,
        sourceType: "DEMO_FIXTURE",
        fixtureId: `fixture:${input.id}`,
        disclaimer: "Synthetic fixture only; this is not live market data.",
      },
    ],
    lastUpdatedAt: AS_OF,
    dataMode: "DEMO",
  });
}

function quote(
  assetId: string,
  overrides: Partial<MarketQuote> = {},
): MarketQuote {
  return MarketQuoteSchema.parse({
    assetId,
    price: "100",
    timestamp: AS_OF,
    provider: "ALIVE_DEMO_MARKET",
    status: "OPEN",
    dataMode: "DEMO",
    ...overrides,
  });
}

function policy(overrides: Partial<PortfolioPolicy> = {}): PortfolioPolicy {
  return PortfolioPolicySchema.parse({
    version: 1,
    objective: "INCOME",
    minimumCashBps: 1_000,
    assetClassLimits: [
      { assetClass: "CASH", minimumBps: 1_000, maximumBps: 3_000 },
      { assetClass: "TREASURY", minimumBps: 7_000, maximumBps: 9_000 },
    ],
    maximumSingleAssetBps: 5_000,
    maximumSingleIssuerBps: 6_000,
    minimumLiquidityScore: 60,
    maximumPortfolioRiskScore: 30,
    maximumPriceAgeSeconds: 300,
    maximumSlippageBps: 50,
    userApprovalRequired: true,
    ...overrides,
  });
}

function fixture(
  policyOverrides: Partial<PortfolioPolicy> = {},
): OptimizationInput {
  const assets = [
    asset({
      id: "demo:cash",
      symbol: "CASH",
      assetClass: "CASH",
      issuer: "issuer:cash",
      risk: 5,
      apr: 200,
    }),
    asset({
      id: "demo:treasury-low",
      symbol: "TLOW",
      assetClass: "TREASURY",
      issuer: "issuer:low",
      risk: 10,
      apr: 300,
    }),
    asset({
      id: "demo:treasury-high",
      symbol: "THIGH",
      assetClass: "TREASURY",
      issuer: "issuer:high",
      risk: 80,
      apr: 1_000,
    }),
  ];
  return {
    policy: policy(policyOverrides),
    assets,
    quotes: assets.map((item) => quote(item.id)),
    asOf: AS_OF,
  };
}

describe("optimizePortfolio", () => {
  it("builds the same feasible proposal regardless of catalog order", () => {
    const input = fixture();
    const first = optimizePortfolio(input);
    const second = optimizePortfolio({
      ...input,
      assets: [...input.assets].reverse(),
      quotes: [...input.quotes].reverse(),
    });

    expect(first.feasible).toBe(true);
    expect(first.allocations).toEqual(second.allocations);
    expect(
      first.allocations.reduce((total, item) => total + item.weightBps, 0),
    ).toBe(10_000);
    expect(first.metrics.riskScore).toBeLessThanOrEqual(30);
    expect(first.metrics.cashBps).toBeGreaterThanOrEqual(1_000);
  });

  it("fails closed when even the minimum-risk completion exceeds policy", () => {
    const proposal = optimizePortfolio(
      fixture({ maximumPortfolioRiskScore: 20 }),
    );

    expect(proposal.feasible).toBe(false);
    expect(proposal.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PORTFOLIO_RISK_EXCEEDED" }),
      ]),
    );
  });

  it("excludes stale, halted, and below-liquidity assets with reason codes", () => {
    const input = fixture();
    input.quotes = input.quotes.map((item) =>
      item.assetId === "demo:treasury-high"
        ? quote(item.assetId, {
            status: "HALTED",
            timestamp: "2026-08-14T19:00:00.000Z",
          })
        : item,
    );
    input.assets = input.assets.map((item) =>
      item.id === "demo:treasury-low"
        ? asset({
            id: item.id,
            symbol: item.symbol,
            assetClass: item.assetClass,
            issuer: item.issuer,
            risk: item.risk.score,
            apr: item.yield?.estimatedAprBps ?? 0,
            liquidity: 40,
          })
        : item,
    );

    const proposal = optimizePortfolio(input);
    expect(proposal.feasible).toBe(false);
    expect(
      proposal.excludedAssets.flatMap((item) =>
        item.reasons.map((reason) => reason.code),
      ),
    ).toEqual(
      expect.arrayContaining([
        "QUOTE_STALE",
        "MARKET_UNAVAILABLE",
        "LIQUIDITY_MINIMUM_MISSED",
      ]),
    );
  });
});

describe("policy drift and rebalance", () => {
  it("reports duplicate and future-dated allocations rather than silently accepting them", () => {
    const input = fixture();
    input.quotes = input.quotes.map((item) =>
      item.assetId === "demo:cash"
        ? quote(item.assetId, { timestamp: "2026-08-14T20:01:00.000Z" })
        : item,
    );
    const allocations: Allocation[] = [
      { assetId: "demo:cash", weightBps: 5_000 },
      { assetId: "demo:cash", weightBps: 5_000 },
    ];

    const drift = detectPolicyDrift(input, allocations);
    expect(drift.withinPolicy).toBe(false);
    expect(drift.violations.map((item) => item.code)).toEqual(
      expect.arrayContaining(["DUPLICATE_ASSET_ALLOCATION", "QUOTE_FUTURE"]),
    );
  });

  it("emits explicit buy and sell deltas for an out-of-policy portfolio", () => {
    const current: Allocation[] = [
      { assetId: "demo:cash", weightBps: 8_000 },
      { assetId: "demo:treasury-low", weightBps: 2_000 },
    ];
    const rebalance = proposeRebalance(fixture(), current);

    expect(rebalance.feasible).toBe(true);
    expect(rebalance.drift.withinPolicy).toBe(false);
    expect(rebalance.trades.some((trade) => trade.side === "SELL")).toBe(true);
    expect(rebalance.trades.some((trade) => trade.side === "BUY")).toBe(true);
    expect(rebalance.turnoverBps).toBeGreaterThan(0);
  });
});
