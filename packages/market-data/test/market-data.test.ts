import { describe, expect, it, vi } from "vitest";

import {
  ChainlinkDataStreamsProvider,
  ControllableDemoMarketDataProvider,
  DemoMarketDataProvider,
  MarketDataError,
  chainlinkConfigFromEnvironment,
  normalizeChainlinkQuote,
  type ChainlinkClientFactory,
} from "../src/index.js";

const OBSERVED_AT = 1_725_000_000;

function baseReport(version: string) {
  return { version, observationsTimestamp: OBSERVED_AT };
}

describe("normalizeChainlinkQuote", () => {
  it("normalizes V3 bid, ask, and price without floating-point arithmetic", () => {
    expect(
      normalizeChainlinkQuote(
        "demo:asset",
        {
          ...baseReport("V3"),
          price: 10_250_000n,
          bid: 10_240_000n,
          ask: 10_260_000n,
        },
        6,
      ),
    ).toEqual({
      assetId: "demo:asset",
      price: "10.25",
      bid: "10.24",
      ask: "10.26",
      mid: "10.25",
      timestamp: "2024-08-30T06:40:00.000Z",
      provider: "CHAINLINK_DATA_STREAMS_V3",
      dataMode: "LIVE",
      status: "UNKNOWN",
    });
  });

  it("uses the RWA update timestamp and correct Chainlink market-status codes", () => {
    const open = normalizeChainlinkQuote("rwa:fund", {
      ...baseReport("V8"),
      midPrice: 102_500_000_000_000_000_000n,
      lastUpdateTimestamp: 1_725_000_123,
      marketStatus: 2,
    });
    const closed = normalizeChainlinkQuote("rwa:fund", {
      ...baseReport("V4"),
      price: 102_500_000_000_000_000_000n,
      marketStatus: 1,
    });

    expect(open).toMatchObject({
      price: "102.5",
      status: "OPEN",
      timestamp: "2024-08-30T06:42:03.000Z",
    });
    expect(closed.status).toBe("CLOSED");
  });

  it("uses tokenizedPrice for V10 and halts a ripcord NAV report", () => {
    expect(
      normalizeChainlinkQuote("rwa:equity", {
        ...baseReport("V10"),
        price: 100_000_000_000_000_000_000n,
        tokenizedPrice: 101_000_000_000_000_000_000n,
        lastUpdateTimestamp: OBSERVED_AT,
        marketStatus: 2,
      }).price,
    ).toBe("101");

    expect(
      normalizeChainlinkQuote("rwa:nav", {
        ...baseReport("V9"),
        navPerShare: 99_000_000_000_000_000_000n,
        navDate: OBSERVED_AT,
        ripcord: 1,
      }).status,
    ).toBe("HALTED");
  });

  it("rejects rate reports and negative prices", () => {
    expect(() =>
      normalizeChainlinkQuote("rwa:rate", {
        ...baseReport("V5"),
        rate: 500n,
      }),
    ).toThrowError(MarketDataError);
    expect(() =>
      normalizeChainlinkQuote("rwa:bad", {
        ...baseReport("V2"),
        price: -1n,
      }),
    ).toThrow("negative asset price");
  });
});

