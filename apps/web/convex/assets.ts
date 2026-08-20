import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Retrieves all cataloged RWA assets.
 */
export const getAssets = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("assets").collect();
    return rows.map((r) => ({
      assetId: r.assetId,
      name: r.name,
      symbol: r.symbol,
      decimals: r.decimals,
      dataMode: r.dataMode,
      issuer: r.issuer,
      jurisdiction: r.jurisdiction,
      assetClass: r.assetClass,
      schemaJson: r.schemaJson,
      lastUpdatedAt: r.lastUpdatedAt,
    }));
  },
});

/**
 * Retrieves a single asset by assetId.
 */
export const getAssetById = query({
  args: { assetId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("assets")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .unique();

    if (!row) return null;
    return {
      assetId: row.assetId,
      name: row.name,
      symbol: row.symbol,
      decimals: row.decimals,
      dataMode: row.dataMode,
      issuer: row.issuer,
      jurisdiction: row.jurisdiction,
      assetClass: row.assetClass,
      schemaJson: row.schemaJson,
      lastUpdatedAt: row.lastUpdatedAt,
    };
  },
});

/**
 * Upserts an RWA asset.
 */
export const saveAsset = mutation({
  args: {
    assetId: v.string(),
    name: v.string(),
    symbol: v.string(),
    decimals: v.number(),
    dataMode: v.string(),
    issuer: v.optional(v.string()),
    jurisdiction: v.optional(v.string()),
    assetClass: v.optional(v.string()),
    schemaJson: v.string(),
    lastUpdatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("assets")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        symbol: args.symbol,
        decimals: args.decimals,
        dataMode: args.dataMode,
        issuer: args.issuer,
        jurisdiction: args.jurisdiction,
        assetClass: args.assetClass,
        schemaJson: args.schemaJson,
        lastUpdatedAt: args.lastUpdatedAt,
      });
      return { id: existing._id, assetId: args.assetId };
    }

    const id = await ctx.db.insert("assets", {
      assetId: args.assetId,
      name: args.name,
      symbol: args.symbol,
      decimals: args.decimals,
      dataMode: args.dataMode,
      issuer: args.issuer,
      jurisdiction: args.jurisdiction,
      assetClass: args.assetClass,
      schemaJson: args.schemaJson,
      lastUpdatedAt: args.lastUpdatedAt,
    });

    return { id, assetId: args.assetId };
  },
});

/**
 * Retrieves extraction runs for an asset.
 */
export const getExtractionRuns = query({
  args: {
    assetId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxLimit = Math.min(args.limit ?? 20, 50);
    const rows = await ctx.db
      .query("extractionRuns")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .order("desc")
      .take(maxLimit);

    return rows;
  },
});

/**
 * Saves a new extraction audit run.
 */
export const saveExtractionRun = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("extractionRuns", {
      runId: args.runId,
      assetId: args.assetId,
      mode: args.mode,
      model: args.model,
      promptVersion: args.promptVersion,
      pipelineVersion: args.pipelineVersion,
      sourceIdsJson: args.sourceIdsJson,
      sourceHashesJson: args.sourceHashesJson,
      status: args.status,
      passportJson: args.passportJson,
      validationErrorsJson: args.validationErrorsJson,
      factsExtractedCount: args.factsExtractedCount,
      factsCitedCount: args.factsCitedCount,
      unknownFieldsCount: args.unknownFieldsCount,
      rejectedAttemptsCount: args.rejectedAttemptsCount,
      startedAt: args.startedAt,
      completedAt: args.completedAt,
    });
    return { id };
  },
});

/**
 * Retrieves a market snapshot by hash.
 */
export const getMarketSnapshot = query({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("marketSnapshots")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();

    if (!row) return null;
    return {
      hash: row.hash,
      snapshotJson: row.snapshotJson,
      capturedAt: row.capturedAt,
      dataMode: row.dataMode,
    };
  },
});

/**
 * Saves a market snapshot.
 */
export const saveMarketSnapshot = mutation({
  args: {
    hash: v.string(),
    snapshotJson: v.string(),
    capturedAt: v.string(),
    dataMode: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("marketSnapshots")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();

    if (existing) {
      return { id: existing._id, hash: args.hash };
    }

    const id = await ctx.db.insert("marketSnapshots", {
      hash: args.hash,
      snapshotJson: args.snapshotJson,
      capturedAt: args.capturedAt,
      dataMode: args.dataMode,
    });

    return { id, hash: args.hash };
  },
});
