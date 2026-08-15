import type {
  AssetClass,
  MarketQuote,
  PortfolioPolicy,
  RwaAsset,
} from "@alive/shared";

import type {
  Allocation,
  AllocationDetail,
  DriftReport,
  ExcludedAsset,
  OptimizationInput,
  PolicyViolation,
  PortfolioMetrics,
  PortfolioProposal,
  RebalanceProposal,
  RebalanceTrade,
} from "./types.js";

const BPS_TOTAL = 10_000;

type Candidate = {
  asset: RwaAsset;
  quote: MarketQuote;
  rank: number;
};

type AllocationState = {
  weights: Map<string, number>;
  issuerTotals: Map<string, number>;
  classTotals: Map<AssetClass, number>;
  total: number;
};

function emptyMetrics(): PortfolioMetrics {
  return {
    expectedAprBps: 0,
    riskScore: 0,
    liquidityScore: 0,
    cashBps: 0,
    issuerExposureBps: {},
    assetClassExposureBps: {},
  };
}

function allowedList(
  policy: PortfolioPolicy,
  key: "allowedAssetIds" | "allowedIssuers",
) {
  return policy[key] ?? [];
}

function blockedList(
  policy: PortfolioPolicy,
  key: "blockedAssetIds" | "blockedIssuers",
) {
  return policy[key] ?? [];
}

function quoteTime(quote: MarketQuote): number {
  return Date.parse(quote.timestamp);
}

