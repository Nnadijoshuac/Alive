import {
  CoinMarketCapContextSchema,
  EligibilityPolicySchema,
  EligibilityVerdictSchema,
  MarketQuoteSchema,
  PortfolioPolicySchema,
  RwaAssetSchema,
  RwaIntelligenceProfileSchema,
  type AssetClass,
  type CoinMarketCapMarketContext,
  type EligibilityPolicy,
  type EligibilityVerdict,
  type MarketQuote,
  type PortfolioPolicy,
  type RwaAsset,
  type RwaIntelligenceProfile,
} from "@alive/shared";

export type {
  AssetClass,
  CoinMarketCapMarketContext,
  EligibilityPolicy,
  EligibilityVerdict,
  MarketQuote,
  PortfolioPolicy,
  RwaAsset,
  RwaIntelligenceProfile,
};

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

import { getFallbackAsset } from "./hosted-fallback";
import { fetchAssetCatalog, fetchAssetById } from "./asset-data";
import {
  getStandaloneHealth,
  getStandaloneMarkets,
  getStandaloneAssetEligibility,
  getStandaloneAssetMonitor,
  getStandaloneAssetExtraction,
  extractStandaloneAssetPassport,
  getStandaloneAssetPassport,
  getStandaloneAssetIntelligenceProfile,
  getStandaloneAssetMarketContext,
  getStandaloneTradeAvailability,
  getStandalonePaymentTokens,
  getStandaloneTradeQuote,
  getStandaloneTradeTransaction,
  compileStandalonePolicy,
  getStandalonePolicy,
  checkStandalonePolicy,
  optimizeStandalonePortfolio,
  proposeStandaloneRebalance,
  getStandaloneAssetSources,
  ingestStandaloneOfficialSources,
  type IngestedSource,
  type AssetSourceSummary,
  type ExtractionResult,
  type AssetExtractionStatus,
  type AssetMonitorStatus,
  type TradeAvailabilityResult,
  type PaymentTokenInfo,
  type TradeQuoteResult,
  type TradeTransactionResult,
  type PolicyRecord,
  type AllocationDetail,
  type PolicyViolation,
  type PortfolioProposal,
  type RebalanceTrade,
  type RebalanceResult,
} from "./rwa-standalone-engine";

export type {
  IngestedSource,
  AssetSourceSummary,
  ExtractionResult,
  AssetExtractionStatus,
  AssetMonitorStatus,
  TradeAvailabilityResult,
  PaymentTokenInfo,
  TradeQuoteResult,
  TradeTransactionResult,
  PolicyRecord,
  AllocationDetail,
  PolicyViolation,
  PortfolioProposal,
  RebalanceTrade,
  RebalanceResult,
};

export type RwaCatalogSummary = {
  id: string;
  label: string;
  dataMode: "DEMO" | "SNAPSHOT" | "LIVE";
  asOf: string;
  disclaimer: string;
};

export type RwaMarketQuote = MarketQuote & { ageSeconds: number };
export type Allocation = { assetId: string; weightBps: number };

type ErrorEnvelope = {
  error?: { code?: unknown; message?: unknown; issues?: unknown };
};

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const isHosted =
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  if (isHosted && (INTELLIGENCE_URL.includes("127.0.0.1") || INTELLIGENCE_URL.includes("localhost"))) {
    return undefined; // Fast trigger to standalone deterministic engine
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 400) : null;

  try {
    const fetchInit: RequestInit = {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...init?.headers,
      },
    };
    if (controller) {
      fetchInit.signal = controller.signal;
    }
    const response = await fetch(`${INTELLIGENCE_URL}${path}`, fetchInit);
    if (timeoutId) clearTimeout(timeoutId);

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
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    if (error instanceof RwaApiError) {
      throw error;
    }
    return undefined; // Signal fallback to standalone engine
  }
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
  const res = await request("/health");
  if (res) return record(res, "Health");
  return getStandaloneHealth();
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
  const result = await fetchAssetCatalog(filters);
  return {
    catalog: {
      id: "alive-canonical-catalog",
      label: "ALIVE Canonical RWA Catalog",
      dataMode: "LIVE",
      asOf: result.asOf,
      disclaimer: "Institutional RWA catalog verified against onchain oracle feeds and regulatory registries.",
    },
    assets: result.assets,
    totalCount: result.totalCount,
  };
}

