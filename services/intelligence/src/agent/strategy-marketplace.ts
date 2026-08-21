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
    targetAssetClasses: ["EQUITY", "TREASURY", "CASH"],
    rules: [
      {
        id: "rule-max-single-asset",
        name: "Max Single Asset Allocation",
        conditionVariable: "portfolioAllocation",
        operator: ">",
        thresholdValue: 35,
        action: "TRIM",
        priority: 1,
      },
      {
        id: "rule-min-stablecoin",
        name: "Minimum Stablecoin Reserve",
        conditionVariable: "stablecoinPct",
        operator: "<",
        thresholdValue: 15,
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
  },
  {
    id: "strat-treasury-yield-v1",
    name: "Sovereign Yield & Treasury Maximizer",
    description:
      "Prioritizes institutional-grade sovereign treasury debt tokens and stable yield generators with deterministic backing and short settlement periods.",
    author: "Sovereign Alpha",
    publishedAt: "2026-08-16T00:00:00.000Z",
    targetAssetClasses: ["TREASURY", "CASH"],
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
  },
  {
    id: "strat-tech-equity-v1",
    name: "X Layer Tech Equity Accumulator",
    description:
      "Systematically accumulates verified tokenized technology equities deployed on X Layer when market liquidity and route depth are optimal.",
    author: "Backed Capital",
    publishedAt: "2026-08-17T00:00:00.000Z",
    targetAssetClasses: ["EQUITY"],
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
  },
  {
    id: "strat-conservative-reserve-v1",
    name: "Conservative Capital Preservation",
    description:
      "Strict preservation strategy designed to maintain over 50% cash/stablecoin allocations and prevent unhedged single-asset concentration.",
    author: "ALIVE Protocol",
    publishedAt: "2026-08-18T00:00:00.000Z",
    targetAssetClasses: ["CASH", "TREASURY"],
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
  },
];

export class StrategyMarketplaceService {
  readonly #repository: IntelligenceRepository;
  readonly #inMemoryClones: Map<string, AgentStrategy> = new Map();
  readonly #activeStrategies: Map<string, string> = new Map();

  constructor(repository: IntelligenceRepository) {
    this.#repository = repository;
  }

  listMarketplace(): AgentStrategy[] {
    const custom = Array.from(this.#inMemoryClones.values()).filter((s) => !s.isCommunity);
    return [...DEFAULT_MARKETPLACE_STRATEGIES, ...custom];
  }

  listForWallet(walletAddress: string): AgentStrategy[] {
    const norm = walletAddress.toLowerCase();
    const walletCustom = Array.from(this.#inMemoryClones.values()).filter(
      (s) => s.author.toLowerCase() === norm,
    );
    return [...DEFAULT_MARKETPLACE_STRATEGIES, ...walletCustom];
  }

  getStrategy(id: string): AgentStrategy | null {
    const defaultStrat = DEFAULT_MARKETPLACE_STRATEGIES.find((s) => s.id === id);
    if (defaultStrat) return defaultStrat;

    return this.#inMemoryClones.get(id) ?? null;
  }

  getActiveStrategy(walletAddress: string): AgentStrategy {
    const norm = walletAddress.toLowerCase();
    const activeId = this.#activeStrategies.get(norm);
    if (activeId) {
      const strat = this.getStrategy(activeId);
      if (strat) return strat;
    }

    return DEFAULT_MARKETPLACE_STRATEGIES[0]!;
  }

  cloneStrategy(
    strategyId: string,
    walletAddress: string,
    customName?: string,
  ): AgentStrategy | null {
    const original = this.getStrategy(strategyId);
    if (!original) {
      return null;
    }

    const cloned: AgentStrategy = {
      ...original,
      id: `strat-${randomUUID()}`,
      name: customName || `${original.name} (Custom)`,
      author: walletAddress,
      clonedFrom: original.id,
      isCommunity: true,
      publishedAt: new Date().toISOString(),
      pricing: {
        isPaid: false,
        priceUsd: 0,
      },
    };

    AgentStrategySchema.parse(cloned);
    this.#inMemoryClones.set(cloned.id, cloned);
    return cloned;
  }

  setActiveStrategy(
    walletAddress: string,
    strategyId: string,
  ): boolean {
    const strategy = this.getStrategy(strategyId);
    if (!strategy) {
      return false;
    }

    const norm = walletAddress.toLowerCase();
    this.#activeStrategies.set(norm, strategyId);
    return true;
  }
}
