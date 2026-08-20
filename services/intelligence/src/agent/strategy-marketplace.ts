import { randomUUID } from "node:crypto";
import {
  AgentStrategySchema,
  type AgentStrategy,
} from "@alive/shared";

import type { IntelligenceRepository } from "../repository.js";

export const DEFAULT_MARKETPLACE_STRATEGIES: AgentStrategy[] = [
  {
    id: "strat-rwa-balance-v1",
    name: "RWA Core Balance v1",
    description:
      "Maintains balanced exposure across tokenized equities, sovereign debt, and stablecoin reserves on X Layer. Generates rebalancing proposals when individual asset weights diverge.",
    author: "ALIVE Research",
    publishedAt: "2026-08-15T00:00:00.000Z",
    version: "1.0.0",
    targetAssetClasses: ["EQUITY", "TREASURY", "CASH"],
    riskTolerance: "MODERATE",
    rules: [
      {
        id: "rule-max-single-asset",
        name: "Max Single Asset Allocation",
        conditionVariable: "portfolioAllocation",
        operator: ">",
        thresholdValue: 35, // Max 35% in any single RWA
        action: "TRIM",
        priority: 1,
      },
      {
        id: "rule-min-stablecoin",
        name: "Minimum Stablecoin Reserve",
        conditionVariable: "stablecoinPct",
        operator: "<",
        thresholdValue: 15, // Keep at least 15% in stablecoins
        action: "REBALANCE",
        priority: 2,
      },
      {
        id: "rule-accumulate-meta",
        name: "Target Meta Exposure",
        conditionVariable: "portfolioAllocation",
        operator: "<",
        thresholdValue: 20,
        action: "ACCUMULATE",
        targetAssetId: "wmetax",
        priority: 3,
      },
    ],
    pricing: {
      isPaid: false,
      priceUsd: 0,
    },
    subscribersCount: 142,
    rating: 4.8,
    isFeatured: true,
  },
  {
    id: "strat-treasury-yield-v1",
    name: "Sovereign Yield & Treasury Maximizer",
    description:
      "Prioritizes institutional-grade sovereign treasury debt tokens and stable yield generators with deterministic backing and short settlement periods.",
    author: "Sovereign Alpha",
    publishedAt: "2026-08-16T00:00:00.000Z",
    version: "1.1.0",
    targetAssetClasses: ["TREASURY", "CASH"],
    riskTolerance: "CONSERVATIVE",
    rules: [
      {
        id: "rule-min-stablecoin-treasury",
        name: "High Liquidity Reserve",
        conditionVariable: "stablecoinPct",
        operator: "<",
        thresholdValue: 30,
        action: "REBALANCE",
        priority: 1,
      },
    ],
    pricing: {
      isPaid: false,
      priceUsd: 0,
    },
    subscribersCount: 98,
    rating: 4.9,
    isFeatured: true,
  },
  {
    id: "strat-tech-equity-v1",
    name: "X Layer Tech Equity Accumulator",
    description:
      "Systematically accumulates verified tokenized technology equities deployed on X Layer when market liquidity and route depth are optimal.",
    author: "Backed Capital",
    publishedAt: "2026-08-17T00:00:00.000Z",
    version: "1.0.2",
    targetAssetClasses: ["EQUITY"],
    riskTolerance: "DYNAMIC",
    rules: [
      {
        id: "rule-accumulate-wmetax",
        name: "Accumulate wMETAx on X Layer",
        conditionVariable: "portfolioAllocation",
        operator: "<",
        thresholdValue: 40,
        action: "ACCUMULATE",
        targetAssetId: "wmetax",
        priority: 1,
      },
    ],
    pricing: {
      isPaid: false,
      priceUsd: 0,
    },
    subscribersCount: 215,
    rating: 4.7,
    isFeatured: true,
  },
  {
    id: "strat-conservative-reserve-v1",
    name: "Conservative Capital Preservation",
    description:
      "Strict preservation strategy designed to maintain over 50% cash/stablecoin allocations and prevent unhedged single-asset concentration.",
    author: "ALIVE Protocol",
    publishedAt: "2026-08-18T00:00:00.000Z",
    version: "1.0.0",
    targetAssetClasses: ["CASH", "TREASURY"],
    riskTolerance: "CONSERVATIVE",
    rules: [
      {
        id: "rule-preserve-cash",
        name: "50% Stablecoin Floor",
        conditionVariable: "stablecoinPct",
        operator: "<",
        thresholdValue: 50,
        action: "REBALANCE",
        priority: 1,
      },
    ],
    pricing: {
      isPaid: false,
      priceUsd: 0,
    },
    subscribersCount: 76,
    rating: 4.9,
    isFeatured: false,
  },
];

