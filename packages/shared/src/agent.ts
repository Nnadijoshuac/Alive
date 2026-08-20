import { z } from "zod";
import { AddressSchema, HexSchema } from "./schemas.js";
import { MarketQuoteSchema } from "./market.js";
import { PortfolioPolicySchema } from "./policy.js";

// ================================================================
// WALLET POSITION & HOLDINGS
// ================================================================

export const WalletPositionSchema = z.object({
  assetId: z.string(),
  symbol: z.string(),
  name: z.string(),
  tokenAddress: AddressSchema.optional().nullable(),
  decimals: z.number().int().nonnegative(),
  balanceRaw: z.string(),
  balanceFormatted: z.string(),
  valueUsd: z.number().nullable().optional(),
  allocationBps: z.number().int().nonnegative().max(10_000).nullable().optional(),
  verificationStatus: z.enum(["VERIFIED", "NOT_ANALYZED", "UNKNOWN", "REJECTED"]),
  eligibilityStatus: z.enum(["ELIGIBLE", "RESTRICTED", "UNKNOWN"]),
  marketStatus: z.enum(["LIVE", "STALE", "DEMO", "UNAVAILABLE"]),
  xLayerDeployment: z
    .object({
      address: AddressSchema,
      verified: z.boolean(),
    })
    .nullable()
    .optional(),
  routeStatus: z.enum(["AVAILABLE", "NO_ROUTE", "UNSUPPORTED"]),
});

export type WalletPosition = z.infer<typeof WalletPositionSchema>;

// ================================================================
// ONCHAIN TRANSFERS & TRADES
// ================================================================

export const WalletTransferSchema = z.object({
  txHash: HexSchema,
  chainId: z.number().int().positive(),
  timestamp: z.string(),
  tokenAddress: AddressSchema,
  tokenSymbol: z.string(),
  fromAddress: AddressSchema,
  toAddress: AddressSchema,
  amount: z.string(),
  amountFormatted: z.string(),
  direction: z.enum(["IN", "OUT"]),
});

export type WalletTransfer = z.infer<typeof WalletTransferSchema>;

export const WalletTradeSchema = z.object({
  txHash: HexSchema,
  chainId: z.number().int().positive(),
  timestamp: z.string(),
  fromToken: z.object({
    address: AddressSchema,
    symbol: z.string(),
    decimals: z.number().int().nonnegative(),
  }),
  toToken: z.object({
    address: AddressSchema,
    symbol: z.string(),
    decimals: z.number().int().nonnegative(),
  }),
  fromAmount: z.string(),
  toAmount: z.string(),
  fromValueUsd: z.number().nullable().optional(),
  toValueUsd: z.number().nullable().optional(),
  direction: z.enum(["BUY", "SELL", "SWAP"]),
  assetId: z.string().nullable().optional(),
  source: z.enum(["ALIVE_EXECUTED", "ONCHAIN_INFERRED"]),
  confidence: z.enum(["HIGH", "MEDIUM"]),
});

export type WalletTrade = z.infer<typeof WalletTradeSchema>;

// ================================================================
// WALLET BEHAVIOR (EVIDENCE-BACKED METRICS, NO PSYCHOLOGY)
// ================================================================

export const WalletBehaviorSchema = z.object({
  observedTradeCount: z.number().int().nonnegative(),
  observedBuyCount: z.number().int().nonnegative(),
  observedSellCount: z.number().int().nonnegative(),
  medianTradeSizeUsd: z.number().nullable().optional(),
  averageTradeSizeUsd: z.number().nullable().optional(),
  tradesLast7d: z.number().int().nonnegative(),
  tradesLast30d: z.number().int().nonnegative(),
  averageHoldingPeriodDays: z.number().nullable().optional(),
  turnover30d: z.number().nullable().optional(),
  historicallyHeldAssetIds: z.array(z.string()),
  frequentlyUsedAssetIds: z.array(z.string()),
  stablecoinAllocationHistory: z
    .array(
      z.object({
        timestamp: z.string(),
        stablecoinPct: z.number(),
      }),
    )
    .nullable()
    .optional(),
});

export type WalletBehavior = z.infer<typeof WalletBehaviorSchema>;

// ================================================================
// WALLET CAPABILITIES (CURRENT POSSIBILITIES)
// ================================================================

