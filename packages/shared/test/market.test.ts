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
