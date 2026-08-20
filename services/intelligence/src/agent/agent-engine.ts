import { randomUUID } from "node:crypto";
import {
  AgentContextSnapshotSchema,
  ProposedAgentActionSchema,
  type AgentContextSnapshot,
  type AgentStrategy,
  type ProposedAgentAction,
  type StrategyRule,
  type WalletCapability,
  type WalletContext,
  type WalletPosition,
} from "@alive/shared";
import { XLAYER_PAYMENT_TOKENS } from "@alive/market-data";

import type { IntelligenceRepository } from "../repository.js";
import type { WalletIntelligenceService } from "../wallet/wallet-intelligence-service.js";
import { DEFAULT_MARKETPLACE_STRATEGIES, type StrategyMarketplaceService } from "./strategy-marketplace.js";
import type { LlmJsonProvider } from "../llm.js";

export interface AgentEngineOptions {
  repository: IntelligenceRepository;
  walletIntelligence: WalletIntelligenceService;
  marketplace: StrategyMarketplaceService;
  llm?: LlmJsonProvider | undefined;
}

export class AgentEngine {
  readonly #repository: IntelligenceRepository;
  readonly #walletIntelligence: WalletIntelligenceService;
  readonly #marketplace: StrategyMarketplaceService;
  readonly #llm: LlmJsonProvider | undefined;

  constructor(options: AgentEngineOptions) {
    this.#repository = options.repository;
    this.#walletIntelligence = options.walletIntelligence;
    this.#marketplace = options.marketplace;
    this.#llm = options.llm;
  }

  async evaluateWallet(walletAddress: string, forceSync = false): Promise<AgentContextSnapshot> {
    const normalized = walletAddress.toLowerCase();
    const context = await this.#walletIntelligence.getWalletContext(normalized, forceSync);
    const activeStrategy =
      this.#marketplace.getActiveStrategy(normalized) || DEFAULT_MARKETPLACE_STRATEGIES[0];

    if (!activeStrategy) {
      throw new Error("No active strategy available");
    }

    const proposedActions: ProposedAgentAction[] = [];

    for (const rule of activeStrategy.rules) {
      const action = this.#evaluateRule(rule, context, activeStrategy);
      if (action) {
        proposedActions.push(action);
      }
    }

    // Sort proposed actions by priority / severity
    proposedActions.sort((a, b) => {
      const pA = a.policyCheckPassed ? 1 : 0;
      const pB = b.policyCheckPassed ? 1 : 0;
      return pB - pA;
    });

    const now = new Date().toISOString();

    const snapshot: AgentContextSnapshot = {
      id: `snapshot-${randomUUID().slice(0, 8)}`,
      agentId: "agent-alive-core-v1",
      walletAddress: normalized as `0x${string}`,
      activeStrategy,
      mandate: null,
      walletPortfolio: context.portfolio,
      walletHistorySummary: context.behavior,
      walletCapabilities: context.capabilities.capabilitiesByAsset,
      userAgentMemory: context.agentMemory,
      assetIntelligence: {},
      liveMarketData: {},
      eligibility: {},
      provenance: {
        portfolioSnapshotAt: context.snapshotAt,
        historySyncedAt: context.snapshotAt,
        marketDataUpdatedAt: context.snapshotAt,
        intelligenceUpdatedAt: context.snapshotAt,
        eligibilityEvaluatedAt: context.snapshotAt,
        agentMemoryUpdatedAt: context.snapshotAt,
      },
      proposedActions,
      timestamp: now,
    };

    const validated = AgentContextSnapshotSchema.parse(snapshot);
    this.#repository.saveContextSnapshot(validated);

    return validated;
  }

