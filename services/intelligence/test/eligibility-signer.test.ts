import { describe, expect, it } from "vitest";
import {
  recoverAliveEligibilitySigner,
  type EligibilityVerdict,
} from "@alive/shared";
import { privateKeyToAccount } from "viem/accounts";

import {
  EligibilitySigner,
  EligibilitySignerError,
} from "../src/attestations/eligibility-signer.js";
import { generateEligibilityNonce } from "../src/attestations/nonce-store.js";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function eligibleVerdict(): EligibilityVerdict {
  return {
    version: 1,
    assetId: "tusdc",
    eligible: true,
    status: "ELIGIBLE",
    reasons: [{ code: "OK", message: "All eligibility checks passed." }],
    evaluatedAt: NOW.toISOString(),
    validUntil: new Date(NOW.getTime() + 900_000).toISOString(),
    passportHash: `0x${"01".repeat(32)}`,
    policyHash: `0x${"02".repeat(32)}`,
    marketSnapshotHash: `0x${"03".repeat(32)}`,
  };
}

describe("generateEligibilityNonce", () => {
  it("returns distinct 32-byte hex values", () => {
    const a = generateEligibilityNonce();
    const b = generateEligibilityNonce();
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("EligibilitySigner", () => {
  it("reports not configured and throws a typed error when unset", async () => {
    const signer = new EligibilitySigner({});
    expect(signer.configured).toBe(false);
    await expect(
      signer.sign("tusdc", eligibleVerdict(), NOW),
    ).rejects.toBeInstanceOf(EligibilitySignerError);
  });

  it("refuses to sign a verdict with no market snapshot commitment", async () => {
    const signer = new EligibilitySigner({
      privateKey: `0x${"42".repeat(32)}`,
      chainId: 31_337,
      verifyingContract: `0x${"aa".repeat(20)}`,
    });
    const { marketSnapshotHash: _drop, ...withoutSnapshot } = eligibleVerdict();
    await expect(
      signer.sign("tusdc", withoutSnapshot as EligibilityVerdict, NOW),
    ).rejects.toMatchObject({ code: "VERDICT_MISSING_MARKET_SNAPSHOT" });
  });

  it("signs a verdict whose signature recovers to the configured address", async () => {
    const privateKey = `0x${"42".repeat(32)}` as const;
    const account = privateKeyToAccount(privateKey);
    const signer = new EligibilitySigner({
      privateKey,
      chainId: 31_337,
      verifyingContract: `0x${"aa".repeat(20)}`,
    });
    expect(signer.configured).toBe(true);
    expect(signer.address).toBe(account.address);

    const signed = await signer.sign("tusdc", eligibleVerdict(), NOW);
    expect(signed.attestation.eligible).toBe(true);
    expect(signed.attestation.passportHash).toBe(eligibleVerdict().passportHash);
    expect(signed.attestation.issuedAt).toBe(Math.floor(NOW.getTime() / 1_000));
    await expect(
      recoverAliveEligibilitySigner(
        signed.attestation,
        signed.domain,
        signed.signature,
      ),
    ).resolves.toBe(account.address);
  });

  it("caps validUntil at 24 hours even if the verdict's own validity is longer", async () => {
    const signer = new EligibilitySigner({
      privateKey: `0x${"42".repeat(32)}`,
      chainId: 31_337,
      verifyingContract: `0x${"aa".repeat(20)}`,
    });
    const longVerdict = {
      ...eligibleVerdict(),
      validUntil: new Date(NOW.getTime() + 100 * 3_600_000).toISOString(),
    };
    const signed = await signer.sign("tusdc", longVerdict, NOW);
    const lifetime = signed.attestation.validUntil - signed.attestation.issuedAt;
    expect(lifetime).toBeLessThanOrEqual(86_400);
  });

  it("derives assetIdHash the same way for the same assetId every time", async () => {
    const signer = new EligibilitySigner({
      privateKey: `0x${"42".repeat(32)}`,
      chainId: 31_337,
      verifyingContract: `0x${"aa".repeat(20)}`,
    });
    const first = await signer.sign("tusdc", eligibleVerdict(), NOW);
    const second = await signer.sign("tusdc", eligibleVerdict(), NOW);
    expect(first.attestation.assetIdHash).toBe(second.attestation.assetIdHash);
  });
});