function quoteIsAvailable(quote: MarketQuote): boolean {
  return quote.status !== "HALTED";
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function estimatedAprBps(asset: RwaAsset): number {
  return asset.yield?.estimatedAprBps ?? 0;
}

function rankAsset(
  asset: RwaAsset,
  policy: PortfolioPolicy,
  currentWeight: number,
): number {
  const annualYield = estimatedAprBps(asset);
  const liquidity = asset.liquidity.score * 100;
  const risk = asset.risk.score * 100;
  const continuity = currentWeight * 2;

  switch (policy.objective) {
    case "CAPITAL_PRESERVATION":
      return annualYield * 2 + liquidity * 5 - risk * 8 + continuity;
    case "INCOME":
      return annualYield * 6 + liquidity * 2 - risk * 4 + continuity;
    case "GROWTH":
      return annualYield * 4 + liquidity - risk * 2 + continuity;
    case "BALANCED":
      return annualYield * 4 + liquidity * 3 - risk * 5 + continuity;
    case "CUSTOM":
      return annualYield * 3 + liquidity * 3 - risk * 4 + continuity;
  }
}

function classLimit(policy: PortfolioPolicy, assetClass: AssetClass) {
  return policy.assetClassLimits.find(
    (limit) => limit.assetClass === assetClass,
  );
}

function assetEligibility(
  policy: PortfolioPolicy,
  asset: RwaAsset,
  quote: MarketQuote | undefined,
  asOfMs: number,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const allowedAssets = allowedList(policy, "allowedAssetIds");
  const allowedIssuers = allowedList(policy, "allowedIssuers");

  if (allowedAssets.length > 0 && !allowedAssets.includes(asset.id)) {
    violations.push({
      code: "ASSET_NOT_APPROVED",
      message: `${asset.symbol} is not in the policy allowlist.`,
      assetId: asset.id,
    });
  }
  if (blockedList(policy, "blockedAssetIds").includes(asset.id)) {
    violations.push({
      code: "ASSET_BLOCKED",
      message: `${asset.symbol} is blocked by policy.`,
      assetId: asset.id,
    });
  }
  if (allowedIssuers.length > 0 && !allowedIssuers.includes(asset.issuer)) {
    violations.push({
      code: "ISSUER_BLOCKED",
      message: `${asset.issuer} is not in the policy issuer allowlist.`,
      assetId: asset.id,
    });
  }
  if (blockedList(policy, "blockedIssuers").includes(asset.issuer)) {
    violations.push({
      code: "ISSUER_BLOCKED",
      message: `${asset.issuer} is blocked by policy.`,
      assetId: asset.id,
    });
  }
  if (!classLimit(policy, asset.assetClass)) {
    violations.push({
      code: "ASSET_NOT_APPROVED",
      message: `${asset.assetClass} is outside the approved asset classes.`,
      assetId: asset.id,
    });
  }
  if (asset.liquidity.score < policy.minimumLiquidityScore) {
    violations.push({
      code: "LIQUIDITY_MINIMUM_MISSED",
      message: `${asset.symbol} liquidity is below the policy minimum.`,
      assetId: asset.id,
      expected: policy.minimumLiquidityScore,
      actual: asset.liquidity.score,
    });
  }
  if (!quote) {
    violations.push({
      code: "QUOTE_MISSING",
      message: `${asset.symbol} has no market quote.`,
      assetId: asset.id,
    });
    return violations;
  }
  const quoteMs = quoteTime(quote);
  if (!Number.isFinite(quoteMs)) {
    violations.push({
      code: "QUOTE_INVALID",
      message: `${asset.symbol} has an invalid quote timestamp.`,
      assetId: asset.id,
    });
  } else {
    if (quoteMs > asOfMs) {
      violations.push({
        code: "QUOTE_FUTURE",
        message: `${asset.symbol} quote is timestamped after the optimization snapshot.`,
        assetId: asset.id,
      });
    }
    const ageSeconds = Math.max(0, Math.floor((asOfMs - quoteMs) / 1_000));
    if (ageSeconds > policy.maximumPriceAgeSeconds) {
      violations.push({
        code: "QUOTE_STALE",
        message: `${asset.symbol} quote is ${ageSeconds}s old; policy allows ${policy.maximumPriceAgeSeconds}s.`,
        assetId: asset.id,
        expected: policy.maximumPriceAgeSeconds,
        actual: ageSeconds,
      });
    }
  }
  if (!quoteIsAvailable(quote)) {
    violations.push({
      code: "MARKET_UNAVAILABLE",
      message: `${asset.symbol} market data is unavailable.`,
      assetId: asset.id,
    });
  }
  return violations;
}

function addWeight(
  state: AllocationState,
  candidate: Candidate,
  amount: number,
): void {
  if (amount <= 0) return;
  const { asset } = candidate;
  state.weights.set(asset.id, (state.weights.get(asset.id) ?? 0) + amount);
  state.issuerTotals.set(
    asset.issuer,
    (state.issuerTotals.get(asset.issuer) ?? 0) + amount,
  );
  state.classTotals.set(
    asset.assetClass,
    (state.classTotals.get(asset.assetClass) ?? 0) + amount,
  );
  state.total += amount;
}

function capacity(
  state: AllocationState,
  candidate: Candidate,
  policy: PortfolioPolicy,
): number {
  const limit = classLimit(policy, candidate.asset.assetClass);
  if (!limit) return 0;
  const assetRoom =
    policy.maximumSingleAssetBps - (state.weights.get(candidate.asset.id) ?? 0);
  const issuerRoom =
    policy.maximumSingleIssuerBps -
    (state.issuerTotals.get(candidate.asset.issuer) ?? 0);
  const classRoom =
    limit.maximumBps - (state.classTotals.get(candidate.asset.assetClass) ?? 0);
  return Math.max(
    0,
    Math.min(assetRoom, issuerRoom, classRoom, BPS_TOTAL - state.total),
  );
}

function sortedCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort(
    (left, right) =>
      right.rank - left.rank || compareText(left.asset.id, right.asset.id),
  );
}

function allocateRequirement(
  state: AllocationState,
  candidates: Candidate[],
  policy: PortfolioPolicy,
  requiredBps: number,
): boolean {
  let remaining = Math.max(0, requiredBps);
  while (remaining > 0) {
    const available = sortedCandidates(candidates)
      .map((candidate) => ({
        candidate,
        room: capacity(state, candidate, policy),
      }))
      .filter((entry) => entry.room > 0)
      .sort(
        (left, right) =>
          left.candidate.asset.risk.score - right.candidate.asset.risk.score ||
          right.room - left.room ||
          right.candidate.rank - left.candidate.rank ||
          compareText(left.candidate.asset.id, right.candidate.asset.id),
      );
    const next = available[0];
    if (!next) return false;
    const amount = Math.min(remaining, next.room);
    addWeight(state, next.candidate, amount);
    remaining -= amount;
  }
  return true;
}