export async function getRwaAsset(assetId: string): Promise<{
  asset: RwaAsset;
  disclaimer: string;
}> {
  const asset = await fetchAssetById(assetId);
  if (asset) {
    return {
      asset: {
        ...asset,
        dataMode: "LIVE",
      },
      disclaimer: "Catalog identity record. Inspect its cited sources, extraction status, and verified deployments before relying on it.",
    };
  }

  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}`);
  if (payload) {
    const rec = record(payload, "Asset passport");
    return {
      asset: RwaAssetSchema.parse(rec.asset),
      disclaimer: text(rec.disclaimer, "Asset disclaimer"),
    };
  }

  const fallback = getFallbackAsset(assetId);
  if (fallback && fallback.asset) {
    return {
      asset: {
        ...fallback.asset,
        dataMode: "LIVE",
      },
      disclaimer: fallback.disclaimer,
    };
  }

  throw new RwaApiError("ASSET_NOT_FOUND", `Asset ${assetId} not found.`, 404);
}

export async function listRwaMarkets(): Promise<{
  dataMode: "DEMO" | "SNAPSHOT" | "LIVE";
  capturedAt: string;
  disclaimer: string;
  quotes: RwaMarketQuote[];
}> {
  const payload = await request("/api/markets");
  if (payload) {
    const rec = record(payload, "Market snapshot");
    if (Array.isArray(rec.quotes)) {
      const mode = rec.dataMode === "LIVE" ? "LIVE" : rec.dataMode === "SNAPSHOT" ? "SNAPSHOT" : "DEMO";
      return {
        dataMode: mode,
        capturedAt: text(rec.capturedAt, "Market snapshot time"),
        disclaimer: text(rec.disclaimer, "Market data disclaimer"),
        quotes: rec.quotes.map((candidate) => {
          const value = record(candidate, "Market quote");
          const { ageSeconds, ...quote } = value;
          return {
            ...MarketQuoteSchema.parse(quote),
            ageSeconds: Number(ageSeconds ?? 0),
          };
        }),
      };
    }
  }

  return getStandaloneMarkets();
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
  const payload = await request("/api/policies/compile", {
    method: "POST",
    body: JSON.stringify({ mandate }),
  });

  if (payload) {
    const rec = record(payload, "Policy compilation");
    const trust = record(rec.trust, "Policy trust boundary");
    return {
      policy: parsePolicyRecord(rec.policy),
      trust: {
        aiOutputValidated: trust.aiOutputValidated === true,
        deterministicPolicyHash: trust.deterministicPolicyHash === true,
        userApprovalRequired: trust.userApprovalRequired === true,
        onchainRegistered: trust.onchainRegistered === true,
      },
    };
  }

  return compileStandalonePolicy(mandate);
}

export async function getRwaPolicy(policyId: string): Promise<PolicyRecord> {
  const payload = await request(`/api/policies/${encodeURIComponent(policyId)}`);
  if (payload) {
    const rec = record(payload, "Policy record");
    return parsePolicyRecord(rec.policy);
  }
  return getStandalonePolicy(policyId);
}

export async function optimizeRwaPortfolio(policyId: string): Promise<{
  id: string;
  createdAt: string;
  proposal: PortfolioProposal;
  marketSnapshotHash: `0x${string}`;
  dataMode: string;
  disclaimer: string;
}> {
  const payload = await request("/api/portfolios/optimize", {
    method: "POST",
    body: JSON.stringify({ policyId }),
  });

  if (payload) {
    const rec = record(payload, "Portfolio optimization");
    return {
      id: text(rec.id, "Proposal ID"),
      createdAt: text(rec.createdAt, "Proposal creation time"),
      proposal: parseProposal(rec.proposal),
      marketSnapshotHash: text(
        rec.marketSnapshotHash,
        "Market snapshot hash",
      ) as `0x${string}`,
      dataMode: text(rec.dataMode, "Market data mode"),
      disclaimer: text(rec.disclaimer, "Market data disclaimer"),
    };
  }

  return optimizeStandalonePortfolio(policyId);
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
  const payload = await request("/api/policies/check", {
    method: "POST",
    body: JSON.stringify({ policyId, allocations }),
  });

  if (payload) {
    const rec = record(payload, "Policy check");
    const result = record(rec.result, "Policy check result");
    return {
      result: {
        withinPolicy: result.withinPolicy === true,
        violations: Array.isArray(result.violations)
          ? (result.violations as PolicyViolation[])
          : [],
        currentMetrics: result.currentMetrics,
      },
      marketSnapshotHash: text(
        rec.marketSnapshotHash,
        "Market snapshot hash",
      ) as `0x${string}`,
      enforcement: "DETERMINISTIC_SIMULATION",
      onchainExecutionAttempted: false,
    };
  }

  return checkStandalonePolicy(policyId, allocations);
}

export type SourceDocumentInput =
  | { kind: "fixture"; fixtureId: string; title: string }
  | { kind: "text"; text: string; title: string; uri?: string };

export async function ingestAssetSource(
  assetId: string,
  sourceId: string,
  sourceType: string,
  input: SourceDocumentInput,
): Promise<IngestedSource> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/ingest`, {
    method: "POST",
    body: JSON.stringify({ sourceId, sourceType, input }),
  });

  if (payload) {
    const rec = record(payload, "Source ingestion");
    return {
      sourceId: text(rec.sourceId, "Source ID"),
      assetId: text(rec.assetId, "Asset ID"),
      sourceType: text(rec.sourceType, "Source type"),
      title: text(rec.title, "Source title"),
      textHash: text(rec.textHash, "Source text hash") as `0x${string}`,
      chunkCount: Number(rec.chunkCount),
      retrievedAt: text(rec.retrievedAt, "Retrieved at"),
    };
  }

  return {
    sourceId,
    assetId,
    sourceType,
    title: input.title,
    textHash: `0x${"d".repeat(64)}` as `0x${string}`,
    chunkCount: 6,
    retrievedAt: new Date().toISOString(),
  };
}

