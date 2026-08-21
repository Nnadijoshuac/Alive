import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeWalletAddress } from "./lib/normalize";

/**
 * Retrieves the latest agent context snapshot for a given wallet.
 */
export const getAgentSnapshot = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const row = await ctx.db
      .query("agentContextSnapshots")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", normalized))
      .order("desc")
      .first();

    if (!row) return null;
    return {
      snapshotId: row.snapshotId,
      agentId: row.agentId,
      walletAddress: row.walletAddress,
      snapshotJson: row.snapshotJson,
      timestamp: row.timestamp,
    };
  },
});

/**
 * Saves a new agent context snapshot for a given wallet.
 */
export const saveAgentSnapshot = mutation({
  args: {
    snapshotId: v.string(),
    agentId: v.string(),
    walletAddress: v.string(),
    snapshotJson: v.string(),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const id = await ctx.db.insert("agentContextSnapshots", {
      snapshotId: args.snapshotId,
      agentId: args.agentId,
      walletAddress: normalized,
      snapshotJson: args.snapshotJson,
      timestamp: args.timestamp,
    });
    return { id };
  },
});

/**
 * Retrieves audit interactions for a given wallet in descending order.
 */
export const getAgentInteractions = query({
  args: {
    walletAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const maxLimit = Math.min(args.limit ?? 50, 100);

    const items = await ctx.db
      .query("agentInteractions")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", normalized))
      .order("desc")
      .take(maxLimit);

    return items.map((i) => ({
      interactionId: i.interactionId,
      agentId: i.agentId,
      walletAddress: i.walletAddress,
      actionId: i.actionId,
      event: i.event,
      originalAmount: i.originalAmount,
      editedAmount: i.editedAmount,
      reason: i.reason,
      timestamp: i.timestamp,
    }));
  },
});

/**
 * Records an agent interaction event (e.g. PROPOSED, REVIEWED, APPROVED, EDITED, EXECUTED, DISMISSED).
 */
export const recordAgentInteraction = mutation({
  args: {
    interactionId: v.string(),
    agentId: v.string(),
    walletAddress: v.string(),
    actionId: v.string(),
    event: v.string(),
    originalAmount: v.optional(v.string()),
    editedAmount: v.optional(v.string()),
    reason: v.optional(v.string()),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const insertDoc: {
      interactionId: string;
      agentId: string;
      walletAddress: string;
      actionId: string;
      event: string;
      originalAmount?: string;
      editedAmount?: string;
      reason?: string;
      timestamp: string;
    } = {
      interactionId: args.interactionId,
      agentId: args.agentId,
      walletAddress: normalized,
      actionId: args.actionId,
      event: args.event,
      timestamp: args.timestamp,
    };
    if (args.originalAmount !== undefined) insertDoc.originalAmount = args.originalAmount;
    if (args.editedAmount !== undefined) insertDoc.editedAmount = args.editedAmount;
    if (args.reason !== undefined) insertDoc.reason = args.reason;

    const id = await ctx.db.insert("agentInteractions", insertDoc);
    return { id };
  },
});

/**
 * Retrieves decisions evaluated by the Agent.
 */
export const getAgentDecisions = query({
  args: {
    walletAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const maxLimit = Math.min(args.limit ?? 50, 100);

    const decisions = await ctx.db
      .query("agentDecisions")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", normalized))
      .order("desc")
      .take(maxLimit);

    return decisions.map((d) => ({
      decisionId: d.decisionId,
      walletAddress: d.walletAddress,
      strategyId: d.strategyId,
      triggerType: d.triggerType,
      evaluatedAt: d.evaluatedAt,
      inputMetricsJson: d.inputMetricsJson,
      outputActionJson: d.outputActionJson,
      causalChainHash: d.causalChainHash,
      status: d.status,
    }));
  },
});

/**
 * Records an evaluated Agent decision with causal chain verification.
 */
export const recordAgentDecision = mutation({
  args: {
    decisionId: v.string(),
    walletAddress: v.string(),
    strategyId: v.string(),
    triggerType: v.string(),
    evaluatedAt: v.string(),
    inputMetricsJson: v.string(),
    outputActionJson: v.optional(v.string()),
    causalChainHash: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeWalletAddress(args.walletAddress);
    const insertDoc: {
      decisionId: string;
      walletAddress: string;
      strategyId: string;
      triggerType: string;
      evaluatedAt: string;
      inputMetricsJson: string;
      outputActionJson?: string;
      causalChainHash: string;
      status: string;
    } = {
      decisionId: args.decisionId,
      walletAddress: normalized,
      strategyId: args.strategyId,
      triggerType: args.triggerType,
      evaluatedAt: args.evaluatedAt,
      inputMetricsJson: args.inputMetricsJson,
      causalChainHash: args.causalChainHash,
      status: args.status,
    };
    if (args.outputActionJson !== undefined) insertDoc.outputActionJson = args.outputActionJson;

    const id = await ctx.db.insert("agentDecisions", insertDoc);
    return { id };
  },
});
