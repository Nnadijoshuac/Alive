import { describe, expect, it } from "vitest";
import {
  DETERMINISTIC_COMPILER_MODE,
  compilePolicyMandateDeterministically,
  safeCompilePolicyMandateDeterministically,
} from "../src/index.js";
import demoPolicyFixture from "../../../data/fixtures/killer-demo-policy.json";

describe("deterministic fallback policy compiler", () => {
  it("compiles the primary demo mandate without claiming AI", () => {
    const result = compilePolicyMandateDeterministically(
      "Protect my capital. Keep at least half in Treasuries. Give me some gold but not more than 20%. Equities can be at most 20%. Never put more than 25% with one issuer. Keep at least 10% liquid.",
    );
    expect(result.mode).toBe(DETERMINISTIC_COMPILER_MODE);
    expect(result.isAiGenerated).toBe(false);
    expect(result.warnings[0]).toMatch(/AI compiler offline/i);
    expect(result.policy.objective).toBe("CAPITAL_PRESERVATION");
    expect(result.policy.minimumCashBps).toBe(1_000);
    expect(result.policy.maximumSingleIssuerBps).toBe(2_500);
    expect(result.policy.minimumLiquidityScore).toBe(70);
    expect(result.policy.assetClassLimits).toEqual(
      expect.arrayContaining([
        { assetClass: "TREASURY", minimumBps: 5_000, maximumBps: 10_000 },
        { assetClass: "GOLD", minimumBps: 500, maximumBps: 2_000 },
        { assetClass: "EQUITY", minimumBps: 0, maximumBps: 2_000 },
        { assetClass: "CASH", minimumBps: 1_000, maximumBps: 10_000 },
      ]),
    );
  });

  it("recognizes a single-position cap", () => {
    const result = compilePolicyMandateDeterministically(
      "Never put more than 10% in one stock.",
    );
    expect(result.policy.maximumSingleAssetBps).toBe(1_000);
  });

  it("turns available liquidity and risk aversion into deterministic policy", () => {
    const result = compilePolicyMandateDeterministically(
      "I hate risk. Keep at least 20% available.",
    );
    expect(result.policy.objective).toBe("CAPITAL_PRESERVATION");
    expect(result.policy.minimumCashBps).toBe(2_000);
    expect(result.policy.maximumPortfolioRiskScore).toBe(40);
  });

  it("reports impossible combined minima instead of repairing them silently", () => {
    const result = safeCompilePolicyMandateDeterministically(
      "Put 60% in Treasuries and at least 50% in gold.",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.join(" ")).toMatch(/11000 BPS/i);
    }
  });

  it("is deterministic", () => {
    const mandate = "Keep half in Treasuries and keep 15% liquid.";
    const first = compilePolicyMandateDeterministically(mandate);
    const second = compilePolicyMandateDeterministically(mandate);
    expect(first.policy).toEqual(second.policy);
    expect(first.policyHash).toBe(second.policyHash);
  });

  it("keeps the deployed local demo policy fixture bound to the compiler output", () => {
    const result = compilePolicyMandateDeterministically(
      demoPolicyFixture.mandate,
    );
    expect(result.policy).toEqual(demoPolicyFixture.policy);
    expect(result.policyHash).toBe(demoPolicyFixture.policyHash);
  });
});