export const WalletCapabilitySchema = z.object({
  assetId: z.string(),
  canBuy: z.boolean(),
  canSell: z.boolean(),
  reason: z.string().nullable().optional(),
  balance: z.string().nullable().optional(),
  spendableAmount: z.string().nullable().optional(),
  sourceToken: z.string().nullable().optional(),
  allowance: z.string().nullable().optional(),
  routeAvailable: z.boolean(),
  verificationStatus: z.string(),
  eligibilityStatus: z.string(),
  marketStatus: z.string(),
  walletChainCorrect: z.boolean(),
  hasGas: z.boolean(),
});

export type WalletCapability = z.infer<typeof WalletCapabilitySchema>;

export const SpendableTokenSchema = z.object({
  address: AddressSchema,
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
  balanceRaw: z.string(),
  balanceFormatted: z.string(),
  valueUsd: z.number().nullable().optional(),
  isNative: z.boolean().optional(),
});

export type SpendableToken = z.infer<typeof SpendableTokenSchema>;

export const ActiveAllowanceSchema = z.object({
  tokenAddress: AddressSchema,
  spenderAddress: AddressSchema,
  allowanceRaw: z.string(),
  allowanceFormatted: z.string(),
  isSufficient: z.boolean(),
});

export type ActiveAllowance = z.infer<typeof ActiveAllowanceSchema>;

// ================================================================
// AGENT INTERACTION MEMORY
// ================================================================

export const AgentInteractionEventSchema = z.enum([
  "PROPOSED",
  "APPROVED",
  "EDITED",
  "DISMISSED",
  "EXECUTED",
  "CANCELLED",
]);

export type AgentInteractionEvent = z.infer<typeof AgentInteractionEventSchema>;

export const AgentInteractionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  walletAddress: AddressSchema,
  actionId: z.string(),
  event: AgentInteractionEventSchema,
  originalAmount: z.string().nullable().optional(),
  editedAmount: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  timestamp: z.string(),
});

export type AgentInteraction = z.infer<typeof AgentInteractionSchema>;

// ================================================================
// ALIVE EXECUTED TRADE RECORD
// ================================================================

export const AliveTradeRecordSchema = z.object({
  txHash: HexSchema,
  walletAddress: AddressSchema,
  agentId: z.string().nullable().optional(),
  strategyId: z.string().nullable().optional(),
  assetId: z.string(),
  action: z.enum(["BUY", "SELL", "REBALANCE"]),
  fromTokenAddress: AddressSchema,
  toTokenAddress: AddressSchema,
  amountIn: z.string(),
  amountOutExpected: z.string(),
  quoteJson: z.string().nullable().optional(),
  executedAt: z.string(),
  chainId: z.number().int().positive(),
  status: z.enum(["PENDING", "CONFIRMED", "FAILED"]),
});

export type AliveTradeRecord = z.infer<typeof AliveTradeRecordSchema>;

// ================================================================
// WALLET CONTEXT (AGGREGATE)
// ================================================================

export const WalletContextSchema = z.object({
  walletAddress: AddressSchema,
  snapshotAt: z.string(),
  portfolio: z.object({
    totalValueUsd: z.number().nullable().optional(),
    positions: z.array(WalletPositionSchema),
    stablecoinValueUsd: z.number().nullable().optional(),
    stablecoinPct: z.number().nullable().optional(),
  }),
  activity: z.object({
    trades: z.array(WalletTradeSchema),
    transfers: z.array(WalletTransferSchema),
    firstObservedAt: z.string().nullable().optional(),
    lastObservedAt: z.string().nullable().optional(),
  }),
  behavior: WalletBehaviorSchema,
  capabilities: z.object({
    chainId: z.number().int().positive(),
    gasBalance: z.string(),
    gasBalanceFormatted: z.string(),
    spendableTokens: z.array(SpendableTokenSchema),
    activeAllowances: z.array(ActiveAllowanceSchema),
    routableAssets: z.array(z.string()),
    maxExecutableAmounts: z.record(z.string()),
    capabilitiesByAsset: z.record(WalletCapabilitySchema),
  }),
  agentMemory: z.object({
    previouslyApprovedActions: z.array(AgentInteractionSchema),
    previouslyDismissedActions: z.array(AgentInteractionSchema),
    previouslyEditedActions: z.array(AgentInteractionSchema),
    activeStrategies: z.array(z.string()),
  }),
});

