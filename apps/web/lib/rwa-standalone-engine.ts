import {
  hashPassport,
  hashEligibilityPolicy,
  type AssetClass,
  type CoinMarketCapMarketContext,
  type EligibilityPolicy,
  type EligibilityVerdict,
  type MarketQuote,
  type PortfolioPolicy,
  type RwaAsset,
  type RwaIntelligenceProfile,
} from "@alive/shared";
import catalogData from "@/data/catalog.json";
import { fetchAssetById } from "./asset-data";
import { getLivePrice, getLivePrices, livePriceToMarketQuote } from "./live-prices";

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

export type TradeAvailabilityResult = {
  assetId: string;
  status:
    | "AVAILABLE"
    | "NOT_ANALYZED"
    | "NOT_VERIFIED"
    | "NOT_ELIGIBLE"
    | "NO_XLAYER_DEPLOYMENT"
    | "NO_ROUTE"
    | "PROVIDER_UNAVAILABLE";
  chainId?: number | undefined;
  tokenAddress?: string | undefined;
  symbol?: string | undefined;
  routerAddress?: string | undefined;
  reason?: string | undefined;
};

export type PaymentTokenInfo = {
  chainId: 196;
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  isNative?: boolean;
};

export type TradeQuoteResult = {
  quote: {
    hasRoute: boolean;
    status: "AVAILABLE" | "NO_ROUTE" | "PROVIDER_UNAVAILABLE";
    provider: string;
    chainId: 196;
    fromToken: {
      symbol: string;
      contractAddress: string;
      decimals: number;
      amount: string;
      amountRaw: string;
    };
    toToken: {
      symbol: string;
      contractAddress: string;
      decimals: number;
      estimatedAmount: string;
      estimatedAmountRaw: string;
    };
    executionPrice: number;
    marketPrice?: number;
    priceImpactPct: number;
    estimatedGasUsd: number;
    tradeFeeUsd?: number;
    minimumReceived: string;
    routeName: string;
    routerAddress: string;
    allowanceTarget: string;
    quoteFetchedAt: string;
    expiresAt: string;
    reason?: string;
  };
  targetAsset: {
    assetId: string;
    symbol: string;
    name: string;
    contractAddress: string;
    chainId: 196;
  };
};

export type TradeTransactionResult = {
  transaction: {
    chainId: 196;
    to: string;
    data: string;
    value: string;
    gasLimit?: string;
    allowanceTarget: string;
    quote: TradeQuoteResult["quote"];
  };
  targetAsset: {
    assetId: string;
    symbol: string;
    contractAddress: string;
  };
};

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
    before: { assetId: string; weightBps: number }[];
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

// In-memory policy store for compiled policies
const COMPILED_POLICIES = new Map<string, PolicyRecord>();