describe("ChainlinkDataStreamsProvider", () => {
  it("fails closed when disabled or missing server credentials", () => {
    const factory = vi.fn<ChainlinkClientFactory>();
    expect(
      () =>
        new ChainlinkDataStreamsProvider(
          { enabled: false, feedIds: {} },
          factory,
        ),
    ).toThrow("disabled");
    expect(
      () =>
        new ChainlinkDataStreamsProvider(
          { enabled: true, feedIds: {} },
          factory,
        ),
    ).toThrow("credentials");
  });

  it("keeps credentials in the client factory and maps configured feeds", async () => {
    const getLatestDecodedReport = vi.fn().mockResolvedValue({
      ...baseReport("V4"),
      price: 1_000_000n,
      marketStatus: 2,
    });
    const factory = vi.fn<ChainlinkClientFactory>(() => ({
      getLatestDecodedReport,
    }));
    const provider = new ChainlinkDataStreamsProvider(
      {
        enabled: true,
        username: "server-key",
        password: "server-secret",
        feedIds: { "rwa:cash": "0xfeed" },
        decimals: { "rwa:cash": 6 },
      },
      factory,
    );

    await expect(provider.getQuote("rwa:cash")).resolves.toMatchObject({
      assetId: "rwa:cash",
      price: "1",
      status: "OPEN",
    });
    expect(factory).toHaveBeenCalledWith({
      apiKey: "server-key",
      userSecret: "server-secret",
      endpoint: "https://api.dataengine.chain.link",
      wsEndpoint: "wss://ws.dataengine.chain.link",
    });
    expect(getLatestDecodedReport).toHaveBeenCalledWith("0xfeed");
  });

  it("loads only explicit server environment variables", () => {
    expect(
      chainlinkConfigFromEnvironment({
        CHAINLINK_DATA_STREAMS_ENABLED: "true",
        CHAINLINK_DATA_STREAMS_USERNAME: "key",
        CHAINLINK_DATA_STREAMS_PASSWORD: "secret",
        CHAINLINK_DATA_STREAMS_ENDPOINT: "https://example.invalid",
        CHAINLINK_DATA_STREAMS_WS_ENDPOINT: "wss://example.invalid",
      }),
    ).toMatchObject({
      enabled: true,
      username: "key",
      password: "secret",
      endpoint: "https://example.invalid",
      wsEndpoint: "wss://example.invalid",
    });
  });
});

describe("DemoMarketDataProvider", () => {
  it("labels deterministic fixtures as demo data and deduplicates requests", async () => {
    const provider = new DemoMarketDataProvider(
      undefined,
      () => new Date("2026-08-14T20:00:00.000Z"),
    );
    const quotes = await provider.getQuotes(["tusdc", "tusdc"]);

    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      assetId: "tusdc",
      dataMode: "DEMO",
      provider: "ALIVE_DEMO_MARKET",
      timestamp: "2026-08-14T20:00:00.000Z",
    });
    await expect(provider.health()).resolves.toMatchObject({
      dataMode: "DEMO",
      message: expect.stringContaining("not live market data"),
    });
  });
});

describe("ControllableDemoMarketDataProvider", () => {
  const NOW = new Date("2026-08-16T12:00:00.000Z");

  it("returns normal fresh demo quotes when no override is set", async () => {
    const provider = new ControllableDemoMarketDataProvider(undefined, () => NOW);
    const quote = await provider.getQuote("ttbill-a");
    expect(quote.timestamp).toBe(NOW.toISOString());
    expect(quote.dataMode).toBe("DEMO");
  });

  it("backdates only the overridden asset, leaving others fresh", async () => {
    const provider = new ControllableDemoMarketDataProvider(undefined, () => NOW);
    provider.setOverride("ttbill-a", { ageSeconds: 31 * 3_600 });

    const stale = await provider.getQuote("ttbill-a");
    const fresh = await provider.getQuote("tgold");

    const staleAgeHours =
      (NOW.getTime() - Date.parse(stale.timestamp)) / 3_600_000;
    expect(staleAgeHours).toBeCloseTo(31, 5);
    expect(fresh.timestamp).toBe(NOW.toISOString());
    // A degraded quote is still unmistakably demo data.
    expect(stale.dataMode).toBe("DEMO");
  });

  it("restores freshness when the override is cleared", async () => {
    const provider = new ControllableDemoMarketDataProvider(undefined, () => NOW);
    provider.setOverride("ttbill-a", { ageSeconds: 31 * 3_600 });
    provider.clearOverride("ttbill-a");
    expect((await provider.getQuote("ttbill-a")).timestamp).toBe(
      NOW.toISOString(),
    );
  });

  it("can force a market status such as HALTED", async () => {
    const provider = new ControllableDemoMarketDataProvider(undefined, () => NOW);
    provider.setOverride("tgold", { status: "HALTED" });
    expect((await provider.getQuote("tgold")).status).toBe("HALTED");
  });

  it("rejects a negative age and reports degradation in health", async () => {
    const provider = new ControllableDemoMarketDataProvider(undefined, () => NOW);
    expect(() => provider.setOverride("tgold", { ageSeconds: -1 })).toThrow();

    expect((await provider.health()).status).toBe("HEALTHY");
    provider.setOverride("tgold", { ageSeconds: 10 });
    const degraded = await provider.health();
    expect(degraded.status).toBe("DEGRADED");
    expect(degraded.dataMode).toBe("DEMO");

    provider.clearAllOverrides();
    expect((await provider.health()).status).toBe("HEALTHY");
  });
});