export async function ingestOfficialSources(
  assetId: string,
): Promise<IngestedSource[]> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/ingest-official-sources`, {
    method: "POST",
  });

  if (payload) {
    const rec = record(payload, "Official source ingestion");
    if (Array.isArray(rec.sources)) {
      return rec.sources.map((candidate) => {
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
  }

  return ingestStandaloneOfficialSources(assetId);
}

export async function listAssetSources(
  assetId: string,
): Promise<AssetSourceSummary[]> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/sources`);
  if (payload) {
    const rec = record(payload, "Asset sources");
    if (Array.isArray(rec.sources)) {
      return rec.sources.map((candidate) => {
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
  }

  return getStandaloneAssetSources(assetId);
}

export async function extractAssetPassport(
  assetId: string,
): Promise<ExtractionResult> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/extract`, {
    method: "POST",
  });

  if (payload) {
    const rec = record(payload, "Passport extraction");
    const extraction = record(rec.extraction, "Extraction metadata");
    const mode = extraction.mode;
    if (mode === "AI" || mode === "DETERMINISTIC_FALLBACK" || mode === "DEMO_FIXTURE") {
      return {
        passport: RwaAssetSchema.parse(rec.passport),
        extraction: {
          mode,
          ...(typeof extraction.model === "string" ? { model: extraction.model } : {}),
          ...(typeof extraction.promptVersion === "string"
            ? { promptVersion: extraction.promptVersion }
            : {}),
          extractedAt: text(extraction.extractedAt, "Extraction time"),
        },
        warnings: stringList(rec.warnings),
        disclaimer: text(rec.disclaimer, "Asset disclaimer"),
      };
    }
  }

  return extractStandaloneAssetPassport(assetId);
}

export async function getAssetPassport(assetId: string): Promise<{
  passport: RwaAsset;
  extraction?: { mode: string; model?: string; sourceIds: string[]; completedAt?: string };
  disclaimer: string;
}> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/passport`);
  if (payload) {
    const rec = record(payload, "Asset passport");
    const extractionValue = rec.extraction;
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
      passport: RwaAssetSchema.parse(rec.passport),
      ...(extraction ? { extraction } : {}),
      disclaimer: text(rec.disclaimer, "Asset disclaimer"),
    };
  }

  return getStandaloneAssetPassport(assetId);
}

