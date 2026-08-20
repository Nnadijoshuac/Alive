import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PortfolioPolicySchema,
  getPortfolioPolicyHashComponents,
  hashPortfolioPolicy,
  type PortfolioPolicyInput,
} from "../src/index.js";

const validPolicy: PortfolioPolicyInput = {
  version: 1,
  objective: "CAPITAL_PRESERVATION",
  minimumCashBps: 1_000,
  assetClassLimits: [
    { assetClass: "GOLD", minimumBps: 500, maximumBps: 2_000 },
    { assetClass: "TREASURY", minimumBps: 5_000, maximumBps: 8_000 },
    { assetClass: "CASH", minimumBps: 1_000, maximumBps: 3_000 },
    { assetClass: "EQUITY", minimumBps: 0, maximumBps: 2_000 },
  ],
  maximumSingleAssetBps: 2_000,
  maximumSingleIssuerBps: 2_500,
  minimumLiquidityScore: 70,
  maximumPortfolioRiskScore: 40,
  maximumPriceAgeSeconds: 120,
  maximumSlippageBps: 100,
  allowedAssetIds: ["tusdc", "tgold", "ttbill-a"],
  blockedAssetIds: ["speculative-credit"],
  allowedIssuers: ["issuer-b", "issuer-a"],
  blockedIssuers: ["blocked-issuer"],
  userApprovalRequired: true,
};

describe("PortfolioPolicy", () => {
  it("normalizes asset classes and identifier arrays deterministically", () => {
    const policy = PortfolioPolicySchema.parse(validPolicy);
    expect(policy.assetClassLimits.map((limit) => limit.assetClass)).toEqual([
      "CASH",
      "TREASURY",
      "EQUITY",
      "GOLD",
    ]);
    expect(policy.allowedAssetIds).toEqual(["tgold", "ttbill-a", "tusdc"]);
    expect(policy.allowedIssuers).toEqual(["issuer-a", "issuer-b"]);
  });

  it("defaults omitted allow/block lists to canonical empty arrays", () => {
    const {
      allowedAssetIds: _allowedAssetIds,
      blockedAssetIds: _blockedAssetIds,
      allowedIssuers: _allowedIssuers,
      blockedIssuers: _blockedIssuers,
      ...withoutLists
    } = validPolicy;
    const policy = PortfolioPolicySchema.parse(withoutLists);
    expect(policy.allowedAssetIds).toEqual([]);
    expect(policy.blockedAssetIds).toEqual([]);
    expect(policy.allowedIssuers).toEqual([]);
    expect(policy.blockedIssuers).toEqual([]);
  });

  it("rejects impossible effective minima", () => {
    const parsed = PortfolioPolicySchema.safeParse({
      ...validPolicy,
      minimumCashBps: 0,
      assetClassLimits: [
        { assetClass: "TREASURY", minimumBps: 7_000, maximumBps: 8_000 },
        { assetClass: "GOLD", minimumBps: 4_000, maximumBps: 5_000 },
      ],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toContain(
        "Effective asset-class minima total 11000 BPS, above 10000 BPS",
      );
    }
  });

  it("rejects contradictory cash floors", () => {
    expect(
      PortfolioPolicySchema.safeParse({
        ...validPolicy,
        minimumCashBps: 2_000,
        assetClassLimits: [
          { assetClass: "CASH", minimumBps: 0, maximumBps: 1_000 },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires an explicit CASH class limit for a positive cash floor", () => {
    expect(
      PortfolioPolicySchema.safeParse({
        ...validPolicy,
        assetClassLimits: validPolicy.assetClassLimits.filter(
          (limit) => limit.assetClass !== "CASH",
        ),
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate limits and normalized duplicate IDs", () => {
    expect(
      PortfolioPolicySchema.safeParse({
        ...validPolicy,
        assetClassLimits: [
          { assetClass: "GOLD", minimumBps: 0, maximumBps: 2_000 },
          { assetClass: "GOLD", minimumBps: 500, maximumBps: 2_500 },
        ],
      }).success,
    ).toBe(false);
    expect(
      PortfolioPolicySchema.safeParse({
        ...validPolicy,
        allowedAssetIds: ["tGOLD", "tgold"],
      }).success,
    ).toBe(false);
  });

  it("rejects allow/block intersections", () => {
    expect(
      PortfolioPolicySchema.safeParse({
        ...validPolicy,
        allowedAssetIds: ["tgold"],
        blockedAssetIds: ["TGOLD"],
      }).success,
    ).toBe(false);
    expect(
      PortfolioPolicySchema.safeParse({
        ...validPolicy,
        allowedIssuers: ["issuer-a"],
        blockedIssuers: ["ISSUER-A"],
      }).success,
    ).toBe(false);
  });

  it("matches the frozen ABI/EIP-712-style parity fixture", () => {
    const fixturePath = fileURLToPath(
      new URL(
        "../../../data/fixtures/policy-hash-parity.json",
        import.meta.url,
      ),
    );
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      policy: PortfolioPolicyInput;
      expected: ReturnType<typeof getPortfolioPolicyHashComponents> & {
        policyHash: `0x${string}`;
      };
    };
    const components = getPortfolioPolicyHashComponents(fixture.policy);
    expect(components.assetClassLimitsHash).toBe(
      fixture.expected.assetClassLimitsHash,
    );
    expect(components.allowedAssetIdsHash).toBe(
      fixture.expected.allowedAssetIdsHash,
    );
    expect(components.blockedAssetIdsHash).toBe(
      fixture.expected.blockedAssetIdsHash,
    );
    expect(components.allowedIssuersHash).toBe(
      fixture.expected.allowedIssuersHash,
    );
    expect(components.blockedIssuersHash).toBe(
      fixture.expected.blockedIssuersHash,
    );
    expect(hashPortfolioPolicy(fixture.policy)).toBe(
      fixture.expected.policyHash,
    );
  });

  it("hashes semantic policy content, independent of input order", () => {
    const reversed: PortfolioPolicyInput = {
      ...validPolicy,
      assetClassLimits: [...validPolicy.assetClassLimits].reverse(),
      allowedAssetIds: [...(validPolicy.allowedAssetIds ?? [])].reverse(),
      allowedIssuers: [...(validPolicy.allowedIssuers ?? [])].reverse(),
    };
    expect(hashPortfolioPolicy(reversed)).toBe(
      hashPortfolioPolicy(validPolicy),
    );
    expect(
      hashPortfolioPolicy({ ...validPolicy, maximumSingleAssetBps: 2_001 }),
    ).not.toBe(hashPortfolioPolicy(validPolicy));
  });
});