function cloneState(state: AllocationState): AllocationState {
  return {
    weights: new Map(state.weights),
    issuerTotals: new Map(state.issuerTotals),
    classTotals: new Map(state.classTotals),
    total: state.total,
  };
}

function riskNumerator(
  state: AllocationState,
  candidatesById: Map<string, Candidate>,
): number {
  let numerator = 0;
  for (const [assetId, weight] of state.weights) {
    const candidate = candidatesById.get(assetId);
    if (candidate) numerator += candidate.asset.risk.score * weight;
  }
  return numerator;
}

function minimumCompletionRisk(
  state: AllocationState,
  candidates: Candidate[],
  policy: PortfolioPolicy,
): number {
  const completion = cloneState(state);
  let risk = 0;
  const lowestRiskFirst = [...candidates].sort(
    (left, right) =>
      left.asset.risk.score - right.asset.risk.score ||
      compareText(left.asset.id, right.asset.id),
  );
  for (const candidate of lowestRiskFirst) {
    const remaining = BPS_TOTAL - completion.total;
    if (remaining === 0) break;
    const amount = Math.min(remaining, capacity(completion, candidate, policy));
    addWeight(completion, candidate, amount);
    risk += candidate.asset.risk.score * amount;
  }
  return completion.total === BPS_TOTAL ? risk : Number.POSITIVE_INFINITY;
}

function riskAwareCapacity(
  state: AllocationState,
  candidate: Candidate,
  candidates: Candidate[],
  candidatesById: Map<string, Candidate>,
  policy: PortfolioPolicy,
): number {
  const maximum = capacity(state, candidate, policy);
  const riskBudget = policy.maximumPortfolioRiskScore * BPS_TOTAL;
  const currentRisk = riskNumerator(state, candidatesById);
  let low = 0;
  let high = maximum;

  while (low < high) {
    const amount = Math.ceil((low + high) / 2);
    const trial = cloneState(state);
    addWeight(trial, candidate, amount);
    const completionRisk = minimumCompletionRisk(trial, candidates, policy);
    const totalRisk =
      currentRisk + candidate.asset.risk.score * amount + completionRisk;
    if (totalRisk <= riskBudget) low = amount;
    else high = amount - 1;
  }
  return low;
}

function computeMetrics(
  allocations: Allocation[],
  assetsById: Map<string, RwaAsset>,
): PortfolioMetrics {
  if (allocations.length === 0) return emptyMetrics();
  let yieldNumerator = 0;
  let riskNumerator = 0;
  let liquidityNumerator = 0;
  let total = 0;
  let cash = 0;
  const issuerExposureBps: Record<string, number> = {};
  const assetClassExposureBps: Partial<Record<AssetClass, number>> = {};

  for (const allocation of allocations) {
    const asset = assetsById.get(allocation.assetId);
    if (!asset || allocation.weightBps <= 0) continue;
    total += allocation.weightBps;
    yieldNumerator += estimatedAprBps(asset) * allocation.weightBps;
    riskNumerator += asset.risk.score * allocation.weightBps;
    liquidityNumerator += asset.liquidity.score * allocation.weightBps;
    issuerExposureBps[asset.issuer] =
      (issuerExposureBps[asset.issuer] ?? 0) + allocation.weightBps;
    assetClassExposureBps[asset.assetClass] =
      (assetClassExposureBps[asset.assetClass] ?? 0) + allocation.weightBps;
    if (asset.assetClass === "CASH") cash += allocation.weightBps;
  }

  return {
    expectedAprBps: total === 0 ? 0 : Math.floor(yieldNumerator / total),
    riskScore: total === 0 ? 0 : Math.floor(riskNumerator / total),
    liquidityScore: total === 0 ? 0 : Math.floor(liquidityNumerator / total),
    cashBps: cash,
    issuerExposureBps,
    assetClassExposureBps,
  };
}

