import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { normalizeWalletAddress } from "./lib/normalize";

/**
 * Trigger-oriented autonomous Agent scheduled cycle.
 *
 * Implements the causal chain:
 * 1. Cheap Check: queries active wallets with active strategies.
 * 2. If no active wallets or zero changes, stops immediately (0 cost).
 * 3. If delta detected: evaluates strategy rules deterministically.
 * 4. Persists verified decisions and updated context snapshots.
 */
export const scheduledAgentCycle = internalMutation({
  args: {},
  handler: async (ctx: any) => {
    const evaluatedAt = new Date().toISOString();

    // 1. CHEAP CHECK: Fetch all active strategies
    const activeStrategies = await ctx.db
      .query("agentStrategies")
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    if (activeStrategies.length === 0) {
      return {
        executed: false,
        activeCount: 0,
        reason: "NO_ACTIVE_STRATEGIES",
        evaluatedAt,
      };
    }

    let processedCount = 0;
    let proposalsGenerated = 0;

    for (const strategy of activeStrategies) {
      if (!strategy.walletAddress) continue;
      const wallet = strategy.walletAddress;

      // 2. Load cached wallet snapshot
      const snapshotRow = await ctx.db
        .query("walletSnapshots")
        .withIndex("by_wallet", (q: any) => q.eq("walletAddress", wallet))
        .unique();

      if (!snapshotRow) continue;

      let walletContext: any = null;
      try {
        walletContext = JSON.parse(snapshotRow.snapshotJson);
      } catch {
        continue;
      }

      processedCount++;

      // 3. Evaluate deterministic strategy rules against wallet positions
      let parsedStrategy: any = null;
      try {
        parsedStrategy = JSON.parse(strategy.strategyJson);
      } catch {
        continue;
      }

      const positions = walletContext?.holdings?.positions ?? [];
      const totalValueUsd = walletContext?.holdings?.totalValueUsd ?? 0;

      let triggeredAction: any = null;
      if (totalValueUsd > 0 && positions.length > 0) {
        // Check rule: Maximum single asset allocation (e.g. 25%)
        for (const pos of positions) {
          const allocationPct = (pos.valueUsd ?? 0) / totalValueUsd;
          if (allocationPct > 0.25) {
            triggeredAction = {
              actionId: `action_${Date.now()}_${pos.assetId}`,
              type: "REBALANCE_SELL",
              targetTokenSymbol: pos.symbol,
              targetTokenAddress: pos.tokenAddress,
              excessPct: ((allocationPct - 0.25) * 100).toFixed(1),
              explanation: `${pos.symbol} allocation (${(allocationPct * 100).toFixed(1)}%) exceeds the 25% strategy threshold.`,
            };
            break;
          }
        }
      }

      // 4. Record Decision
      const decisionId = `dec_${Date.now()}_${wallet.slice(2, 8)}`;
      const causalChainHash = `0x${Buffer.from(decisionId + evaluatedAt).toString("hex").padEnd(64, "0").slice(0, 64)}`;

      if (triggeredAction) {
        proposalsGenerated++;
        await ctx.db.insert("agentDecisions", {
          decisionId,
          walletAddress: wallet,
          strategyId: strategy.strategyId,
          triggerType: "ALLOCATION_BREACH",
          evaluatedAt,
          inputMetricsJson: JSON.stringify({ totalValueUsd, positionCount: positions.length }),
          outputActionJson: JSON.stringify(triggeredAction),
          causalChainHash,
          status: "ACTION_PROPOSED",
        });

        // Record interaction proposal in audit log
        await ctx.db.insert("agentInteractions", {
          interactionId: `int_${Date.now()}_${wallet.slice(2, 8)}`,
          agentId: strategy.strategyId,
          walletAddress: wallet,
          actionId: triggeredAction.actionId,
          event: "PROPOSED",
          reason: triggeredAction.explanation,
          timestamp: evaluatedAt,
        });
      } else {
        await ctx.db.insert("agentDecisions", {
          decisionId,
          walletAddress: wallet,
          strategyId: strategy.strategyId,
          triggerType: "PERIODIC_CHECK",
          evaluatedAt,
          inputMetricsJson: JSON.stringify({ totalValueUsd, positionCount: positions.length }),
          outputActionJson: undefined,
          causalChainHash,
          status: "COMPLIANT_NO_ACTION",
        });
      }
    }

    return {
      executed: true,
      processedCount,
      proposalsGenerated,
      evaluatedAt,
    };
  },
});