export type WalletContext = z.infer<typeof WalletContextSchema>;

// ================================================================
// AGENT STRATEGY (STRUCTURED SCHEMA, NO ARBITRARY CODE)
// ================================================================

export const StrategyConditionVariableSchema = z.enum([
  "portfolioAllocation",
  "stablecoinPct",
  "positionAgeDays",
  "observedTradeFrequency",
  "marketStatus",
  "eligibilityStatus",
  "verificationStatus",
  "routeAvailable",
]);

export type StrategyConditionVariable = z.infer<typeof StrategyConditionVariableSchema>;

export const StrategyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  conditionVariable: StrategyConditionVariableSchema,
  operator: z.enum([">", "<", "==", "!=", ">=", "<="]),
  thresholdValue: z.union([z.string(), z.number()]),
  targetAssetId: z.string().optional(),
  action: z.enum(["REBALANCE", "SELL", "BUY", "ACCUMULATE", "TRIM", "ALERT"]),
  priority: z.number().int().nonnegative(),
});

export type StrategyRule = z.infer<typeof StrategyRuleSchema>;

export const AgentStrategySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  author: z.string(),
  pricing: z.object({
    isPaid: z.boolean(),
    priceUsd: z.number().nonnegative().optional(),
    tokenAddress: AddressSchema.optional(),
  }),
  targetAssetClasses: z.array(z.string()),
  rules: z.array(StrategyRuleSchema),
  rebalanceThresholdBps: z.number().int().nonnegative().max(10_000).optional(),
  targetAllocations: z.record(z.number().int().nonnegative().max(10_000)).optional(),
  clonedFrom: z.string().nullable().optional(),
  isCommunity: z.boolean().optional(),
  publishedAt: z.string(),
});

export type AgentStrategy = z.infer<typeof AgentStrategySchema>;

// ================================================================
// PROPOSED AGENT ACTION
// ================================================================

export const ProposedAgentActionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  strategyId: z.string(),
  assetId: z.string(),
  actionType: z.enum(["BUY", "SELL", "REBALANCE"]),
  direction: z.enum(["BUY", "SELL"]),
  paymentTokenAddress: AddressSchema,
  paymentTokenSymbol: z.string(),
  targetTokenAddress: AddressSchema,
  targetTokenSymbol: z.string(),
  amountFormatted: z.string(),
  amountRaw: z.string(),
  estimatedUsdValue: z.number(),
  deterministicRuleId: z.string(),
  deterministicReason: z.string(),
  explanation: z.string(),
  contextEvidence: z.array(z.string()),
  policyCheckPassed: z.boolean(),
  policyViolationReason: z.string().nullable().optional(),
  quote: z.unknown().optional(),
  status: z.enum(["PENDING_REVIEW", "APPROVED", "DISMISSED", "EXECUTED"]),
  createdAt: z.string(),
});

export type ProposedAgentAction = z.infer<typeof ProposedAgentActionSchema>;

// ================================================================
// AGENT CONTEXT SNAPSHOT
// ================================================================

export const ContextProvenanceSchema = z.object({
  portfolioSnapshotAt: z.string(),
  historySyncedAt: z.string(),
  marketDataUpdatedAt: z.string(),
  intelligenceUpdatedAt: z.string(),
  eligibilityEvaluatedAt: z.string(),
  agentMemoryUpdatedAt: z.string(),
});

export type ContextProvenance = z.infer<typeof ContextProvenanceSchema>;

export const AgentContextSnapshotSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  walletAddress: AddressSchema,
  activeStrategy: AgentStrategySchema,
  mandate: PortfolioPolicySchema.nullable().optional(),
  walletPortfolio: WalletContextSchema.shape.portfolio,
  walletHistorySummary: WalletBehaviorSchema,
  walletCapabilities: z.record(WalletCapabilitySchema),
  userAgentMemory: WalletContextSchema.shape.agentMemory,
  assetIntelligence: z.record(z.unknown()),
  liveMarketData: z.record(MarketQuoteSchema),
  eligibility: z.record(z.string()),
  provenance: ContextProvenanceSchema,
  proposedActions: z.array(ProposedAgentActionSchema),
  timestamp: z.string(),
});

export type AgentContextSnapshot = z.infer<typeof AgentContextSnapshotSchema>;