export function evaluateAllocation(
  input: OptimizationInput,
  allocations: Allocation[],
): DriftReport {
  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const quotesById = new Map(
    input.quotes.map((quote) => [quote.assetId, quote]),
  );
  const asOfMs = Date.parse(input.asOf);
  const violations: PolicyViolation[] = [];
  const metrics = computeMetrics(allocations, assetsById);
  const total = allocations.reduce(
    (sum, allocation) => sum + allocation.weightBps,
    0,
  );
  const seenAllocations = new Set<string>();

  for (const allocation of allocations) {
    if (
      !Number.isInteger(allocation.weightBps) ||
      allocation.weightBps < 0 ||
      allocation.weightBps > BPS_TOTAL
    ) {
      violations.push({
        code: "ALLOCATION_WEIGHT_INVALID",
        message: `${allocation.assetId} must use an integer weight between 0 and ${BPS_TOTAL} BPS.`,
        assetId: allocation.assetId,
        actual: allocation.weightBps,
      });
    }
    if (seenAllocations.has(allocation.assetId)) {
      violations.push({
        code: "DUPLICATE_ASSET_ALLOCATION",
        message: `${allocation.assetId} appears more than once in the allocation.`,
        assetId: allocation.assetId,
      });
    }
    seenAllocations.add(allocation.assetId);
  }

  if (total !== BPS_TOTAL) {
    violations.push({
      code: "ALLOCATION_TOTAL_INVALID",
      message: `Allocation totals ${total} BPS; exactly ${BPS_TOTAL} BPS is required.`,
      expected: BPS_TOTAL,
      actual: total,
    });
  }

  for (const allocation of allocations) {
    const asset = assetsById.get(allocation.assetId);
    if (!asset) {
      violations.push({
        code: "ASSET_NOT_APPROVED",
        message: `${allocation.assetId} is not in the approved catalog.`,
        assetId: allocation.assetId,
      });
      continue;
    }
    violations.push(
      ...assetEligibility(
        input.policy,
        asset,
        quotesById.get(asset.id),
        asOfMs,
      ),
    );
    if (allocation.weightBps > input.policy.maximumSingleAssetBps) {
      violations.push({
        code: "ASSET_LIMIT_EXCEEDED",
        message: `${asset.symbol} exceeds the single-asset cap.`,
        assetId: asset.id,
        expected: input.policy.maximumSingleAssetBps,
        actual: allocation.weightBps,
      });
    }
  }

  for (const limit of input.policy.assetClassLimits) {
    const actual = metrics.assetClassExposureBps[limit.assetClass] ?? 0;
    if (actual < limit.minimumBps) {
      violations.push({
        code: "ASSET_CLASS_MINIMUM_MISSED",
        message: `${limit.assetClass} is below its policy minimum.`,
        expected: limit.minimumBps,
        actual,
      });
    }
    if (actual > limit.maximumBps) {
      violations.push({
        code: "ASSET_CLASS_MAXIMUM_EXCEEDED",
        message: `${limit.assetClass} exceeds its policy maximum.`,
        expected: limit.maximumBps,
        actual,
      });
    }
  }

  if (metrics.cashBps < input.policy.minimumCashBps) {
    violations.push({
      code: "CASH_MINIMUM_MISSED",
      message: "Cash allocation is below the policy minimum.",
      expected: input.policy.minimumCashBps,
      actual: metrics.cashBps,
    });
  }
  for (const [issuer, exposure] of Object.entries(metrics.issuerExposureBps)) {
    if (exposure > input.policy.maximumSingleIssuerBps) {
      violations.push({
        code: "ISSUER_LIMIT_EXCEEDED",
        message: `${issuer} exposure exceeds the issuer cap.`,
        expected: input.policy.maximumSingleIssuerBps,
        actual: exposure,
      });
    }
  }
  if (metrics.riskScore > input.policy.maximumPortfolioRiskScore) {
    violations.push({
      code: "PORTFOLIO_RISK_EXCEEDED",
      message: "ALIVE Risk Score exceeds the policy maximum.",
      expected: input.policy.maximumPortfolioRiskScore,
      actual: metrics.riskScore,
    });
  }

  return {
    withinPolicy: violations.length === 0,
    violations,
    currentMetrics: metrics,
  };
}

