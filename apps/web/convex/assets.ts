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
 * Retrieves all cataloged RWA assets as full canonical RwaAsset objects.
 */
export const getCanonicalAssets = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("assets").collect();
    const valid: any[] = [];
    for (const r of rows) {
      if (!r.schemaJson) continue;
      try {
        const parsed = JSON.parse(r.schemaJson);
        valid.push({
          ...parsed,
          id: r.assetId,
          name: r.name,
          symbol: r.symbol,
          assetClass: r.assetClass ?? parsed.assetClass,
        });
      } catch {
        // Skip unparseable records
      }
    }
    return valid;
  },
});

/**
 * Retrieves a single canonical RwaAsset by assetId.
 */
export const getCanonicalAssetById = query({
  args: { assetId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("assets")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .unique();

    if (!row || !row.schemaJson) return null;
    try {
      const parsed = JSON.parse(row.schemaJson);
      return {
        ...parsed,
        id: row.assetId,
        name: row.name,
        symbol: row.symbol,
        assetClass: row.assetClass ?? parsed.assetClass,
      };
    } catch {
      return null;
    }
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
      const patchDoc: Record<string, unknown> = {
        name: args.name,
        symbol: args.symbol,
        decimals: args.decimals,
        dataMode: args.dataMode,
        schemaJson: args.schemaJson,
        lastUpdatedAt: args.lastUpdatedAt,
      };
      if (args.issuer !== undefined) patchDoc.issuer = args.issuer;
      if (args.jurisdiction !== undefined) patchDoc.jurisdiction = args.jurisdiction;
      if (args.assetClass !== undefined) patchDoc.assetClass = args.assetClass;

      await ctx.db.patch(existing._id, patchDoc);
      return { id: existing._id, assetId: args.assetId };
    }

    const insertDoc: {
      assetId: string;
      name: string;
      symbol: string;
      decimals: number;
      dataMode: string;
      issuer?: string;
      jurisdiction?: string;
      assetClass?: string;
      schemaJson: string;
      lastUpdatedAt: string;
    } = {
      assetId: args.assetId,
      name: args.name,
      symbol: args.symbol,
      decimals: args.decimals,
      dataMode: args.dataMode,
      schemaJson: args.schemaJson,
      lastUpdatedAt: args.lastUpdatedAt,
    };
    if (args.issuer !== undefined) insertDoc.issuer = args.issuer;
    if (args.jurisdiction !== undefined) insertDoc.jurisdiction = args.jurisdiction;
    if (args.assetClass !== undefined) insertDoc.assetClass = args.assetClass;

    const id = await ctx.db.insert("assets", insertDoc);
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
    const insertDoc: Record<string, unknown> = {
      runId: args.runId,
      assetId: args.assetId,
      mode: args.mode,
      promptVersion: args.promptVersion,
      pipelineVersion: args.pipelineVersion,
      sourceIdsJson: args.sourceIdsJson,
      sourceHashesJson: args.sourceHashesJson,
      status: args.status,
      startedAt: args.startedAt,
    };
    if (args.model !== undefined) insertDoc.model = args.model;
    if (args.passportJson !== undefined) insertDoc.passportJson = args.passportJson;
    if (args.validationErrorsJson !== undefined) insertDoc.validationErrorsJson = args.validationErrorsJson;
    if (args.factsExtractedCount !== undefined) insertDoc.factsExtractedCount = args.factsExtractedCount;
    if (args.factsCitedCount !== undefined) insertDoc.factsCitedCount = args.factsCitedCount;
    if (args.unknownFieldsCount !== undefined) insertDoc.unknownFieldsCount = args.unknownFieldsCount;
    if (args.rejectedAttemptsCount !== undefined) insertDoc.rejectedAttemptsCount = args.rejectedAttemptsCount;
    if (args.completedAt !== undefined) insertDoc.completedAt = args.completedAt;

    const id = await ctx.db.insert("extractionRuns", insertDoc as any);
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
