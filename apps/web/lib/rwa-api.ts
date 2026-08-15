import {
  MarketQuoteSchema,
  PortfolioPolicySchema,
  RwaAssetSchema,
  type AssetClass,
  type MarketQuote,
  type PortfolioPolicy,
  type RwaAsset,
} from "@alive/shared";

const INTELLIGENCE_URL = (
  process.env.NEXT_PUBLIC_INTELLIGENCE_URL ?? "http://127.0.0.1:4200"
).replace(/\/$/u, "");

export class RwaApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = "RwaApiError";
  }
}

type ErrorEnvelope = {
  error?: { code?: unknown; message?: unknown; issues?: unknown };
};

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${INTELLIGENCE_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch (error) {
    throw new RwaApiError(
      "INTELLIGENCE_OFFLINE",
      "The ALIVE intelligence service is offline. Start it with pnpm dev.",
      0,
      error,
    );
  }
  const payload = (await response.json().catch(() => undefined)) as
    ErrorEnvelope | undefined;
  if (!response.ok) {
    const code =
      typeof payload?.error?.code === "string"
        ? payload.error.code
        : `HTTP_${response.status}`;
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "The intelligence service rejected the request.";
    throw new RwaApiError(
      code,
      message,
      response.status,
      payload?.error?.issues,
    );
  }
  return payload;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RwaApiError(
      "INVALID_RESPONSE",
      `${label} returned an invalid response.`,
      502,
    );
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RwaApiError("INVALID_RESPONSE", `${label} is missing.`, 502);
  }
  return value;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

export type RwaCatalogSummary = {
  id: string;
  label: string;
  dataMode: "DEMO" | "SNAPSHOT";
  asOf: string;
  disclaimer: string;
};

export type RwaMarketQuote = MarketQuote & { ageSeconds: number };

export type PolicyRecord = {
  id: string;
  version: number;
  createdAt: string;
  originalMandate: string;
  policy: PortfolioPolicy;
  policyHash: `0x${string}`;
  explanation: string[];
  warnings: string[];
  compiler: {
    mode: "AI" | "DETERMINISTIC_FALLBACK";
    isAiGenerated: boolean;
    provider: string;
    model?: string;
  };
};

export type AllocationDetail = {
  assetId: string;
  weightBps: number;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  issuer: string;
  estimatedAprBps: number;
  liquidityScore: number;
  riskScore: number;
  reasons: string[];
};

export type PolicyViolation = {
  code: string;
  message: string;
  assetId?: string;
  expected?: number;
  actual?: number;
};

export type PortfolioProposal = {
  feasible: boolean;
  allocations: AllocationDetail[];
  excludedAssets: {
    assetId: string;
    symbol: string;
    reasons: PolicyViolation[];
  }[];
  metrics: {
    expectedAprBps: number;
    riskScore: number;
    liquidityScore: number;
    cashBps: number;
    issuerExposureBps: Record<string, number>;
    assetClassExposureBps: Partial<Record<AssetClass, number>>;
  };
  violations: PolicyViolation[];
  calculation: {
    engine: "ALIVE_DETERMINISTIC_OPTIMIZER_V1";
    asOf: string;
    objective: PortfolioPolicy["objective"];
    allocationTotalBps: number;
  };
};

export type Allocation = { assetId: string; weightBps: number };

export type RebalanceTrade = {
  assetId: string;
  symbol: string;
  side: "BUY" | "SELL";
  weightBps: number;
};

export type RebalanceResult = {
  id: string;
  createdAt: string;
  rebalance: {
    feasible: boolean;
    before: Allocation[];
    after: AllocationDetail[];
    trades: RebalanceTrade[];
    turnoverBps: number;
    drift: {
      withinPolicy: boolean;
      violations: PolicyViolation[];
      currentMetrics: PortfolioProposal["metrics"];
    };
    proposal: PortfolioProposal;
  };
  marketSnapshotHash: `0x${string}`;
  dataMode: string;
  disclaimer: string;
};

