import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeWalletAddress } from "./lib/normalize";

/**
 * Retrieves all published marketplace strategies.
 */
export const getMarketplaceStrategies = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("agentStrategies")
      .withIndex("by_marketplace", (q) => q.eq("isMarketplace", true))
      .collect();

    return rows.map((s) => ({
      id: s.strategyId,
      name: s.name,
      walletAddress: s.walletAddress,
      strategyJson: s.strategyJson,
      isActive: s.isActive,
      isMarketplace: s.isMarketplace,
      pricingJson: s.pricingJson,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },
});

/**
 * Retrieves custom or active strategies for a specific user wallet.
 */
export const getUserStrategies = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const rows = await ctx.db
      .query("agentStrategies")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", normalized))
      .collect();

    return rows.map((s) => ({
      id: s.strategyId,
      name: s.name,
      walletAddress: s.walletAddress,
      strategyJson: s.strategyJson,
      isActive: s.isActive,
      isMarketplace: s.isMarketplace,
      pricingJson: s.pricingJson,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },
});

/**
 * Upserts a strategy (user-created or marketplace).
 */
export const saveStrategy = mutation({
  args: {
    strategyId: v.string(),
    walletAddress: v.optional(v.string()),
    name: v.string(),
    strategyJson: v.string(),
    isActive: v.boolean(),
    isMarketplace: v.boolean(),
    pricingJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedWallet = args.walletAddress ? normalizeWalletAddress(args.walletAddress) : undefined;
    const existing = await ctx.db
      .query("agentStrategies")
      .withIndex("by_strategyId", (q) => q.eq("strategyId", args.strategyId))
      .unique();

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        walletAddress: normalizedWallet,
        name: args.name,
        strategyJson: args.strategyJson,
        isActive: args.isActive,
        isMarketplace: args.isMarketplace,
        pricingJson: args.pricingJson,
        updatedAt: now,
      });
      return { id: existing._id, strategyId: args.strategyId };
    }

    const id = await ctx.db.insert("agentStrategies", {
      strategyId: args.strategyId,
      walletAddress: normalizedWallet,
      name: args.name,
      strategyJson: args.strategyJson,
      isActive: args.isActive,
      isMarketplace: args.isMarketplace,
      pricingJson: args.pricingJson,
      createdAt: now,
      updatedAt: now,
    });

    return { id, strategyId: args.strategyId };
  },
});

/**
 * Sets the active operating strategy for a specific wallet.
 */
export const setActiveStrategy = mutation({
  args: {
    walletAddress: v.string(),
    strategyId: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);

    // Deactivate existing user strategies for this wallet
    const existing = await ctx.db
      .query("agentStrategies")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", normalized))
      .collect();

    for (const strat of existing) {
      if (strat.strategyId !== args.strategyId && strat.isActive) {
        await ctx.db.patch(strat._id, { isActive: false });
      }
    }

    // Find the target strategy
    const target = await ctx.db
      .query("agentStrategies")
      .withIndex("by_strategyId", (q) => q.eq("strategyId", args.strategyId))
      .unique();

    if (target) {
      await ctx.db.patch(target._id, { isActive: true });
      return { success: true, strategyId: args.strategyId };
    }

    return { success: false, error: "Strategy not found" };
  },
});
