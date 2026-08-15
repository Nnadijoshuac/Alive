import { describe, expect, it } from "vitest";
import {
  EligibilityPolicySchema,
  EligibilityVerdictSchema,
  hashEligibilityPolicy,
  hashPassport,
  isVerdictExpired,
} from "../src/index.js";

function validPolicy() {
  return {
    version: 1 as const,
    policyId: "test-policy",
    allowedAssetClasses: ["TREASURY" as const],
    requireApprovedIssuer: true,
    approvedIssuers: ["demo-treasury-issuer-a"],
    requiredSourceTypes: ["DEMO_FIXTURE" as const],
    maxNavAgeSeconds: 86_400,
    maxPriceAgeSeconds: 3_600,
    requireRedemptionActive: true,
    maxPriceDeviationBps: 500,
    verdictValiditySeconds: 900,
  };
}

describe("EligibilityPolicySchema", () => {
  it("parses a valid policy", () => {
    expect(EligibilityPolicySchema.parse(validPolicy()).policyId).toBe(
      "test-policy",
    );
  });

  it("rejects strict extra fields", () => {
    expect(
      EligibilityPolicySchema.safeParse({ ...validPolicy(), extra: true })
        .success,
    ).toBe(false);
  });
});

describe("hashEligibilityPolicy / hashPassport", () => {
  it("is deterministic for identical input", () => {
    const a = hashEligibilityPolicy(validPolicy());
    const b = hashEligibilityPolicy(validPolicy());
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes when the policy changes", () => {
    const a = hashEligibilityPolicy(validPolicy());
    const b = hashEligibilityPolicy({ ...validPolicy(), maxNavAgeSeconds: 1 });
    expect(a).not.toBe(b);
  });

  it("hashPassport is deterministic and content-sensitive", () => {
    const a = hashPassport({ id: "x", value: 1 });
    const b = hashPassport({ id: "x", value: 1 });
    const c = hashPassport({ id: "x", value: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("EligibilityVerdictSchema / isVerdictExpired", () => {
  function validVerdict() {
    return {
      version: 1 as const,
      assetId: "ttbill-a",
      eligible: true,
      status: "ELIGIBLE" as const,
      reasons: [{ code: "OK" as const, message: "All checks passed." }],
      evaluatedAt: "2026-08-15T12:00:00.000Z",
      validUntil: "2026-08-15T12:15:00.000Z",
      passportHash: hashPassport({ id: "ttbill-a" }),
      policyHash: hashEligibilityPolicy(validPolicy()),
    };
  }

  it("parses a valid verdict", () => {
    expect(EligibilityVerdictSchema.parse(validVerdict()).status).toBe(
      "ELIGIBLE",
    );
  });

  it("treats a verdict as expired once now reaches validUntil", () => {
    const verdict = validVerdict();
    expect(isVerdictExpired(verdict, new Date("2026-08-15T12:14:59.000Z"))).toBe(
      false,
    );
    expect(isVerdictExpired(verdict, new Date("2026-08-15T12:15:00.000Z"))).toBe(
      true,
    );
  });
});
