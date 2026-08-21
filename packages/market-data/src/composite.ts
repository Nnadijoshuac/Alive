import type { MarketQuote } from "@alive/shared";

import { ChainlinkDataFeedProvider } from "./chainlink-data-feed.js";
import { feedForAsset } from "./chainlink-feeds.js";
import { ControllableDemoMarketDataProvider } from "./demo-controls.js";
import { OkxMarketProvider } from "./okx.js";
import {
  MarketDataError,
  type DataProviderHealth,
  type MarketDataProvider,
} from "./provider.js";

/**
 * Routes each asset to the right source:
 * 1. Assets with a configured Chainlink feed are served live from Chainlink (e.g. ttbill-b).
 * 2. Assets supported on X Layer are served live from OKX OnchainOS (e.g. WMETAX).
 * 3. Everything else comes from the labelled demo provider.
 */
export class CompositeMarketDataProvider implements MarketDataProvider {
  readonly name = "ALIVE_COMPOSITE";

  constructor(
    private readonly chainlink: ChainlinkDataFeedProvider,
    private readonly demo: ControllableDemoMarketDataProvider,
    private readonly okx?: OkxMarketProvider,
  ) {}

  /** True when this asset's data comes from a real Chainlink feed. */
  isChainlinkLive(assetId: string): boolean {
    return feedForAsset(assetId) !== undefined;
  }

  /** True when this asset's data comes from OKX / X Layer. */
  isOkxLive(assetId: string): boolean {
    return this.okx?.supportsAsset(assetId) ?? false;
  }

  /** True when this asset has live market data from either provider. */
  isLive(assetId: string): boolean {
    return this.isChainlinkLive(assetId) || this.isOkxLive(assetId);
  }

  /**
   * Applies an Attack Lab degradation. Refuses on live-backed assets:
   * real oracle/market data is never modified to make a demo fail.
   */
  degrade(assetId: string, ageSeconds: number): void {
    if (this.isLive(assetId)) {
      const source = this.isChainlinkLive(assetId)
        ? `Chainlink feed ${feedForAsset(assetId)?.label}`
        : "OKX OnchainOS market feed";
      throw new MarketDataError(
        "PROVIDER_DISABLED",
        `${assetId} is backed by the live ${source}. ALIVE does not modify real oracle data to simulate a failure; run the Attack Lab against a demo-backed asset instead.`,
      );
    }
    if (ageSeconds === 0) {
      this.demo.clearOverride(assetId);
      return;
    }
    this.demo.setOverride(assetId, { ageSeconds });
  }

  clearDegradations(): void {
    this.demo.clearAllOverrides();
  }

  listDegradations(): Record<string, { ageSeconds?: number }> {
    return this.demo.listOverrides();
  }

  async getQuote(assetId: string): Promise<MarketQuote> {
    if (this.isChainlinkLive(assetId)) {
      return this.chainlink.getQuote(assetId);
    }
    if (this.okx && this.isOkxLive(assetId)) {
      try {
        return await this.okx.getQuote(assetId);
      } catch {
        return this.demo.getQuote(assetId);
      }
    }
    return this.demo.getQuote(assetId);
  }

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
    const checks: Promise<DataProviderHealth>[] = [
      this.chainlink.health(),
      this.demo.health(),
    ];
    if (this.okx) {
      checks.push(this.okx.health());
    }

    const results = await Promise.all(checks);
    const hasOffline = results.some((r) => r.status === "OFFLINE");
    const hasDegraded = results.some((r) => r.status === "DEGRADED");
    const status = hasOffline ? "OFFLINE" : hasDegraded ? "DEGRADED" : "HEALTHY";

    return {
      provider: this.name,
      status,
      dataMode: "LIVE",
      checkedAt: results[0]?.checkedAt ?? new Date().toISOString(),
      message: results.map((r) => `${r.provider}: ${r.message}`).join(" | "),
    };
  }
}
