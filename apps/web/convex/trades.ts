import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeWalletAddress } from "./lib/normalize";

/**
 * Retrieves ALIVE self-custodial trades for a specific wallet.
 */
export const getAliveTrades = query({
  args: {
    walletAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const maxLimit = Math.min(args.limit ?? 50, 100);

    const rows = await ctx.db
      .query("aliveTrades")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", normalized))
      .order("desc")
      .take(maxLimit);

    return rows.map((r) => ({
      txHash: r.txHash,
      walletAddress: r.walletAddress,
      agentId: r.agentId,
      strategyId: r.strategyId,
      assetId: r.assetId,
      action: r.action,
      amountIn: r.amountIn,
      amountOutExpected: r.amountOutExpected,
      quoteJson: r.quoteJson,
      chainId: r.chainId,
      status: r.status,
      executedAt: r.executedAt,
    }));
  },
});

/**
 * Records a self-custodial trade submitted on X Layer.
 */
export const recordAliveTrade = mutation({
  args: {
    txHash: v.string(),
    walletAddress: v.string(),
    agentId: v.optional(v.string()),
    strategyId: v.optional(v.string()),
    assetId: v.string(),
    action: v.string(),
    amountIn: v.string(),
    amountOutExpected: v.string(),
    quoteJson: v.optional(v.string()),
    chainId: v.number(),
    status: v.string(),
    executedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const existing = await ctx.db
      .query("aliveTrades")
      .withIndex("by_txHash", (q) => q.eq("txHash", args.txHash))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        quoteJson: args.quoteJson,
      });
      return { id: existing._id, txHash: args.txHash };
    }

    const id = await ctx.db.insert("aliveTrades", {
      txHash: args.txHash,
      walletAddress: normalized,
      agentId: args.agentId,
      strategyId: args.strategyId,
      assetId: args.assetId,
      action: args.action,
      amountIn: args.amountIn,
      amountOutExpected: args.amountOutExpected,
      quoteJson: args.quoteJson,
      chainId: args.chainId,
      status: args.status,
      executedAt: args.executedAt,
    });

    return { id, txHash: args.txHash };
  },
});

/**
 * Updates the onchain status of a trade.
 */
export const updateAliveTradeStatus = mutation({
  args: {
    txHash: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("aliveTrades")
      .withIndex("by_txHash", (q) => q.eq("txHash", args.txHash))
      .unique();

    if (!existing) {
      return { success: false, error: "Trade not found" };
    }

    await ctx.db.patch(existing._id, { status: args.status });
    return { success: true, txHash: args.txHash, status: args.status };
  },
});
