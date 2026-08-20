import { privateKeyToAccount } from "viem/accounts";

import { describe, expect, it } from "vitest";
import {
  ALIVE_ELIGIBILITY_DOMAIN_NAME,
  ALIVE_ELIGIBILITY_PRIMARY_TYPE,
  ALIVE_ELIGIBILITY_TYPE_STRING,
  EligibilityAttestationSchema,
  EligibilityPolicySchema,
  EligibilityVerdictSchema,
  getAliveEligibilityTypedData,
  hashAliveEligibilityAttestation,
  hashAssetId,
  hashEligibilityPolicy,
  hashEligibilityReasons,
  hashPassport,
  isVerdictExpired,
  recoverAliveEligibilitySigner,
  type EligibilityAttestation,
  type EligibilityAttestationDomain,
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

describe("hashAssetId", () => {
  it("is deterministic and content-sensitive", () => {
    // keccak256(utf8Bytes("")) is the well-known empty-string hash — a
    // simple cross-check that this really is keccak256 over UTF-8 bytes,
    // matching packages/contracts/scripts/deploy-rwa.ts's ethers.id(key).
    expect(hashAssetId("")).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
    expect(hashAssetId("tusdc")).toBe(hashAssetId("tusdc"));
    expect(hashAssetId("tusdc")).not.toBe(hashAssetId("ttbill-a"));
  });
});

describe("hashEligibilityReasons", () => {
  it("is deterministic and content-sensitive", () => {
    const reasons = [{ code: "OK" as const, message: "All checks passed." }];
    expect(hashEligibilityReasons(reasons)).toBe(hashEligibilityReasons(reasons));
    expect(hashEligibilityReasons(reasons)).not.toBe(
      hashEligibilityReasons([{ code: "NAV_STALE", message: "stale" }]),
    );
  });
});

const attestation: EligibilityAttestation = {
  assetIdHash: `0x${"01".repeat(32)}`,
  eligible: true,
  reasonHash: `0x${"02".repeat(32)}`,
  passportHash: `0x${"03".repeat(32)}`,
  marketSnapshotHash: `0x${"04".repeat(32)}`,
  policyHash: `0x${"05".repeat(32)}`,
  issuedAt: 1_700_000_000,
  validUntil: 1_700_000_900,
  nonce: `0x${"06".repeat(32)}`,
};

const domain: EligibilityAttestationDomain = {
  chainId: 1_952,
  verifyingContract: `0x${"34".repeat(20)}`,
};

describe("EligibilityAttestation EIP-712 signing", () => {
  it("rejects a lifetime beyond 24h and a zero commitment", () => {
    expect(
      EligibilityAttestationSchema.safeParse({
        ...attestation,
        validUntil: attestation.issuedAt + 86_401,
      }).success,
    ).toBe(false);
    expect(
      EligibilityAttestationSchema.safeParse({
        ...attestation,
        nonce: `0x${"00".repeat(32)}`,
      }).success,
    ).toBe(false);
  });

  it("recovers the signer and binds every commitment field", async () => {
    const account = privateKeyToAccount(`0x${"42".repeat(32)}`);
    const signature = await account.signTypedData(
      getAliveEligibilityTypedData(attestation, domain),
    );
    expect(ALIVE_ELIGIBILITY_DOMAIN_NAME).toBe("ALIVE Eligibility Gateway");
    expect(ALIVE_ELIGIBILITY_PRIMARY_TYPE).toBe("EligibilityAttestation");
    expect(ALIVE_ELIGIBILITY_TYPE_STRING).toBe(
      "EligibilityAttestation(bytes32 assetIdHash,bool eligible,bytes32 reasonHash,bytes32 passportHash,bytes32 marketSnapshotHash,bytes32 policyHash,uint64 issuedAt,uint64 validUntil,bytes32 nonce)",
    );
    await expect(
      recoverAliveEligibilitySigner(attestation, domain, signature),
    ).resolves.toBe(account.address);
    expect(hashAliveEligibilityAttestation(attestation, domain)).not.toBe(
      hashAliveEligibilityAttestation(
        { ...attestation, eligible: false },
        domain,
      ),
    );
    expect(hashAliveEligibilityAttestation(attestation, domain)).not.toBe(
      hashAliveEligibilityAttestation(
        { ...attestation, reasonHash: `0x${"ff".repeat(32)}` },
        domain,
      ),
    );
  });
});
