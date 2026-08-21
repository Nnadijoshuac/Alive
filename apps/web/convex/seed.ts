import { mutation } from "./_generated/server";
import { CANONICAL_CATALOG } from "./lib/canonicalCatalog";

export const seedCanonicalData = mutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();

    // 1. Seed Marketplace Strategies
    const defaultStrategies = [
      {
        strategyId: "rwa-core-balance-v1",
        name: "RWA Core Balance",
        strategyJson: JSON.stringify({
          id: "rwa-core-balance-v1",
          name: "RWA Core Balance",
          description: "Institutional balanced strategy maintaining diversified exposure across tokenized equities, US Treasuries, and stable numeraire with strict 25% single-asset risk caps.",
          riskProfile: "BALANCED",
          targetAllocations: [
            { symbol: "WMETAX", targetBps: 2500, maxBps: 3000 },
            { symbol: "SPYX", targetBps: 3500, maxBps: 4000 },
            { symbol: "TTBILL-B", targetBps: 2500, maxBps: 3000 },
            { symbol: "USDT", targetBps: 1500, maxBps: 10000 },
          ],
          rebalanceThresholdBps: 500,
          guardrails: {
            requireProofOfReserve: true,
            maxSingleAssetBps: 4000,
            enforceMinCashFloorBps: 1000,
          },
        }),
        isActive: true,
        isMarketplace: true,
        pricingJson: JSON.stringify({ isFree: true, priceUsd: 0 }),
      },
      {
        strategyId: "yield-maximizer-v1",
        name: "Treasury Yield Maximizer",
        strategyJson: JSON.stringify({
          id: "yield-maximizer-v1",
          name: "Treasury Yield Maximizer",
          description: "Capital preservation strategy focused on short-duration tokenized US Treasury bills backed by live Chainlink oracle proofs.",
          riskProfile: "CONSERVATIVE",
          targetAllocations: [
            { symbol: "TTBILL-B", targetBps: 7000, maxBps: 8000 },
            { symbol: "SPYX", targetBps: 1500, maxBps: 2000 },
            { symbol: "USDT", targetBps: 1500, maxBps: 10000 },
          ],
          rebalanceThresholdBps: 300,
          guardrails: {
            requireProofOfReserve: true,
            maxSingleAssetBps: 8000,
            enforceMinCashFloorBps: 1000,
          },
        }),
        isActive: false,
        isMarketplace: true,
        pricingJson: JSON.stringify({ isFree: true, priceUsd: 0 }),
      },
      {
        strategyId: "us-equities-growth-v1",
        name: "Tokenized US Equities Growth",
        strategyJson: JSON.stringify({
          id: "us-equities-growth-v1",
          name: "Tokenized US Equities Growth",
          description: "Growth portfolio tracking tokenized mega-cap equities on X Layer with automated rebalancing against macroeconomic policy events.",
          riskProfile: "GROWTH",
          targetAllocations: [
            { symbol: "WMETAX", targetBps: 4500, maxBps: 5000 },
            { symbol: "SPYX", targetBps: 4500, maxBps: 5000 },
            { symbol: "USDT", targetBps: 1000, maxBps: 10000 },
          ],
          rebalanceThresholdBps: 400,
          guardrails: {
            requireProofOfReserve: false,
            maxSingleAssetBps: 5000,
            enforceMinCashFloorBps: 500,
          },
        }),
        isActive: false,
        isMarketplace: true,
        pricingJson: JSON.stringify({ isFree: true, priceUsd: 0 }),
      },
    ];

    let seededStrategies = 0;
    for (const strat of defaultStrategies) {
      const existing = await ctx.db
        .query("agentStrategies")
        .withIndex("by_strategyId", (q) => q.eq("strategyId", strat.strategyId))
        .unique();

      if (!existing) {
        await ctx.db.insert("agentStrategies", {
          ...strat,
          createdAt: now,
          updatedAt: now,
        });
        seededStrategies++;
      } else {
        await ctx.db.patch(existing._id, {
          strategyJson: strat.strategyJson,
          name: strat.name,
          updatedAt: now,
        });
      }
    }

    // 2. Seed All 27 Canonical RWA Assets
    let seededAssets = 0;
    let updatedAssets = 0;

    for (const rawAsset of CANONICAL_CATALOG.assets) {
      const asset = rawAsset as Record<string, unknown>;
      const assetId = asset.id as string;
      const issuer = typeof asset.issuer === "string" ? asset.issuer : (asset.issuer as { id?: string })?.id ?? "UNKNOWN";
      const deployments = asset.deployments as Array<{ decimals?: number }> | undefined;
      const decimals = (deployments && deployments[0]?.decimals) ?? 18;
      const dataMode = (asset.dataMode as string) ?? "SNAPSHOT";
      const jurisdiction = typeof asset.jurisdiction === "string" ? asset.jurisdiction : "US";
      const schemaJson = JSON.stringify(asset);

      const existing = await ctx.db
        .query("assets")
        .withIndex("by_assetId", (q) => q.eq("assetId", assetId))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: asset.name as string,
          symbol: asset.symbol as string,
          decimals,
          dataMode,
          issuer,
          jurisdiction,
          assetClass: asset.assetClass as string,
          schemaJson,
          lastUpdatedAt: now,
        });
        updatedAssets++;
      } else {
        await ctx.db.insert("assets", {
          assetId,
          name: asset.name as string,
          symbol: asset.symbol as string,
          decimals,
          dataMode,
          issuer,
          jurisdiction,
          assetClass: asset.assetClass as string,
          schemaJson,
          lastUpdatedAt: now,
        });
        seededAssets++;
      }
    }

    return {
      success: true,
      seededStrategies,
      seededAssets,
      updatedAssets,
      totalAssetsCount: CANONICAL_CATALOG.assets.length,
      timestamp: now,
    };
  },
});

export const seedInitialData = seedCanonicalData;
