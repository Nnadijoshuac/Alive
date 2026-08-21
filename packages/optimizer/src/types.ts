import type {
  AssetClass,
  MarketQuote,
  PortfolioPolicy,
  RwaAsset,
} from "@alive/shared";

export type Allocation = {
  assetId: string;
  weightBps: number;
};

export type AllocationDetail = Allocation & {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  issuer: string;
  estimatedAprBps: number;
  liquidityScore: number;
  riskScore: number;
  reasons: string[];
};

export type PolicyViolationCode =
  | "ALLOCATION_TOTAL_INVALID"
  | "ALLOCATION_WEIGHT_INVALID"
  | "DUPLICATE_ASSET_ALLOCATION"
  | "ASSET_NOT_APPROVED"
  | "ASSET_BLOCKED"
  | "ASSET_LIMIT_EXCEEDED"
  | "ISSUER_BLOCKED"
  | "ISSUER_LIMIT_EXCEEDED"
  | "ASSET_CLASS_MINIMUM_MISSED"
  | "ASSET_CLASS_MAXIMUM_EXCEEDED"
  | "CASH_MINIMUM_MISSED"
  | "LIQUIDITY_MINIMUM_MISSED"
  | "PORTFOLIO_RISK_EXCEEDED"
  | "QUOTE_MISSING"
  | "QUOTE_INVALID"
  | "QUOTE_FUTURE"
  | "QUOTE_STALE"
  | "MARKET_UNAVAILABLE"
  | "ASSET_NOT_ANALYZED";

export type PolicyViolation = {
  code: PolicyViolationCode;
  message: string;
  assetId?: string;
  expected?: number;
  actual?: number;
};

export type ExcludedAsset = {
  assetId: string;
  symbol: string;
  reasons: PolicyViolation[];
};

export type PortfolioMetrics = {
  expectedAprBps: number;
  riskScore: number;
  liquidityScore: number;
  cashBps: number;
  issuerExposureBps: Record<string, number>;
  assetClassExposureBps: Partial<Record<AssetClass, number>>;
};

export type OptimizationInput = {
  policy: PortfolioPolicy;
  assets: RwaAsset[];
  quotes: MarketQuote[];
  asOf: string;
  currentAllocations?: Allocation[];
};

export type PortfolioProposal = {
  feasible: boolean;
  allocations: AllocationDetail[];
  excludedAssets: ExcludedAsset[];
  metrics: PortfolioMetrics;
  violations: PolicyViolation[];
  calculation: {
    engine: "ALIVE_DETERMINISTIC_OPTIMIZER_V1";
    asOf: string;
    objective: PortfolioPolicy["objective"];
    allocationTotalBps: number;
  };
};

export type DriftReport = {
  withinPolicy: boolean;
  violations: PolicyViolation[];
  currentMetrics: PortfolioMetrics;
};

export type RebalanceTrade = {
  assetId: string;
  symbol: string;
  side: "BUY" | "SELL";
  weightBps: number;
};

export type RebalanceProposal = {
  feasible: boolean;
  before: Allocation[];
  after: AllocationDetail[];
  trades: RebalanceTrade[];
  turnoverBps: number;
  drift: DriftReport;
  proposal: PortfolioProposal;
};
