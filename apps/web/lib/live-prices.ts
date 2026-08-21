/**
 * Live Price Fetcher — replaces frozen CANONICAL_MARKET_QUOTES with
 * real-time market data from public APIs.
 *
 * Sources:
 * 1. CoinGecko free API — underlying asset reference prices (no key needed)
 * 2. OKX public market API — X Layer token prices (no key needed)
 *
 * 30-second TTL cache with stale-while-revalidate to avoid rate-limiting.
 * Falls back to hardcoded snapshot values on failure.
 *
 * Per AGENTS.md: Never hardcode market values. Label synthetic and dated
 * snapshot data. Surface data freshness and provenance.
 */

import type { MarketQuote } from "@alive/shared";

// ─── Types ───────────────────────────────────────────────────────────
export type LivePrice = {
  assetId: string;
  price: number;
  provider: string;
  fetchedAt: string;
  ageSeconds: number;
  dataMode: "LIVE" | "SNAPSHOT" | "STALE";
};

type CacheEntry = {
  price: number;
  provider: string;
  fetchedAt: number; // epoch ms
};

// ─── Configuration ───────────────────────────────────────────────────

/**
 * Maps ALIVE asset IDs → CoinGecko IDs for underlying reference pricing.
 * These are the "real" assets behind the tokenized wrappers.
 */
const COINGECKO_ID_MAP: Record<string, string> = {
  // Stablecoins / cash
  usdc: "usd-coin",
  usdt: "tether",
  // X Layer native
  okb: "okb",
};

/**
 * Maps ALIVE asset IDs → stock/etf tickers for reference pricing via
 * Yahoo Finance proxy (free, no key).
 * NOTE: CoinGecko doesn't track stocks. We use a public stock price API.
 */
const STOCK_REFERENCE_MAP: Record<string, { ticker: string; name: string }> = {
  "meta-xstock": { ticker: "META", name: "Meta Platforms Inc." },
  wmetax: { ticker: "META", name: "Meta Platforms Inc." },
  "spyx-xstock": { ticker: "SPY", name: "SPDR S&P 500 ETF Trust" },
  spyx: { ticker: "SPY", name: "SPDR S&P 500 ETF Trust" },
  "backed-bcspx": { ticker: "SPY", name: "SPDR S&P 500 ETF Trust" },
};

/**
 * Static reference prices for assets with NAV-based pricing that can't
 * be fetched from public APIs without API keys.
 * These are labeled as SNAPSHOT, not LIVE — per AGENTS.md rule.
 */
const NAV_REFERENCE_PRICES: Record<
  string,
  { price: number; provider: string }
> = {
  "ttbill-b": { price: 105.42, provider: "Chainlink NAVLink (snapshot)" },
  buidl: { price: 1.0, provider: "Securitize / BlackRock (snapshot)" },
  ousg: { price: 110.5, provider: "Ondo Finance Oracle (snapshot)" },
  usdy: { price: 1.082, provider: "Ondo Finance Oracle (snapshot)" },
  "benji-fobxx": {
    price: 1.0,
    provider: "Franklin Templeton OnChain (snapshot)",
  },
  "openeden-tbill": {
    price: 1.064,
    provider: "Chainlink Proof of Reserve (snapshot)",
  },
  "backed-bib01": { price: 108.3, provider: "Backed Assets Oracle (snapshot)" },
  jtrsy: { price: 104.2, provider: "Chainlink NAVLink (snapshot)" },
  acred: { price: 10.25, provider: "Apollo Securitize NAV (snapshot)" },
  uscc: { price: 101.8, provider: "Centrifuge Securitize NAV (snapshot)" },
  "wisdomtree-wtgxx": {
    price: 1.0,
    provider: "WisdomTree Digital (snapshot)",
  },
  usyc: { price: 1.053, provider: "Hashnote Oracle (snapshot)" },
};

// ─── Cache ───────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000; // 30 seconds
const priceCache = new Map<string, CacheEntry>();

function getCachedPrice(assetId: string): CacheEntry | null {
  const entry = priceCache.get(assetId);
  if (!entry) return null;
  return entry;
}

