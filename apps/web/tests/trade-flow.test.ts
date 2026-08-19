import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPaymentTokens,
  getTradeAvailability,
  getTradeQuote,
  getTradeTransaction,
} from "@/lib/rwa-api";
import {
  XLAYER_MAINNET_CONFIG,
  isWalletAvailable,
} from "@/lib/rwa-trade";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("X Layer Trade Client & Flow", () => {
  it("XLAYER_MAINNET_CONFIG has exact X Layer parameters", () => {
    expect(XLAYER_MAINNET_CONFIG.chainIdDec).toBe(196);
    expect(XLAYER_MAINNET_CONFIG.chainIdHex).toBe("0xc4");
    expect(XLAYER_MAINNET_CONFIG.rpcUrls[0]).toBe("https://rpc.xlayer.tech");
    expect(XLAYER_MAINNET_CONFIG.blockExplorerUrls[0]).toContain("xlayer");
    expect(XLAYER_MAINNET_CONFIG.nativeCurrency.symbol).toBe("OKB");
  });

  it("fetches supported payment tokens on X Layer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        tokens: [
          {
            chainId: 196,
            symbol: "USDC",
            name: "USD Coin",
            contractAddress: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
            decimals: 6,
          },
          {
            chainId: 196,
            symbol: "USDT",
            name: "Tether USD",
            contractAddress: "0x1e4a5963abfd975d8c9021ce480b42188849d41d",
            decimals: 6,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await getPaymentTokens();
    expect(tokens.length).toBe(2);
    expect(tokens[0]!.symbol).toBe("USDC");
    expect(tokens[0]!.chainId).toBe(196);
  });

  it("checks trade availability for WMETAX", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        assetId: "meta-xstock",
        status: "AVAILABLE",
        chainId: 196,
        tokenAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
        symbol: "WMETAX",
        routerAddress: "0x789b70868a2d10ae8ee438992ad367f08c3d6118",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await getTradeAvailability("meta-xstock");
    expect(res.status).toBe("AVAILABLE");
    expect(res.chainId).toBe(196);
    expect(res.tokenAddress).toBe("0xe840946ffebcd66b7c4e95095effafadfa0d0e56");
  });

  it("requests trade quote with atomic precision", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        quote: {
          hasRoute: true,
          status: "AVAILABLE",
          provider: "OKX DEX",
          chainId: 196,
          fromToken: {
            symbol: "USDC",
            contractAddress: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
            decimals: 6,
            amount: "1000",
            amountRaw: "1000000000",
          },
          toToken: {
            symbol: "WMETAX",
            contractAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
            decimals: 18,
            estimatedAmount: "1.8175",
            estimatedAmountRaw: "1817500000000000000",
          },
          executionPrice: 550.21,
          priceImpactPct: 0.08,
          estimatedGasUsd: 0.02,
          minimumReceived: "1.8084",
          routeName: "OKX DEX Aggregator",
          routerAddress: "0x789b70868a2d10ae8ee438992ad367f08c3d6118",
          allowanceTarget: "0x789b70868a2d10ae8ee438992ad367f08c3d6118",
          quoteFetchedAt: "2026-08-17T00:00:00.000Z",
          expiresAt: "2026-08-17T00:01:00.000Z",
        },
        targetAsset: {
          assetId: "meta-xstock",
          symbol: "WMETAX",
          name: "Wrapped Meta xStock",
          contractAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
          chainId: 196,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await getTradeQuote({
      assetId: "meta-xstock",
      fromTokenAddress: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
      amount: "1000",
    });

    expect(res.quote.hasRoute).toBe(true);
    expect(res.quote.fromToken.amount).toBe("1000");
    expect(res.quote.toToken.estimatedAmount).toBe("1.8175");
    expect(res.targetAsset.contractAddress).toBe(
      "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
    );
  });

  it("constructs swap transaction for user's connected wallet without server custody", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        transaction: {
          chainId: 196,
          to: "0x789b70868a2d10ae8ee438992ad367f08c3d6118",
          data: "0x38ed173900000000000000000000000000000000",
          value: "0x0",
          gasLimit: "250000",
          allowanceTarget: "0x789b70868a2d10ae8ee438992ad367f08c3d6118",
          quote: {
            hasRoute: true,
            status: "AVAILABLE",
            provider: "OKX DEX",
            chainId: 196,
            fromToken: { symbol: "USDC", contractAddress: "0x74b7f16337b8972027f6196a17a631ac6de26d22", decimals: 6, amount: "100", amountRaw: "100000000" },
            toToken: { symbol: "WMETAX", contractAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56", decimals: 18, estimatedAmount: "0.18", estimatedAmountRaw: "180000000000000000" },
            executionPrice: 550,
            priceImpactPct: 0.05,
            estimatedGasUsd: 0.02,
            minimumReceived: "0.179",
            routeName: "OKX Aggregator",
            routerAddress: "0x789b70868a2d10ae8ee438992ad367f08c3d6118",
            allowanceTarget: "0x789b70868a2d10ae8ee438992ad367f08c3d6118",
            quoteFetchedAt: "2026-08-17T00:00:00.000Z",
            expiresAt: "2026-08-17T00:01:00.000Z",
          },
        },
        targetAsset: {
          assetId: "meta-xstock",
          symbol: "WMETAX",
          contractAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await getTradeTransaction({
      assetId: "meta-xstock",
      fromTokenAddress: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
      amount: "100",
      userWalletAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(res.transaction.chainId).toBe(196);
    expect(res.transaction.to).toBe("0x789b70868a2d10ae8ee438992ad367f08c3d6118");
    expect(res.transaction.data.startsWith("0x")).toBe(true);
  });
});
