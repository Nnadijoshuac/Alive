import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FixedDecimalStringSchema,
  MarketQuoteSchema,
  MarketSnapshotSchema,
  compareFixedDecimals,
  hashMarketSnapshot,
  type MarketSnapshotInput,
} from "../src/index.js";

describe("market schemas", () => {
  it("keeps prices out of floating-point numbers and canonicalizes strings", () => {
    expect(FixedDecimalStringSchema.parse("100.230000")).toBe("100.23");
    expect(FixedDecimalStringSchema.safeParse(100.23).success).toBe(false);
    expect(FixedDecimalStringSchema.safeParse("1e6").success).toBe(false);
    expect(FixedDecimalStringSchema.safeParse("01.00").success).toBe(false);
    expect(compareFixedDecimals("1.1", "1.09")).toBe(1);
  });

  it("rejects incoherent bid, ask, and mid fields", () => {
    const quote = {
      assetId: "tgold",
      price: "2450.50",
      timestamp: "2026-08-14T12:00:00.000Z",
      provider: "ALIVE Demo Market Provider",
      status: "OPEN",
      dataMode: "DEMO",
      bid: "2451",
      ask: "2450",
      mid: "2450.5",
    };
    expect(MarketQuoteSchema.safeParse(quote).success).toBe(false);
  });

  it("parses and sorts the frozen demo snapshot", () => {
    const fixturePath = fileURLToPath(
      new URL(
        "../../../data/fixtures/market-snapshot.demo.json",
        import.meta.url,
      ),
    );
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    const snapshot = MarketSnapshotSchema.parse(fixture);
    expect(snapshot.dataMode).toBe("DEMO");
    expect(snapshot.quotes.length).toBeGreaterThanOrEqual(8);
    expect(snapshot.quotes.map((quote) => quote.assetId)).toEqual(
      [...snapshot.quotes.map((quote) => quote.assetId)].sort(),
    );
    expect(hashMarketSnapshot(snapshot)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects duplicate assets and future-dated quotes", () => {
    const quote = {
      assetId: "tusdc",
      price: "1",
      timestamp: "2026-08-14T12:00:01.000Z",
      provider: "ALIVE Demo Market Provider",
      status: "OPEN" as const,
      dataMode: "DEMO" as const,
    };
    const snapshot: MarketSnapshotInput = {
      version: 1,
      dataMode: "DEMO",
      capturedAt: "2026-08-14T12:00:00.000Z",
      quotes: [quote, quote],
    };
    expect(MarketSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});

describe("onchain source provenance", () => {
  const source = {
    network: "Ethereum",
    chainId: 1,
    feedAddress: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as const,
    description: "ETH / USD",
    decimals: 8,
    roundId: "129127208515966893834",
    sourceUpdatedAt: "2026-08-16T12:00:00.000Z",
    observedAt: "2026-08-16T12:05:00.000Z",
    blockNumber: 25769584,
  };
  const liveQuote = {
    assetId: "tgold",
    price: "4377.24",
    timestamp: "2026-08-16T12:00:00.000Z",
    provider: "CHAINLINK",
    status: "OPEN" as const,
    dataMode: "LIVE" as const,
    onchainSource: source,
  };

  it("accepts a live quote carrying full provenance", () => {
    const parsed = MarketQuoteSchema.parse(liveQuote);
    expect(parsed.onchainSource?.chainId).toBe(1);
    expect(parsed.onchainSource?.feedAddress).toBe(source.feedAddress);
  });

  it("allows a live quote without contract provenance (e.g. a signed offchain report)", () => {
    // Data Streams reports are live but signed offchain rather than read
    // from a contract, so contract provenance is not required of every LIVE
    // quote -- only of quotes that claim to have been read onchain.
    const { onchainSource: _drop, ...bare } = liveQuote;
    expect(MarketQuoteSchema.safeParse(bare).success).toBe(true);
  });

  it("rejects a live quote attributed to a demo provider", () => {
    const { onchainSource: _drop, ...bare } = liveQuote;
    expect(
      MarketQuoteSchema.safeParse({
        ...bare,
        provider: "ALIVE Demo Market Provider",
      }).success,
    ).toBe(false);
  });

  it("rejects a demo quote that claims onchain provenance", () => {
    expect(
      MarketQuoteSchema.safeParse({
        ...liveQuote,
        dataMode: "DEMO",
        provider: "ALIVE Demo Market Provider",
      }).success,
    ).toBe(false);
  });

  it("rejects a quote whose timestamp disagrees with its source update time", () => {
    // Presenting a day-old answer under a fresh timestamp is the exact
    // failure this invariant exists to prevent.
    expect(
      MarketQuoteSchema.safeParse({
        ...liveQuote,
        timestamp: "2026-08-16T12:04:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects an observation recorded before the source wrote the answer", () => {
    expect(
      MarketQuoteSchema.safeParse({
        ...liveQuote,
        onchainSource: { ...source, observedAt: "2026-08-16T11:59:00.000Z" },
      }).success,
    ).toBe(false);
  });

  it("keeps existing demo quotes valid without provenance", () => {
    expect(
      MarketQuoteSchema.safeParse({
        assetId: "tgold",
        price: "2450.5",
        timestamp: "2026-08-16T12:00:00.000Z",
        provider: "ALIVE Demo Market Provider",
        status: "OPEN",
        dataMode: "DEMO",
      }).success,
    ).toBe(true);
  });
});
