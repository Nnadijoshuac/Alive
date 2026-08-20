import { describe, expect, it, vi } from "vitest";
import {
  CoinMarketCapPublicProvider,
  CMC_DATA_DETAIL_URL,
  CMC_MARKET_PAIRS_URL,
  CMC_PUBLIC_MAP_URL,
} from "../src/coinmarketcap.js";

const MOCK_MAP_RESPONSE = {
  data: [
    {
      id: 37211,
      name: "Wrapped Meta Tokenized stock (xStock)",
      symbol: "WMETAX",
      slug: "wrapped-meta-tokenized-stock-xstock",
      rank: 2915,
      is_active: 1,
      platform: {
        id: 216,
        name: "X Layer",
        symbol: "OKB",
        slug: "okb",
        token_address: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
      },
    },
    {
      id: 37006,
      name: "SP500 tokenized ETF (xStock)",
      symbol: "SPYX",
      slug: "sp500-tokenized-stock-xstock",
      rank: 328,
      is_active: 1,
      platform: {
        id: 16,
        name: "Solana",
        symbol: "SOL",
        slug: "solana",
        token_address: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
      },
    },
    {
      id: 1001,
      name: "Unrelated Meta Token",
      symbol: "META",
      slug: "meta-token",
      platform: {
        id: 1,
        name: "Ethereum",
        token_address: "0x1111111111111111111111111111111111111111",
      },
    },
  ],
};

const MOCK_DETAIL_WMETAX = {
  data: {
    id: 37211,
    name: "Wrapped Meta Tokenized stock (xStock)",
    symbol: "WMETAX",
    slug: "wrapped-meta-tokenized-stock-xstock",
    category: "token",
    statistics: {
      price: 549.101265,
      priceChangePercentage24h: -0.018,
      marketCap: 112148.01,
      volume24h: 22892.52,
      totalOnchainLiquidity: 192264.02,
      circulatingSupply: 204.239,
      totalSupply: 204.239,
    },
    holders: {
      holderCount: 142,
    },
  },
  status: {
    timestamp: "2026-08-19T14:47:47.000Z",
  },
};

const MOCK_PAIRS_WMETAX = {
  data: {
    id: 37211,
    name: "Wrapped Meta Tokenized stock (xStock)",
    symbol: "WMETAX",
    numMarketPairs: 1,
    marketPairs: [
      {
        exchangeName: "Uniswap v3 (X Layer)",
        exchangeSlug: "uniswap-v3-x-layer",
        marketPair: "USDG/WMETAX",
        baseSymbol: "USDG",
        quoteSymbol: "WMETAX",
        price: 549.101,
        volumeUsd: 22892.52,
        liquidity: 192264.02,
        lastUpdated: "2026-08-19T14:47:47.000Z",
      },
    ],
  },
};

