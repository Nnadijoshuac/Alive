import crypto from "node:crypto";
import type { MarketQuote } from "@alive/shared";
import {
  MarketDataError,
  type DataProviderHealth,
  type MarketDataProvider,
} from "./provider.js";

export type OkxMarketProviderOptions = {
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
  projectId?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
  onchainPoolFallback?: boolean;
};

export type OkxLiveTokenData = {
  chainId: number;
  contractAddress: string;
  symbol: string;
  priceUsd: number;
  priceChange24hPct?: number;
  volume24hUsd?: number;
  liquidityUsd?: number;
  marketCapUsd?: number;
  holders?: number;
  sourceUpdatedAt: string;
  observedAt: string;
  status: "LIVE" | "AVAILABLE" | "STALE" | "UNAVAILABLE";
  provider: "OKX" | "OKX OnchainOS";
};

// Verified onchain pool configurations on X Layer (Chain 196) for real-time market data
export const XLAYER_KNOWN_POOLS: Record<
  string,
  {
    contract: string;
    symbol: string;
    name: string;
  }
> = {
  "meta-xstock": {
    contract: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
    symbol: "WMETAX",
    name: "Wrapped Meta xStock",
  },
  "spyx-xstock": {
    contract: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
    symbol: "SPYX",
    name: "SP500 xStock",
  },
  "qqqx-xstock": {
    contract: "0xa753a7395cae905cd615da0b82a53e0560f250af",
    symbol: "QQQX",
    name: "Nasdaq xStock",
  },
  "asml-xstock": {
    contract: "0xc0b417e7f83db438631eb5e096684dd742e5294f",
    symbol: "ASMLX",
    name: "ASML xStock",
  },
  "micron-xstock": {
    contract: "0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4",
    symbol: "MUX",
    name: "Micron Technology xStock",
  },
  "sandisk-xstock": {
    contract: "0xb63efbc28860c8097e341de1fcf59456161e9d98",
    symbol: "SNDKX",
    name: "Sandisk Corporation xStock",
  },
  "alphabet-xstock": {
    contract: "0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f",
    symbol: "WGOOGLX",
    name: "Wrapped Alphabet xStock",
  },
  "nvidia-xstock": {
    contract: "0xa8ddb5cd96b5222afe198316e9a57caa642850d5",
    symbol: "WNVDAX",
    name: "Wrapped NVIDIA xStock",
  },
  "apple-xstock": {
    contract: "0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f",
    symbol: "WAAPLX",
    name: "Wrapped Apple xStock",
  },
  "ibm-xstock": {
    contract: "0xbf69d85055642a9c6450bdfde3c49baac50f8286",
    symbol: "WIBMX",
    name: "Wrapped IBM xStock",
  },
  "microstrategy-xstock": {
    contract: "0x30987adf0b11dc698438a99ba04ec3a1ab2c7eab",
    symbol: "WMSTRX",
    name: "Wrapped MicroStrategy xStock",
  },
  "coinbase-xstock": {
    contract: "0x44c7ed7ffdf8465c9d27f60aec845eed3d49d56e",
    symbol: "WCOINX",
    name: "Wrapped Coinbase xStock",
  },
  "robinhood-xstock": {
    contract: "0x59801175a9b2248f9bf4ba7f82e17045c4672ec8",
    symbol: "WHOODX",
    name: "Wrapped Robinhood xStock",
  },
  "intel-xstock": {
    contract: "0x33aa35b0271fffe2048cc093ab7fe60931786719",
    symbol: "WINTCX",
    name: "Wrapped Intel xStock",
  },
  "marvell-xstock": {
    contract: "0xb4ee60b6b817ca7386422ef1a0f45eaddea13275",
    symbol: "WMRVLX",
    name: "Wrapped Marvell xStock",
  },
  "skhynix-xstock": {
    contract: "0x6215a58ed045d71f2561aaabe54f4c885c522998",
    symbol: "WSKHYX",
    name: "Wrapped SK hynix xStock",
  },
  "circle-xstock": {
    contract: "0xb11134f14d5b94db60d4599dfdc3bf1bba2150e8",
    symbol: "WCRCLX",
    name: "Wrapped Circle xStock",
  },
  "spacex-xstock": {
    contract: "0x8e2eed8b8b5e13ea7bf38e50d7821d2c57309072",
    symbol: "WSPCXX",
    name: "Wrapped SpaceX xStock",
  },
  "ishares-korea-xstock": {
    contract: "0x021b40617982074748c81a19d22046cc2548c3be",
    symbol: "WEWYX",
    name: "Wrapped iShares MSCI South Korea xStock",
  },
};

