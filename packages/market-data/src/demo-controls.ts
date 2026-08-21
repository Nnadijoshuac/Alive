import type { MarketQuote } from "@alive/shared";

import { DemoMarketDataProvider, type DemoQuoteSeed } from "./demo.js";
import {
  MarketDataError,
  type DataProviderHealth,
  type MarketDataProvider,
} from "./provider.js";

export type DemoAssetOverride = {
  /** Backdates this asset's quote by N seconds, so freshness rules see it as stale. */
  ageSeconds?: number;
  /** Forces the reported market status (e.g. HALTED) for this asset. */
  status?: MarketQuote["status"];
};

/**
 * Wraps DemoMarketDataProvider with per-asset, in-memory overrides so a demo
 * operator can degrade one asset's data on purpose -- the mechanism behind the
 * gateway demo's "make NAV stale" step and the Attack Lab.
 *
 * This only ever makes DEMO data worse; it cannot invent or improve a quote,
 * and it never touches a live provider. Every quote it returns still carries
 * dataMode: "DEMO", so nothing it produces can be mistaken for live market
 * data. Overrides are process-local and reset on restart.
 */
export class ControllableDemoMarketDataProvider implements MarketDataProvider {
  readonly name = "ALIVE_DEMO_MARKET";
  readonly #inner: DemoMarketDataProvider;
  readonly #overrides = new Map<string, DemoAssetOverride>();

  constructor(
    seeds?: readonly DemoQuoteSeed[],
    private readonly now: () => Date = () => new Date(),
  ) {
    this.#inner = seeds
      ? new DemoMarketDataProvider(seeds, now)
      : new DemoMarketDataProvider(undefined, now);
  }

  setOverride(assetId: string, override: DemoAssetOverride): void {
    const ageSeconds = override.ageSeconds;
    if (ageSeconds !== undefined) {
      if (!Number.isFinite(ageSeconds) || ageSeconds < 0) {
        throw new RangeError("ageSeconds must be a non-negative number");
      }
    }
    const next: DemoAssetOverride = {
      ...(ageSeconds !== undefined ? { ageSeconds } : {}),
      ...(override.status !== undefined ? { status: override.status } : {}),
    };
    if (Object.keys(next).length === 0) {
      this.#overrides.delete(assetId);
      return;
    }
    this.#overrides.set(assetId, next);
  }

  clearOverride(assetId: string): void {
    this.#overrides.delete(assetId);
  }

  clearAllOverrides(): void {
    this.#overrides.clear();
  }

  listOverrides(): Record<string, DemoAssetOverride> {
    return Object.fromEntries(this.#overrides.entries());
  }

  async getQuote(assetId: string): Promise<MarketQuote> {
    const quote = await this.#inner.getQuote(assetId);
    const override = this.#overrides.get(assetId);
    if (!override) return quote;

    const aged =
      override.ageSeconds !== undefined
        ? new Date(
            this.now().getTime() - override.ageSeconds * 1_000,
          ).toISOString()
        : quote.timestamp;

    return {
      ...quote,
      timestamp: aged,
      ...(override.status !== undefined ? { status: override.status } : {}),
    };
  }

  async getQuotes(assetIds: string[]): Promise<MarketQuote[]> {
    return Promise.all(
      [...new Set(assetIds)].sort().map((assetId) => this.getQuote(assetId)),
    );
  }

  async health(): Promise<DataProviderHealth> {
    const base = await this.#inner.health();
    const overridden = this.#overrides.size;
    if (overridden === 0) return base;
    return {
      ...base,
      status: "DEGRADED",
      message: `${base.message} ${overridden} demo asset(s) currently have a deliberate degradation override applied.`,
    };
  }
}

export { MarketDataError };