describe("CoinMarketCapPublicProvider", () => {
  it("resolves WMETAX strictly contract-first on X Layer (chainId 196)", async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr === CMC_PUBLIC_MAP_URL) {
        return new Response(JSON.stringify(MOCK_MAP_RESPONSE), { status: 200 });
      }
      if (urlStr.includes("id=37211")) {
        return new Response(JSON.stringify(MOCK_DETAIL_WMETAX), { status: 200 });
      }
      if (urlStr.includes("slug=wrapped-meta-tokenized-stock-xstock")) {
        return new Response(JSON.stringify(MOCK_PAIRS_WMETAX), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    const now = new Date("2026-08-19T14:50:00.000Z");
    const provider = new CoinMarketCapPublicProvider({
      fetchImpl: mockFetch as unknown as typeof fetch,
      now: () => now,
    });

    const context = await provider.getMarketContext({
      id: "meta-xstock",
      symbol: "WMETAX",
      deployments: [
        {
          chainId: 196,
          contractAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
          deploymentStatus: "VERIFIED",
        },
      ],
    });

    expect(context.provider).toBe("coinmarketcap");
    expect(context.providerMode).toBe("KEYLESS_PUBLIC");
    expect(context.dataMode).toBe("LIVE");
    expect(context.priceUsd).toBeCloseTo(549.101265);
    expect(context.volume24hUsd).toBeCloseTo(22892.52);
    expect(context.liquidityUsd).toBeCloseTo(192264.02);
    expect(context.marketCapUsd).toBeCloseTo(112148.01);
    expect(context.dex?.exchangeName).toBe("Uniswap v3 (X Layer)");
    expect(context.dex?.pair).toBe("USDG/WMETAX");
    expect(context.contractAddress).toBe("0xe840946ffebcd66b7c4e95095effafadfa0d0e56");
  });

  it("prevents symbol collision and returns UNAVAILABLE when contract does not match on X Layer (e.g. SPYX)", async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr === CMC_PUBLIC_MAP_URL) {
        return new Response(JSON.stringify(MOCK_MAP_RESPONSE), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    const now = new Date("2026-08-19T14:50:00.000Z");
    const provider = new CoinMarketCapPublicProvider({
      fetchImpl: mockFetch as unknown as typeof fetch,
      now: () => now,
    });

    // SPYX has Solana address in CMC mock, but X Layer address 0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48
    const context = await provider.getMarketContext({
      id: "spyx-xstock",
      symbol: "SPYX",
      deployments: [
        {
          chainId: 196,
          contractAddress: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
          deploymentStatus: "VERIFIED",
        },
      ],
    });

    // Must NOT fall back to Solana SPYX or fake X Layer price!
    expect(context.dataMode).toBe("UNAVAILABLE");
    expect(context.priceUsd).toBeUndefined();
    expect(context.reason).toContain("not indexed in CoinMarketCap");
  });

  it("does not require API key and never calls x402 paid endpoints", async () => {
    const calledUrls: string[] = [];
    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      calledUrls.push(urlStr);
      // Ensure no API keys or paid auth headers were passed
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers["X-CMC_PRO_API_KEY"]).toBeUndefined();
      expect(headers["x402-payment"]).toBeUndefined();

      if (urlStr === CMC_PUBLIC_MAP_URL) {
        return new Response(JSON.stringify(MOCK_MAP_RESPONSE), { status: 200 });
      }
      if (urlStr.includes("id=37211")) {
        return new Response(JSON.stringify(MOCK_DETAIL_WMETAX), { status: 200 });
      }
      if (urlStr.includes("slug=wrapped-meta-tokenized-stock-xstock")) {
        return new Response(JSON.stringify(MOCK_PAIRS_WMETAX), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    const provider = new CoinMarketCapPublicProvider({
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    await provider.getMarketContext("meta-xstock");

    expect(calledUrls.every((u) => !u.includes("/x402/"))).toBe(true);
  });

  it("returns cached observation as STALE when provider fails on subsequent poll", async () => {
    let failFetch = false;
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      if (failFetch) throw new Error("Network timeout");
      const urlStr = url.toString();
      if (urlStr === CMC_PUBLIC_MAP_URL) {
        return new Response(JSON.stringify(MOCK_MAP_RESPONSE), { status: 200 });
      }
      if (urlStr.includes("id=37211")) {
        return new Response(JSON.stringify(MOCK_DETAIL_WMETAX), { status: 200 });
      }
      if (urlStr.includes("slug=wrapped-meta-tokenized-stock-xstock")) {
        return new Response(JSON.stringify(MOCK_PAIRS_WMETAX), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    let mockTime = new Date("2026-08-19T14:50:00.000Z");
    const provider = new CoinMarketCapPublicProvider({
      fetchImpl: mockFetch as unknown as typeof fetch,
      now: () => mockTime,
      cacheTtlMs: 10_000,
    });

    const first = await provider.getMarketContext("meta-xstock");
    expect(first.dataMode).toBe("LIVE");

    // Advance time past cache TTL and make network fail
    mockTime = new Date("2026-08-19T14:55:00.000Z");
    failFetch = true;

    const second = await provider.getMarketContext("meta-xstock");
    expect(second.dataMode).toBe("STALE");
    expect(second.priceUsd).toBeCloseTo(549.101265);
    expect(second.reason).toContain("serving cached observation");
  });
});
