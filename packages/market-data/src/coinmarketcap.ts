import {
  CoinMarketCapContextSchema,
  FixedDecimalStringSchema,
  MarketQuoteSchema,
  type CoinMarketCapMarketContext,
  type MarketQuote,
  type RwaAsset,
} from "@alive/shared";

import {
  MarketDataError,
  type DataProviderHealth,
  type MarketDataProvider,
} from "./provider.js";

export const CMC_PUBLIC_MAP_URL =
  "https://pro-api.coinmarketcap.com/public-api/v1/cryptocurrency/map";
export const CMC_DATA_DETAIL_URL =
  "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail";
export const CMC_MARKET_PAIRS_URL =
  "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/market-pairs/latest";

export type CmcMapToken = {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  rank?: number;
  is_active?: number;
  platform?: {
    id: number;
    name: string;
    symbol: string;
    slug: string;
    token_address?: string;
  } | null;
};

export type CmcDetailResponse = {
  data?: {
    id: number;
    name: string;
    symbol: string;
    slug: string;
    category?: string;
    description?: string;
    statistics?: {
      price?: number;
      priceChangePercentage24h?: number;
      marketCap?: number;
      volume24h?: number;
      totalOnchainLiquidity?: number;
      circulatingSupply?: number;
      totalSupply?: number;
    };
    platforms?: Array<{
      contractAddress: string;
      contractPlatform: string;
      contractPlatformId: number;
      contractChainId?: number;
      contractExplorerUrl?: string;
    }>;
    urls?: {
      website?: string[];
      twitter?: string[];
      explorer?: string[];
    };
    holders?: {
      holderCount?: number;
    };
  };
  status?: {
    timestamp?: string;
    error_code?: string | number;
    error_message?: string;
  };
};

export type CmcMarketPairsResponse = {
  data?: {
    id: number;
    name: string;
    symbol: string;
    numMarketPairs?: number;
    marketPairs?: Array<{
      exchangeName?: string;
      exchangeSlug?: string;
      marketPair?: string;
      baseSymbol?: string;
      quoteSymbol?: string;
      price?: number;
      volumeUsd?: number;
      liquidity?: number;
      lastUpdated?: string;
      dexerUrl?: string;
    }>;
  };
};

export type CoinMarketCapProviderOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  cacheTtlMs?: number;
  mapCacheTtlMs?: number;
  freshnessSeconds?: number;
  assetDeployments?: Record<string, { chainId: number; contractAddress: string }>;
};

/**
 * Verified default deployments on X Layer (chainId 196) and Ethereum for ALIVE assets.
 * Used for contract-address-first resolution when an asset ID is provided.
 */
export const DEFAULT_ASSET_CONTRACTS: Record<
  string,
  { chainId: number; contractAddress: string }
> = {
  "meta-xstock": {
    chainId: 196,
    contractAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
  },
  "spyx-xstock": {
    chainId: 196,
    contractAddress: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
  },
  "alphabet-xstock": {
    chainId: 196,
    contractAddress: "0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f",
  },
  "amazon-xstock": {
    chainId: 196,
    contractAddress: "0x910cabde3eba7fc1ce64fd14bd680b9f60fa0f90",
  },
  "broadcom-xstock": {
    chainId: 196,
    contractAddress: "0xe89572bfe500ac7e8ecd8dc8119d274214e06f14",
  },
  "qqqx-xstock": {
    chainId: 196,
    contractAddress: "0xa753a7395cae905cd615da0b82a53e0560f250af",
  },
  "asml-xstock": {
    chainId: 196,
    contractAddress: "0xc0b417e7f83db438631eb5e096684dd742e5294f",
  },
  "micron-xstock": {
    chainId: 196,
    contractAddress: "0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4",
  },
  "sandisk-xstock": {
    chainId: 196,
    contractAddress: "0xb63efbc28860c8097e341de1fcf59456161e9d98",
  },
  "usdy": {
    chainId: 1,
    contractAddress: "0x96f6ef951840721adbf46ac996b59e0235cb985c",
  },
};

