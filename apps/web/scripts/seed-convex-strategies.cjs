// Seed script to populate Convex production with canonical marketplace strategies

const CONVEX_URL = "https://careful-chihuahua-483.convex.cloud";

const DEFAULT_MARKETPLACE_STRATEGIES = [
  {
    id: "strat-rwa-balance-v1",
    name: "RWA Core Balance v1",
    description:
      "Maintains balanced exposure across tokenized equities, sovereign debt, and stablecoin reserves on X Layer. Generates rebalancing proposals when individual asset weights diverge.",
    author: "ALIVE Research",
    publishedAt: "2026-08-15T00:00:00.000Z",
    targetAssetClasses: ["EQUITY", "TREASURY", "CASH"],
    rules: [
      {
        id: "rule-max-single-asset",
        name: "Max Single Asset Allocation",
        conditionVariable: "portfolioAllocation",
        operator: ">",
        thresholdValue: 35,
        action: "TRIM",
        priority: 1,
      },
      {
        id: "rule-min-stablecoin",
        name: "Minimum Stablecoin Reserve",
        conditionVariable: "stablecoinPct",
        operator: "<",
        thresholdValue: 15,
        action: "REBALANCE",
        priority: 2,
      },
      {
        id: "rule-accumulate-meta",
        name: "Target Meta Exposure",
        conditionVariable: "portfolioAllocation",
        operator: "<",
        thresholdValue: 20,
        action: "ACCUMULATE",
        targetAssetId: "wmetax",
        priority: 3,
      },
    ],
    pricing: {
      isPaid: false,
      priceUsd: 0,
    },
  },
  {
    id: "strat-treasury-yield-v1",
    name: "Sovereign Yield & Treasury Maximizer",
    description:
      "Prioritizes institutional-grade sovereign treasury debt tokens and stable yield generators with deterministic backing and short settlement periods.",
    author: "Sovereign Alpha",
    publishedAt: "2026-08-16T00:00:00.000Z",
    targetAssetClasses: ["TREASURY", "CASH"],
    rules: [
      {
        id: "rule-min-stablecoin-treasury",
        name: "High Liquidity Reserve",
        conditionVariable: "stablecoinPct",
        operator: "<",
        thresholdValue: 30,
        action: "REBALANCE",
        priority: 1,
      },
    ],
    pricing: {
      isPaid: false,
      priceUsd: 0,
    },
  },
  {
    id: "strat-tech-equity-v1",
    name: "X Layer Tech Equity Accumulator",
    description:
      "Systematically accumulates verified tokenized technology equities deployed on X Layer when market liquidity and route depth are optimal.",
    author: "Backed Capital",
    publishedAt: "2026-08-17T00:00:00.000Z",
    targetAssetClasses: ["EQUITY"],
    rules: [
      {
        id: "rule-accumulate-wmetax",
        name: "Accumulate wMETAx on X Layer",
        conditionVariable: "portfolioAllocation",
        operator: "<",
        thresholdValue: 40,
        action: "ACCUMULATE",
        targetAssetId: "wmetax",
        priority: 1,
      },
    ],
    pricing: {
      isPaid: false,
      priceUsd: 0,
    },
  },
  {
    id: "strat-conservative-reserve-v1",
    name: "Conservative Capital Preservation",
    description:
      "Strict preservation strategy designed to maintain over 50% cash/stablecoin allocations and prevent unhedged single-asset concentration.",
    author: "ALIVE Protocol",
    publishedAt: "2026-08-18T00:00:00.000Z",
    targetAssetClasses: ["CASH", "TREASURY"],
    rules: [
      {
        id: "rule-preserve-cash",
        name: "50% Stablecoin Floor",
        conditionVariable: "stablecoinPct",
        operator: "<",
        thresholdValue: 50,
        action: "REBALANCE",
        priority: 1,
      },
    ],
    pricing: {
      isPaid: false,
      priceUsd: 0,
    },
  },
];

async function seed() {
  console.log(`Seeding ${DEFAULT_MARKETPLACE_STRATEGIES.length} strategies to Convex: ${CONVEX_URL}...`);
  for (const strat of DEFAULT_MARKETPLACE_STRATEGIES) {
    const res = await fetch(`${CONVEX_URL}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "strategies:saveStrategy",
        args: {
          strategyId: strat.id,
          name: strat.name,
          strategyJson: JSON.stringify(strat),
          isActive: false,
          isMarketplace: true,
          pricingJson: JSON.stringify(strat.pricing),
        },
        format: "json",
      }),
    });
    const data = await res.json();
    console.log(`Seeded strategy ${strat.id} (${strat.name}):`, data.status);
  }
  console.log("Seeding complete!");
}

seed().catch(console.error);