function parsePolicyRecord(input: unknown): PolicyRecord {
  const value = record(input, "Policy");
  const compiler = record(value.compiler, "Policy compiler");
  const mode = compiler.mode;
  if (mode !== "AI" && mode !== "DETERMINISTIC_FALLBACK") {
    throw new RwaApiError(
      "INVALID_RESPONSE",
      "Policy compiler mode is invalid.",
      502,
    );
  }
  return {
    id: text(value.id, "Policy ID"),
    version: Number(value.version),
    createdAt: text(value.createdAt, "Policy creation time"),
    originalMandate: text(value.originalMandate, "Original mandate"),
    policy: PortfolioPolicySchema.parse(value.policy),
    policyHash: text(value.policyHash, "Policy hash") as `0x${string}`,
    explanation: stringList(value.explanation),
    warnings: stringList(value.warnings),
    compiler: {
      mode,
      isAiGenerated: compiler.isAiGenerated === true,
      provider: text(compiler.provider, "Policy compiler provider"),
      ...(typeof compiler.model === "string" ? { model: compiler.model } : {}),
    },
  };
}

function parseProposal(input: unknown): PortfolioProposal {
  const value = record(
    input,
    "Portfolio proposal",
  ) as unknown as PortfolioProposal;
  if (
    typeof value.feasible !== "boolean" ||
    !Array.isArray(value.allocations) ||
    !Array.isArray(value.violations) ||
    typeof value.calculation?.allocationTotalBps !== "number"
  ) {
    throw new RwaApiError(
      "INVALID_RESPONSE",
      "Portfolio proposal is invalid.",
      502,
    );
  }
  return value;
}

export async function getIntelligenceHealth() {
  return record(await request("/health"), "Health");
}

export async function listRwaAssets(): Promise<{
  catalog: RwaCatalogSummary;
  assets: RwaAsset[];
}> {
  const payload = record(await request("/api/assets"), "Asset catalog");
  const catalog = record(payload.catalog, "Catalog summary");
  return {
    catalog: {
      id: text(catalog.id, "Catalog ID"),
      label: text(catalog.label, "Catalog label"),
      dataMode: catalog.dataMode === "SNAPSHOT" ? "SNAPSHOT" : "DEMO",
      asOf: text(catalog.asOf, "Catalog timestamp"),
      disclaimer: text(catalog.disclaimer, "Catalog disclaimer"),
    },
    assets: RwaAssetSchema.array().parse(payload.assets),
  };
}

export async function getRwaAsset(assetId: string): Promise<{
  asset: RwaAsset;
  disclaimer: string;
}> {
  const payload = record(
    await request(`/api/assets/${encodeURIComponent(assetId)}`),
    "Asset passport",
  );
  return {
    asset: RwaAssetSchema.parse(payload.asset),
    disclaimer: text(payload.disclaimer, "Asset disclaimer"),
  };
}

export async function listRwaMarkets(): Promise<{
  dataMode: "DEMO" | "SNAPSHOT" | "LIVE";
  capturedAt: string;
  disclaimer: string;
  quotes: RwaMarketQuote[];
}> {
  const payload = record(await request("/api/markets"), "Market snapshot");
  if (!Array.isArray(payload.quotes)) {
    throw new RwaApiError(
      "INVALID_RESPONSE",
      "Market quotes are missing.",
      502,
    );
  }
  return {
    dataMode:
      payload.dataMode === "LIVE"
        ? "LIVE"
        : payload.dataMode === "SNAPSHOT"
          ? "SNAPSHOT"
          : "DEMO",
    capturedAt: text(payload.capturedAt, "Market snapshot time"),
    disclaimer: text(payload.disclaimer, "Market data disclaimer"),
    quotes: payload.quotes.map((candidate) => {
      const value = record(candidate, "Market quote");
      const { ageSeconds, ...quote } = value;
      return {
        ...MarketQuoteSchema.parse(quote),
        ageSeconds: Number(ageSeconds),
      };
    }),
  };
}

export async function compileRwaPolicy(mandate: string): Promise<{
  policy: PolicyRecord;
  trust: {
    aiOutputValidated: boolean;
    deterministicPolicyHash: boolean;
    userApprovalRequired: boolean;
    onchainRegistered: boolean;
  };
}> {
  const payload = record(
    await request("/api/policies/compile", {
      method: "POST",
      body: JSON.stringify({ mandate }),
    }),
    "Policy compilation",
  );
  const trust = record(payload.trust, "Policy trust boundary");
  return {
    policy: parsePolicyRecord(payload.policy),
    trust: {
      aiOutputValidated: trust.aiOutputValidated === true,
      deterministicPolicyHash: trust.deterministicPolicyHash === true,
      userApprovalRequired: trust.userApprovalRequired === true,
      onchainRegistered: trust.onchainRegistered === true,
    },
  };
}