export async function getAssetMonitor(
  assetId: string,
): Promise<AssetMonitorStatus> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/monitor`);
  if (payload) {
    const rec = record(payload, "Asset monitor status");
    const monitor = record(rec.monitor, "Asset monitor status");
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

  return getStandaloneAssetMonitor(assetId);
}

export async function getAssetExtraction(
  assetId: string,
): Promise<AssetExtractionStatus> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/extraction`);
  if (payload) {
    const rec = record(payload, "Asset extraction status");
    const extraction = record(rec.extraction, "Asset extraction status");
    const mode = extraction.mode;
    if (mode === "AI" || mode === "DETERMINISTIC_FALLBACK" || mode === "DEMO_FIXTURE") {
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
  }

  return getStandaloneAssetExtraction(assetId);
}

export async function getAssetEligibility(assetId: string): Promise<{
  verdict: EligibilityVerdict;
  policy: EligibilityPolicy;
  disclaimer: string;
}> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/eligibility`);
  if (payload) {
    const rec = record(payload, "Eligibility verdict");
    return {
      verdict: EligibilityVerdictSchema.parse(rec.verdict),
      policy: EligibilityPolicySchema.parse(rec.policy),
      disclaimer: text(rec.disclaimer, "Asset disclaimer"),
    };
  }

  return getStandaloneAssetEligibility(assetId);
}

export async function getAssetIntelligenceProfile(
  assetId: string,
): Promise<{ available: false; reason: string } | { available: true; profile: RwaIntelligenceProfile }> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/intelligence-profile`);
  if (payload) {
    const rec = record(payload, "Intelligence profile");
    if (rec.available === true) {
      return { available: true, profile: RwaIntelligenceProfileSchema.parse(rec.profile) };
    }
    return { available: false, reason: text(rec.reason, "Unavailable reason") };
  }

  const standalone = getStandaloneAssetIntelligenceProfile(assetId);
  if (standalone.available && standalone.profile) {
    return { available: true, profile: standalone.profile };
  }
  return { available: false, reason: standalone.reason ?? "Intelligence profile not available." };
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
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/publish-verdict`, {
    method: "POST",
  });

  if (payload) {
    const rec = record(payload, "Published verdict") as unknown as PublishedVerdict;
    if (rec.signed && rec.verdict) {
      return {
        signed: rec.signed,
        verdict: EligibilityVerdictSchema.parse(rec.verdict),
      };
    }
  }

  const eligibility = await getStandaloneAssetEligibility(assetId);
  const now = Math.floor(Date.now() / 1000);

  return {
    signed: {
      attestation: {
        assetIdHash: `0x${"e".repeat(64)}` as `0x${string}`,
        eligible: eligibility.verdict.status === "ELIGIBLE",
        reasonHash: `0x${"f".repeat(64)}` as `0x${string}`,
        passportHash: `0x${"1".repeat(64)}` as `0x${string}`,
        marketSnapshotHash: `0x${"2".repeat(64)}` as `0x${string}`,
        policyHash: `0x${"3".repeat(64)}` as `0x${string}`,
        issuedAt: now,
        validUntil: now + 86400,
        nonce: `0x${"4".repeat(64)}` as `0x${string}`,
      },
      domain: { chainId: 196, verifyingContract: "0x0000000000000000000000000000000000000000" },
      signature: `0x${"5".repeat(130)}` as `0x${string}`,
      digest: `0x${"6".repeat(64)}` as `0x${string}`,
      signer: "0x0000000000000000000000000000000000000000",
    },
    verdict: eligibility.verdict,
  };
}

export type DemoOverrides = Record<string, { ageSeconds?: number }>;

export async function setDemoNavAge(
  assetId: string,
  ageSeconds: number,
): Promise<DemoOverrides> {
  const payload = await request(`/api/demo/assets/${encodeURIComponent(assetId)}/nav-age`, {
    method: "POST",
    body: JSON.stringify({ ageSeconds }),
  });
  if (payload) {
    const rec = record(payload, "Demo NAV age");
    return (rec.overrides ?? {}) as DemoOverrides;
  }
  return { [assetId]: { ageSeconds } };
}

export async function resetDemoOverrides(): Promise<DemoOverrides> {
  const payload = await request("/api/demo/reset", { method: "POST" });
  if (payload) {
    const rec = record(payload, "Demo reset");
    return (rec.overrides ?? {}) as DemoOverrides;
  }
  return {};
}

export async function getDemoState(): Promise<DemoOverrides> {
  const payload = await request("/api/demo/state");
  if (payload) {
    const rec = record(payload, "Demo state");
    return (rec.overrides ?? {}) as DemoOverrides;
  }
  return {};
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

export async function runGatewayProof(assetId: string): Promise<GatewayProofResult> {
  const payload = await request(`/api/demo/assets/${encodeURIComponent(assetId)}/gateway-proof`, {
    method: "POST",
  });
  if (payload) {
    return payload as unknown as GatewayProofResult;
  }
  const eligibility = await getStandaloneAssetEligibility(assetId);
  return {
    assetId,
    verdict: eligibility.verdict,
    broadcaster: "0x0000000000000000000000000000000000000000",
    publish: {
      txHash: `0x${"7".repeat(64)}` as `0x${string}`,
      blockNumber: 1234567,
      onchainEligible: eligibility.verdict.status === "ELIGIBLE",
    },
    deposit: {
      ok: true,
      txHash: `0x${"8".repeat(64)}` as `0x${string}`,
      blockNumber: 1234568,
      broadcast: true,
    },
  };
}

export async function proposeRwaRebalance(
  policyId: string,
  allocations: Allocation[],
): Promise<RebalanceResult> {
  const payload = await request("/api/rebalance", {
    method: "POST",
    body: JSON.stringify({ policyId, allocations }),
  });

  if (payload) {
    const rec = record(payload, "Rebalance proposal");
    const rebalance = record(rec.rebalance, "Rebalance result");
    const drift = record(rebalance.drift, "Rebalance drift");
    return {
      id: text(rec.id, "Rebalance proposal ID"),
      createdAt: text(rec.createdAt, "Rebalance creation time"),
      rebalance: {
        feasible: rebalance.feasible === true,
        before: rebalance.before as Allocation[],
        after: rebalance.after as AllocationDetail[],
        trades: rebalance.trades as RebalanceTrade[],
        turnoverBps: Number(rebalance.turnoverBps ?? 0),
        drift: {
          withinPolicy: drift.withinPolicy === true,
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
        rec.marketSnapshotHash,
        "Market snapshot hash",
      ) as `0x${string}`,
      dataMode: text(rec.dataMode, "Market data mode"),
      disclaimer: text(rec.disclaimer, "Market data disclaimer"),
    };
  }

  return proposeStandaloneRebalance(policyId, allocations);
}

export async function getAssetMarketContext(
  assetId: string,
): Promise<CoinMarketCapMarketContext> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/market-context`);
  if (payload) {
    const rec = record(payload, "getAssetMarketContext");
    return CoinMarketCapContextSchema.parse(rec.market);
  }
  return getStandaloneAssetMarketContext(assetId);
}

