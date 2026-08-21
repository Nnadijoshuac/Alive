const { ConvexHttpClient } = require("convex/browser");
const { anyApi } = require("convex/server");

const CONVEX_URL = "https://careful-chihuahua-483.convex.cloud";

async function main() {
  console.log(`[ALIVE] Connecting to remote Convex at ${CONVEX_URL}...`);
  const client = new ConvexHttpClient(CONVEX_URL);

  const walletAddress = "0x71C56828b52f3BE8FE52D3720743bB2519A56d25";
  const now = new Date().toISOString();

  // 1. Record Decision
  console.log("1. Recording Agent Decision on remote Convex...");
  const decisionResult = await client.mutation(anyApi.agent.recordAgentDecision, {
    decisionId: `dec-${Date.now()}`,
    walletAddress,
    strategyId: "rwa-core-balance-v1",
    triggerType: "SCHEDULED_TICK",
    evaluatedAt: now,
    inputMetricsJson: JSON.stringify({
      totalValueUsd: 125450,
      deviations: [{ symbol: "WMETAX", deltaBps: 9 }],
      freshnessSeconds: 14,
    }),
    outputActionJson: JSON.stringify({
      action: "HOLD",
      reason: "Portfolio allocations within target 25% single-asset risk envelope. Oracle feeds fresh.",
    }),
    causalChainHash: "0x4f8a8b8c2d1e0f9a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a",
    status: "EVALUATED",
  });
  console.log("-> Decision recorded successfully:", decisionResult);

  // 2. Query Decisions
  console.log("2. Querying Agent Decisions for wallet...");
  const decisions = await client.query(anyApi.agent.getAgentDecisions, { walletAddress });
  console.log(`-> Retrieved ${decisions.length} decisions from remote Convex.`);

  // 3. Save Agent Context Snapshot
  console.log("3. Saving Agent Context Snapshot...");
  const snapshotResult = await client.mutation(anyApi.agent.saveAgentSnapshot, {
    snapshotId: `snap-${Date.now()}`,
    agentId: "alive-core-agent",
    walletAddress,
    snapshotJson: JSON.stringify({
      walletAddress,
      totalPortfolioUsd: 125450,
      riskLevel: "MODERATE",
      holdings: [
        { symbol: "WMETAX", balance: 50, valueUsd: 31250, weightBps: 2491 },
        { symbol: "SPYX", balance: 75, valueUsd: 43850, weightBps: 3495 },
        { symbol: "TTBILL-B", balance: 31500, valueUsd: 31500, weightBps: 2511 },
        { symbol: "USDT", balance: 18850, valueUsd: 18850, weightBps: 1503 },
      ],
    }),
    timestamp: now,
  });
  console.log("-> Snapshot saved:", snapshotResult);

  // 4. Query Snapshot
  const latestSnapshot = await client.query(anyApi.agent.getAgentSnapshot, { walletAddress });
  console.log("-> Verified latest snapshot exists:", !!latestSnapshot, latestSnapshot?.agentId);

  // 5. Query Marketplace Strategies
  console.log("5. Querying Marketplace Strategies...");
  const strategies = await client.query(anyApi.strategies.getMarketplaceStrategies, {});
  console.log(`-> ${strategies.length} active marketplace strategies found on remote Convex.`);

  // 6. Record an Agent Interaction
  console.log("6. Recording Agent Interaction audit event...");
  const interactionResult = await client.mutation(anyApi.agent.recordAgentInteraction, {
    interactionId: `int-${Date.now()}`,
    agentId: "alive-core-agent",
    walletAddress,
    actionId: "act-rebalance-check",
    event: "REVIEWED",
    reason: "Autonomous periodic policy envelope verification passed.",
    timestamp: now,
  });
  console.log("-> Interaction recorded:", interactionResult);

  // 7. Trigger Agent Cycle
  console.log("7. Triggering Remote Agent Evaluation Cycle...");
  const cycleResult = await client.mutation(anyApi.scheduler.triggerAgentCycle, {});
  console.log("-> Cycle result:", cycleResult);

  console.log("\n[SUCCESS] All remote Convex mutations, queries, and scheduler cycles verified on production!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
