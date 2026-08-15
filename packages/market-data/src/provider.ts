import type { MarketQuote } from "@alive/shared";

export type DataProviderHealth = {
  provider: string;
  status: "HEALTHY" | "DEGRADED" | "OFFLINE";
  dataMode: "DEMO" | "SNAPSHOT" | "LIVE";
  checkedAt: string;
  message: string;
};

export interface MarketDataProvider {
  readonly name: string;
  getQuote(assetId: string): Promise<MarketQuote>;
  getQuotes(assetIds: string[]): Promise<MarketQuote[]>;
  health(): Promise<DataProviderHealth>;
}

export class MarketDataError extends Error {
  constructor(
    readonly code:
      | "ASSET_NOT_SUPPORTED"
      | "PROVIDER_DISABLED"
      | "PROVIDER_MISCONFIGURED"
      | "PROVIDER_UNAVAILABLE"
      | "REPORT_UNSUPPORTED"
      | "REPORT_INVALID",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MarketDataError";
  }
}