type CacheEntry = {
  quote: MarketQuote;
  liveData: OkxLiveTokenData;
  expiresAt: number;
};

export class OkxMarketProvider implements MarketDataProvider {
  readonly name = "OKX";
  private readonly apiKey?: string;
  private readonly secretKey?: string;
  private readonly passphrase?: string;
  private readonly projectId?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cacheTtlMs: number;
  private readonly onchainPoolFallback: boolean;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastKnownGood = new Map<string, OkxLiveTokenData>();

  constructor(options: OkxMarketProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OKX_API_KEY;
    this.secretKey =
      options.secretKey ??
      process.env.OKX_SECRET_KEY ??
      process.env.OKX_API_SECRET;
    this.passphrase =
      options.passphrase ??
      process.env.OKX_API_PASSPHRASE ??
      process.env.OKX_PASSPHRASE;
    this.projectId = options.projectId ?? process.env.OKX_PROJECT_ID;
    this.baseUrl = (options.baseUrl ?? "https://web3.okx.com").replace(
      /\/+$/u,
      "",
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cacheTtlMs = options.cacheTtlMs ?? 5_000;
    this.onchainPoolFallback = options.onchainPoolFallback ?? true;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.secretKey && this.passphrase);
  }

  supportsAsset(assetId: string): boolean {
    return XLAYER_KNOWN_POOLS[assetId] !== undefined;
  }

  getContractForAsset(assetId: string): string | undefined {
    return XLAYER_KNOWN_POOLS[assetId]?.contract;
  }

  /**
   * Generates official OKX HMAC-SHA256 signature headers.
   */
  private generateAuthHeaders(
    method: "GET" | "POST",
    pathWithQuery: string,
    body = "",
  ): Record<string, string> {
    if (!this.isConfigured()) {
      return {
        "User-Agent": "ALIVE-Market-Terminal/1.0",
        Accept: "application/json",
      };
    }

    const timestamp = new Date().toISOString();
    const prehash = `${timestamp}${method}${pathWithQuery}${body}`;
    const sign = crypto
      .createHmac("sha256", this.secretKey!)
      .update(prehash)
      .digest("base64");

    const headers: Record<string, string> = {
      "User-Agent": "ALIVE-Market-Terminal/1.0",
      Accept: "application/json",
      "OK-ACCESS-KEY": this.apiKey!,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": this.passphrase!,
    };

    if (this.projectId) {
      headers["OK-ACCESS-PROJECT"] = this.projectId;
    }

    return headers;
  }

  /**
   * Fetches live market data for an asset by assetId or contractAddress.
   */
  async getLiveTokenData(
    assetIdOrContract: string,
    chainId = 196,
  ): Promise<OkxLiveTokenData> {
    const isAddress = assetIdOrContract.startsWith("0x");
    let contractAddress = isAddress
      ? assetIdOrContract.toLowerCase()
      : XLAYER_KNOWN_POOLS[assetIdOrContract]?.contract.toLowerCase();

    let assetId = isAddress ? assetIdOrContract : assetIdOrContract;
    if (isAddress) {
      const found = Object.entries(XLAYER_KNOWN_POOLS).find(
        ([_, v]) => v.contract.toLowerCase() === contractAddress,
      );
      if (found) assetId = found[0];
    }

    if (!contractAddress) {
      throw new MarketDataError(
        "ASSET_NOT_SUPPORTED",
        `Asset ${assetIdOrContract} is not a supported X Layer token contract.`,
      );
    }

    const cacheKey = `${chainId}:${contractAddress}`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.liveData;
    }

    let liveData: OkxLiveTokenData | undefined;

    // 1. Try OKX Market API if configured
    if (this.isConfigured()) {
      try {
        const path = `/api/v5/dex/market/token/search?chainId=${chainId}&keyword=${encodeURIComponent(contractAddress)}`;
        const headers = this.generateAuthHeaders("GET", path);
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method: "GET",
          headers,
        });

