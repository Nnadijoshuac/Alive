import {
  EligibilityPolicySchema,
  EligibilityVerdictSchema,
  MarketQuoteSchema,
  PortfolioPolicySchema,
  RwaAssetSchema,
  type AssetClass,
  type EligibilityPolicy,
  type EligibilityVerdict,
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

export type RwaCatalogFilters = {
  q?: string;
  chainId?: number;
  assetClass?: string;
  issuer?: string;
  verification?: "VERIFIED" | "NOT_ANALYZED" | "UNVERIFIED";
  page?: number;
  limit?: number;
};

export async function listRwaAssets(filters: RwaCatalogFilters = {}): Promise<{
  catalog: RwaCatalogSummary;
  assets: RwaAsset[];
  totalCount: number;
}> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  const payload = record(
    await request(`/api/assets${query ? `?${query}` : ""}`),
    "Asset catalog",
  );
  const pagination = payload.pagination
    ? record(payload.pagination, "Pagination")
    : undefined;
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
    totalCount:
      typeof pagination?.totalCount === "number"
        ? pagination.totalCount
        : RwaAssetSchema.array().parse(payload.assets).length,
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

export type SourceDocumentInput =
  | { kind: "fixture"; fixtureId: string; title: string }
  | { kind: "text"; text: string; title: string; uri?: string };

export type IngestedSource = {
  sourceId: string;
  assetId: string;
  sourceType: string;
  title: string;
  textHash: `0x${string}`;
  chunkCount: number;
  retrievedAt: string;
};

export type AssetSourceSummary = {
  sourceId: string;
  sourceType: string;
  title: string;
  uri?: string;
  textHash: `0x${string}`;
  chunkCount: number;
  retrievedAt: string;
};

export async function ingestAssetSource(
  assetId: string,
  sourceId: string,
  sourceType: string,
  input: SourceDocumentInput,
): Promise<IngestedSource> {
  const payload = record(
    await request(`/api/assets/${encodeURIComponent(assetId)}/ingest`, {
      method: "POST",
      body: JSON.stringify({ sourceId, sourceType, input }),
    }),
    "Source ingestion",
  );
  return {
    sourceId: text(payload.sourceId, "Source ID"),
    assetId: text(payload.assetId, "Asset ID"),
    sourceType: text(payload.sourceType, "Source type"),
    title: text(payload.title, "Source title"),
    textHash: text(payload.textHash, "Source text hash") as `0x${string}`,
    chunkCount: Number(payload.chunkCount),
    retrievedAt: text(payload.retrievedAt, "Retrieved at"),
  };
}

/**
 * Ingests ALIVE's own known-good real issuer/product documentation for this
 * asset (currently just ttbill-b's Superstate/Invesco USTB sources) --
 * never the legacy filesystem demo-fixture path. Throws RwaApiError with
 * code ASSET_HAS_NO_OFFICIAL_SOURCES (HTTP 404) for any asset without a
 * registered official source set; callers should fall back to
 * ingestAssetSource's DEMO_FIXTURE path in that case.
 */
export async function ingestOfficialSources(
  assetId: string,
): Promise<IngestedSource[]> {
  const payload = record(
    await request(`/api/assets/${encodeURIComponent(assetId)}/ingest-official-sources`, {
      method: "POST",
    }),
    "Official source ingestion",
  );
  if (!Array.isArray(payload.sources)) {
    throw new RwaApiError(
      "INVALID_RESPONSE",
      "Official source ingestion response is invalid.",
      502,
    );
  }
  return payload.sources.map((candidate) => {
    const value = record(candidate, "Official source");
    return {
      sourceId: text(value.sourceId, "Source ID"),
      assetId,
      sourceType: text(value.sourceType, "Source type"),
      title: text(value.title, "Source title"),
      textHash: text(value.textHash, "Source text hash") as `0x${string}`,
      chunkCount: Number(value.chunkCount),
      retrievedAt: text(value.retrievedAt, "Retrieved at"),
    };
  });
}

export async function listAssetSources(
  assetId: string,
): Promise<AssetSourceSummary[]> {
  const payload = record(
    await request(`/api/assets/${encodeURIComponent(assetId)}/sources`),
    "Asset sources",
  );
  if (!Array.isArray(payload.sources)) return [];
  return payload.sources.map((candidate) => {
    const value = record(candidate, "Source summary");
    return {
      sourceId: text(value.sourceId, "Source ID"),
      sourceType: text(value.sourceType, "Source type"),
      title: text(value.title, "Source title"),
      ...(typeof value.uri === "string" ? { uri: value.uri } : {}),
      textHash: text(value.textHash, "Source text hash") as `0x${string}`,
      chunkCount: Number(value.chunkCount),
      retrievedAt: text(value.retrievedAt, "Retrieved at"),
    };
  });
}

export type ExtractionResult = {
  passport: RwaAsset;
  extraction: {
    mode: "AI" | "DETERMINISTIC_FALLBACK" | "DEMO_FIXTURE";
    model?: string;
    promptVersion?: string;
    extractedAt: string;
  };
  warnings: string[];
  disclaimer: string;
};

export async function extractAssetPassport(
  assetId: string,
): Promise<ExtractionResult> {
  const payload = record(
    await request(`/api/assets/${encodeURIComponent(assetId)}/extract`, {
      method: "POST",
    }),
    "Passport extraction",
  );
  const extraction = record(payload.extraction, "Extraction metadata");
  const mode = extraction.mode;
  if (mode !== "AI" && mode !== "DETERMINISTIC_FALLBACK" && mode !== "DEMO_FIXTURE") {
    throw new RwaApiError("INVALID_RESPONSE", "Extraction mode is invalid.", 502);
  }
  return {
    passport: RwaAssetSchema.parse(payload.passport),
    extraction: {
      mode,
      ...(typeof extraction.model === "string" ? { model: extraction.model } : {}),
      ...(typeof extraction.promptVersion === "string"
        ? { promptVersion: extraction.promptVersion }
        : {}),
      extractedAt: text(extraction.extractedAt, "Extraction time"),
    },
    warnings: stringList(payload.warnings),
    disclaimer: text(payload.disclaimer, "Asset disclaimer"),
  };
}

export async function getAssetPassport(assetId: string): Promise<{
  passport: RwaAsset;
  extraction?: { mode: string; model?: string; sourceIds: string[]; completedAt?: string };
  disclaimer: string;
}> {
  const payload = record(
    await request(`/api/assets/${encodeURIComponent(assetId)}/passport`),
    "Asset passport",
  );
  const extractionValue = payload.extraction;
  let extraction:
    | { mode: string; model?: string; sourceIds: string[]; completedAt?: string }
    | undefined;
  if (extractionValue && typeof extractionValue === "object") {
    const value = record(extractionValue, "Passport extraction");
    extraction = {
      mode: text(value.mode, "Extraction mode"),
      ...(typeof value.model === "string" ? { model: value.model } : {}),
      sourceIds: stringList(value.sourceIds),
      ...(typeof value.completedAt === "string"
        ? { completedAt: value.completedAt }
        : {}),
    };
  }
  return {
    passport: RwaAssetSchema.parse(payload.passport),
    ...(extraction ? { extraction } : {}),
    disclaimer: text(payload.disclaimer, "Asset disclaimer"),
  };
}

export type AssetMonitorStatus = {
  assetId: string;
  monitoring: boolean;
  provider?: string;
  latestValue?: string;
  sourceUpdatedAt?: string;
  lastAliveCheckAt?: string;
  ageSeconds?: number;
  freshness?: "OK" | "STALE" | "DATA_UNAVAILABLE";
  eligibility?: string;
  lastEligibilityChangeAt?: string;
  lastError?: string;
};

export async function getAssetMonitor(
  assetId: string,
): Promise<AssetMonitorStatus> {
  const payload = record(
    await request(`/api/assets/${encodeURIComponent(assetId)}/monitor`),
    "Asset monitor status",
  );
  const monitor = record(payload.monitor, "Asset monitor status");
  return {
    assetId: text(monitor.assetId, "Monitor asset ID"),
    monitoring: monitor.monitoring === true,
    ...(typeof monitor.provider === "string"
      ? { provider: monitor.provider }
      : {}),
    ...(typeof monitor.latestValue === "string"
      ? { latestValue: monitor.latestValue }
      : {}),
    ...(typeof monitor.sourceUpdatedAt === "string"
      ? { sourceUpdatedAt: monitor.sourceUpdatedAt }
      : {}),
    ...(typeof monitor.lastAliveCheckAt === "string"
      ? { lastAliveCheckAt: monitor.lastAliveCheckAt }
      : {}),
    ...(typeof monitor.ageSeconds === "number"
      ? { ageSeconds: monitor.ageSeconds }
      : {}),
    ...(monitor.freshness === "OK" ||
    monitor.freshness === "STALE" ||
    monitor.freshness === "DATA_UNAVAILABLE"
      ? { freshness: monitor.freshness }
      : {}),
    ...(typeof monitor.eligibility === "string"
      ? { eligibility: monitor.eligibility }
      : {}),
    ...(typeof monitor.lastEligibilityChangeAt === "string"
      ? { lastEligibilityChangeAt: monitor.lastEligibilityChangeAt }
      : {}),
    ...(typeof monitor.lastError === "string"
      ? { lastError: monitor.lastError }
      : {}),
  };
}

export type AssetExtractionStatus = {
  assetId: string;
  mode: "AI" | "DETERMINISTIC_FALLBACK" | "DEMO_FIXTURE";
  live: boolean;
  provider?: string;
  model?: string;
  sourceCount: number;
  factsExtracted: number;
  factsCited: number;
  unknownFields: number;
  unsupportedClaimsRejected: number;
  schemaValidation: "PASSED" | "FAILED";
  sourceValidation: "PASSED" | "FAILED";
  completedAt: string;
};

export async function getAssetExtraction(
  assetId: string,
): Promise<AssetExtractionStatus> {
  const payload = record(
    await request(`/api/assets/${encodeURIComponent(assetId)}/extraction`),
    "Asset extraction status",
  );
  const extraction = record(payload.extraction, "Asset extraction status");
  const mode = extraction.mode;
  if (mode !== "AI" && mode !== "DETERMINISTIC_FALLBACK" && mode !== "DEMO_FIXTURE") {
    throw new RwaApiError("INVALID_RESPONSE", "Extraction mode is invalid.", 502);
  }
  const schemaValidation = extraction.schemaValidation === "PASSED" ? "PASSED" : "FAILED";
  const sourceValidation = extraction.sourceValidation === "PASSED" ? "PASSED" : "FAILED";
  return {
    assetId: text(extraction.assetId, "Extraction asset ID"),
    mode,
    live: extraction.live === true,
    ...(typeof extraction.provider === "string" ? { provider: extraction.provider } : {}),
    ...(typeof extraction.model === "string" ? { model: extraction.model } : {}),
    sourceCount: Number(extraction.sourceCount ?? 0),
    factsExtracted: Number(extraction.factsExtracted ?? 0),
    factsCited: Number(extraction.factsCited ?? 0),
    unknownFields: Number(extraction.unknownFields ?? 0),
    unsupportedClaimsRejected: Number(extraction.unsupportedClaimsRejected ?? 0),
    schemaValidation,
    sourceValidation,
    completedAt: text(extraction.completedAt, "Extraction completion time"),
  };
}

export async function getAssetEligibility(assetId: string): Promise<{
  verdict: EligibilityVerdict;
  policy: EligibilityPolicy;
  disclaimer: string;
}> {
  const payload = record(
    await request(`/api/assets/${encodeURIComponent(assetId)}/eligibility`),
    "Eligibility verdict",
  );
  return {
    verdict: EligibilityVerdictSchema.parse(payload.verdict),
    policy: EligibilityPolicySchema.parse(payload.policy),
    disclaimer: text(payload.disclaimer, "Asset disclaimer"),
  };
}

export type PublishedVerdict = {
  signed: {
    attestation: {
      assetIdHash: `0x${string}`;
      eligible: boolean;
      reasonHash: `0x${string}`;
      passportHash: `0x${string}`;
      marketSnapshotHash: `0x${string}`;
      policyHash: `0x${string}`;
      issuedAt: number;
      validUntil: number;
      nonce: `0x${string}`;
    };
    domain: { chainId: number; verifyingContract: `0x${string}` };
    signature: `0x${string}`;
    digest: `0x${string}`;
    signer: `0x${string}`;
  };
  verdict: EligibilityVerdict;
};

export async function publishAssetVerdict(
  assetId: string,
): Promise<PublishedVerdict> {
  const payload = record(
    await request(`/api/assets/${encodeURIComponent(assetId)}/publish-verdict`, {
      method: "POST",
    }),
    "Published verdict",
  ) as unknown as PublishedVerdict;
  if (!payload.signed || !payload.verdict) {
    throw new RwaApiError(
      "INVALID_RESPONSE",
      "Publish-verdict response is invalid.",
      502,
    );
  }
  return {
    signed: payload.signed,
    verdict: EligibilityVerdictSchema.parse(payload.verdict),
  };
}

export type DemoOverrides = Record<string, { ageSeconds?: number }>;

/**
 * Attack Lab controls. Only ever registered server-side when DEMO_MODE=true,
 * and only ever able to make a DEMO asset's data worse -- the backend
 * refuses (409) to degrade a live Chainlink-backed asset like ttbill-b.
 */
export async function setDemoNavAge(
  assetId: string,
  ageSeconds: number,
): Promise<DemoOverrides> {
  const payload = record(
    await request(`/api/demo/assets/${encodeURIComponent(assetId)}/nav-age`, {
      method: "POST",
      body: JSON.stringify({ ageSeconds }),
    }),
    "Demo NAV age",
  );
  return (payload.overrides ?? {}) as DemoOverrides;
}

export async function resetDemoOverrides(): Promise<DemoOverrides> {
  const payload = record(
    await request("/api/demo/reset", { method: "POST" }),
    "Demo reset",
  );
  return (payload.overrides ?? {}) as DemoOverrides;
}

export async function getDemoState(): Promise<DemoOverrides> {
  const payload = record(await request("/api/demo/state"), "Demo state");
  return (payload.overrides ?? {}) as DemoOverrides;
}

export type GatewayProofResult = {
  assetId: string;
  verdict: EligibilityVerdict;
  broadcaster: `0x${string}`;
  publish: { txHash: `0x${string}`; blockNumber: number; onchainEligible: boolean };
  deposit:
    | { ok: true; txHash: `0x${string}`; blockNumber: number; broadcast: true }
    | { ok: false; contractError: string; broadcast: false };
};

/**
 * Server-side only: signs the asset's current verdict, publishes it to
 * AliveEligibilityRegistry on X Layer Testnet, and attempts
 * depositEligibleAsset against that published state. Never touches a
 * live Chainlink-backed asset (409). Throws RwaApiError with code
 * GATEWAY_CLIENT_UNAVAILABLE if the server has no broadcasting key
 * configured -- callers must show that honestly, never treat it as a
 * simulated success.
 */
export async function runGatewayProof(assetId: string): Promise<GatewayProofResult> {
  const payload = record(
    await request(`/api/demo/assets/${encodeURIComponent(assetId)}/gateway-proof`, {
      method: "POST",
    }),
    "Gateway proof",
  );
  return payload as unknown as GatewayProofResult;
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
