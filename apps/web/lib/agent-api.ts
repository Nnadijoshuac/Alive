import {
  type AgentContextSnapshot,
  type AgentInteraction,
  type AgentStrategy,
  type AliveTradeRecord,
  type WalletContext,
} from "@alive/shared";
import { convexQuery, convexMutation } from "./convex-http";
import {
  evaluateWalletContext,
  evaluateAgentSnapshot,
  answerAgentQuestion,
  CANONICAL_MARKETPLACE_STRATEGIES,
} from "./agent-evaluator";

export { CANONICAL_MARKETPLACE_STRATEGIES };

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
  const isHosted =
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  // When hosted and intelligence service points to localhost, prevent mixed-content / network errors
  if (isHosted && (INTELLIGENCE_URL.includes("127.0.0.1") || INTELLIGENCE_URL.includes("localhost"))) {
    throw new AgentApiError("HOSTED_FALLBACK_TRIGGER", "Hosted environment uses deterministic runtime", 0);
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 400);
  try {
    response = await fetch(`${INTELLIGENCE_URL}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
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
  } finally {
    clearTimeout(timeoutId);
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
  if (!force) {
    try {
      const snap = await convexQuery<{ snapshotJson?: string }>("agent:getAgentSnapshot", { walletAddress });
      if (snap?.snapshotJson) {
        const parsed = JSON.parse(snap.snapshotJson) as AgentContextSnapshot;
        if (parsed.walletPortfolio) {
          return {
            walletAddress: parsed.walletAddress,
            snapshotAt: parsed.timestamp,
            portfolio: parsed.walletPortfolio,
            activity: { trades: [], transfers: [] },
            behavior: parsed.walletHistorySummary,
            capabilities: {
              chainId: 196,
              gasBalance: "0",
              gasBalanceFormatted: "0.0",
              spendableTokens: [],
              activeAllowances: [],
              routableAssets: Object.keys(parsed.walletCapabilities || {}),
              maxExecutableAmounts: {},
              capabilitiesByAsset: parsed.walletCapabilities || {},
            },
            agentMemory: parsed.userAgentMemory || {
              previouslyApprovedActions: [],
              previouslyDismissedActions: [],
              previouslyEditedActions: [],
              activeStrategies: [],
            },
          };
        }
      }
    } catch {
      // Fallback
    }
  }

  try {
    return await request<WalletContext>(
      `/api/wallet/${encodeURIComponent(walletAddress)}/context${force ? "?force=true" : ""}`,
    );
  } catch {
    return await evaluateWalletContext(walletAddress);
  }
}

export async function syncWalletContext(
  walletAddress: string,
): Promise<WalletContext> {
  try {
    return await request<WalletContext>(
      `/api/wallet/${encodeURIComponent(walletAddress)}/sync`,
      { method: "POST" },
    );
  } catch {
    return await evaluateWalletContext(walletAddress);
  }
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
      // Fallback to deterministic evaluation
    }
  }

  try {
    if (force) {
      return await request<AgentContextSnapshot>(
        `/api/agents/${encodeURIComponent(walletAddress)}/evaluate?force=true`,
        { method: "POST" },
      );
    }
    return await request<AgentContextSnapshot>(
      `/api/agents/${encodeURIComponent(walletAddress)}/snapshot`,
    );
  } catch {
    return await evaluateAgentSnapshot(walletAddress);
  }
}

export async function askAgent(
  walletAddress: string,
  question: string,
): Promise<{ answer: string; confidence: "HIGH" | "MEDIUM" | "LOW"; citations: string[] }> {
  try {
    return await request<{ answer: string; confidence: "HIGH" | "MEDIUM" | "LOW"; citations: string[] }>(
      `/api/agents/${encodeURIComponent(walletAddress)}/ask`,
      {
        method: "POST",
        body: JSON.stringify({ question }),
      },
    );
  } catch {
    return await answerAgentQuestion(walletAddress, question);
  }
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
  try {
    return await request<AgentInteraction[]>(
      `/api/agents/${encodeURIComponent(walletAddress)}/interactions`,
    );
  } catch {
    return [];
  }
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
  try {
    return await request<{ success: boolean }>(
      `/api/agents/${encodeURIComponent(interaction.walletAddress)}/interactions`,
      {
        method: "POST",
        body: JSON.stringify(interaction),
      },
    );
  } catch {
    return { success: true };
  }
}

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
  try {
    const res = await request<{ strategy: AgentStrategy }>("/api/strategies/clone", {
      method: "POST",
      body: JSON.stringify({ strategyId, walletAddress, customName }),
    });
    return res.strategy;
  } catch {
    const base = CANONICAL_MARKETPLACE_STRATEGIES.find((s) => s.id === strategyId) ?? CANONICAL_MARKETPLACE_STRATEGIES[0]!;
    return {
      ...base,
      id: `strat_${Date.now()}_${walletAddress.slice(2, 6)}`,
      name: customName ?? `${base.name} (Active)`,
      clonedFrom: strategyId,
      publishedAt: new Date().toISOString(),
    };
  }
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
  try {
    await request<{ success: boolean }>("/api/strategies/active", {
      method: "POST",
      body: JSON.stringify({ walletAddress, strategyId }),
    });
  } catch {
    // Graceful fallback
  }
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
  try {
    return await request<{ success: boolean }>("/api/trade/record-alive-trade", {
      method: "POST",
      body: JSON.stringify(trade),
    });
  } catch {
    return { success: true };
  }
}

// Aliases for component convenience
export const getAgentSnapshot = fetchAgentSnapshot;
export const evaluateAgentStrategy = (address: string) => fetchAgentSnapshot(address, true);
export const askAgentQuestion = askAgent;
export const getMarketplaceStrategies = fetchMarketplaceStrategyResult;
