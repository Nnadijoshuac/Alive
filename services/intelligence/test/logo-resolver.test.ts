import { describe, expect, it, vi } from "vitest";

import {
  resolveFromCoinGecko,
  resolveFromTrustWallet,
  resolveTokenLogo,
} from "../src/data/logo-resolver.js";

const NOW = new Date("2026-08-18T00:00:00.000Z");
const ADDRESS = "0x1b19c19393e2d034d8ff31ff34c81252fcbbee92";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("resolveFromCoinGecko", () => {
  it("resolves a logo when CoinGecko's returned contract address matches the one requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "ousg",
        contract_address: ADDRESS,
        image: { large: "https://coin-images.coingecko.com/coins/images/29023/large/OUSG.png" },
      }),
    );
    const result = await resolveFromCoinGecko("Ethereum", ADDRESS, () => NOW, fetchMock);
    expect(result).toEqual({
      logoStatus: "RESOLVED",
      logoUrl: "https://coin-images.coingecko.com/coins/images/29023/large/OUSG.png",
      logoSource: "COINGECKO",
      logoSourceId: "ousg",
      logoContractAddress: ADDRESS,
      logoNetwork: "Ethereum",
      logoVerifiedAt: NOW.toISOString(),
    });
  });

  // The whole point of this resolver: never trust an API response's image
  // just because it came back with a 200 -- the identity must actually
  // match what was requested.
  it("refuses to resolve when the returned contract address does not match the requested one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "some-other-token",
        contract_address: "0x000000000000000000000000000000000000ff",
        image: { large: "https://example.com/wrong.png" },
      }),
    );
    const result = await resolveFromCoinGecko("Ethereum", ADDRESS, () => NOW, fetchMock);
    expect(result).toEqual({ logoStatus: "UNAVAILABLE" });
  });

  it("is unavailable for a network CoinGecko has no platform mapping for", async () => {
    const fetchMock = vi.fn();
    const result = await resolveFromCoinGecko("SomeUnmappedChain", ADDRESS, () => NOW, fetchMock);
    expect(result).toEqual({ logoStatus: "UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is unavailable, not an error, on a 404 (token not on CoinGecko)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    const result = await resolveFromCoinGecko("Ethereum", ADDRESS, () => NOW, fetchMock);
    expect(result).toEqual({ logoStatus: "UNAVAILABLE" });
  });

  it("is unavailable when the response has no image at all", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ id: "ousg", contract_address: ADDRESS }),
    );
    const result = await resolveFromCoinGecko("Ethereum", ADDRESS, () => NOW, fetchMock);
    expect(result).toEqual({ logoStatus: "UNAVAILABLE" });
  });

  it("retries on 429 and succeeds once the rate limit clears", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 429 }))
        .mockResolvedValueOnce(
          jsonResponse({
            id: "ousg",
            contract_address: ADDRESS,
            image: { large: "https://example.com/ousg.png" },
          }),
        );
      const pending = resolveFromCoinGecko("Ethereum", ADDRESS, () => NOW, fetchMock);
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await pending;
      expect(result.logoStatus).toBe("RESOLVED");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("resolveFromTrustWallet", () => {
  it("resolves when the address-keyed asset path exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const result = await resolveFromTrustWallet("Ethereum", ADDRESS, () => NOW, fetchMock);
    expect(result).toEqual({
      logoStatus: "RESOLVED",
      logoUrl: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${ADDRESS}/logo.png`,
      logoSource: "TRUST_WALLET",
      logoContractAddress: ADDRESS,
      logoNetwork: "Ethereum",
      logoVerifiedAt: NOW.toISOString(),
    });
  });

  it("is unavailable when the asset path does not exist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const result = await resolveFromTrustWallet("Ethereum", ADDRESS, () => NOW, fetchMock);
    expect(result).toEqual({ logoStatus: "UNAVAILABLE" });
  });
});

describe("resolveTokenLogo", () => {
  it("is unavailable for an asset with no network/tokenAddress -- never invents a logo", async () => {
    const result = await resolveTokenLogo({});
    expect(result).toEqual({ logoStatus: "UNAVAILABLE" });
  });

  it("falls back to Trust Wallet only when CoinGecko has nothing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 404)) // coingecko miss
      .mockResolvedValueOnce(new Response(null, { status: 200 })); // trust wallet hit
    const result = await resolveTokenLogo(
      { network: "Ethereum", tokenAddress: ADDRESS },
      () => NOW,
      fetchMock,
    );
    expect(result.logoStatus).toBe("RESOLVED");
    if (result.logoStatus === "RESOLVED") expect(result.logoSource).toBe("TRUST_WALLET");
  });

  it("is unavailable when neither source resolves", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const result = await resolveTokenLogo(
      { network: "Ethereum", tokenAddress: ADDRESS },
      () => NOW,
      fetchMock,
    );
    expect(result).toEqual({ logoStatus: "UNAVAILABLE" });
  });
});
