import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type RwaAsset,
} from "@alive/shared";

import { loadRwaCatalog } from "../src/catalog.js";
import { IntelligenceRepository } from "../src/repository.js";
import { WalletIntelligenceService } from "../src/wallet/wallet-intelligence-service.js";
import { StrategyMarketplaceService } from "../src/agent/strategy-marketplace.js";
import { AgentEngine } from "../src/agent/agent-engine.js";

const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);

const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

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
          return balances.usdc ? "0x" + BigInt(balances.usdc).toString(16) : "0x3b9aca00"; // 1000 USDC
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

async function createTestHarness(mockRpc = createMockRpcCaller()) {
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

  const walletIntelligence = new WalletIntelligenceService({
    repository: repo,
    rpcCaller: mockRpc,
  });

  const marketplace = new StrategyMarketplaceService(repo);
  const agentEngine = new AgentEngine({
    repository: repo,
    walletIntelligence,
    marketplace,
  });

  return { repo, walletIntelligence, marketplace, agentEngine };
}

describe("Strategy Marketplace & Agent Engine", () => {
  it("lists seeded marketplace strategies with structured rules", async () => {
    const { marketplace, repo } = await createTestHarness();
    const strategies = marketplace.listMarketplace();

    expect(strategies.length).toBeGreaterThanOrEqual(4);
    const core = strategies.find((s) => s.id === "strat-rwa-balance-v1");
    expect(core).toBeDefined();
    expect(core?.name).toBe("RWA Core Balance v1");
    expect(core?.rules.length).toBeGreaterThanOrEqual(2);
    repo.close();
  });

  it("clones a strategy to a wallet with complete isolation", async () => {
    const { marketplace, repo } = await createTestHarness();

    const cloned = marketplace.cloneStrategy("strat-rwa-balance-v1", WALLET_A, "My Custom RWA Strategy");
    expect(cloned).toBeDefined();
    expect(cloned?.name).toBe("My Custom RWA Strategy");
    expect(cloned?.id).not.toBe("strat-rwa-balance-v1");

    const walletAStrats = marketplace.listForWallet(WALLET_A);
    const walletBStrats = marketplace.listForWallet(WALLET_B);

    expect(walletAStrats.some((s) => s.id === cloned?.id)).toBe(true);
    expect(walletBStrats.some((s) => s.id === cloned?.id)).toBe(false);
    repo.close();
  });

  it("evaluates wallet context against active strategy and produces action proposals with WHY breakdown", async () => {
    const { agentEngine, repo } = await createTestHarness();

    const snapshot = await agentEngine.evaluateWallet(WALLET_A, true);

    expect(snapshot.walletAddress.toLowerCase()).toBe(WALLET_A.toLowerCase());
    expect(snapshot.activeStrategy).toBeDefined();
    expect(snapshot.proposedActions.length).toBeGreaterThan(0);

    const proposal = snapshot.proposedActions[0];
    expect(proposal).toBeDefined();
    expect(proposal?.deterministicRuleId).toBeDefined();
    expect(proposal?.deterministicReason).toBeDefined();
    expect(proposal?.explanation).toBeDefined();
    expect(proposal?.contextEvidence.length).toBeGreaterThan(0);
    expect(proposal?.policyCheckPassed).toBe(true);
    repo.close();
  });

  it("strictly enforces policy and blocks execution when route is unavailable (SPYx NO_ROUTE)", async () => {
    const { agentEngine, marketplace, repo } = await createTestHarness();

    // Clone and set a strategy specifically targeting SPYx
    const strat = marketplace.cloneStrategy("strat-rwa-balance-v1", WALLET_A, "SPYx Target Strategy");
    if (strat) {
      strat.rules = [
        {
          id: "rule-buy-spyx",
          name: "Accumulate SPYx",
          conditionVariable: "portfolioAllocation",
          operator: "<",
          thresholdValue: 50,
          action: "ACCUMULATE",
          targetAssetId: "spyx",
          priority: 1,
        },
      ];
      repo.saveAgentStrategy({
        strategy: strat,
        walletAddress: WALLET_A,
        isActive: true,
        isMarketplace: false,
      });
      marketplace.setActiveStrategy(WALLET_A, strat.id);
    }

    const snapshot = await agentEngine.evaluateWallet(WALLET_A, true);
    const spyxProposal = snapshot.proposedActions.find((p) => p.assetId === "spyx");

    expect(spyxProposal).toBeDefined();
    expect(spyxProposal?.policyCheckPassed).toBe(false);
    expect(spyxProposal?.policyViolationReason).toContain("NO_ROUTE");
    repo.close();
  });

  it("answers wallet-aware questions accurately via Ask Agent Q&A", async () => {
    const { agentEngine, repo } = await createTestHarness();

    // 1. Balance / portfolio query
    const res1 = await agentEngine.askAgent(WALLET_A, "What is my current portfolio balance and stablecoin reserve?");
    expect(res1.confidence).toBe("HIGH");
    expect(res1.answer).toContain("estimated portfolio value");
    expect(res1.citations.length).toBeGreaterThan(0);

    // 2. Proposal reasoning query
    const res2 = await agentEngine.askAgent(WALLET_A, "Why did the agent propose this rebalancing action?");
    expect(res2.confidence).toBe("HIGH");
    expect(res2.answer).toContain("ALIVE Agent");

    // 3. Asset tradeability query
    const res3 = await agentEngine.askAgent(WALLET_A, "Can I buy SPYx on X Layer right now?");
    expect(res3.confidence).toBe("HIGH");
    expect(res3.answer).toContain("NO_ROUTE");
    repo.close();
  });
});
