import { describe, expect, it } from "vitest";
import { RwaAssetSchema, isVerdictExpired, type MarketQuote, type RwaAsset } from "@alive/shared";
import { createDemoEligibilityPolicy } from "../src/demo-policy.js";
import { evaluateEligibility } from "../src/engine.js";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function healthyTreasuryPassport(): RwaAsset {
  return RwaAssetSchema.parse({
    id: "ttbill-a",
    symbol: "tTBILL-A",
    name: "Test Treasury Fund A",
    assetClass: "TREASURY",
    issuer: "demo-treasury-issuer-a",
    issuerName: "ALIVE Demo Treasury Issuer A",
    underlying: "Synthetic short-duration US Treasury reference basket",
    liquidity: { score: 94 },
    risk: {
      score: 18,
      issuerRisk: 18,
      liquidityRisk: 8,
      marketRisk: 14,
      oracleRisk: 20,
      redemptionRisk: 12,
      productComplexityRisk: 10,
      methodology: "ALIVE_DEMO_RISK_V1",
    },
    redemption: { supported: true, frequency: "Daily" },
    sources: [
      {
        id: "demo-source-ttbill-a",
        title: "ALIVE synthetic demo fixture",
        sourceType: "DEMO_FIXTURE",
        fixtureId: "demo-source-ttbill-a",
        retrievedAt: "2026-08-15T11:00:00.000Z",
        supportedFields: [
          "symbol",
          "name",
          "assetClass",
          "issuer",
          "issuerName",
          "underlying",
          "liquidity.score",
          "risk.score",
          "risk.issuerRisk",
          "risk.liquidityRisk",
          "risk.marketRisk",
          "risk.oracleRisk",
          "risk.redemptionRisk",
          "risk.productComplexityRisk",
          "risk.methodology",
          "lastUpdatedAt",
          "redemption.supported",
          "redemption.frequency",
        ],
        disclaimer: "Synthetic fixture; not live market data.",
      },
    ],
    lastUpdatedAt: "2026-08-15T11:00:00.000Z",
    dataMode: "DEMO",
  });
}

function quoteAt(assetId: string, timestamp: string): MarketQuote {
  return {
    assetId,
    price: "1.01",
    timestamp,
    provider: "ALIVE Demo Market Provider",
    status: "OPEN",
    dataMode: "DEMO",
  };
}

