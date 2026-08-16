import type { MarketQuote } from "@alive/shared";

import { ChainlinkDataFeedProvider } from "./chainlink-data-feed.js";
import { feedForAsset } from "./chainlink-feeds.js";
import { ControllableDemoMarketDataProvider } from "./demo-controls.js";
import {
  MarketDataError,
  type DataProviderHealth,
  type MarketDataProvider,
} from "./provider.js";

/**
 * Routes each asset to the right source: assets with a configured Chainlink
 * feed are served live from that feed, everything else from the labelled
 * demo provider.
 *
 * The important property is what this makes impossible. The Attack Lab's
 * degradation controls live on the demo provider, and this router will not
 * apply them to a Chainlink-backed asset -- `degrade()` throws for those.
 * So a live Chainlink value can never be doctored to manufacture a demo
 * failure, and a demo failure can never be presented as a live one. The two
 * modes stay honest by construction rather than by convention.
 */
export class CompositeMarketDataProvider implements MarketDataProvider {
  readonly name = "ALIVE_COMPOSITE";

  constructor(
    private readonly chainlink: ChainlinkDataFeedProvider,
    private readonly demo: ControllableDemoMarketDataProvider,
  ) {}

  /** True when this asset's data comes from a real Chainlink feed. */
  isLive(assetId: string): boolean {
    return feedForAsset(assetId) !== undefined;
  }

  /**
   * Applies an Attack Lab degradation. Refuses on Chainlink-backed assets:
   * real oracle data is never modified to make a demo fail.
   */
  degrade(assetId: string, ageSeconds: number): void {
    if (this.isLive(assetId)) {
      const feed = feedForAsset(assetId);
      throw new MarketDataError(
        "PROVIDER_DISABLED",
        `${assetId} is backed by the live Chainlink feed ${feed?.label}. ALIVE does not modify real oracle data to simulate a failure; run the Attack Lab against a demo-backed asset instead.`,
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
    return this.isLive(assetId)
      ? this.chainlink.getQuote(assetId)
      : this.demo.getQuote(assetId);
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
    const [live, demo] = await Promise.all([
      this.chainlink.health(),
      this.demo.health(),
    ]);
    // Report the worse of the two rather than the more flattering one.
    const status =
      live.status === "OFFLINE" || demo.status === "OFFLINE"
        ? "OFFLINE"
        : live.status === "DEGRADED" || demo.status === "DEGRADED"
          ? "DEGRADED"
          : "HEALTHY";
    return {
      provider: this.name,
      status,
      // Mixed sourcing: some assets are live, some are demo, and the passport
      // labels each asset individually.
      dataMode: "LIVE",
      checkedAt: live.checkedAt,
      message: `Live Chainlink: ${live.message} | Demo assets: ${demo.message}`,
    };
  }
}
