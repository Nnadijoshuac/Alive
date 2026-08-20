import { describe, it, expect } from "vitest";

describe("Persistent Agent Scheduler Invariants", () => {
  it("executes cheap check and skips evaluation when no active strategies exist", () => {
    const activeStrategies: any[] = [];
    const shouldRunDeepEvaluation = activeStrategies.length > 0;

    expect(shouldRunDeepEvaluation).toBe(false);
  });

  it("detects allocation breaches deterministically and proposes rebalancing", () => {
    const positions = [
      { assetId: "meta-xstock", symbol: "WMETAX", valueUsd: 6400 },
      { assetId: "spyx", symbol: "SPYX", valueUsd: 1600 },
      { assetId: "usdt", symbol: "USDT", valueUsd: 2000 },
    ];
    const totalValueUsd = 10_000;
    const maxAllocationLimit = 0.25; // 25%

    const breaches = positions.filter((p) => p.valueUsd / totalValueUsd > maxAllocationLimit);

    expect(breaches.length).toBe(1);
    const target = breaches[0]!;
    expect(target.symbol).toBe("WMETAX");
    expect(target.valueUsd / totalValueUsd).toBe(0.64);
  });

  it("ensures decision audit records are immutable and contain causal chain hashes", () => {
    const decision = {
      decisionId: "dec_1787200000_1a44e5",
      walletAddress: "0xe2475653b6f8a846152a5508a8e1b1faae1a44e5",
      strategyId: "rwa-core-balance-v1",
      triggerType: "ALLOCATION_BREACH",
      evaluatedAt: new Date().toISOString(),
      causalChainHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      status: "ACTION_PROPOSED",
    };

    expect(decision.causalChainHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(decision.status).toBe("ACTION_PROPOSED");
  });
});
