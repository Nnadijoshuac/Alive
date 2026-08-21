import {
  type AgentContextSnapshot,
  type AgentInteraction,
  type AgentStrategy,
  type AliveTradeRecord,
  type WalletContext,
} from "@alive/shared";
import { convexQuery, convexMutation } from "./convex-http";

const INTELLIGENCE_URL = (
  process.env.NEXT_PUBLIC_INTELLIGENCE_URL ?? "http://127.0.0.1:4200"
).replace(/\/$/u, "");

export class AgentApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AgentApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${INTELLIGENCE_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new AgentApiError(
      "NETWORK_ERROR",
      `Failed to fetch ${path}: ${cause instanceof Error ? cause.message : "network failure"}`,
      0,
    );
  }

  const text = await response.text();
  let json: unknown = undefined;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      // non-json body
    }
  }

  if (!response.ok) {
    const err = json as { error?: { code?: string; message?: string } } | undefined;
    throw new AgentApiError(
      err?.error?.code ?? "HTTP_ERROR",
      err?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
    );
  }

  return json as T;
}

export async function fetchWalletContext(
  walletAddress: string,
  force = false,
): Promise<WalletContext> {
  try {
    const snap = await convexQuery<{ snapshotJson?: string }>("wallet:getWalletSnapshot", { walletAddress });
    if (snap?.snapshotJson) {
      return JSON.parse(snap.snapshotJson);
    }
  } catch {
    // Fallback
  }
  return request<WalletContext>(
    `/api/wallet/${encodeURIComponent(walletAddress)}/context${force ? "?force=true" : ""}`,
  );
}

export async function syncWalletContext(
  walletAddress: string,
): Promise<WalletContext> {
  return request<WalletContext>(
    `/api/wallet/${encodeURIComponent(walletAddress)}/sync`,
    { method: "POST" },
  );
}

export async function fetchAgentSnapshot(
  walletAddress: string,
  force = false,
): Promise<AgentContextSnapshot> {
  if (!force) {
    try {
      const snap = await convexQuery<{ snapshotJson?: string }>("agent:getAgentSnapshot", { walletAddress });
      if (snap?.snapshotJson) {
        return JSON.parse(snap.snapshotJson);
      }
    } catch {
      // Fallback
    }
  }
  if (force) {
    return request<AgentContextSnapshot>(
      `/api/agents/${encodeURIComponent(walletAddress)}/evaluate?force=true`,
      { method: "POST" },
    );
  }
  return request<AgentContextSnapshot>(
    `/api/agents/${encodeURIComponent(walletAddress)}/snapshot`,
  );
}

export async function askAgent(
  walletAddress: string,
  question: string,
): Promise<{ answer: string; confidence: "HIGH" | "MEDIUM" | "LOW"; citations: string[] }> {
  return request<{ answer: string; confidence: "HIGH" | "MEDIUM" | "LOW"; citations: string[] }>(
    `/api/agents/${encodeURIComponent(walletAddress)}/ask`,
    {
      method: "POST",
      body: JSON.stringify({ question }),
    },
  );
}

export async function fetchAgentInteractions(
  walletAddress: string,
): Promise<AgentInteraction[]> {
  try {
    const items = await convexQuery<AgentInteraction[]>("agent:getAgentInteractions", { walletAddress });
    if (items && items.length > 0) {
      return items;
    }
  } catch {
    // Fallback
  }
  return request<AgentInteraction[]>(
    `/api/agents/${encodeURIComponent(walletAddress)}/interactions`,
  );
}

export async function recordAgentInteraction(
  interaction: AgentInteraction,
): Promise<{ success: boolean }> {
  try {
    const interactionArgs: {
      interactionId: string;
      agentId: string;
      walletAddress: string;
      actionId: string;
      event: string;
      originalAmount?: string;
      editedAmount?: string;
      reason?: string;
      timestamp: string;
    } = {
      interactionId: interaction.id ?? `int_${Date.now()}`,
      agentId: interaction.agentId ?? "alive-core-agent",
      walletAddress: interaction.walletAddress,
      actionId: interaction.actionId ?? "act-default",
      event: interaction.event,
      timestamp: interaction.timestamp ?? new Date().toISOString(),
    };
    if (interaction.originalAmount) interactionArgs.originalAmount = interaction.originalAmount;
    if (interaction.editedAmount) interactionArgs.editedAmount = interaction.editedAmount;
    if (interaction.reason) interactionArgs.reason = interaction.reason;

    await convexMutation("agent:recordAgentInteraction", interactionArgs);
    return { success: true };
  } catch (err) {
    console.warn("Convex recordAgentInteraction fallback:", err);
  }
  return request<{ success: boolean }>(
    `/api/agents/${encodeURIComponent(interaction.walletAddress)}/interactions`,
    {
      method: "POST",
      body: JSON.stringify(interaction),
    },
  );
}

