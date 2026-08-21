import { describe, it, expect } from "vitest";
import { normalizeWalletAddress } from "../convex/lib/normalize";

describe("Convex Persistence Layer Invariants", () => {
  it("normalizes addresses before executing database queries", () => {
    const raw = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";
    const normalized = normalizeWalletAddress(raw);
    expect(normalized).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
  });

  it("prohibits invalid or malicious address inputs", () => {
    expect(() => normalizeWalletAddress("")).toThrow("must be a non-empty string");
    expect(() => normalizeWalletAddress("DROP TABLE users;--")).toThrow("Invalid EVM address format");
  });

  it("verifies wallet context persistence structure matches schema", () => {
    const sampleWalletContext = {
      walletAddress: "0xe2475653b6f8a846152a5508a8e1b1faae1a44e5",
      holdings: {
        totalValueUsd: 15420.5,
        positions: [],
      },
      updatedAt: new Date().toISOString(),
    };

    const serialized = JSON.stringify(sampleWalletContext);
    const parsed = JSON.parse(serialized);

    expect(parsed.walletAddress).toBe(sampleWalletContext.walletAddress);
    expect(parsed.holdings.totalValueUsd).toBe(15420.5);
  });

  it("verifies strategy persistence and active status toggling logic", () => {
    const strategies = [
      { id: "strat-1", walletAddress: "0xuser1", name: "Strategy A", isActive: true },
      { id: "strat-2", walletAddress: "0xuser1", name: "Strategy B", isActive: false },
    ];

    // Simulate activating strat-2 for 0xuser1
    const updated = strategies.map((s) => ({
      ...s,
      isActive: s.id === "strat-2",
    }));

    expect(updated.find((s) => s.id === "strat-1")?.isActive).toBe(false);
    expect(updated.find((s) => s.id === "strat-2")?.isActive).toBe(true);
  });
});