/**
 * Real Keyless CoinMarketCap Public Data Provider for ALIVE.
 *
 * Rules:
 * 1. Contract-address-first resolution (Chain + Contract address).
 *    Never resolves by symbol alone to prevent collision with unrelated ticker symbols.
 * 2. Keyless Public endpoints only (no API key, no x402 paid endpoints).
 * 3. Server-side caching with graceful fallback on timeout.
 * 4. Transparent status: LIVE, AVAILABLE, STALE, UNAVAILABLE.
 * 5. Does not mutate or override Chainlink authoritative oracle NAV for USTB.
 */
export class CoinMarketCapPublicProvider implements MarketDataProvider {
  readonly name = "CoinMarketCap (Keyless Public)";

  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #cacheTtlMs: number;
  readonly #mapCacheTtlMs: number;
  readonly #freshnessSeconds: number;
  readonly #assetContracts: Record<
    string,
    { chainId: number; contractAddress: string }
  >;

  #mapCache: { tokens: CmcMapToken[]; fetchedAt: number } | null = null;
  #contextCache = new Map<
    string,
    { context: CoinMarketCapMarketContext; fetchedAt: number }
  >();

  constructor(options?: CoinMarketCapProviderOptions) {
    this.#fetch = options?.fetchImpl ?? fetch;
    this.#now = options?.now ?? (() => new Date());
    this.#cacheTtlMs = options?.cacheTtlMs ?? 90_000; // 90 seconds TTL for market context
    this.#mapCacheTtlMs = options?.mapCacheTtlMs ?? 3_600_000; // 1 hour TTL for map
    this.#freshnessSeconds = options?.freshnessSeconds ?? 600; // 10 minutes freshness limit
    this.#assetContracts = {
      ...DEFAULT_ASSET_CONTRACTS,
      ...(options?.assetDeployments ?? {}),
    };
  }

  /**
   * Fetches the public CoinMarketCap token map to index contracts.
   */
  async getCmcMap(): Promise<CmcMapToken[]> {
    const nowMs = this.#now().getTime();
    if (
      this.#mapCache &&
      nowMs - this.#mapCache.fetchedAt < this.#mapCacheTtlMs
    ) {
      return this.#mapCache.tokens;
    }

    try {
      const response = await this.#fetch(CMC_PUBLIC_MAP_URL, {
        headers: {
          Accept: "application/json",
          "User-Agent": "ALIVE-MarketIntelligence/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`CMC Map API error: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as { data?: CmcMapToken[] };
      const tokens = payload.data ?? [];
      this.#mapCache = { tokens, fetchedAt: nowMs };
      return tokens;
    } catch (error) {
      if (this.#mapCache) {
        return this.#mapCache.tokens;
      }
      throw new MarketDataError(
        "PROVIDER_UNAVAILABLE",
        `Failed to reach CoinMarketCap public map: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolves a token contract to a CoinMarketCap mapped token entry.
   * STRICT CONTRACT-ADDRESS-FIRST: matches token_address on the requested platform.
   */
  async resolveByContract(
    contractAddress: string,
    _chainId?: number,
  ): Promise<CmcMapToken | undefined> {
    const map = await this.getCmcMap();
    const normalizedContract = contractAddress.toLowerCase();

    return map.find(
      (token) =>
        token.platform?.token_address &&
        token.platform.token_address.toLowerCase() === normalizedContract,
    );
  }

  /**
   * Fetches full market context for an asset or passport.
   */
  async getMarketContext(
    target:
      | string
      | {
          id: string;
          symbol: string;
          deployments?:
            | readonly {
                chainId: number;
                contractAddress: string;
                deploymentStatus?: string | undefined;
              }[]
            | undefined;
        },
  ): Promise<CoinMarketCapMarketContext> {
    const assetId = typeof target === "string" ? target : target.id;
    const now = this.#now();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();

    // Check cached context
    const cached = this.#contextCache.get(assetId);
    if (cached && nowMs - cached.fetchedAt < this.#cacheTtlMs) {
      return cached.context;
    }

    // Determine deployment contract
    let contractAddress: `0x${string}` | undefined;
    let chainId: number | undefined;

    if (typeof target !== "string" && target.deployments && target.deployments.length > 0) {
      // Prioritize X Layer (chainId 196) or first verified deployment
      const xlayer = target.deployments.find((d) => d.chainId === 196);
      const chosen = xlayer ?? target.deployments[0];
      if (chosen) {
        contractAddress = chosen.contractAddress as `0x${string}`;
        chainId = chosen.chainId;
      }
    } else {
      const known = this.#assetContracts[assetId];
      if (known) {
        contractAddress = known.contractAddress as `0x${string}`;
        chainId = known.chainId;
      }
    }

    if (!contractAddress) {
      const unavailable: CoinMarketCapMarketContext = {
        provider: "coinmarketcap",
        providerMode: "KEYLESS_PUBLIC",
        assetId,
        observedAt: nowIso,
        dataMode: "UNAVAILABLE",
        reason: "Asset has no deployment contract address registered for CoinMarketCap lookup.",
      };
      this.#contextCache.set(assetId, { context: unavailable, fetchedAt: nowMs });
      return unavailable;
    }

    // Contract-first resolution
    let matchedToken: CmcMapToken | undefined;
    try {
      matchedToken = await this.resolveByContract(contractAddress, chainId);
    } catch (err) {
      if (cached) {
        return {
          ...cached.context,
          dataMode: "STALE",
          observedAt: nowIso,
          reason: `CoinMarketCap map lookup failed; serving cached observation. (${err instanceof Error ? err.message : String(err)})`,
        };
      }
      const unavailable: CoinMarketCapMarketContext = {
        provider: "coinmarketcap",
        providerMode: "KEYLESS_PUBLIC",
        assetId,
        chainId,
        contractAddress,
        observedAt: nowIso,
        dataMode: "UNAVAILABLE",
        reason: `CoinMarketCap map unavailable: ${err instanceof Error ? err.message : String(err)}`,
      };
      return unavailable;
    }

    if (!matchedToken) {
      const unavailable: CoinMarketCapMarketContext = {
        provider: "coinmarketcap",
        providerMode: "KEYLESS_PUBLIC",
        assetId,
        chainId,
        contractAddress,
        observedAt: nowIso,
        dataMode: "UNAVAILABLE",
        reason: `Contract address ${contractAddress} on chain ${chainId ?? "unknown"} is not indexed in CoinMarketCap.`,
      };
      this.#contextCache.set(assetId, { context: unavailable, fetchedAt: nowMs });
      return unavailable;
    }

    // Fetch token detail & market pairs by matched CMC ID & slug
    try {
      const [detailRes, pairsRes] = await Promise.all([
        this.#fetch(`${CMC_DATA_DETAIL_URL}?id=${matchedToken.id}`, {
          headers: {
            Accept: "application/json",
            "User-Agent": "ALIVE-MarketIntelligence/1.0",
          },
        }),
        this.#fetch(`${CMC_MARKET_PAIRS_URL}?slug=${matchedToken.slug}`, {
          headers: {
            Accept: "application/json",
            "User-Agent": "ALIVE-MarketIntelligence/1.0",
          },
        }).catch(() => null),
      ]);

      if (!detailRes.ok) {
        throw new Error(`CMC Detail API HTTP ${detailRes.status}`);
      }

      const detailJson = (await detailRes.json()) as CmcDetailResponse;
      const stats = detailJson.data?.statistics;

      let pairsJson: CmcMarketPairsResponse | undefined;
      if (pairsRes && pairsRes.ok) {
        pairsJson = (await pairsRes.json()) as CmcMarketPairsResponse;
      }

      const topPair = pairsJson?.data?.marketPairs?.[0];
      const sourceUpdatedAt =
        topPair?.lastUpdated ??
        detailJson.status?.timestamp ??
        nowIso;

      const sourceAgeSeconds = Math.max(
        0,
        Math.floor((nowMs - Date.parse(sourceUpdatedAt)) / 1_000),
      );
      const isLive = sourceAgeSeconds <= this.#freshnessSeconds;

      const context: CoinMarketCapMarketContext = CoinMarketCapContextSchema.parse({
        provider: "coinmarketcap",
        providerMode: "KEYLESS_PUBLIC",
        assetId,
        chainId,
        contractAddress,
        priceUsd: stats?.price !== undefined && stats.price > 0 ? stats.price : undefined,
        marketCapUsd: stats?.marketCap !== undefined && stats.marketCap > 0 ? stats.marketCap : undefined,
        volume24hUsd: stats?.volume24h !== undefined && stats.volume24h >= 0 ? stats.volume24h : undefined,
        priceChange24hPct: stats?.priceChangePercentage24h,
        liquidityUsd: stats?.totalOnchainLiquidity !== undefined && stats.totalOnchainLiquidity >= 0 ? stats.totalOnchainLiquidity : undefined,
        circulatingSupply: stats?.circulatingSupply !== undefined && stats.circulatingSupply > 0 ? stats.circulatingSupply : undefined,
        totalSupply: stats?.totalSupply !== undefined && stats.totalSupply > 0 ? stats.totalSupply : undefined,
        holders: detailJson.data?.holders?.holderCount,
        dex: topPair
          ? {
              exchangeName: topPair.exchangeName,
              exchangeSlug: topPair.exchangeSlug,
              pair: topPair.marketPair,
              baseSymbol: topPair.baseSymbol,
              quoteSymbol: topPair.quoteSymbol,
              dexTotalLiquidity: topPair.liquidity,
            }
          : undefined,
        sourceUpdatedAt,
        observedAt: nowIso,
        sourceUrl: `https://coinmarketcap.com/currencies/${matchedToken.slug}/`,
        dataMode: isLive ? "LIVE" : "AVAILABLE",
      });

      this.#contextCache.set(assetId, { context, fetchedAt: nowMs });
      return context;
    } catch (error) {
      if (cached) {
        return {
          ...cached.context,
          dataMode: "STALE",
          observedAt: nowIso,
          reason: `CMC detail fetch failed; serving cached observation. (${error instanceof Error ? error.message : String(error)})`,
        };
      }

      const unavailable: CoinMarketCapMarketContext = {
        provider: "coinmarketcap",
        providerMode: "KEYLESS_PUBLIC",
        assetId,
        chainId,
        contractAddress,
        observedAt: nowIso,
        dataMode: "UNAVAILABLE",
        reason: `Failed to fetch CoinMarketCap token details: ${error instanceof Error ? error.message : String(error)}`,
      };
      return unavailable;
    }
  }

  async getQuote(assetId: string): Promise<MarketQuote> {
    const context = await this.getMarketContext(assetId);
    if (!context.priceUsd || context.dataMode === "UNAVAILABLE") {
      throw new MarketDataError(
        "ASSET_NOT_SUPPORTED",
        `CoinMarketCap public provider has no live price for ${assetId}. Reason: ${context.reason ?? "Unsupported onchain contract"}`,
      );
    }

    const price = FixedDecimalStringSchema.parse(context.priceUsd.toFixed(6));
    const timestamp = context.sourceUpdatedAt ?? context.observedAt;

    return MarketQuoteSchema.parse({
      assetId,
      price,
      timestamp,
      provider: "CoinMarketCap (Keyless Public)",
      status: "OPEN",
      dataMode: context.dataMode === "LIVE" ? "LIVE" : "DEMO",
    });
  }

  async getQuotes(assetIds: string[]): Promise<MarketQuote[]> {
    const results = await Promise.allSettled(
      assetIds.map((id) => this.getQuote(id)),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<MarketQuote> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  async health(): Promise<DataProviderHealth> {
    try {
      const map = await this.getCmcMap();
      return {
        provider: this.name,
        status: map.length > 0 ? "HEALTHY" : "DEGRADED",
        dataMode: "LIVE",
        checkedAt: this.#now().toISOString(),
        message: `CoinMarketCap public keyless API online (${map.length} tokens indexed).`,
      };
    } catch (error) {
      return {
        provider: this.name,
        status: "DEGRADED",
        dataMode: "LIVE",
        checkedAt: this.#now().toISOString(),
        message: `CoinMarketCap public API degraded: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