export const CANONICAL_MARKETPLACE_STRATEGIES: AgentStrategy[] = [
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

export type MarketplaceStrategySource = "PERSISTED" | "SERVICE" | "REFERENCE";

export type MarketplaceStrategyResult = {
  strategies: AgentStrategy[];
  dataMode: MarketplaceStrategySource;
};

export async function fetchMarketplaceStrategyResult(): Promise<MarketplaceStrategyResult> {
  try {
    const rows = await convexQuery<Array<{ strategyJson: string }>>("strategies:getMarketplaceStrategies", {});
    if (rows && rows.length > 0) {
      return {
        strategies: rows.map((r) => JSON.parse(r.strategyJson)),
        dataMode: "PERSISTED",
      };
    }
  } catch (err) {
    console.warn("Convex fetchMarketplaceStrategies fallback:", err);
  }
  try {
    const res = await request<{ strategies: AgentStrategy[] }>("/api/strategies/marketplace");
    if (res?.strategies && res.strategies.length > 0) {
      return { strategies: res.strategies, dataMode: "SERVICE" };
    }
  } catch {
    // Reference templates remain available for inspecting the preview UI.
  }
  return {
    strategies: CANONICAL_MARKETPLACE_STRATEGIES,
    dataMode: "REFERENCE",
  };
}

export async function fetchMarketplaceStrategies(): Promise<AgentStrategy[]> {
  return (await fetchMarketplaceStrategyResult()).strategies;
}

export async function fetchWalletStrategies(
  walletAddress: string,
): Promise<AgentStrategy[]> {
  try {
    const rows = await convexQuery<Array<{ strategyJson: string }>>("strategies:getUserStrategies", { walletAddress });
    if (rows && rows.length > 0) {
      return rows.map((r) => JSON.parse(r.strategyJson));
    }
  } catch (err) {
    console.warn("Convex fetchWalletStrategies fallback:", err);
  }
  try {
    const res = await request<{ strategies: AgentStrategy[] }>(
      `/api/strategies/wallet/${encodeURIComponent(walletAddress)}`,
    );
    if (res?.strategies && res.strategies.length > 0) {
      return res.strategies;
    }
  } catch {
    // Fallback
  }
  return CANONICAL_MARKETPLACE_STRATEGIES;
}

export async function cloneStrategy(
  strategyId: string,
  walletAddress: string,
  customName?: string,
): Promise<AgentStrategy> {
  try {
    const marketplace = await convexQuery<Array<{ id: string; strategyJson: string }>>("strategies:getMarketplaceStrategies", {});
    const base = marketplace.find((s) => s.id === strategyId);
    if (base) {
      const parsed = JSON.parse(base.strategyJson) as AgentStrategy;
      const clonedId = `strat_${Date.now()}_${walletAddress.slice(2, 6)}`;
      const cloned: AgentStrategy = {
        ...parsed,
        id: clonedId,
        name: customName ?? `${parsed.name} (Active)`,
        clonedFrom: strategyId,
        publishedAt: new Date().toISOString(),
      };
      await convexMutation("strategies:saveStrategy", {
        strategyId: clonedId,
        name: cloned.name,
        walletAddress,
        strategyJson: JSON.stringify(cloned),
        isActive: false,
        isMarketplace: false,
      });
      return cloned;
    }
  } catch (err) {
    console.warn("Convex cloneStrategy fallback:", err);
  }
  const res = await request<{ strategy: AgentStrategy }>("/api/strategies/clone", {
    method: "POST",
    body: JSON.stringify({ strategyId, walletAddress, customName }),
  });
  return res.strategy;
}

export async function setActiveStrategy(
  walletAddress: string,
  strategyId: string,
): Promise<void> {
  try {
    await convexMutation("strategies:setActiveStrategy", {
      walletAddress,
      strategyId,
    });
    return;
  } catch (err) {
    console.warn("Convex setActiveStrategy fallback:", err);
  }
  await request<{ success: boolean }>("/api/strategies/active", {
    method: "POST",
    body: JSON.stringify({ walletAddress, strategyId }),
  });
}

export async function recordAliveTrade(
  trade: AliveTradeRecord,
): Promise<{ success: boolean }> {
  try {
    const tradeArgs: {
      txHash: string;
      walletAddress: string;
      assetId: string;
      action: string;
      amountIn: string;
      amountOutExpected: string;
      chainId: number;
      status: string;
      executedAt: string;
      agentId?: string;
      strategyId?: string;
      quoteJson?: string;
    } = {
      txHash: trade.txHash,
      walletAddress: trade.walletAddress,
      assetId: trade.assetId,
      action: trade.action,
      amountIn: trade.amountIn,
      amountOutExpected: trade.amountOutExpected,
      chainId: trade.chainId,
      status: trade.status,
      executedAt: trade.executedAt,
    };
    if (trade.agentId) tradeArgs.agentId = trade.agentId;
    if (trade.strategyId) tradeArgs.strategyId = trade.strategyId;
    if (trade.quoteJson) tradeArgs.quoteJson = trade.quoteJson;

    await convexMutation("trades:recordAliveTrade", tradeArgs);
    return { success: true };
  } catch (err) {
    console.warn("Convex recordAliveTrade fallback:", err);
  }
  return request<{ success: boolean }>("/api/trade/record-alive-trade", {
    method: "POST",
    body: JSON.stringify(trade),
  });
}

// Aliases for component convenience
export const getAgentSnapshot = fetchAgentSnapshot;
export const evaluateAgentStrategy = (address: string) => fetchAgentSnapshot(address, true);
export const askAgentQuestion = askAgent;
export const getMarketplaceStrategies = fetchMarketplaceStrategyResult;
