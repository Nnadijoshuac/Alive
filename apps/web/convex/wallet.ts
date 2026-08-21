import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeWalletAddress } from "./lib/normalize";

/**
 * Retrieves the cached wallet intelligence context snapshot for a given wallet.
 * Ensures strict address normalization and wallet data isolation.
 */
export const getWalletSnapshot = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const row = await ctx.db
      .query("walletSnapshots")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", normalized))
      .unique();

    if (!row) return null;
    return {
      walletAddress: row.walletAddress,
      snapshotJson: row.snapshotJson,
      updatedAt: row.updatedAt,
    };
  },
});

/**
 * Upserts a wallet intelligence context snapshot for a given wallet.
 */
export const saveWalletSnapshot = mutation({
  args: {
    walletAddress: v.string(),
    snapshotJson: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const existing = await ctx.db
      .query("walletSnapshots")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", normalized))
      .unique();

    const updatedAt = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        snapshotJson: args.snapshotJson,
        updatedAt,
      });
      return { id: existing._id, updatedAt };
    } else {
      const id = await ctx.db.insert("walletSnapshots", {
        walletAddress: normalized,
        snapshotJson: args.snapshotJson,
        updatedAt,
      });
      return { id, updatedAt };
    }
  },
});

/**
 * Retrieves trade history for a given wallet in descending chronological order.
 */
export const getWalletTrades = query({
  args: {
    walletAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const maxLimit = Math.min(args.limit ?? 50, 100);

    const trades = await ctx.db
      .query("walletTrades")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", normalized))
      .order("desc")
      .take(maxLimit);

    return trades.map((t) => ({
      tradeId: t.tradeId,
      walletAddress: t.walletAddress,
      txHash: t.txHash,
      chainId: t.chainId,
      tradeJson: t.tradeJson,
      source: t.source,
      confidence: t.confidence,
      timestamp: t.timestamp,
    }));
  },
});

/**
 * Records a detected or executed wallet trade.
 */
export const recordWalletTrade = mutation({
  args: {
    walletAddress: v.string(),
    tradeId: v.string(),
    txHash: v.string(),
    chainId: v.number(),
    tradeJson: v.string(),
    source: v.string(),
    confidence: v.string(),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);

    // Check for existing trade by txHash to prevent duplicate logs
    const existing = await ctx.db
      .query("walletTrades")
      .withIndex("by_txHash", (q) => q.eq("txHash", args.txHash))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        walletAddress: normalized,
        chainId: args.chainId,
        tradeJson: args.tradeJson,
        source: args.source,
        confidence: args.confidence,
        timestamp: args.timestamp,
      });
      return { id: existing._id, isNew: false };
    }

    const id = await ctx.db.insert("walletTrades", {
      tradeId: args.tradeId,
      walletAddress: normalized,
      txHash: args.txHash,
      chainId: args.chainId,
      tradeJson: args.tradeJson,
      source: args.source,
      confidence: args.confidence,
      timestamp: args.timestamp,
    });

    return { id, isNew: true };
  },
});