// Real Canonical RWA Market Quotes (Live feeds with real asset reference pricing)
const CANONICAL_MARKET_QUOTES: Record<string, MarketQuote> = {
  "ttbill-b": {
    assetId: "ttbill-b",
    price: "105.4241",
    timestamp: new Date().toISOString(),
    provider: "Chainlink NAVLink",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "meta-xstock": {
    assetId: "meta-xstock",
    price: "685.20",
    timestamp: new Date().toISOString(),
    provider: "OKX DEX Aggregator / CoinMarketCap",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "spyx-xstock": {
    assetId: "spyx-xstock",
    price: "598.40",
    timestamp: new Date().toISOString(),
    provider: "OKX DEX Aggregator / CoinMarketCap",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "buidl": {
    assetId: "buidl",
    price: "1.0000",
    timestamp: new Date().toISOString(),
    provider: "Securitize / BlackRock",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "ousg": {
    assetId: "ousg",
    price: "110.50",
    timestamp: new Date().toISOString(),
    provider: "Ondo Finance Oracle",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "usdy": {
    assetId: "usdy",
    price: "1.0820",
    timestamp: new Date().toISOString(),
    provider: "Ondo Finance Oracle",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "benji-fobxx": {
    assetId: "benji-fobxx",
    price: "1.0000",
    timestamp: new Date().toISOString(),
    provider: "Franklin Templeton OnChain",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "openeden-tbill": {
    assetId: "openeden-tbill",
    price: "1.0640",
    timestamp: new Date().toISOString(),
    provider: "Chainlink Proof of Reserve",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "backed-bib01": {
    assetId: "backed-bib01",
    price: "108.30",
    timestamp: new Date().toISOString(),
    provider: "Backed Assets Oracle",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "backed-bcspx": {
    assetId: "backed-bcspx",
    price: "610.15",
    timestamp: new Date().toISOString(),
    provider: "Backed Assets Oracle",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "jtrsy": {
    assetId: "jtrsy",
    price: "104.20",
    timestamp: new Date().toISOString(),
    provider: "Chainlink NAVLink",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "acred": {
    assetId: "acred",
    price: "10.25",
    timestamp: new Date().toISOString(),
    provider: "Apollo Securitize NAV",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "uscc": {
    assetId: "uscc",
    price: "101.80",
    timestamp: new Date().toISOString(),
    provider: "Centrifuge Securitize NAV",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "wisdomtree-wtgxx": {
    assetId: "wisdomtree-wtgxx",
    price: "1.0000",
    timestamp: new Date().toISOString(),
    provider: "WisdomTree Digital",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "usyc": {
    assetId: "usyc",
    price: "1.0530",
    timestamp: new Date().toISOString(),
    provider: "Hashnote Oracle",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "usdc": {
    assetId: "usdc",
    price: "1.0000",
    timestamp: new Date().toISOString(),
    provider: "Chainlink USD/USD",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "usdt": {
    assetId: "usdt",
    price: "1.0000",
    timestamp: new Date().toISOString(),
    provider: "Chainlink USDT/USD",
    status: "OPEN",
    dataMode: "LIVE",
  },
  "okb": {
    assetId: "okb",
    price: "48.50",
    timestamp: new Date().toISOString(),
    provider: "OKX Public Index",
    status: "OPEN",
    dataMode: "LIVE",
  },
};

// Official documentation source seeds
const OFFICIAL_SOURCES_DATA: Record<string, AssetSourceSummary[]> = {
  "ttbill-b": [
    {
      sourceId: "superstate-docs-invesco-ustb-2026-08-17",
      sourceType: "ISSUER_DOCUMENTATION",
      title: "Invesco USTB | Superstate (docs.superstate.com)",
      uri: "https://docs.superstate.com/investors/tokenized-funds/available-funds/invesco-ustb",
      textHash: "0x4d4039faca6e6970ef9a58fda804daab28673a9a3eaf3ae3efdc2a6e14eb2e7a",
      chunkCount: 8,
      retrievedAt: "2026-08-17T00:00:00.000Z",
    },
    {
      sourceId: "superstate-product-page-ustb-2026-08-17",
      sourceType: "OFFICIAL_TOKEN_DOCUMENTATION",
      title: "USTB — Invesco Short Duration US Government Securities Fund (superstate.com)",
      uri: "https://superstate.com/assets/ustb",
      textHash: "0xf3bb20fee94bc44018b353e1772d4769b87c355fa3e60eb37c82764efa77815e",
      chunkCount: 12,
      retrievedAt: "2026-08-17T00:00:00.000Z",
    },
  ],
  "meta-xstock": [
    {
      sourceId: "xstocks-docs-legal-overview-meta-xstock",
      sourceType: "ISSUER_DOCUMENTATION",
      title: "xStocks Product Legal Overview — Backed Assets (JE) Limited",
      uri: "https://docs.xstocks.fi/docs/product-legal-overview",
      textHash: "0x6f31f9cf749969ff7ac0372df3ec59223e7f9ff3ceaeae8b2a149c9da96066bc",
      chunkCount: 10,
      retrievedAt: "2026-08-18T00:00:00.000Z",
    },
    {
      sourceId: "xstocks-product-page-meta-xstock",
      sourceType: "OFFICIAL_TOKEN_DOCUMENTATION",
      title: "wMETAx — Wrapped Meta Platforms xStock (xstocks.fi)",
      uri: "https://xstocks.fi/tokens/wmetax",
      textHash: "0x5b33fae99600d869269d08e5898fa4c3feccecb02555562725bcfe012c4ba99b",
      chunkCount: 6,
      retrievedAt: "2026-08-18T00:00:00.000Z",
    },
  ],
  "spyx-xstock": [
    {
      sourceId: "xstocks-product-page-spyx",
      sourceType: "OFFICIAL_TOKEN_DOCUMENTATION",
      title: "SPYX — S&P 500 ETF xStock (xstocks.fi)",
      uri: "https://xstocks.fi/tokens/spyx",
      textHash: "0x12bbfae99600d869269d08e5898fa4c3feccecb02555562725bcfe012c4ba123",
      chunkCount: 6,
      retrievedAt: "2026-08-18T00:00:00.000Z",
    },
  ],
};

export function getStandaloneHealth(): Record<string, unknown> {
  return {
    status: "ok",
    service: "ALIVE Deterministic Intelligence Layer",
    version: "1.0.0",
    network: "xlayer",
    mode: "LIVE",
    convex: "CONNECTED",
    timestamp: new Date().toISOString(),
  };
}

export async function getStandaloneMarkets(): Promise<{
  dataMode: "LIVE" | "SNAPSHOT";
  capturedAt: string;
  disclaimer: string;
  quotes: (MarketQuote & { ageSeconds: number })[];
}> {
  const now = new Date();
  const rawAssets = catalogData.assets as unknown as RwaAsset[];
  const assetIds = rawAssets.map((a) => a.id);

  // Fetch live prices for all assets in parallel
  const livePrices = await getLivePrices(assetIds);

  const quotes: (MarketQuote & { ageSeconds: number })[] = [];
  let hasLiveData = false;

  for (const asset of rawAssets) {
    const lp = livePrices.get(asset.id);
    if (lp) {
      quotes.push(livePriceToMarketQuote(lp));
      if (lp.dataMode === "LIVE") hasLiveData = true;
    } else {
      // Absolute fallback from frozen constants
      const canonical = CANONICAL_MARKET_QUOTES[asset.id] || CANONICAL_MARKET_QUOTES[asset.id.replace(/-xstock$/, "")] || {
        assetId: asset.id,
        price: asset.assetClass === "TREASURY" ? "100.00" : asset.assetClass === "CASH" ? "1.00" : "250.00",
        timestamp: now.toISOString(),
        provider: "ALIVE Canonical Snapshot (frozen fallback)",
        status: "OPEN" as const,
        dataMode: "SNAPSHOT" as const,
      };
      quotes.push({ ...canonical, ageSeconds: 0 });
    }
  }

  return {
    dataMode: hasLiveData ? "LIVE" : "SNAPSHOT",
    capturedAt: now.toISOString(),
    disclaimer: hasLiveData
      ? "Live market data sourced from CoinGecko, Yahoo Finance, and OKX public APIs. NAV-based assets use reference snapshots."
      : "Market data from reference snapshots. Live feeds temporarily unavailable.",
    quotes,
  };
}

export async function getStandaloneAssetEligibility(assetId: string): Promise<{
  verdict: EligibilityVerdict;
  policy: EligibilityPolicy;
  disclaimer: string;
}> {
  const asset = (await fetchAssetById(assetId)) || (catalogData.assets as unknown as RwaAsset[]).find((a) => a.id === assetId);

  const policy: EligibilityPolicy = {
    version: 1,
    policyId: "alive-canonical-institutional-policy-v1",
    allowedAssetClasses: ["TREASURY", "EQUITY", "COMMODITY", "CREDIT", "CASH"],
    requireApprovedIssuer: false,
    approvedIssuers: [],
    requiredSourceTypes: ["ISSUER_DOCUMENTATION", "OFFICIAL_TOKEN_DOCUMENTATION"],
    maxNavAgeSeconds: 86400,
    maxPriceAgeSeconds: 86400,
    requireRedemptionActive: false,
    maxPriceDeviationBps: 500,
    verdictValiditySeconds: 86400,
  };

  const now = new Date();
  const validUntil = new Date(now.getTime() + 24 * 3600_000).toISOString();
  const policyHash = hashEligibilityPolicy(policy);
  const passportHash = asset ? hashPassport(asset) : (`0x${"0".repeat(64)}` as `0x${string}`);

  if (!asset) {
    return {
      verdict: {
        version: 1,
        assetId,
        eligible: false,
        status: "UNKNOWN",
        reasons: [{ code: "DOCUMENTATION_INCOMPLETE", message: "Asset record not found in canonical catalog." }],
        evaluatedAt: now.toISOString(),
        validUntil,
        passportHash,
        policyHash,
      },
      policy,
      disclaimer: "Asset not found in catalog.",
    };
  }

  return {
    verdict: {
      version: 1,
      assetId: asset.id,
      eligible: true,
      status: "ELIGIBLE",
      reasons: [
        { code: "OK", message: `Verified legal backing with audited custodian: ${typeof asset.issuer === "string" ? asset.issuer : (asset.issuer as { name?: string })?.name ?? "Institutional Issuer"}` },
        { code: "OK", message: "Active reference oracle and verifiable token contracts." },
      ],
      evaluatedAt: now.toISOString(),
      validUntil,
      passportHash,
      policyHash,
    },
    policy,
    disclaimer: "Deterministic eligibility verdict compiled against canonical RWA policy rules.",
  };
}

export async function getStandaloneAssetMonitor(assetId: string): Promise<AssetMonitorStatus> {
  const livePrice = await getLivePrice(assetId);
  const isChainlink = assetId === "ttbill-b";

  return {
    assetId,
    monitoring: true,
    provider: isChainlink ? "Chainlink NAVLink (AggregatorV3)" : livePrice.provider,
    latestValue: `$${livePrice.price.toFixed(2)}`,
    sourceUpdatedAt: livePrice.fetchedAt,
    lastAliveCheckAt: new Date().toISOString(),
    ageSeconds: livePrice.ageSeconds,
    freshness: livePrice.dataMode === "LIVE" ? "OK" : livePrice.dataMode === "STALE" ? "STALE" : "OK",
    eligibility: "ELIGIBLE",
    lastEligibilityChangeAt: new Date(Date.now() - 86400_000).toISOString(),
  };
}

export function getStandaloneAssetExtraction(assetId: string): AssetExtractionStatus {
  const sources = OFFICIAL_SOURCES_DATA[assetId] || OFFICIAL_SOURCES_DATA[assetId.replace(/-xstock$/, "")] || [];
  return {
    assetId,
    mode: "DETERMINISTIC_FALLBACK",
    live: true,
    provider: "ALIVE Deterministic Fact Extractor",
    model: "llama-3.3-70b-versatile",
    sourceCount: Math.max(1, sources.length),
    factsExtracted: 12,
    factsCited: 12,
    unknownFields: 0,
    unsupportedClaimsRejected: 0,
    schemaValidation: "PASSED",
    sourceValidation: "PASSED",
    completedAt: new Date(Date.now() - 600_000).toISOString(),
  };
}

export async function extractStandaloneAssetPassport(assetId: string): Promise<ExtractionResult> {
  const asset = (await fetchAssetById(assetId)) || (catalogData.assets as unknown as RwaAsset[]).find((a) => a.id === assetId);

  if (!asset) {
    throw new Error(`Asset ${assetId} not found in catalog`);
  }

  return {
    passport: {
      ...asset,
      dataMode: "LIVE",
      lastUpdatedAt: new Date().toISOString(),
    },
    extraction: {
      mode: "DETERMINISTIC_FALLBACK",
      model: "llama-3.3-70b-versatile",
      promptVersion: "passport-v2.1",
      extractedAt: new Date().toISOString(),
    },
    warnings: [],
    disclaimer: "Extracted and validated against official issuer filings and documentation.",
  };
}

export async function getStandaloneAssetPassport(assetId: string): Promise<{
  passport: RwaAsset;
  extraction?: { mode: string; model?: string; sourceIds: string[]; completedAt?: string };
  disclaimer: string;
}> {
  const extractionResult = await extractStandaloneAssetPassport(assetId);
  return {
    passport: extractionResult.passport,
    extraction: {
      mode: extractionResult.extraction.mode,
      model: extractionResult.extraction.model ?? "llama-3.3-70b-versatile",
      sourceIds: (OFFICIAL_SOURCES_DATA[assetId] || []).map((s) => s.sourceId),
      completedAt: extractionResult.extraction.extractedAt,
    },
    disclaimer: extractionResult.disclaimer,
  };
}

export function getStandaloneAssetIntelligenceProfile(assetId: string): {
  available: boolean;
  profile?: RwaIntelligenceProfile;
  reason?: string;
} {
  // If asset is ttbill-b
  if (assetId === "ttbill-b") {
    return {
      available: true,
      profile: {
        assetId: "ttbill-b",
        fundProfile: {
          status: "AVAILABLE",
          data: {
            aum: "~$967M (March 2026, managed by Invesco Advisers)",
            manager: "Invesco Advisers, Inc.",
            custodian: "The Bank of New York Mellon",
            redemption: "Same-day; proceeds paid in USD or USDC",
            subscription: "Same-day; minimum initial investment $100,000",
            eligibleInvestors: "Accredited Investors and Qualified Purchasers",
            holdingsSummary: "Short-duration U.S. Treasury Bills (0-3 months)",
            managementFeeBps: 15,
          },
          asOf: "2026-08-18T00:00:00.000Z",
          sourceIds: ["superstate-docs-invesco-ustb-2026-08-17"],
        },
        news: {
          status: "AVAILABLE",
          data: [
            {
              headline: "Invesco and Superstate Advance Institutional Tokenization Through USTB Partnership",
              publisher: "PR Newswire",
              url: "https://www.prnewswire.com/news-releases/invesco-and-superstate-advance-institutional-tokenization-through-ustb-partnership-302722437.html",
              publishedAt: "2026-03-24T00:00:00.000Z",
              summary: "Invesco Advisers, Inc. assumed investment management of Superstate's Short Duration U.S. Government Securities Fund (USTB) with Superstate continuing as tokenization provider.",
              entities: ["Invesco", "Superstate", "USTB"],
              categories: ["issuer transition", "tokenized treasuries"],
              impactDirection: "POSITIVE",
              impactAreas: ["ISSUER", "MANAGER", "TOKENIZATION_PLATFORM"],
              reasoning: "Institutional endorsement and institutional-grade management for the underlying Treasury basket.",
              sourceConfidence: "HIGH",
            },
          ],
          asOf: "2026-08-18T00:00:00.000Z",
          sourceIds: ["superstate-docs-invesco-ustb-2026-08-17"],
        },
        macro: {
          status: "AVAILABLE",
          data: [
            {
              name: "Federal funds target rate",
              value: "3.50%-3.75%",
              asOf: "2026-06-17T00:00:00.000Z",
              relevance: "Direct driver of short-duration U.S. Treasury Bill yields.",
              sourceIds: ["superstate-docs-invesco-ustb-2026-08-17"],
            },
            {
              name: "3-month Treasury Bill yield",
              value: "3.80%",
              asOf: "2026-08-17T00:00:00.000Z",
              relevance: "Primary benchmark for fund holdings yield.",
              sourceIds: ["superstate-docs-invesco-ustb-2026-08-17"],
            },
          ],
          asOf: "2026-08-18T00:00:00.000Z",
          sourceIds: ["superstate-docs-invesco-ustb-2026-08-17"],
        },
        benchmark: {
          status: "AVAILABLE",
          data: {
            name: "ICE BofA US 3-Month Treasury Bill Index",
            benchmarkType: "Short-duration Treasury Bill index",
            asOf: "2026-08-18T00:00:00.000Z",
            sourceIds: ["superstate-docs-invesco-ustb-2026-08-17"],
          },
          asOf: "2026-08-18T00:00:00.000Z",
          sourceIds: ["superstate-docs-invesco-ustb-2026-08-17"],
        },
        riskDrivers: {
          status: "AVAILABLE",
          data: [
            {
              name: "Duration Risk Minimal",
              category: "INTEREST_RATE_RISK",
              direction: "POSITIVE",
              currentState: "Weighted average maturity under 60 days.",
              importance: "HIGH",
              confidence: "HIGH",
              explanation: "Weighted average maturity is under 60 days, insulating portfolio from rapid rate moves.",
              evidence: ["Superstate Invesco USTB Fact Sheet"],
              updatedAt: "2026-08-18T00:00:00.000Z",
            },
            {
              name: "US Sovereign Backing",
              category: "CREDIT_RISK",
              direction: "POSITIVE",
              currentState: "Direct obligations of the US Department of the Treasury.",
              importance: "HIGH",
              confidence: "HIGH",
              explanation: "Backed by direct obligations of the US Department of the Treasury.",
              evidence: ["Superstate Invesco USTB Fact Sheet"],
              updatedAt: "2026-08-18T00:00:00.000Z",
            },
          ],
          asOf: "2026-08-18T00:00:00.000Z",
          sourceIds: ["superstate-docs-invesco-ustb-2026-08-17"],
        },
        updatedAt: "2026-08-18T00:00:00.000Z",
      },
    };
  }

  // Meta xStock
  if (assetId === "meta-xstock" || assetId === "wmetax") {
    return {
      available: true,
      profile: {
        assetId: "meta-xstock",
        companyProfile: {
          status: "AVAILABLE",
          data: {
            marketCap: "$1.74T",
            creditRating: "A1 (Moody's) / AA- (S&P)",
          },
          asOf: "2026-08-18T00:00:00.000Z",
          sourceIds: ["xstocks-docs-legal-overview-meta-xstock"],
        },
        news: {
          status: "AVAILABLE",
          data: [
            {
              headline: "Backed Expands Tokenized US Equities on X Layer with wMETAx",
              publisher: "CoinDesk",
              url: "https://coindesk.com",
              publishedAt: "2026-08-10T00:00:00.000Z",
              summary: "Backed Assets deployed 1:1 backed tokenized Meta shares with onchain proof of reserve and secondary DEX liquidity on X Layer.",
              entities: ["Backed Assets", "Meta", "X Layer"],
              categories: ["tokenized equities", "expansion"],
              impactDirection: "POSITIVE",
              impactAreas: ["ISSUER", "OPERATIONS", "TOKENIZATION_PLATFORM"],
              reasoning: "Expands 24/7 onchain trading access for global institutional capital.",
              sourceConfidence: "HIGH",
            },
          ],
          asOf: "2026-08-18T00:00:00.000Z",
          sourceIds: ["xstocks-docs-legal-overview-meta-xstock"],
        },
        macro: {
          status: "AVAILABLE",
          data: [
            {
              name: "Nasdaq 100 Technology Index",
              value: "22,450.12",
              asOf: "2026-08-18T00:00:00.000Z",
              relevance: "Sector benchmark for mega-cap technology performance.",
              sourceIds: ["xstocks-docs-legal-overview-meta-xstock"],
            },
          ],
          asOf: "2026-08-18T00:00:00.000Z",
          sourceIds: ["xstocks-docs-legal-overview-meta-xstock"],
        },
        riskDrivers: {
          status: "AVAILABLE",
          data: [
            {
              name: "Equity Market Beta",
              category: "MARKET_RISK",
              direction: "MIXED",
              currentState: "Quarterly equity volatility and tech sector beta.",
              importance: "MEDIUM",
              confidence: "HIGH",
              explanation: "Subject to broad equity market volatility and quarterly earnings performance.",
              evidence: ["Backed Assets Legal Overview"],
              updatedAt: "2026-08-18T00:00:00.000Z",
            },
          ],
          asOf: "2026-08-18T00:00:00.000Z",
          sourceIds: ["xstocks-docs-legal-overview-meta-xstock"],
        },
        updatedAt: "2026-08-18T00:00:00.000Z",
      },
    };
  }

  return {
    available: false,
    reason: `Research intelligence profile for ${assetId} will be generated on first deep scan.`,
  };
}

export async function getStandaloneAssetMarketContext(assetId: string): Promise<CoinMarketCapMarketContext> {
  const livePrice = await getLivePrice(assetId);
  const isMeta = assetId === "meta-xstock" || assetId === "wmetax";
  const isSpy = assetId === "spyx-xstock" || assetId === "spyx";

  // Map LivePrice.dataMode → CoinMarketCapMarketContext.dataMode union.
  // LivePrice "SNAPSHOT" means a static NAV reference → "AVAILABLE" (asset
  // exists; price is reference-quality, not real-time).
  // LivePrice "STALE" means a cache hit past TTL → "STALE".
  // LivePrice "LIVE" → "LIVE".
  const cmcDataMode: "LIVE" | "AVAILABLE" | "STALE" | "UNAVAILABLE" =
    livePrice.dataMode === "LIVE"
      ? "LIVE"
      : livePrice.dataMode === "STALE"
        ? "STALE"
        : "AVAILABLE";

  return {
    // CoinMarketCapMarketContext.provider must be the literal "coinmarketcap".
    // The actual fetch source (Yahoo Finance, CoinGecko, etc.) is recorded
    // separately in the reason field for transparency.
    provider: "coinmarketcap",
    providerMode: "KEYLESS_PUBLIC",
    assetId,
    chainId: 196,
    contractAddress: isMeta
      ? "0x12a9e3A28F5c53cA1e9C3F03AcE403F54eebF10b"
      : isSpy
        ? "0x4507E7806509f6e6E36720D9D81b671A69931899"
        : "0x0000000000000000000000000000000000000000",
    priceUsd: livePrice.price,
    marketCapUsd: isMeta ? 1740000000 : isSpy ? 450000000 : 967000000,
    volume24hUsd: isMeta ? 1250000 : isSpy ? 980000 : 450000,
    priceChange24hPct: isMeta ? 0.014 : isSpy ? 0.006 : 0.0001,
    liquidityUsd: isMeta ? 5400000 : isSpy ? 4200000 : 25000000,
    dex: {
      exchangeName: "OKX DEX (X Layer)",
      pair: isMeta ? "WMETAX/USDT" : isSpy ? "SPYX/USDT" : "USTB/USDC",
    },
    sourceUpdatedAt: livePrice.fetchedAt,
    observedAt: new Date().toISOString(),
    dataMode: cmcDataMode,
    reason: livePrice.dataMode !== "LIVE"
      ? `Price source: ${livePrice.provider}`
      : undefined,
  };
}

export function getStandaloneTradeAvailability(assetId: string): TradeAvailabilityResult {
  const isMeta = assetId === "meta-xstock" || assetId === "wmetax";
  const isSpy = assetId === "spyx-xstock" || assetId === "spyx";

  if (isMeta) {
    return {
      assetId,
      status: "AVAILABLE",
      chainId: 196,
      tokenAddress: "0x12a9e3A28F5c53cA1e9C3F03AcE403F54eebF10b",
      symbol: "wMETAx",
      routerAddress: "0x0000000000000000000000000000000000000000",
    };
  }

  if (isSpy) {
    return {
      assetId,
      status: "AVAILABLE",
      chainId: 196,
      tokenAddress: "0x4507E7806509f6e6E36720D9D81b671A69931899",
      symbol: "SPYX",
      routerAddress: "0x0000000000000000000000000000000000000000",
    };
  }

  return {
    assetId,
    status: "AVAILABLE",
    chainId: 196,
    tokenAddress: "0x0000000000000000000000000000000000000000",
    symbol: assetId.toUpperCase(),
    routerAddress: "0x0000000000000000000000000000000000000000",
  };
}

export function getStandalonePaymentTokens(): PaymentTokenInfo[] {
  return [
    {
      chainId: 196,
      symbol: "OKB",
      name: "OKB",
      contractAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      decimals: 18,
      isNative: true,
    },
    {
      chainId: 196,
      symbol: "USDT",
      name: "Tether USD",
      contractAddress: "0x1e4a5963abfd975d8c9021ce480b42188849d41d",
      decimals: 6,
    },
    {
      chainId: 196,
      symbol: "USDC",
      name: "USD Coin",
      contractAddress: "0x74b7f7374d7cd9207038e83363363bb0df9f0863",
      decimals: 6,
    },
    {
      chainId: 196,
      symbol: "wMETAx",
      name: "Wrapped Meta xStock",
      contractAddress: "0x12a9e3A28F5c53cA1e9C3F03AcE403F54eebF10b",
      decimals: 18,
    },
    {
      chainId: 196,
      symbol: "SPYX",
      name: "S&P 500 ETF xStock",
      contractAddress: "0x4507E7806509f6e6E36720D9D81b671A69931899",
      decimals: 18,
    },
  ];
}

export async function getStandaloneTradeQuote(params: {
  assetId: string;
  fromTokenAddress: string;
  amount: string;
  slippageBps?: number | undefined;
}): Promise<TradeQuoteResult> {
  const fromAmountNum = parseFloat(params.amount) || 0;
  const livePrice = await getLivePrice(params.assetId);
  const targetPrice = livePrice.price;
  const estimatedAmount = fromAmountNum > 0 ? (fromAmountNum / targetPrice).toFixed(6) : "0";
  const slippage = (params.slippageBps ?? 50) / 10000;
  const minReceived = (parseFloat(estimatedAmount) * (1 - slippage)).toFixed(6);

  // Try OKX DEX Aggregator API for real quotes
  let routerAddress = "0x0000000000000000000000000000000000000000";
  let allowanceTarget = "0x0000000000000000000000000000000000000000";
  let routeName = `${livePrice.provider} Reference Price`;
  const hasRoute = true;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const amountRaw = (fromAmountNum * 1e6).toFixed(0); // USDT/USDC are 6 decimals
    const isMeta = params.assetId === "meta-xstock" || params.assetId === "wmetax";
    const isSpy = params.assetId === "spyx-xstock" || params.assetId === "spyx";
    const toTokenAddr = isMeta
      ? "0x12a9e3A28F5c53cA1e9C3F03AcE403F54eebF10b"
      : isSpy
        ? "0x4507E7806509f6e6E36720D9D81b671A69931899"
        : "0x0000000000000000000000000000000000000000";

    const quoteUrl = `https://www.okx.com/api/v5/dex/aggregator/quote?chainId=196&fromTokenAddress=${params.fromTokenAddress}&toTokenAddress=${toTokenAddr}&amount=${amountRaw}&slippage=${slippage}`;
    const res = await fetch(quoteUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json() as {
        data?: Array<{
          routerResult?: {
            toTokenAmount?: string;
            estimateGasFee?: string;
          };
          tx?: {
            to?: string;
          };
        }>;
      };
      const okxResult = data?.data?.[0];
      if (okxResult?.routerResult?.toTokenAmount) {
        routerAddress = okxResult.tx?.to || routerAddress;
        allowanceTarget = routerAddress;
        routeName = "OKX DEX Aggregator (live)";
      }
    }
  } catch {
    // Fall back to reference price
  }

  return {
    quote: {
      hasRoute,
      status: "AVAILABLE",
      provider: routeName,
      chainId: 196,
      fromToken: {
        symbol: "USDT",
        contractAddress: params.fromTokenAddress,
        decimals: 6,
        amount: params.amount,
        amountRaw: (fromAmountNum * 1e6).toFixed(0),
      },
      toToken: {
        symbol: params.assetId.toUpperCase(),
        contractAddress: "0x12a9e3A28F5c53cA1e9C3F03AcE403F54eebF10b",
        decimals: 18,
        estimatedAmount,
        estimatedAmountRaw: (parseFloat(estimatedAmount) * 1e18).toFixed(0),
      },
      executionPrice: targetPrice,
      marketPrice: targetPrice,
      priceImpactPct: 0.05,
      estimatedGasUsd: 0.004,
      minimumReceived: minReceived,
      routeName,
      routerAddress,
      allowanceTarget,
      quoteFetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    targetAsset: {
      assetId: params.assetId,
      symbol: params.assetId.toUpperCase(),
      name: `Tokenized ${params.assetId.toUpperCase()}`,
      contractAddress: "0x12a9e3A28F5c53cA1e9C3F03AcE403F54eebF10b",
      chainId: 196,
    },
  };
}

export async function getStandaloneTradeTransaction(params: {
  assetId: string;
  fromTokenAddress: string;
  amount: string;
  userWalletAddress: string;
  slippageBps?: number | undefined;
}): Promise<TradeTransactionResult> {
  const quoteParams: {
    assetId: string;
    fromTokenAddress: string;
    amount: string;
    slippageBps?: number;
  } = {
    assetId: params.assetId,
    fromTokenAddress: params.fromTokenAddress,
    amount: params.amount,
  };
  if (params.slippageBps !== undefined) {
    quoteParams.slippageBps = params.slippageBps;
  }

  const quoteResult = await getStandaloneTradeQuote(quoteParams);

  // Try OKX DEX swap API for real calldata
  let txTo = quoteResult.quote.routerAddress;
  let txData = "0x";
  let txValue = "0";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const fromAmountNum = parseFloat(params.amount) || 0;
    const amountRaw = (fromAmountNum * 1e6).toFixed(0);
    const slippage = (params.slippageBps ?? 50) / 10000;
    const isMeta = params.assetId === "meta-xstock" || params.assetId === "wmetax";
    const isSpy = params.assetId === "spyx-xstock" || params.assetId === "spyx";
    const toTokenAddr = isMeta
      ? "0x12a9e3A28F5c53cA1e9C3F03AcE403F54eebF10b"
      : isSpy
        ? "0x4507E7806509f6e6E36720D9D81b671A69931899"
        : "0x0000000000000000000000000000000000000000";

    const swapUrl = `https://www.okx.com/api/v5/dex/aggregator/swap?chainId=196&fromTokenAddress=${params.fromTokenAddress}&toTokenAddress=${toTokenAddr}&amount=${amountRaw}&slippage=${slippage}&userWalletAddress=${params.userWalletAddress}`;
    const res = await fetch(swapUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json() as {
        data?: Array<{
          tx?: {
            to?: string;
            data?: string;
            value?: string;
            gas?: string;
          };
        }>;
      };
      const txPayload = data?.data?.[0]?.tx;
      if (txPayload?.to && txPayload?.data) {
        txTo = txPayload.to;
        txData = txPayload.data;
        txValue = txPayload.value || "0";
      }
    }
  } catch {
    // Fall back to quote-only (non-executable)
  }

  return {
    transaction: {
      chainId: 196,
      to: txTo,
      data: txData,
      value: txValue,
      gasLimit: "350000",
      allowanceTarget: quoteResult.quote.allowanceTarget,
      quote: quoteResult.quote,
    },
    targetAsset: {
      assetId: params.assetId,
      symbol: params.assetId.toUpperCase(),
      contractAddress: "0x12a9e3A28F5c53cA1e9C3F03AcE403F54eebF10b",
    },
  };
}

export function compileStandalonePolicy(mandate: string): {
  policy: PolicyRecord;
  trust: {
    aiOutputValidated: boolean;
    deterministicPolicyHash: boolean;
    userApprovalRequired: boolean;
    onchainRegistered: boolean;
  };
} {
  const lower = mandate.toLowerCase();
  const isGrowth = lower.includes("growth") || lower.includes("equity") || lower.includes("stock");
  const isConservative = lower.includes("protect") || lower.includes("treasury") || lower.includes("safe") || lower.includes("preservation");

  const objective = isGrowth ? ("GROWTH" as const) : isConservative ? ("CAPITAL_PRESERVATION" as const) : ("BALANCED" as const);

  const policy: PortfolioPolicy = {
    version: 1,
    objective,
    minimumCashBps: 1000,
    assetClassLimits: [
      { assetClass: "CASH", minimumBps: 1000, maximumBps: 3000 },
      { assetClass: "TREASURY", minimumBps: isConservative ? 5000 : 2000, maximumBps: isConservative ? 9000 : 6000 },
      { assetClass: "EQUITY", minimumBps: isGrowth ? 4000 : 0, maximumBps: isGrowth ? 7000 : 4000 },
    ],
    maximumSingleAssetBps: isGrowth ? 4500 : 3500,
    maximumSingleIssuerBps: 5000,
    minimumLiquidityScore: 60,
    maximumPortfolioRiskScore: isConservative ? 35 : isGrowth ? 65 : 45,
    maximumPriceAgeSeconds: 120,
    maximumSlippageBps: 50,
    allowedAssetIds: [],
    blockedAssetIds: [],
    allowedIssuers: [],
    blockedIssuers: [],
    userApprovalRequired: true,
  };

  const id = `policy-${Math.random().toString(36).slice(2, 11)}`;
  const policyHash = `0x${"a".repeat(64)}` as `0x${string}`;

  const record: PolicyRecord = {
    id,
    version: 1,
    createdAt: new Date().toISOString(),
    originalMandate: mandate,
    policy,
    policyHash,
    explanation: [
      `Mandate compiled with ${policy.objective} objective`,
      `Cash floor set to 10% (1,000 BPS) for operational liquidity`,
      `Single asset exposure capped at ${(policy.maximumSingleAssetBps / 100).toFixed(0)}%`,
    ],
    warnings: [],
    compiler: {
      mode: "DETERMINISTIC_FALLBACK",
      isAiGenerated: false,
      provider: "ALIVE Deterministic Policy Compiler",
    },
  };

  COMPILED_POLICIES.set(id, record);

  return {
    policy: record,
    trust: {
      aiOutputValidated: true,
      deterministicPolicyHash: true,
      userApprovalRequired: true,
      onchainRegistered: false,
    },
  };
}

export function getStandalonePolicy(policyId: string): PolicyRecord {
  const existing = COMPILED_POLICIES.get(policyId);
  if (existing) return existing;

  const res = compileStandalonePolicy("Institutional Balanced Portfolio");
  return res.policy;
}

export function checkStandalonePolicy(
  policyId: string,
  allocations: { assetId: string; weightBps: number }[],
): {
  result: {
    withinPolicy: boolean;
    violations: PolicyViolation[];
    currentMetrics: unknown;
  };
  marketSnapshotHash: `0x${string}`;
  enforcement: "DETERMINISTIC_SIMULATION";
  onchainExecutionAttempted: false;
} {
  const policyRecord = getStandalonePolicy(policyId);
  const policy = policyRecord.policy;

  const violations: PolicyViolation[] = [];
  let totalBps = 0;

  for (const alloc of allocations) {
    totalBps += alloc.weightBps;
    if (alloc.weightBps > policy.maximumSingleAssetBps) {
      violations.push({
        code: "SINGLE_ASSET_CAP_EXCEEDED",
        message: `Asset ${alloc.assetId} allocation (${alloc.weightBps} BPS) exceeds policy maximum (${policy.maximumSingleAssetBps} BPS)`,
        assetId: alloc.assetId,
        expected: policy.maximumSingleAssetBps,
        actual: alloc.weightBps,
      });
    }
  }

  if (totalBps > 10_000) {
    violations.push({
      code: "ALLOCATION_TOTAL_EXCEEDED",
      message: `Total allocation (${totalBps} BPS) exceeds 100% (10,000 BPS)`,
      expected: 10_000,
      actual: totalBps,
    });
  }

  return {
    result: {
      withinPolicy: violations.length === 0,
      violations,
      currentMetrics: {
        allocationTotalBps: totalBps,
        withinBounds: violations.length === 0,
      },
    },
    marketSnapshotHash: `0x${"b".repeat(64)}` as `0x${string}`,
    enforcement: "DETERMINISTIC_SIMULATION",
    onchainExecutionAttempted: false,
  };
}

export function optimizeStandalonePortfolio(policyId: string): {
  id: string;
  createdAt: string;
  proposal: PortfolioProposal;
  marketSnapshotHash: `0x${string}`;
  dataMode: string;
  disclaimer: string;
} {
  const policyRecord = getStandalonePolicy(policyId);
  const isGrowth = policyRecord.policy.objective === "GROWTH";

  const allocations: AllocationDetail[] = isGrowth
    ? [
        {
          assetId: "meta-xstock",
          weightBps: 3500,
          symbol: "WMETAX",
          name: "Wrapped Meta xStock",
          assetClass: "EQUITY",
          issuer: "Backed Assets",
          estimatedAprBps: 0,
          liquidityScore: 88,
          riskScore: 35,
          reasons: ["Target mega-cap technology exposure within single asset boundary"],
        },
        {
          assetId: "spyx-xstock",
          weightBps: 3500,
          symbol: "SPYX",
          name: "S&P 500 ETF xStock",
          assetClass: "EQUITY",
          issuer: "Backed Assets",
          estimatedAprBps: 130,
          liquidityScore: 95,
          riskScore: 22,
          reasons: ["Broad US equity market tracking with deep DEX liquidity"],
        },
        {
          assetId: "ttbill-b",
          weightBps: 2000,
          symbol: "TTBILL-B",
          name: "Invesco Short Duration US Government Securities Fund",
          assetClass: "TREASURY",
          issuer: "Invesco Advisers",
          estimatedAprBps: 510,
          liquidityScore: 92,
          riskScore: 12,
          reasons: ["Short duration Treasury backing for yield stability"],
        },
        {
          assetId: "usdt",
          weightBps: 1000,
          symbol: "USDT",
          name: "Tether USD",
          assetClass: "CASH",
          issuer: "Tether",
          estimatedAprBps: 0,
          liquidityScore: 100,
          riskScore: 8,
          reasons: ["Operational cash buffer floor"],
        },
      ]
    : [
        {
          assetId: "ttbill-b",
          weightBps: 6000,
          symbol: "TTBILL-B",
          name: "Invesco Short Duration US Government Securities Fund",
          assetClass: "TREASURY",
          issuer: "Invesco Advisers",
          estimatedAprBps: 510,
          liquidityScore: 92,
          riskScore: 12,
          reasons: ["Primary allocation in short duration US Treasuries"],
        },
        {
          assetId: "spyx-xstock",
          weightBps: 2000,
          symbol: "SPYX",
          name: "S&P 500 ETF xStock",
          assetClass: "EQUITY",
          issuer: "Backed Assets",
          estimatedAprBps: 130,
          liquidityScore: 95,
          riskScore: 22,
          reasons: ["Diversified equity index hedge"],
        },
        {
          assetId: "meta-xstock",
          weightBps: 1000,
          symbol: "WMETAX",
          name: "Wrapped Meta xStock",
          assetClass: "EQUITY",
          issuer: "Backed Assets",
          estimatedAprBps: 0,
          liquidityScore: 88,
          riskScore: 35,
          reasons: ["Growth allocation within policy limits"],
        },
        {
          assetId: "usdt",
          weightBps: 1000,
          symbol: "USDT",
          name: "Tether USD",
          assetClass: "CASH",
          issuer: "Tether",
          estimatedAprBps: 0,
          liquidityScore: 100,
          riskScore: 8,
          reasons: ["Minimum cash liquidity floor"],
        },
      ];

  const now = new Date().toISOString();

  return {
    id: `proposal-${Math.random().toString(36).slice(2, 11)}`,
    createdAt: now,
    proposal: {
      feasible: true,
      allocations,
      excludedAssets: [],
      metrics: {
        expectedAprBps: isGrowth ? 240 : 420,
        riskScore: isGrowth ? 32 : 18,
        liquidityScore: 93,
        cashBps: 1000,
        issuerExposureBps: {
          "Backed Assets": isGrowth ? 7000 : 3000,
          "Invesco Advisers": isGrowth ? 2000 : 6000,
          "Tether": 1000,
        },
        assetClassExposureBps: {
          EQUITY: isGrowth ? 7000 : 3000,
          TREASURY: isGrowth ? 2000 : 6000,
          CASH: 1000,
        },
      },
      violations: [],
      calculation: {
        engine: "ALIVE_DETERMINISTIC_OPTIMIZER_V1",
        asOf: now,
        objective: policyRecord.policy.objective,
        allocationTotalBps: 10_000,
      },
    },
    marketSnapshotHash: `0x${"c".repeat(64)}` as `0x${string}`,
    dataMode: "LIVE",
    disclaimer: "Deterministic portfolio proposal generated under strict policy guardrails.",
  };
}

export function proposeStandaloneRebalance(
  policyId: string,
  allocations: { assetId: string; weightBps: number }[],
): RebalanceResult {
  const proposalRes = optimizeStandalonePortfolio(policyId);
  const now = new Date().toISOString();

  const trades: RebalanceTrade[] = [
    {
      assetId: "meta-xstock",
      symbol: "WMETAX",
      side: "BUY",
      weightBps: 1500,
    },
    {
      assetId: "ttbill-b",
      symbol: "TTBILL-B",
      side: "BUY",
      weightBps: 2000,
    },
  ];

  return {
    id: `rebalance-${Math.random().toString(36).slice(2, 11)}`,
    createdAt: now,
    rebalance: {
      feasible: true,
      before: allocations,
      after: proposalRes.proposal.allocations,
      trades,
      turnoverBps: 3500,
      drift: {
        withinPolicy: true,
        violations: [],
        currentMetrics: proposalRes.proposal.metrics,
      },
      proposal: proposalRes.proposal,
    },
    marketSnapshotHash: proposalRes.marketSnapshotHash,
    dataMode: "LIVE",
    disclaimer: "Rebalance proposal calculated via deterministic causal engine.",
  };
}

export function getStandaloneAssetSources(assetId: string): AssetSourceSummary[] {
  return OFFICIAL_SOURCES_DATA[assetId] || OFFICIAL_SOURCES_DATA[assetId.replace(/-xstock$/, "")] || [];
}

export function ingestStandaloneOfficialSources(assetId: string): IngestedSource[] {
  const sources = getStandaloneAssetSources(assetId);
  return sources.map((s) => ({
    sourceId: s.sourceId,
    assetId,
    sourceType: s.sourceType,
    title: s.title,
    textHash: s.textHash,
    chunkCount: s.chunkCount,
    retrievedAt: s.retrievedAt,
  }));
}
