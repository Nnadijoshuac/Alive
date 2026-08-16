import { describe, expect, it } from "vitest";
import { MarketQuoteSchema } from "@alive/shared";

import {
  ChainlinkDataFeedProvider,
  scaleAnswer,
  type ChainlinkReader,
} from "../src/chainlink-data-feed.js";
import { CHAINLINK_FEEDS, feedForAsset } from "../src/chainlink-feeds.js";
import { MarketDataError } from "../src/provider.js";

const NOW = new Date("2026-08-16T19:00:00.000Z");
const nowSeconds = Math.floor(NOW.getTime() / 1_000);

/** Mocks only the RPC transport; all provider logic runs for real. */
function reader(
  overrides: {
    decimals?: number;
    description?: string;
    answer?: bigint;
    updatedAt?: bigint;
    roundId?: bigint;
    blockNumber?: bigint;
    fail?: Error;
  } = {},
): ChainlinkReader {
  return {
    async readFeed() {
      if (overrides.fail) throw overrides.fail;
      return {
        decimals: overrides.decimals ?? 6,
        description: overrides.description ?? "USTB NAV per Share",
        round: [
          overrides.roundId ?? 36_893_488_147_419_104_003n,
          overrides.answer ?? 11_177_748n,
          BigInt(nowSeconds - 4_000),
          overrides.updatedAt ?? BigInt(nowSeconds - 3_600),
          overrides.roundId ?? 36_893_488_147_419_104_003n,
        ] as const,
        blockNumber: overrides.blockNumber ?? 25_769_678n,
      };
    },
  };
}

describe("scaleAnswer", () => {
  it("scales integers at feed decimals without floating point", () => {
    expect(scaleAnswer(11_177_748n, 6)).toBe("11.177748");
    expect(scaleAnswer(115_333_588n, 8)).toBe("1.15333588");
    expect(scaleAnswer(100_000_000n, 8)).toBe("1");
    expect(scaleAnswer(1n, 18)).toBe("0.000000000000000001");
    expect(scaleAnswer(0n, 8)).toBe("0");
  });

  it("refuses a negative answer rather than coercing it", () => {
    expect(() => scaleAnswer(-1n, 8)).toThrow(MarketDataError);
  });
});