describe("evaluateEligibility", () => {
  it("returns ELIGIBLE for a healthy, fresh, redemption-active asset", () => {
    const verdict = evaluateEligibility({
      passport: healthyTreasuryPassport(),
      policy: createDemoEligibilityPolicy(),
      quote: quoteAt("ttbill-a", "2026-08-15T11:56:00.000Z"),
      now: NOW,
    });
    expect(verdict.status).toBe("ELIGIBLE");
    expect(verdict.eligible).toBe(true);
    expect(verdict.reasons).toEqual([{ code: "OK", message: expect.any(String) }]);
    expect(verdict.passportHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(verdict.policyHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("restricts on stale NAV for a TREASURY asset past maxNavAgeSeconds", () => {
    const verdict = evaluateEligibility({
      passport: healthyTreasuryPassport(),
      policy: createDemoEligibilityPolicy(),
      // 31 hours old, policy allows 24
      quote: quoteAt("ttbill-a", "2026-08-14T05:00:00.000Z"),
      now: NOW,
    });
    expect(verdict.status).toBe("RESTRICTED");
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.map((r) => r.code)).toContain("NAV_STALE");
    expect(verdict.reasons.find((r) => r.code === "NAV_STALE")?.message).toMatch(
      /31 hours old/,
    );
  });

  it("restricts on stale price for a non-NAV-tracked asset class", () => {
    const passport = RwaAssetSchema.parse({
      ...healthyTreasuryPassport(),
      assetClass: "GOLD",
      issuer: "demo-gold-issuer",
      issuerName: "ALIVE Demo Gold Issuer",
    });
    const verdict = evaluateEligibility({
      passport,
      policy: createDemoEligibilityPolicy(),
      // 2 hours old, policy allows 1 hour for price-tracked classes
      quote: quoteAt("tgold", "2026-08-15T10:00:00.000Z"),
      now: NOW,
    });
    expect(verdict.status).toBe("RESTRICTED");
    expect(verdict.reasons.map((r) => r.code)).toContain("PRICE_STALE");
  });

  it("returns UNKNOWN (not RESTRICTED) when the only problem is missing market data", () => {
    const verdict = evaluateEligibility({
      passport: healthyTreasuryPassport(),
      policy: createDemoEligibilityPolicy(),
      now: NOW,
      // no quote supplied
    });
    expect(verdict.status).toBe("UNKNOWN");
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.map((r) => r.code)).toEqual(["NAV_UNAVAILABLE"]);
  });

  it("restricts on missing required documentation", () => {
    const passport = healthyTreasuryPassport();
    const policy = createDemoEligibilityPolicy();
    const stricterPolicy = {
      ...policy,
      requiredSourceTypes: [
        "DEMO_FIXTURE",
        "ISSUER_DOCUMENTATION",
      ] as (typeof policy)["requiredSourceTypes"],
    };
    const verdict = evaluateEligibility({
      passport,
      policy: stricterPolicy,
      quote: quoteAt("ttbill-a", "2026-08-15T11:56:00.000Z"),
      now: NOW,
    });
    expect(verdict.reasons.map((r) => r.code)).toContain("DOCUMENTATION_INCOMPLETE");
  });

  it("restricts on an unapproved issuer", () => {
    const passport = RwaAssetSchema.parse({
      ...healthyTreasuryPassport(),
      issuer: "some-unapproved-issuer",
      issuerName: "Some Unapproved Issuer",
    });
    const verdict = evaluateEligibility({
      passport,
      policy: createDemoEligibilityPolicy(),
      quote: quoteAt("ttbill-a", "2026-08-15T11:56:00.000Z"),
      now: NOW,
    });
    expect(verdict.status).toBe("RESTRICTED");
    expect(verdict.reasons.map((r) => r.code)).toContain("ISSUER_NOT_APPROVED");
  });

  it("restricts when redemption is explicitly disabled", () => {
    const base = healthyTreasuryPassport();
    const passport = RwaAssetSchema.parse({
      ...base,
      redemption: { supported: false },
      sources: [
        {
          ...base.sources[0],
          supportedFields: base.sources[0]?.supportedFields.filter(
            (field) => field !== "redemption.frequency",
          ),
        },
      ],
    });
    const verdict = evaluateEligibility({
      passport,
      policy: createDemoEligibilityPolicy(),
      quote: quoteAt("ttbill-a", "2026-08-15T11:56:00.000Z"),
      now: NOW,
    });
    expect(verdict.reasons.map((r) => r.code)).toContain("REDEMPTION_DISABLED");
  });

  it("restricts a disabled asset (on-chain registry fact)", () => {
    const verdict = evaluateEligibility({
      passport: healthyTreasuryPassport(),
      policy: createDemoEligibilityPolicy(),
      quote: quoteAt("ttbill-a", "2026-08-15T11:56:00.000Z"),
      assetEnabled: false,
      now: NOW,
    });
    expect(verdict.status).toBe("RESTRICTED");
    expect(verdict.reasons.map((r) => r.code)).toContain("ASSET_DISABLED");
  });

  it("restricts on an asset class outside the policy allowlist", () => {
    const passport = RwaAssetSchema.parse({
      ...healthyTreasuryPassport(),
      assetClass: "COMMODITY",
      issuer: "demo-gold-issuer",
    });
    const policy = createDemoEligibilityPolicy();
    const verdict = evaluateEligibility({
      passport,
      policy,
      quote: quoteAt("ttbill-a", "2026-08-15T11:56:00.000Z"),
      now: NOW,
    });
    expect(verdict.reasons.map((r) => r.code)).toContain("ASSET_CLASS_NOT_ALLOWED");
  });

  it("is deterministic: identical inputs produce identical hashes and reasons", () => {
    const first = evaluateEligibility({
      passport: healthyTreasuryPassport(),
      policy: createDemoEligibilityPolicy(),
      quote: quoteAt("ttbill-a", "2026-08-15T11:56:00.000Z"),
      now: NOW,
    });
    const second = evaluateEligibility({
      passport: healthyTreasuryPassport(),
      policy: createDemoEligibilityPolicy(),
      quote: quoteAt("ttbill-a", "2026-08-15T11:56:00.000Z"),
      now: NOW,
    });
    expect(first.passportHash).toBe(second.passportHash);
    expect(first.policyHash).toBe(second.policyHash);
    expect(first.reasons).toEqual(second.reasons);
  });
});

describe("isVerdictExpired", () => {
  it("returns false before validUntil and true at/after it", () => {
    const verdict = evaluateEligibility({
      passport: healthyTreasuryPassport(),
      policy: createDemoEligibilityPolicy(),
      quote: quoteAt("ttbill-a", "2026-08-15T11:56:00.000Z"),
      now: NOW,
    });
    expect(isVerdictExpired(verdict, NOW)).toBe(false);
    const afterExpiry = new Date(Date.parse(verdict.validUntil) + 1);
    expect(isVerdictExpired(verdict, afterExpiry)).toBe(true);
  });
});
