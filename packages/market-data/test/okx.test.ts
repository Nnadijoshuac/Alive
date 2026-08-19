import { describe, expect, it, vi } from "vitest";
import {
  OkxMarketProvider,
  OkxTradeRouter,
  XLAYER_KNOWN_POOLS,
  XLAYER_PAYMENT_TOKENS,
} from "../src/index.js";

describe("OkxMarketProvider", () => {
  it("recognizes verified X Layer assets by assetId", () => {
    const provider = new OkxMarketProvider();
    expect(provider.supportsAsset("meta-xstock")).toBe(true);
    expect(provider.supportsAsset("spyx-xstock")).toBe(true);
    expect(provider.supportsAsset("nvidia-xstock")).toBe(true);
    expect(provider.supportsAsset("unknown-asset")).toBe(false);
  });

  it("resolves exact verified contracts for X Layer xStocks", () => {
    const provider = new OkxMarketProvider();
    expect(provider.getContractForAsset("meta-xstock")).toBe(
      "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
    );
    expect(provider.getContractForAsset("spyx-xstock")).toBe(
      "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
    );
  });

  it("normalizes live price data correctly from provider response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          attributes: {
            symbol: "wMETAx",
            price_usd: "548.2850",
            price_change_percentage: { h24: "0.42" },
            volume_usd: { h24: "125000" },
            total_reserve_in_usd: "100660",
            fdv_usd: "101946",
          },
        },
      }),
    });

    const provider = new OkxMarketProvider({
      fetchImpl: mockFetch as any,
    });

    const liveData = await provider.getLiveTokenData("meta-xstock");
    expect(liveData.symbol).toBe("wMETAx");
    expect(liveData.priceUsd).toBe(548.285);
    expect(liveData.priceChange24hPct).toBe(0.42);
    expect(liveData.liquidityUsd).toBe(100660);
    expect(liveData.status).toBe("LIVE");
    expect(liveData.chainId).toBe(196);
    expect(liveData.contractAddress).toBe("0xe840946ffebcd66b7c4e95095effafadfa0d0e56");

    const quote = await provider.getQuote("meta-xstock");
    expect(quote.assetId).toBe("meta-xstock");
    expect(quote.price).toBe("548.2850");
    expect(quote.dataMode).toBe("LIVE");
    expect(quote.onchainSource?.network).toBe("X Layer");
  });

  it("caches responses within short TTL to prevent API hammering", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          attributes: {
            symbol: "SPYx",
            price_usd: "598.12",
          },
        },
      }),
    });

    const provider = new OkxMarketProvider({
      fetchImpl: mockFetch as any,
      cacheTtlMs: 5000,
    });

    await provider.getQuote("spyx-xstock");
    await provider.getQuote("spyx-xstock");
    await provider.getQuote("spyx-xstock");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("OkxTradeRouter", () => {
  it("contains verified X Layer payment tokens with exact addresses and decimals", () => {
    expect(XLAYER_PAYMENT_TOKENS.USDC).toMatchObject({
      chainId: 196,
      symbol: "USDC",
      contractAddress: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
      decimals: 6,
    });
    expect(XLAYER_PAYMENT_TOKENS.USDT).toMatchObject({
      chainId: 196,
      symbol: "USDT",
      contractAddress: "0x1e4a5963abfd975d8c9021ce480b42188849d41d",
      decimals: 6,
    });
  });

  it("generates swap quote with execution price and minimum received for WMETAX", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          attributes: {
            symbol: "wMETAx",
            decimals: 18,
            price_usd: "500.0",
            total_reserve_in_usd: "100000",
          },
        },
      }),
    });

    const router = new OkxTradeRouter({
      fetchImpl: mockFetch as any,
    });

    const quote = await router.getQuote({
      chainId: 196,
      fromTokenAddress: XLAYER_PAYMENT_TOKENS.USDC.contractAddress,
      toTokenAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
      fromAmount: "1000",
      slippageBps: 50, // 0.5%
    });

    expect(quote.hasRoute).toBe(true);
    expect(quote.status).toBe("AVAILABLE");
    expect(quote.chainId).toBe(196);
    expect(quote.fromToken.symbol).toBe("USDC");
    expect(quote.fromToken.amount).toBe("1000");
    expect(quote.toToken.symbol).toBe("wMETAx");
    expect(parseFloat(quote.toToken.estimatedAmount)).toBeCloseTo(2.0, 1);
    expect(parseFloat(quote.minimumReceived)).toBeCloseTo(1.99, 2);
    expect(quote.quoteFetchedAt).toBeDefined();
    expect(quote.expiresAt).toBeDefined();
    expect(quote.routerAddress).toBeDefined();
  });

  it("honestly returns NO_ROUTE when target contract has 0 liquidity (e.g. SPYX)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          attributes: {
            symbol: "SPYx",
            decimals: 18,
            price_usd: null,
            total_reserve_in_usd: "0",
          },
        },
      }),
    });

    const router = new OkxTradeRouter({
      fetchImpl: mockFetch as any,
    });

    const quote = await router.getQuote({
      chainId: 196,
      fromTokenAddress: XLAYER_PAYMENT_TOKENS.USDC.contractAddress,
      toTokenAddress: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
      fromAmount: "100",
    });

    expect(quote.hasRoute).toBe(false);
    expect(quote.status).toBe("NO_ROUTE");
    expect(quote.reason).toContain("No active liquidity pool route found on X Layer");
  });

  it("constructs swap transaction calldata targeting X Layer router", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          attributes: {
            symbol: "wMETAx",
            decimals: 18,
            price_usd: "500.0",
            total_reserve_in_usd: "100000",
          },
        },
      }),
    });

    const router = new OkxTradeRouter({
      fetchImpl: mockFetch as any,
    });

    const tx = await router.getSwapTransaction({
      chainId: 196,
      fromTokenAddress: XLAYER_PAYMENT_TOKENS.USDC.contractAddress,
      toTokenAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
      fromAmount: "100",
      userWalletAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(tx.chainId).toBe(196);
    expect(tx.to.startsWith("0x")).toBe(true);
    expect(tx.data.startsWith("0x")).toBe(true);
    expect(tx.value).toBe("0x0");
    expect(tx.allowanceTarget).toBeDefined();
  });
});