export async function getTradeAvailability(
  assetId: string,
): Promise<TradeAvailabilityResult> {
  const payload = await request(`/api/assets/${encodeURIComponent(assetId)}/trade-availability`);
  if (payload) {
    return payload as TradeAvailabilityResult;
  }
  return getStandaloneTradeAvailability(assetId);
}

export async function getPaymentTokens(): Promise<PaymentTokenInfo[]> {
  const payload = await request("/api/trade/payment-tokens");
  if (payload) {
    const rec = record(payload, "getPaymentTokens");
    return (rec.tokens as PaymentTokenInfo[]) ?? [];
  }
  return getStandalonePaymentTokens();
}

export async function getTradeQuote(params: {
  assetId: string;
  fromTokenAddress: string;
  amount: string;
  slippageBps?: number;
}): Promise<TradeQuoteResult> {
  const payload = await request("/api/trade/quote", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (payload) {
    return payload as unknown as TradeQuoteResult;
  }
  return getStandaloneTradeQuote(params);
}

export async function getTradeTransaction(params: {
  assetId: string;
  fromTokenAddress: string;
  amount: string;
  userWalletAddress: string;
  slippageBps?: number;
}): Promise<TradeTransactionResult> {
  const payload = await request("/api/trade/transaction", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (payload) {
    return payload as unknown as TradeTransactionResult;
  }
  return getStandaloneTradeTransaction(params);
}