function allocationReasons(asset: RwaAsset, policy: PortfolioPolicy): string[] {
  const reasons = [
    `${asset.assetClass} is permitted by the approved policy.`,
    `Liquidity score ${asset.liquidity.score}/100 meets the ${policy.minimumLiquidityScore}/100 floor.`,
    `Issuer exposure remains bounded by ${policy.maximumSingleIssuerBps} BPS.`,
  ];
  const apr = estimatedAprBps(asset);
  if (apr > 0) reasons.splice(1, 0, `Snapshot yield estimate is ${apr} BPS.`);
  return reasons;
}

function toDetails(
  state: AllocationState,
  candidatesById: Map<string, Candidate>,
  policy: PortfolioPolicy,
): AllocationDetail[] {
  return [...state.weights.entries()]
    .filter(([, weightBps]) => weightBps > 0)
    .sort(([left], [right]) => compareText(left, right))
    .map(([assetId, weightBps]) => {
      const candidate = candidatesById.get(assetId);
      if (!candidate) throw new Error(`Missing optimizer candidate ${assetId}`);
      return {
        assetId,
        weightBps,
        symbol: candidate.asset.symbol,
        name: candidate.asset.name,
        assetClass: candidate.asset.assetClass,
        issuer: candidate.asset.issuer,
        estimatedAprBps: estimatedAprBps(candidate.asset),
        liquidityScore: candidate.asset.liquidity.score,
        riskScore: candidate.asset.risk.score,
        reasons: allocationReasons(candidate.asset, policy),
      };
    });
}