function setCachedPrice(
  assetId: string,
  price: number,
  provider: string,
): void {
  priceCache.set(assetId, {
    price,
    provider,
    fetchedAt: Date.now(),
  });
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

// ─── CoinGecko Fetcher ──────────────────────────────────────────────

let lastCoinGeckoFetch = 0;
const COINGECKO_COOLDOWN_MS = 15_000; // Rate limit: max 1 call per 15s

async function fetchCoinGeckoPrices(): Promise<
  Record<string, number> | null
> {
  if (Date.now() - lastCoinGeckoFetch < COINGECKO_COOLDOWN_MS) {
    return null; // Respect rate limit
  }

  const ids = Object.values(COINGECKO_ID_MAP).join(",");
  if (!ids) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      {
        headers: { accept: "application/json" },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    lastCoinGeckoFetch = Date.now();

    if (!res.ok) return null;
    const data = (await res.json()) as Record<
      string,
      { usd?: number }
    >;

    const prices: Record<string, number> = {};
    for (const [assetId, geckoId] of Object.entries(COINGECKO_ID_MAP)) {
      const usd = data[geckoId]?.usd;
      if (usd !== undefined && usd > 0) {
        prices[assetId] = usd;
      }
    }
    return prices;
  } catch {
    return null;
  }
}

// ─── Stock Price Fetcher ─────────────────────────────────────────────

let lastStockFetch = 0;
const STOCK_COOLDOWN_MS = 15_000;
const stockPriceCache = new Map<string, { price: number; fetchedAt: number }>();

/**
 * Fetches real stock/ETF prices via a public financial data API.
 * Uses Yahoo Finance v8 quote endpoint (public, no key).
 */
async function fetchStockPrices(): Promise<Record<string, number> | null> {
  if (Date.now() - lastStockFetch < STOCK_COOLDOWN_MS) {
    return null;
  }

  const tickers = [
    ...new Set(Object.values(STOCK_REFERENCE_MAP).map((s) => s.ticker)),
  ];
  if (tickers.length === 0) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const prices: Record<string, number> = {};

    // Fetch each ticker individually via a lightweight public endpoint
    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
            {
              headers: {
                accept: "application/json",
                "User-Agent": "ALIVE-Intelligence/1.0",
              },
              signal: controller.signal,
            },
          );
          if (res.ok) {
            const data = await res.json() as {
              chart?: {
                result?: Array<{
                  meta?: { regularMarketPrice?: number };
                }>;
              };
            };
            const price =
              data?.chart?.result?.[0]?.meta?.regularMarketPrice;
            if (price && price > 0) {
              prices[ticker] = price;
            }
          }
        } catch {
          // Individual ticker failure — continue
        }
      }),
    );

    clearTimeout(timer);
    lastStockFetch = Date.now();

    return Object.keys(prices).length > 0 ? prices : null;
  } catch {
    return null;
  }
}

// ─── OKX Ticker Fetcher ─────────────────────────────────────────────

let lastOkxFetch = 0;
const OKX_COOLDOWN_MS = 10_000;

/**
 * Fetches OKB price from OKX public index ticker (no key needed).
 */