  #evaluateRule(
    rule: StrategyRule,
    context: WalletContext,
    strategy: AgentStrategy,
  ): ProposedAgentAction | null {
    const { portfolio, capabilities, behavior, agentMemory } = context;
    const now = new Date().toISOString();

    // 1. Condition Evaluation
    let isTriggered = false;
    let triggerMetric = "";
    let targetAssetId = rule.targetAssetId;
    let targetPosition: WalletPosition | undefined;

    if (rule.conditionVariable === "portfolioAllocation") {
      if (targetAssetId) {
        targetPosition = portfolio.positions.find((p) => p.assetId === targetAssetId);
        const currentAllocPct = (targetPosition?.allocationBps || 0) / 100;
        triggerMetric = `Current allocation ${currentAllocPct}% (target ${rule.operator} ${rule.thresholdValue}%)`;
        if (this.#compare(currentAllocPct, rule.operator, rule.thresholdValue)) {
          isTriggered = true;
        }
      } else {
        // Find any position violating single-asset cap
        for (const pos of portfolio.positions) {
          const allocPct = (pos.allocationBps || 0) / 100;
          if (this.#compare(allocPct, rule.operator, rule.thresholdValue)) {
            isTriggered = true;
            targetAssetId = pos.assetId;
            targetPosition = pos;
            triggerMetric = `${pos.symbol} allocation ${allocPct}% exceeds cap ${rule.thresholdValue}%`;
            break;
          }
        }
      }
    } else if (rule.conditionVariable === "stablecoinPct") {
      triggerMetric = `Stablecoin allocation ${portfolio.stablecoinPct}% (target ${rule.operator} ${rule.thresholdValue}%)`;
      if (this.#compare(portfolio.stablecoinPct, rule.operator, rule.thresholdValue)) {
        isTriggered = true;
        // Default target asset is first routable RWA if accumulate, or held asset if rebalance
        if (!targetAssetId) {
          targetAssetId = "wmetax";
          targetPosition = portfolio.positions.find((p) => p.assetId === targetAssetId);
        }
      }
    } else if (rule.conditionVariable === "observedTradeFrequency") {
      triggerMetric = `30d trade count ${behavior.tradesLast30d} (${rule.operator} ${rule.thresholdValue})`;
      if (this.#compare(behavior.tradesLast30d, rule.operator, rule.thresholdValue)) {
        isTriggered = true;
      }
    }

    if (!isTriggered || !targetAssetId) {
      return null;
    }

    // 2. Determine Action Details and Sizing Heuristics
    const assetCap: WalletCapability | undefined = capabilities.capabilitiesByAsset[targetAssetId];
    let actionType: "BUY" | "SELL" | "REBALANCE" =
      rule.action === "ACCUMULATE" ? "BUY" : rule.action === "TRIM" ? "SELL" : "REBALANCE";
    let direction: "BUY" | "SELL" = actionType === "BUY" ? "BUY" : "SELL";

    let fromToken = {
      address: (XLAYER_PAYMENT_TOKENS.USDC?.contractAddress || "0x74b7f16337b8972027f6196a17a631ac6de26d22") as `0x${string}`,
      symbol: "USDC",
      decimals: 6,
    };
    let toToken = {
      address: (targetPosition?.tokenAddress || "0xe840946ffebcd66b7c4e95095effafadfa0d0e56") as `0x${string}`,
      symbol: targetPosition?.symbol || targetAssetId.toUpperCase(),
      decimals: 18,
    };
    let amountIn = "100";
    let estimatedValueUsd = 100;

    if (actionType === "BUY") {
      direction = "BUY";
      // Sizing: Use min(50% spendable USDC, median trade size, or $250 default)
      const spendableUsdc = parseFloat(assetCap?.spendableAmount || "0");
      const median = behavior.medianTradeSizeUsd || 250;
      let targetSizeUsd = Math.min(spendableUsdc * 0.5, median);
      if (targetSizeUsd < 10 && spendableUsdc >= 10) {
        targetSizeUsd = Math.min(spendableUsdc, 50);
      }
      targetSizeUsd = Math.max(10, Math.round(targetSizeUsd));
      amountIn = targetSizeUsd.toString();
      estimatedValueUsd = targetSizeUsd;
    } else if (actionType === "SELL") {
      direction = "SELL";
      fromToken = {
        address: (targetPosition?.tokenAddress || "0xe840946ffebcd66b7c4e95095effafadfa0d0e56") as `0x${string}`,
        symbol: targetPosition?.symbol || targetAssetId.toUpperCase(),
        decimals: 18,
      };
      toToken = {
        address: (XLAYER_PAYMENT_TOKENS.USDC?.contractAddress || "0x74b7f16337b8972027f6196a17a631ac6de26d22") as `0x${string}`,
        symbol: "USDC",
        decimals: 6,
      };
      const heldBal = parseFloat(targetPosition?.balanceFormatted || "0");
      const trimAmount = heldBal * 0.25; // Trim 25%
      amountIn = trimAmount.toFixed(4);
      estimatedValueUsd = (targetPosition?.valueUsd || 0) * 0.25;
    }

    // 3. Strict Deterministic Policy & Capability Checks
    const verificationOk = assetCap?.verificationStatus === "VERIFIED";
    const eligibilityOk = assetCap?.eligibilityStatus === "ELIGIBLE";
    const routeOk = assetCap?.routeAvailable === true;
    const hasGas = BigInt(capabilities.gasBalance || "0") > 1_000_000_000_000_000n;
    const canTradeDirection = direction === "BUY" ? assetCap?.canBuy : assetCap?.canSell;

    let canExecute = false;
    let blockingReason: string | null = null;

    if (!verificationOk) {
      blockingReason = "Asset verification incomplete (NOT_ANALYZED or UNVERIFIED)";
    } else if (!eligibilityOk) {
      blockingReason = "Asset eligibility status is RESTRICTED";
    } else if (!routeOk) {
      blockingReason = "No verified DEX liquidity route available on X Layer (NO_ROUTE)";
    } else if (!hasGas) {
      blockingReason = "Insufficient OKB balance for X Layer gas fees";
    } else if (!canTradeDirection) {
      blockingReason = assetCap?.reason || "Insufficient spendable funds or asset balance";
    } else {
      canExecute = true;
    }

    const explanation = `Strategy '${strategy.name}' triggered rule '${rule.name}': ${triggerMetric}.`;

    const contextEvidence = [
      `Observed trades: ${behavior.observedTradeCount} (${behavior.tradesLast30d} in last 30d)`,
      `Median trade size: ${behavior.medianTradeSizeUsd ? `$${behavior.medianTradeSizeUsd}` : "N/A"}`,
      `Capability: Route ${routeOk ? "AVAILABLE" : "UNAVAILABLE"}, Gas ${hasGas ? "OK" : "LOW"}`,
    ];

    const amountRaw =
      direction === "BUY"
        ? (BigInt(amountIn) * 1_000_000n).toString()
        : (BigInt(Math.max(1, Math.floor(parseFloat(amountIn) * 1e6))) * 10n ** 12n).toString();

    return {
      id: `act-${targetAssetId}-${actionType.toLowerCase()}-${randomUUID().slice(0, 6)}`,
      agentId: "agent-alive-core-v1",
      strategyId: strategy.id,
      assetId: targetAssetId,
      actionType,
      direction,
      paymentTokenAddress: fromToken.address,
      paymentTokenSymbol: fromToken.symbol,
      targetTokenAddress: toToken.address,
      targetTokenSymbol: toToken.symbol,
      amountFormatted: amountIn,
      amountRaw,
      estimatedUsdValue: Math.round(estimatedValueUsd * 100) / 100,
      deterministicRuleId: rule.id,
      deterministicReason: triggerMetric,
      explanation,
      contextEvidence,
      policyCheckPassed: canExecute,
      policyViolationReason: blockingReason,
      status: "PENDING_REVIEW",
      createdAt: now,
    };
  }

  #compare(value: number, operator: StrategyRule["operator"], threshold: number): boolean {
    switch (operator) {
      case ">":
        return value > threshold;
      case ">=":
        return value >= threshold;
      case "<":
        return value < threshold;
      case "<=":
        return value <= threshold;
      case "==":
        return value === threshold;
      case "!=":
        return value !== threshold;
      default:
        return false;
    }
  }

  async askAgent(
    walletAddress: string,
    question: string,
  ): Promise<{
    answer: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    citations: string[];
  }> {
    const normalized = walletAddress.toLowerCase();
    const snapshot = await this.evaluateWallet(normalized);
    const { walletPortfolio, activeStrategy, proposedActions, walletCapabilities } = snapshot;

    // Deterministic factual answer synthesizer
    const qLower = question.toLowerCase();

    if (
      qLower.includes("balance") ||
      qLower.includes("portfolio") ||
      qLower.includes("holding") ||
      qLower.includes("value")
    ) {
      const held = walletPortfolio.positions.filter((p) => parseFloat(p.balanceFormatted) > 0);
      const heldText =
        held.length > 0
          ? held.map((p) => `${p.symbol}: ${p.balanceFormatted} ($${p.valueUsd || 0})`).join(", ")
          : "No non-zero RWA positions";
      return {
        answer: `Your connected wallet holds a total estimated portfolio value of $${(walletPortfolio.totalValueUsd || 0).toFixed(2)} with ${walletPortfolio.stablecoinPct || 0}% in stablecoins. Active holdings: ${heldText}. Gas reserve is configured on X Layer.`,
        confidence: "HIGH",
        citations: ["onchain_xlayer_rpc", "alive_wallet_snapshot"],
      };
    }

    if (
      qLower.includes("why") ||
      qLower.includes("propos") ||
      qLower.includes("action") ||
      qLower.includes("rebalance")
    ) {
      if (proposedActions.length === 0) {
        return {
          answer: `No action proposals are currently active. Your current allocation satisfies all rules in active strategy '${activeStrategy?.name || "Core Balance"}'.`,
          confidence: "HIGH",
          citations: ["alive_strategy_engine"],
        };
      }
      const p = proposedActions[0];
      return {
        answer: `ALIVE Agent proposed ${p?.actionType} for ${p?.targetTokenSymbol}: "${p?.explanation}". Rationale: ${p?.deterministicReason}. Execution status: ${p?.policyCheckPassed ? "Ready for user signing on X Layer" : `Blocked: ${p?.policyViolationReason}`}.`,
        confidence: "HIGH",
        citations: ["alive_strategy_engine", "alive_verification_registry"],
      };
    }

    if (
      qLower.includes("spyx") ||
      qLower.includes("wmetax") ||
      qLower.includes("can i trade") ||
      qLower.includes("buy")
    ) {
      const isMeta = qLower.includes("meta") || qLower.includes("wmetax");
      const assetId = isMeta ? "wmetax" : "spyx";
      const cap = walletCapabilities[assetId];
      if (!cap) {
        return {
          answer: `Asset ${assetId.toUpperCase()} is not available on X Layer.`,
          confidence: "HIGH",
          citations: ["alive_asset_catalog"],
        };
      }
      if (cap.canBuy) {
        return {
          answer: `${cap.assetId.toUpperCase()} is fully verified and tradeable on X Layer. Route is active with OKX DEX liquidity. You have ${cap.spendableAmount} USDC spendable and OKB gas ready.`,
          confidence: "HIGH",
          citations: ["okx_dex_router", "alive_verification_registry"],
        };
      } else {
        return {
          answer: `${cap.assetId.toUpperCase()} currently cannot be bought: ${cap.reason === "NO_ROUTE" ? "DEX liquidity pool is unseeded on X Layer (NO_ROUTE)" : cap.reason}.`,
          confidence: "HIGH",
          citations: ["okx_dex_router", "alive_policy_engine"],
        };
      }
    }

    // General fallback
    return {
      answer: `ALIVE Agent is monitoring wallet ${normalized.slice(0, 6)}...${normalized.slice(-4)} under strategy '${activeStrategy?.name || "RWA Core Balance"}'. Total value: $${(walletPortfolio.totalValueUsd || 0).toFixed(2)}. ${proposedActions.length} active proposals generated.`,
      confidence: "MEDIUM",
      citations: ["alive_wallet_snapshot", "alive_strategy_engine"],
    };
  }
}