export function optimizePortfolio(input: OptimizationInput): PortfolioProposal {
  const asOfMs = Date.parse(input.asOf);
  if (!Number.isFinite(asOfMs))
    throw new Error("Optimization asOf must be an ISO timestamp.");
  const quotesById = new Map(
    input.quotes.map((quote) => [quote.assetId, quote]),
  );
  const currentById = new Map(
    (input.currentAllocations ?? []).map((allocation) => [
      allocation.assetId,
      allocation.weightBps,
    ]),
  );
  const excludedAssets: ExcludedAsset[] = [];
  const candidates: Candidate[] = [];

  for (const asset of input.assets) {
    const quote = quotesById.get(asset.id);
    const reasons = assetEligibility(input.policy, asset, quote, asOfMs);
    if (reasons.length > 0 || !quote) {
      excludedAssets.push({ assetId: asset.id, symbol: asset.symbol, reasons });
      continue;
    }
    candidates.push({
      asset,
      quote,
      rank: rankAsset(asset, input.policy, currentById.get(asset.id) ?? 0),
    });
  }

  const state: AllocationState = {
    weights: new Map(),
    issuerTotals: new Map(),
    classTotals: new Map(),
    total: 0,
  };
  const constructionViolations: PolicyViolation[] = [];
  const requirements = input.policy.assetClassLimits
    .map((limit) => ({
      assetClass: limit.assetClass,
      requiredBps:
        limit.assetClass === "CASH"
          ? Math.max(limit.minimumBps, input.policy.minimumCashBps)
          : limit.minimumBps,
      candidates: candidates.filter(
        (candidate) => candidate.asset.assetClass === limit.assetClass,
      ),
    }))
    .filter((requirement) => requirement.requiredBps > 0)
    .sort(
      (left, right) =>
        left.candidates.length - right.candidates.length ||
        right.requiredBps - left.requiredBps ||
        compareText(left.assetClass, right.assetClass),
    );

  for (const requirement of requirements) {
    if (
      !allocateRequirement(
        state,
        requirement.candidates,
        input.policy,
        requirement.requiredBps,
      )
    ) {
      constructionViolations.push({
        code: "ASSET_CLASS_MINIMUM_MISSED",
        message: `${requirement.assetClass} minimum cannot be satisfied with eligible capacity.`,
        expected: requirement.requiredBps,
        actual: state.classTotals.get(requirement.assetClass) ?? 0,
      });
    }
  }

  const ranked = sortedCandidates(candidates);
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.asset.id, candidate]),
  );
  const minimumRemainingRisk = minimumCompletionRisk(
    state,
    candidates,
    input.policy,
  );
  if (
    constructionViolations.length === 0 &&
    riskNumerator(state, candidatesById) + minimumRemainingRisk >
      input.policy.maximumPortfolioRiskScore * BPS_TOTAL
  ) {
    constructionViolations.push({
      code: "PORTFOLIO_RISK_EXCEEDED",
      message: "Eligible assets cannot satisfy the portfolio risk ceiling.",
      expected: input.policy.maximumPortfolioRiskScore,
    });
  }

  while (state.total < BPS_TOTAL && constructionViolations.length === 0) {
    const next = ranked
      .map((candidate) => ({
        candidate,
        amount: riskAwareCapacity(
          state,
          candidate,
          candidates,
          candidatesById,
          input.policy,
        ),
      }))
      .find((entry) => entry.amount > 0);
    if (!next) {
      constructionViolations.push({
        code: "ALLOCATION_TOTAL_INVALID",
        message:
          "Eligible asset, issuer, class, and risk caps leave unallocated capital.",
        expected: BPS_TOTAL,
        actual: state.total,
      });
      break;
    }
    addWeight(state, next.candidate, next.amount);
  }

  const details = toDetails(state, candidatesById, input.policy);
  const evaluation = evaluateAllocation(input, details);
  const violations = [...constructionViolations, ...evaluation.violations];

  return {
    feasible: violations.length === 0,
    allocations: details,
    excludedAssets,
    metrics: evaluation.currentMetrics,
    violations,
    calculation: {
      engine: "ALIVE_DETERMINISTIC_OPTIMIZER_V1",
      asOf: input.asOf,
      objective: input.policy.objective,
      allocationTotalBps: state.total,
    },
  };
}

export function detectPolicyDrift(
  input: OptimizationInput,
  currentAllocations: Allocation[],
): DriftReport {
  return evaluateAllocation(input, currentAllocations);
}

export function proposeRebalance(
  input: OptimizationInput,
  currentAllocations: Allocation[],
): RebalanceProposal {
  const drift = detectPolicyDrift(input, currentAllocations);
  const proposal = optimizePortfolio({ ...input, currentAllocations });
  const currentById = new Map(
    currentAllocations.map((item) => [item.assetId, item.weightBps]),
  );
  const targetById = new Map(
    proposal.allocations.map((item) => [item.assetId, item.weightBps]),
  );
  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const allAssetIds = [
    ...new Set([...currentById.keys(), ...targetById.keys()]),
  ].sort(compareText);
  const trades: RebalanceTrade[] = [];

  for (const assetId of allAssetIds) {
    const delta =
      (targetById.get(assetId) ?? 0) - (currentById.get(assetId) ?? 0);
    if (delta === 0) continue;
    trades.push({
      assetId,
      symbol: assetsById.get(assetId)?.symbol ?? assetId,
      side: delta > 0 ? "BUY" : "SELL",
      weightBps: Math.abs(delta),
    });
  }
  const sold = trades
    .filter((trade) => trade.side === "SELL")
    .reduce((sum, trade) => sum + trade.weightBps, 0);
  const bought = trades
    .filter((trade) => trade.side === "BUY")
    .reduce((sum, trade) => sum + trade.weightBps, 0);

  return {
    feasible: proposal.feasible,
    before: [...currentAllocations].sort((left, right) =>
      compareText(left.assetId, right.assetId),
    ),
    after: proposal.allocations,
    trades,
    turnoverBps: Math.max(sold, bought),
    drift,
    proposal,
  };
}