describe("ChainlinkDataFeedProvider", () => {
  it("produces a schema-valid LIVE quote carrying full source provenance", async () => {
    const provider = new ChainlinkDataFeedProvider(reader(), () => NOW);
    const quote = await provider.getQuote("ttbill-a");

    // The canonical schema is the real contract, so parse rather than eyeball.
    const parsed = MarketQuoteSchema.parse(quote);
    expect(parsed.dataMode).toBe("LIVE");
    expect(parsed.provider).toBe("CHAINLINK");
    expect(parsed.price).toBe("11.177748");
    expect(parsed.status).toBe("OPEN");

    expect(parsed.onchainSource).toMatchObject({
      network: "Ethereum",
      chainId: 1,
      feedAddress: CHAINLINK_FEEDS["ustb-nav"].address,
      decimals: 6,
      blockNumber: 25_769_678,
      description: "USTB NAV per Share",
    });
    // The quote's timestamp is the feed's updatedAt, not the fetch time.
    expect(parsed.timestamp).toBe(parsed.onchainSource?.sourceUpdatedAt);
    expect(parsed.onchainSource?.observedAt).toBe(NOW.toISOString());
  });

  it("respects each feed's own decimals rather than assuming 8", async () => {
    // USTB is a 6-decimal feed. Reading it as 8 would silently divide the
    // NAV by 100 and still look plausible.
    const provider = new ChainlinkDataFeedProvider(
      reader({ decimals: 6, answer: 11_177_748n }),
      () => NOW,
    );
    expect((await provider.getQuote("ttbill-a")).price).toBe("11.177748");

    const eightDp = new ChainlinkDataFeedProvider(
      reader({ decimals: 8, description: "TBILL NAV", answer: 115_333_588n }),
      () => NOW,
    );
    expect((await eightDp.getQuote("ttbill-c")).price).toBe("1.15333588");
  });

  it("marks a value stale against that feed's own bound, not a global one", async () => {
    // 30h old. Fine for a 4-day NAV bound, stale for a 30h reserve bound.
    const staleSeconds = BigInt(nowSeconds - 30 * 3_600);

    const nav = new ChainlinkDataFeedProvider(
      reader({ updatedAt: staleSeconds }),
      () => NOW,
    );
    expect((await nav.getQuote("ttbill-a")).status).toBe("OPEN");

    const reserves = new ChainlinkDataFeedProvider(
      reader({
        updatedAt: BigInt(nowSeconds - 31 * 3_600),
        description: "KAU Reserves",
        decimals: 18,
      }),
      () => NOW,
    );
    expect((await reserves.getQuote("tgold")).status).toBe("UNKNOWN");
  });

  it("refuses a feed whose description does not match the configured asset", async () => {
    // Guards against a mistyped or repointed address silently pricing one
    // asset off another.
    const provider = new ChainlinkDataFeedProvider(
      reader({ description: "ETH / USD" }),
      () => NOW,
    );
    await expect(provider.getQuote("ttbill-a")).rejects.toMatchObject({
      code: "REPORT_INVALID",
    });
  });

  it("rejects an incomplete round, a zero answer, and a future timestamp", async () => {
    const incomplete = new ChainlinkDataFeedProvider(
      reader({ updatedAt: 0n }),
      () => NOW,
    );
    await expect(incomplete.getQuote("ttbill-a")).rejects.toMatchObject({
      code: "REPORT_INVALID",
    });

    const zero = new ChainlinkDataFeedProvider(
      reader({ answer: 0n }),
      () => NOW,
    );
    await expect(zero.getQuote("ttbill-a")).rejects.toMatchObject({
      code: "REPORT_INVALID",
    });

    const future = new ChainlinkDataFeedProvider(
      reader({ updatedAt: BigInt(nowSeconds + 600) }),
      () => NOW,
    );
    await expect(future.getQuote("ttbill-a")).rejects.toMatchObject({
      code: "REPORT_INVALID",
    });
  });

  it("surfaces an unreachable RPC as unavailable and never as fresh data", async () => {
    const provider = new ChainlinkDataFeedProvider(
      reader({ fail: new Error("fetch failed: ECONNREFUSED") }),
      () => NOW,
    );
    // The critical property: failure must not resolve to a quote at all.
    await expect(provider.getQuote("ttbill-a")).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });

    const health = await provider.health();
    expect(health.status).toBe("OFFLINE");
    expect(health.dataMode).toBe("LIVE");
  });

  it("rejects an unconfigured asset instead of inventing a feed", async () => {
    const provider = new ChainlinkDataFeedProvider(reader(), () => NOW);
    await expect(provider.getQuote("not-a-real-asset")).rejects.toMatchObject({
      code: "ASSET_NOT_SUPPORTED",
    });
  });

  it("omits assets it cannot serve from a bulk read rather than faking them", async () => {
    const provider = new ChainlinkDataFeedProvider(reader(), () => NOW);
    const quotes = await provider.getQuotes(["ttbill-a", "not-a-real-asset"]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.assetId).toBe("ttbill-a");
  });

  it("reports DEGRADED health when reachable but the primary feed is stale", async () => {
    const provider = new ChainlinkDataFeedProvider(
      reader({ updatedAt: BigInt(nowSeconds - 5 * 24 * 3_600) }),
      () => NOW,
    );
    expect((await provider.health()).status).toBe("DEGRADED");
  });
});

describe("feed registry", () => {
  it("is RWA-specific: every wired feed is a NAV, reserve, or AUM signal", () => {
    for (const [key, feed] of Object.entries(CHAINLINK_FEEDS)) {
      expect(
        ["NAV_PER_SHARE", "RESERVE_QUANTITY", "AUM"],
        `${key} should describe the asset itself, not a market price`,
      ).toContain(feed.valueKind);
    }
  });

  it("gives every feed a per-feed staleness bound of at least its heartbeat", () => {
    for (const [key, feed] of Object.entries(CHAINLINK_FEEDS)) {
      expect(
        feed.maxAgeSeconds,
        `${key} must not be stale before its own heartbeat elapses`,
      ).toBeGreaterThanOrEqual(feed.heartbeatSeconds);
      expect(feed.freshnessRationale.length).toBeGreaterThan(20);
    }
  });

  it("maps ALIVE demo assets to feeds and back", () => {
    expect(feedForAsset("ttbill-a")?.key).toBe("ustb-nav");
    expect(feedForAsset("tgold")?.product).toBe("Proof of Reserve");
    expect(feedForAsset("nope")).toBeUndefined();
  });
});