export async function getRwaPolicy(policyId: string): Promise<PolicyRecord> {
  const payload = record(
    await request(`/api/policies/${encodeURIComponent(policyId)}`),
    "Policy record",
  );
  return parsePolicyRecord(payload.policy);
}

export async function optimizeRwaPortfolio(policyId: string): Promise<{
  id: string;
  createdAt: string;
  proposal: PortfolioProposal;
  marketSnapshotHash: `0x${string}`;
  dataMode: string;
  disclaimer: string;
}> {
  const payload = record(
    await request("/api/portfolios/optimize", {
      method: "POST",
      body: JSON.stringify({ policyId }),
    }),
    "Portfolio optimization",
  );
  return {
    id: text(payload.id, "Proposal ID"),
    createdAt: text(payload.createdAt, "Proposal creation time"),
    proposal: parseProposal(payload.proposal),
    marketSnapshotHash: text(
      payload.marketSnapshotHash,
      "Market snapshot hash",
    ) as `0x${string}`,
    dataMode: text(payload.dataMode, "Market data mode"),
    disclaimer: text(payload.disclaimer, "Market data disclaimer"),
  };
}

export async function checkRwaPolicy(
  policyId: string,
  allocations: Allocation[],
): Promise<{
  result: {
    withinPolicy: boolean;
    violations: PolicyViolation[];
    currentMetrics: unknown;
  };
  marketSnapshotHash: `0x${string}`;
  enforcement: "DETERMINISTIC_SIMULATION";
  onchainExecutionAttempted: false;
}> {
  const payload = record(
    await request("/api/policies/check", {
      method: "POST",
      body: JSON.stringify({ policyId, allocations }),
    }),
    "Policy check",
  );
  const result = record(payload.result, "Policy check result");
  return {
    result: {
      withinPolicy: result.withinPolicy === true,
      violations: Array.isArray(result.violations)
        ? (result.violations as PolicyViolation[])
        : [],
      currentMetrics: result.currentMetrics,
    },
    marketSnapshotHash: text(
      payload.marketSnapshotHash,
      "Market snapshot hash",
    ) as `0x${string}`,
    enforcement: "DETERMINISTIC_SIMULATION",
    onchainExecutionAttempted: false,
  };
}

export async function proposeRwaRebalance(
  policyId: string,
  allocations: Allocation[],
): Promise<RebalanceResult> {
  const payload = record(
    await request("/api/rebalance", {
      method: "POST",
      body: JSON.stringify({ policyId, allocations }),
    }),
    "Rebalance proposal",
  );
  const rebalance = record(payload.rebalance, "Rebalance result");
  const drift = record(rebalance.drift, "Rebalance drift");
  if (
    typeof rebalance.feasible !== "boolean" ||
    !Array.isArray(rebalance.before) ||
    !Array.isArray(rebalance.after) ||
    !Array.isArray(rebalance.trades) ||
    typeof rebalance.turnoverBps !== "number" ||
    typeof drift.withinPolicy !== "boolean"
  ) {
    throw new RwaApiError(
      "INVALID_RESPONSE",
      "Rebalance result is invalid.",
      502,
    );
  }
  return {
    id: text(payload.id, "Rebalance proposal ID"),
    createdAt: text(payload.createdAt, "Rebalance creation time"),
    rebalance: {
      feasible: rebalance.feasible,
      before: rebalance.before as Allocation[],
      after: rebalance.after as AllocationDetail[],
      trades: rebalance.trades as RebalanceTrade[],
      turnoverBps: rebalance.turnoverBps,
      drift: {
        withinPolicy: drift.withinPolicy,
        violations: Array.isArray(drift.violations)
          ? (drift.violations as PolicyViolation[])
          : [],
        currentMetrics: record(
          drift.currentMetrics,
          "Current portfolio metrics",
        ) as PortfolioProposal["metrics"],
      },
      proposal: parseProposal(rebalance.proposal),
    },
    marketSnapshotHash: text(
      payload.marketSnapshotHash,
      "Market snapshot hash",
    ) as `0x${string}`,
    dataMode: text(payload.dataMode, "Market data mode"),
    disclaimer: text(payload.disclaimer, "Market data disclaimer"),
  };
}