export class StrategyMarketplaceService {
  readonly #repository: IntelligenceRepository;

  constructor(repository: IntelligenceRepository) {
    this.#repository = repository;
    this.seedDefaultStrategies();
  }

  seedDefaultStrategies(): void {
    for (const strategy of DEFAULT_MARKETPLACE_STRATEGIES) {
      const existing = this.#repository.getAgentStrategy(strategy.id);
      if (!existing) {
        this.#repository.saveAgentStrategy({
          strategy,
          isActive: false,
          isMarketplace: true,
        });
      }
    }
  }

  listMarketplace(): AgentStrategy[] {
    const list = this.#repository.listMarketplaceStrategies();
    if (list.length === 0) {
      this.seedDefaultStrategies();
      return this.#repository.listMarketplaceStrategies();
    }
    return list;
  }

  listForWallet(walletAddress: string): AgentStrategy[] {
    const normalized = walletAddress.toLowerCase();
    const walletStrategies = this.#repository.listWalletStrategies(normalized);
    if (walletStrategies.length === 0) {
      // If wallet has no custom cloned strategies yet, clone default core strategy
      const core = DEFAULT_MARKETPLACE_STRATEGIES[0];
      if (core) {
        const cloned = this.cloneStrategy(core.id, normalized);
        return cloned ? [cloned] : [];
      }
    }
    return walletStrategies;
  }

  getActiveStrategy(walletAddress: string): AgentStrategy | undefined {
    const normalized = walletAddress.toLowerCase();
    const active = this.#repository.getActiveStrategyForWallet(normalized);
    if (active) return active;

    // Default to first strategy
    const list = this.listForWallet(normalized);
    if (list[0]) {
      this.#repository.setActiveStrategyForWallet(normalized, list[0].id);
      return list[0];
    }
    return undefined;
  }

  cloneStrategy(
    strategyId: string,
    walletAddress: string,
    customName?: string,
  ): AgentStrategy | undefined {
    const normalized = walletAddress.toLowerCase();
    const target = this.#repository.getAgentStrategy(strategyId);
    if (!target) return undefined;

    const newId = `strat-custom-${randomUUID().slice(0, 8)}`;
    const cloned: AgentStrategy = {
      ...target.strategy,
      id: newId,
      name: customName || `${target.strategy.name} (Custom)`,
      author: `Wallet ${normalized.slice(0, 6)}...${normalized.slice(-4)}`,
      publishedAt: new Date().toISOString(),
      isCommunity: true,
      pricing: {
        isPaid: false,
        priceUsd: 0,
      },
    };

    const validated = AgentStrategySchema.parse(cloned);
    this.#repository.saveAgentStrategy({
      strategy: validated,
      walletAddress: normalized,
      isActive: true,
      isMarketplace: false,
    });
    this.#repository.setActiveStrategyForWallet(normalized, validated.id);

    return validated;
  }

  setActiveStrategy(walletAddress: string, strategyId: string): boolean {
    const normalized = walletAddress.toLowerCase();
    const target = this.#repository.getAgentStrategy(strategyId);
    if (!target) return false;

    // Check ownership if strategy is wallet-specific
    if (target.walletAddress && target.walletAddress !== normalized) {
      return false; // Cannot activate another wallet's private strategy
    }

    this.#repository.setActiveStrategyForWallet(normalized, strategyId);
    return true;
  }
}
