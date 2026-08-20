import {
  type AgentContextSnapshot,
  type AgentInteraction,
  type AgentStrategy,
  type AliveTradeRecord,
  type WalletContext,
} from "@alive/shared";

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

export async function recordAgentInteraction(
  interaction: AgentInteraction,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `/api/agents/${encodeURIComponent(interaction.walletAddress)}/interactions`,
    {
      method: "POST",
      body: JSON.stringify(interaction),
    },
  );
}

export async function fetchMarketplaceStrategies(): Promise<AgentStrategy[]> {
  const res = await request<{ strategies: AgentStrategy[] }>("/api/strategies/marketplace");
  return res.strategies;
}

export async function fetchWalletStrategies(
  walletAddress: string,
): Promise<AgentStrategy[]> {
  const res = await request<{ strategies: AgentStrategy[] }>(
    `/api/strategies/wallet/${encodeURIComponent(walletAddress)}`,
  );
  return res.strategies;
}

export async function cloneStrategy(
  strategyId: string,
  walletAddress: string,
  customName?: string,
): Promise<AgentStrategy> {
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
  await request<{ success: boolean }>("/api/strategies/active", {
    method: "POST",
    body: JSON.stringify({ walletAddress, strategyId }),
  });
}

export async function recordAliveTrade(
  trade: AliveTradeRecord,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/trade/record-alive-trade", {
    method: "POST",
    body: JSON.stringify(trade),
  });
}