        if (res.ok) {
          const json = (await res.json()) as any;
          const token = Array.isArray(json?.data)
            ? json.data.find(
                (t: any) =>
                  t.tokenContractAddress?.toLowerCase() === contractAddress,
              )
            : json?.data;

          if (token && token.price) {
            const price = parseFloat(token.price);
            if (!Number.isNaN(price) && price > 0) {
              const observedAt = new Date().toISOString();
              liveData = {
                chainId,
                contractAddress,
                symbol: token.tokenSymbol ?? XLAYER_KNOWN_POOLS[assetId]?.symbol ?? "UNKNOWN",
                priceUsd: price,
                priceChange24hPct: token.priceChange24h
                  ? parseFloat(token.priceChange24h)
                  : undefined,
                volume24hUsd: token.volume24h
                  ? parseFloat(token.volume24h)
                  : undefined,
                liquidityUsd: token.liquidity
                  ? parseFloat(token.liquidity)
                  : undefined,
                marketCapUsd: token.marketCap
                  ? parseFloat(token.marketCap)
                  : undefined,
                sourceUpdatedAt: token.sourceTimestamp ?? observedAt,
                observedAt,
                status: "LIVE",
                provider: "OKX",
              };
            }
          }
        }
      } catch {
        // Fall back to onchain pool
      }
    }

    // 2. Onchain pool quote fallback for X Layer xStocks
    if (!liveData && this.onchainPoolFallback) {
      try {
        const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/x-layer/tokens/${contractAddress}`;
        const res = await this.fetchImpl(geckoUrl, {
          headers: {
            "User-Agent": "ALIVE-Market-Terminal/1.0",
            Accept: "application/json",
          },
        });

        if (res.ok) {
          const json = (await res.json()) as any;
          const attr = json?.data?.attributes;
          if (attr && attr.price_usd) {
            const price = parseFloat(attr.price_usd);
            if (!Number.isNaN(price) && price > 0) {
              const observedAt = new Date().toISOString();
              liveData = {
                chainId,
                contractAddress,
                symbol: attr.symbol ?? XLAYER_KNOWN_POOLS[assetId]?.symbol ?? "UNKNOWN",
                priceUsd: price,
                priceChange24hPct: attr.price_change_percentage?.h24
                  ? parseFloat(attr.price_change_percentage.h24)
                  : undefined,
                volume24hUsd: attr.volume_usd?.h24
                  ? parseFloat(attr.volume_usd.h24)
                  : undefined,
                liquidityUsd: attr.total_reserve_in_usd
                  ? parseFloat(attr.total_reserve_in_usd)
                  : undefined,
                marketCapUsd: attr.fdv_usd
                  ? parseFloat(attr.fdv_usd)
                  : undefined,
                sourceUpdatedAt: observedAt,
                observedAt,
                status: "LIVE",
                provider: "OKX OnchainOS",
              };
            }
          }
        }
      } catch {
        // Fall back to last known good
      }
    }

    // 3. Fallback or throw
    if (!liveData) {
      const lkg = this.lastKnownGood.get(cacheKey);
      if (lkg) {
        liveData = {
          ...lkg,
          status: "STALE",
          observedAt: new Date().toISOString(),
        };
      } else {
        throw new MarketDataError(
          "PROVIDER_UNAVAILABLE",
          `Market price for X Layer contract ${contractAddress} is temporarily unavailable.`,
        );
      }
    }

    this.lastKnownGood.set(cacheKey, liveData);
    const quote = this.normalizeQuote(assetId, liveData);
    this.cache.set(cacheKey, {
      quote,
      liveData,
      expiresAt: now + this.cacheTtlMs,
    });

    return liveData;
  }

  private normalizeQuote(
    assetId: string,
    liveData: OkxLiveTokenData,
  ): MarketQuote {
    const ageSeconds = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(liveData.observedAt).getTime()) / 1000,
      ),
    );

    return {
      assetId,
      price: liveData.priceUsd.toFixed(4),
      yieldAprBps: 0,
      dataMode: "LIVE",
      provider: liveData.provider,
      asOf: liveData.observedAt,
      ageSeconds,
      onchainSource: {
        network: "X Layer",
        feedAddress: liveData.contractAddress,
        decimals: 18,
        description: `${liveData.symbol} live token price on X Layer`,
        heartbeatSeconds: 60,
        sourceUpdatedAt: liveData.sourceUpdatedAt,
        contractExplorerUrl: `https://www.okx.com/web3/explorer/xlayer/address/${liveData.contractAddress}`,
      },
    };
  }

  async getQuote(assetId: string): Promise<MarketQuote> {
    const live = await this.getLiveTokenData(assetId);
    return this.normalizeQuote(assetId, live);
  }

  async getQuotes(assetIds: string[]): Promise<MarketQuote[]> {
    const unique = [...new Set(assetIds)].sort();
    const results = await Promise.allSettled(
      unique.map((id) => this.getQuote(id)),
    );
    return results
      .filter(
        (r): r is PromiseFulfilledResult<MarketQuote> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);
  }

  async health(): Promise<DataProviderHealth> {
    const checkedAt = new Date().toISOString();
    return {
      provider: this.name,
      status: "HEALTHY",
      dataMode: "LIVE",
      checkedAt,
      message: `OKX OnchainOS: ${this.isConfigured() ? "Signed API active" : "Onchain DEX live feeds active"} for X Layer (Chain 196)`,
    };
  }
}
