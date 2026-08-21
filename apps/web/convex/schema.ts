import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * ALIVE Production Convex Schema
 *
 * Maps all persistent domain concepts of the ALIVE system into reactive Convex tables.
 * Strict indexes are established for wallet isolation, fast lookups, and audit history.
 */
export default defineSchema({
  // 1. RWA Assets Catalog
  assets: defineTable({
    assetId: v.string(),
    name: v.string(),
    symbol: v.string(),
    decimals: v.number(),
    dataMode: v.string(), // "LIVE" | "SYNTHETIC_DEMO" | "DATED_SNAPSHOT"
    issuer: v.optional(v.string()),
    jurisdiction: v.optional(v.string()),
    assetClass: v.optional(v.string()),
    schemaJson: v.string(), // serialized RwaAsset
    lastUpdatedAt: v.string(),
  }).index("by_assetId", ["assetId"]),

  // 2. Asset Source Metadata
  assetSources: defineTable({
    assetId: v.string(),
    sourceId: v.string(),
    sourceJson: v.string(),
    retrievedAt: v.string(),
  })
    .index("by_assetId", ["assetId"])
    .index("by_asset_source", ["assetId", "sourceId"]),

  // 3. Raw Source Documents (for LLM extraction & audit)
  sourceDocuments: defineTable({
    sourceId: v.string(),
    assetId: v.string(),
    sourceType: v.string(),
    title: v.string(),
    uri: v.optional(v.string()),
    text: v.string(),
    textHash: v.string(),
    chunkCount: v.number(),
    retrievedAt: v.string(),
    ingestedAt: v.string(),
  })
    .index("by_assetId", ["assetId"])
    .index("by_sourceId", ["sourceId"])
    .index("by_asset_source", ["assetId", "sourceId"]),

  // 4. Extraction Runs (Groq LLM audit logs)
  extractionRuns: defineTable({
    runId: v.string(),
    assetId: v.string(),
    mode: v.string(),
    model: v.optional(v.string()),
    promptVersion: v.string(),
    pipelineVersion: v.string(),
    sourceIdsJson: v.string(),
    sourceHashesJson: v.string(),
    status: v.string(),
    passportJson: v.optional(v.string()),
    validationErrorsJson: v.optional(v.string()),
    factsExtractedCount: v.optional(v.number()),
    factsCitedCount: v.optional(v.number()),
    unknownFieldsCount: v.optional(v.number()),
    rejectedAttemptsCount: v.optional(v.number()),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
  })
    .index("by_assetId", ["assetId", "startedAt"])
    .index("by_runId", ["runId"]),

  // 5. Market Quotes
  marketQuotes: defineTable({
    assetId: v.string(),
    quoteJson: v.string(),
    provider: v.string(),
    observedAt: v.string(),
    recordedAt: v.string(),
  }).index("by_assetId", ["assetId", "observedAt"]),

  // 6. Market Snapshots (immutable portfolio state snapshots)
  marketSnapshots: defineTable({
    hash: v.string(),
    snapshotJson: v.string(),
    capturedAt: v.string(),
    dataMode: v.string(),
  }).index("by_hash", ["hash"]),

  // 7. Market Observations (raw feed inputs & age)
  marketObservations: defineTable({
    observationId: v.string(),
    assetId: v.string(),
    provider: v.string(),
    dataMode: v.string(),
    value: v.optional(v.string()),
    sourceChainId: v.optional(v.number()),
    sourceAddress: v.optional(v.string()),
    sourceUpdatedAt: v.optional(v.string()),
    blockNumber: v.optional(v.number()),
    observedAt: v.string(),
    ageSeconds: v.optional(v.number()),
    status: v.string(),
    eligibilityStatus: v.optional(v.string()),
    reasonCodesJson: v.optional(v.string()),
  }).index("by_assetId", ["assetId", "observedAt"]),

  // 8. Published Verdicts (onchain eligibility signer attestations)
  publishedVerdicts: defineTable({
    assetId: v.string(),
    status: v.string(),
    validUntil: v.string(),
    publishedAt: v.string(),
    transactionHash: v.optional(v.string()),
    digest: v.optional(v.string()),
  }).index("by_assetId", ["assetId"]),

  // 9. Portfolio Policies
  policies: defineTable({
    policyId: v.string(),
    currentVersion: v.number(),
    policyHash: v.string(),
    originalMandate: v.string(),
    compilerMode: v.string(),
    compilerProvider: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_policyId", ["policyId"]),

  // 10. Policy Versions
  policyVersions: defineTable({
    policyId: v.string(),
    version: v.number(),
    policyHash: v.string(),
    policyJson: v.string(),
    explanationJson: v.string(),
    warningsJson: v.string(),
    createdAt: v.string(),
  })
    .index("by_policyId", ["policyId"])
    .index("by_policy_version", ["policyId", "version"]),

  // 11. Portfolio Proposals
  portfolioProposals: defineTable({
    proposalId: v.string(),
    policyId: v.optional(v.string()),
    policyHash: v.optional(v.string()),
    proposalJson: v.string(),
    marketSnapshotHash: v.optional(v.string()),
    currentAllocationsJson: v.optional(v.string()),
    executionPlanHash: v.optional(v.string()),
    executionPlanJson: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_proposalId", ["proposalId"])
    .index("by_policyId", ["policyId"]),

  // 12. Vaults
  vaults: defineTable({
    address: v.string(), // normalized lowercase
    owner: v.string(), // normalized lowercase
    policyId: v.string(),
    policyHash: v.string(),
    chainId: v.number(),
    createdAt: v.string(),
  })
    .index("by_address", ["address"])
    .index("by_owner", ["owner"]),

  // 13. Vault Holdings
  holdings: defineTable({
    vaultAddress: v.string(), // normalized lowercase
    assetId: v.string(),
    amount: v.string(),
    updatedAt: v.string(),
  })
    .index("by_vault", ["vaultAddress"])
    .index("by_vault_asset", ["vaultAddress", "assetId"]),

  // 14. Strategy Proposals (EIP-712 signed execution intents)
  strategyProposals: defineTable({
    nonce: v.string(),
    vaultAddress: v.string(), // normalized lowercase
    strategyJson: v.string(),
    status: v.string(),
    issuedAt: v.string(),
    expiresAt: v.string(),
    proposalId: v.optional(v.string()),
    policyId: v.optional(v.string()),
    executionPlanHash: v.optional(v.string()),
    planJson: v.optional(v.string()),
    signature: v.optional(v.string()),
    digest: v.optional(v.string()),
    signer: v.optional(v.string()),
    createdAt: v.optional(v.string()),
  })
    .index("by_nonce", ["nonce"])
    .index("by_vault", ["vaultAddress"])
    .index("by_proposalId", ["proposalId"]),

  // 15. Wallet Snapshots (Wallet Intelligence Context)
  walletSnapshots: defineTable({
    walletAddress: v.string(), // normalized lowercase
    snapshotJson: v.string(), // serialized WalletContext
    updatedAt: v.string(),
  }).index("by_wallet", ["walletAddress"]),

  // 16. Wallet Trades (Inferred & executed onchain history)
  walletTrades: defineTable({
    tradeId: v.string(),
    walletAddress: v.string(), // normalized lowercase
    txHash: v.string(),
    chainId: v.number(),
    tradeJson: v.string(), // serialized WalletTrade
    source: v.string(), // "ALIVE_EXECUTED" | "ONCHAIN_INFERRED"
    confidence: v.string(), // "HIGH" | "MEDIUM"
    timestamp: v.string(),
  })
    .index("by_wallet", ["walletAddress", "timestamp"])
    .index("by_txHash", ["txHash"]),

  // 17. Agent Interactions (Audit timeline)
  agentInteractions: defineTable({
    interactionId: v.string(),
    agentId: v.string(),
    walletAddress: v.string(), // normalized lowercase
    actionId: v.string(),
    event: v.string(), // "PROPOSED" | "REVIEWED" | "APPROVED" | "EDITED" | "EXECUTED" | "DISMISSED" | "FAILED"
    originalAmount: v.optional(v.string()),
    editedAmount: v.optional(v.string()),
    reason: v.optional(v.string()),
    timestamp: v.string(),
  }).index("by_wallet", ["walletAddress", "timestamp"]),

  // 18. ALIVE Trades (Self-custodial execution tracking)
  aliveTrades: defineTable({
    txHash: v.string(),
    walletAddress: v.string(), // normalized lowercase
    agentId: v.optional(v.string()),
    strategyId: v.optional(v.string()),
    assetId: v.string(),
    action: v.string(), // "BUY" | "SELL" | "REBALANCE"
    amountIn: v.string(),
    amountOutExpected: v.string(),
    quoteJson: v.optional(v.string()),
    chainId: v.number(),
    status: v.string(), // "SUBMITTED" | "CONFIRMED" | "FAILED" | "CANCELLED"
    executedAt: v.string(),
  })
    .index("by_wallet", ["walletAddress", "executedAt"])
    .index("by_txHash", ["txHash"]),

  // 19. Agent Strategies (Marketplace & Custom User Strategies)
  agentStrategies: defineTable({
    strategyId: v.string(),
    walletAddress: v.optional(v.string()), // normalized lowercase (empty/null for global marketplace strategies)
    name: v.string(),
    strategyJson: v.string(), // serialized AgentStrategy
    isActive: v.boolean(),
    isMarketplace: v.boolean(),
    pricingJson: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_strategyId", ["strategyId"])
    .index("by_wallet", ["walletAddress"])
    .index("by_marketplace", ["isMarketplace"]),

  // 20. Agent Context Snapshots
  agentContextSnapshots: defineTable({
    snapshotId: v.string(),
    agentId: v.string(),
    walletAddress: v.string(), // normalized lowercase
    snapshotJson: v.string(), // serialized AgentContextSnapshot
    timestamp: v.string(),
  }).index("by_wallet", ["walletAddress", "timestamp"]),

  // 21. Agent Decisions & Trigger Log (Durable audit log)
  agentDecisions: defineTable({
    decisionId: v.string(),
    walletAddress: v.string(), // normalized lowercase
    strategyId: v.string(),
    triggerType: v.string(), // "PERIODIC_CHECK" | "PRICE_DEVIATION" | "MANUAL_SYNC" | "ALLOCATION_BREACH"
    evaluatedAt: v.string(),
    inputMetricsJson: v.string(),
    outputActionJson: v.optional(v.string()),
    causalChainHash: v.string(),
    status: v.string(), // "COMPLIANT_NO_ACTION" | "ACTION_PROPOSED" | "REJECTED_POLICY"
  }).index("by_wallet", ["walletAddress", "evaluatedAt"]),
});
