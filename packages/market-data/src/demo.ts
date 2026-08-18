import type { MarketQuote } from "@alive/shared";

import {
  MarketDataError,
  type DataProviderHealth,
  type MarketDataProvider,
} from "./provider.js";

export type DemoQuoteSeed = Omit<
  MarketQuote,
  "timestamp" | "provider" | "dataMode"
>;

export const DEMO_QUOTE_SEEDS: readonly DemoQuoteSeed[] = [
  {
    assetId: "tusdc",
    price: "1.000000",
    bid: "0.999900",
    ask: "1.000100",
    mid: "1.000000",
    status: "OPEN",
  },
  {
    assetId: "ttbill-a",
    price: "101.250000",
    bid: "101.240000",
    ask: "101.260000",
    mid: "101.250000",
    status: "OPEN",
  },
  {
    assetId: "ttbill-b",
    price: "100.870000",
    bid: "100.860000",
    ask: "100.880000",
    mid: "100.870000",
    status: "OPEN",
  },
  {
    assetId: "ttbill-c",
    price: "99.940000",
    bid: "99.930000",
    ask: "99.950000",
    mid: "99.940000",
    status: "OPEN",
  },
  {
    assetId: "tgold",
    price: "2450.500000",
    bid: "2449.500000",
    ask: "2451.500000",
    mid: "2450.500000",
    status: "OPEN",
  },
  {
    assetId: "tsp500",
    price: "552.400000",
    bid: "552.200000",
    ask: "552.600000",
    mid: "552.400000",
    status: "CLOSED",
  },
  {
    assetId: "tnvda",
    price: "126.700000",
    bid: "126.600000",
    ask: "126.800000",
    mid: "126.700000",
    status: "CLOSED",
  },
  {
    assetId: "taapl",
    price: "225.300000",
    bid: "225.200000",
    ask: "225.400000",
    mid: "225.300000",
    status: "CLOSED",
  },
] as const;

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly name = "ALIVE_DEMO_MARKET";
  readonly #seeds: Map<string, DemoQuoteSeed>;

  constructor(
    seeds: readonly DemoQuoteSeed[] = DEMO_QUOTE_SEEDS,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.#seeds = new Map(seeds.map((seed) => [seed.assetId, seed]));
  }

  async getQuote(assetId: string): Promise<MarketQuote> {
    const seed = this.#seeds.get(assetId);
    if (!seed) {
      throw new MarketDataError(
        "ASSET_NOT_SUPPORTED",
        `${assetId} has no ALIVE demo-market quote.`,
      );
    }
    return {
      ...seed,
      provider: this.name,
      dataMode: "DEMO",
      timestamp: this.now().toISOString(),
    };
  }

  /**
   * Tolerant by design: a real catalog can (and now does) contain assets
   * this demo provider has no seed for -- e.g. a real, unanalyzed RWA with
   * no Chainlink mapping either. Those assets simply have no quote (market
   * data UNAVAILABLE), not a hard failure for the whole batch.
   */
  async getQuotes(assetIds: string[]): Promise<MarketQuote[]> {
    const unique = [...new Set(assetIds)].sort();
    const settled = await Promise.allSettled(
      unique.map((assetId) => this.getQuote(assetId)),
    );
    return settled
      .filter(
        (entry): entry is PromiseFulfilledResult<MarketQuote> =>
          entry.status === "fulfilled",
      )
      .map((entry) => entry.value);
  }

  async health(): Promise<DataProviderHealth> {
    return {
      provider: this.name,
      status: "HEALTHY",
      dataMode: "DEMO",
      checkedAt: this.now().toISOString(),
      message:
        "Synthetic ALIVE demo quotes are available. They are not live market data.",
    };
  }
}