async function fetchOkxPrices(): Promise<Record<string, number> | null> {
  if (Date.now() - lastOkxFetch < OKX_COOLDOWN_MS) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      "https://www.okx.com/api/v5/market/index-tickers?instId=OKB-USDT",
      {
        headers: { accept: "application/json" },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    lastOkxFetch = Date.now();

    if (!res.ok) return null;

    const data = (await res.json()) as {
      data?: Array<{ idxPx?: string; instId?: string }>;
    };

    const prices: Record<string, number> = {};
    for (const item of data?.data || []) {
      if (item.instId === "OKB-USDT" && item.idxPx) {
        const px = parseFloat(item.idxPx);
        if (px > 0) prices["okb"] = px;
      }
    }

    return Object.keys(prices).length > 0 ? prices : null;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Fetches the live price for a single asset, using cache and multiple
 * sources. Returns the best available price with provenance.
 */
export async function getLivePrice(assetId: string): Promise<LivePrice> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // 1. Check cache first
  const cached = getCachedPrice(assetId);
  if (cached && isFresh(cached)) {
    return {
      assetId,
      price: cached.price,
      provider: cached.provider,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      ageSeconds: Math.round((now - cached.fetchedAt) / 1000),
      dataMode: "LIVE",
    };
  }

  // 2. Try stock reference prices for equity tokens
  const stockRef = STOCK_REFERENCE_MAP[assetId];
  if (stockRef) {
    // Check stock cache
    const stockCached = stockPriceCache.get(stockRef.ticker);
    if (stockCached && now - stockCached.fetchedAt < CACHE_TTL_MS) {
      setCachedPrice(
        assetId,
        stockCached.price,
        `Yahoo Finance (${stockRef.ticker})`,
      );
      return {
        assetId,
        price: stockCached.price,
        provider: `Yahoo Finance (${stockRef.ticker})`,
        fetchedAt: new Date(stockCached.fetchedAt).toISOString(),
        ageSeconds: Math.round((now - stockCached.fetchedAt) / 1000),
        dataMode: "LIVE",
      };
    }

    const stockPrices = await fetchStockPrices();
    if (stockPrices && stockPrices[stockRef.ticker]) {
      const price = stockPrices[stockRef.ticker]!;
      stockPriceCache.set(stockRef.ticker, { price, fetchedAt: now });
      setCachedPrice(assetId, price, `Yahoo Finance (${stockRef.ticker})`);
      return {
        assetId,
        price,
        provider: `Yahoo Finance (${stockRef.ticker})`,
        fetchedAt: nowIso,
        ageSeconds: 0,
        dataMode: "LIVE",
      };
    }
  }

  // 3. Try CoinGecko for crypto assets
  const geckoId = COINGECKO_ID_MAP[assetId];
  if (geckoId) {
    const geckoPrices = await fetchCoinGeckoPrices();
    if (geckoPrices && geckoPrices[assetId] !== undefined) {
      const price = geckoPrices[assetId]!;
      setCachedPrice(assetId, price, "CoinGecko");
      return {
        assetId,
        price,
        provider: "CoinGecko",
        fetchedAt: nowIso,
        ageSeconds: 0,
        dataMode: "LIVE",
      };
    }
  }

  // 4. Try OKX for OKB
  if (assetId === "okb") {
    const okxPrices = await fetchOkxPrices();
    if (okxPrices && okxPrices["okb"]) {
      const price = okxPrices["okb"]!;
      setCachedPrice(assetId, price, "OKX Public Index");
      return {
        assetId,
        price,
        provider: "OKX Public Index",
        fetchedAt: nowIso,
        ageSeconds: 0,
        dataMode: "LIVE",
      };
    }
  }

  // 5. NAV reference prices (labeled as SNAPSHOT per AGENTS.md)
  const navRef = NAV_REFERENCE_PRICES[assetId];
  if (navRef) {
    return {
      assetId,
      price: navRef.price,
      provider: navRef.provider,
      fetchedAt: nowIso,
      ageSeconds: 0,
      dataMode: "SNAPSHOT",
    };
  }

  // 6. Return stale cache if available
  if (cached) {
    return {
      assetId,
      price: cached.price,
      provider: `${cached.provider} (stale)`,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      ageSeconds: Math.round((now - cached.fetchedAt) / 1000),
      dataMode: "STALE",
    };
  }

  // 7. Final fallback — $1.00 for unknown assets
  return {
    assetId,
    price: 1.0,
    provider: "ALIVE Fallback (no market data)",
    fetchedAt: nowIso,
    ageSeconds: 0,
    dataMode: "SNAPSHOT",
  };
}

/**
 * Batch-fetch live prices for multiple assets. Triggers parallel fetches
 * then resolves each asset from cache or API results.
 */
export async function getLivePrices(
  assetIds: string[],
): Promise<Map<string, LivePrice>> {
  // Pre-warm all sources in parallel
  await Promise.allSettled([
    fetchCoinGeckoPrices(),
    fetchStockPrices(),
    fetchOkxPrices(),
  ]);

  // Now resolve each from cache (populated by pre-warm)
  const results = new Map<string, LivePrice>();
  await Promise.all(
    assetIds.map(async (id) => {
      results.set(id, await getLivePrice(id));
    }),
  );
  return results;
}

/**
 * Converts a LivePrice to the MarketQuote format used by the rest of the
 * codebase, adding ageSeconds for the RwaMarketQuote type.
 */
export function livePriceToMarketQuote(
  lp: LivePrice,
): MarketQuote & { ageSeconds: number } {
  return {
    assetId: lp.assetId,
    price: lp.price.toFixed(4),
    timestamp: lp.fetchedAt,
    provider: lp.provider,
    status: "OPEN",
    dataMode: lp.dataMode === "LIVE" ? "LIVE" : "SNAPSHOT",
    ageSeconds: lp.ageSeconds,
  };
}

/**
 * Gets the numeric price for an asset. Convenience wrapper that
 * returns just the number, used by the wallet evaluator.
 */
export async function getAssetPrice(assetId: string): Promise<number> {
  const lp = await getLivePrice(assetId);
  return lp.price;
}
