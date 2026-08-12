import { describe, expect, it } from "vitest";
import { getAliveAttestationTypedData, hashAliveAttestation } from "@alive/shared";
import { privateKeyToAccount } from "viem/accounts";
import { validateAttestationBinding } from "@/lib/attestation-binding";
import type { Address, Hex, SignedAttestation, VerificationResult, VerificationSession } from "@/lib/types";

const assetId = `0x${"01".repeat(32)}` as Hex;
const sessionId = `0x${"02".repeat(32)}` as Hex;
const context = `0x${"03".repeat(32)}` as Hex;
const evidenceHash = `0x${"04".repeat(32)}` as Hex;
const wallet = `0x${"05".repeat(20)}` as Address;
const registry = `0x${"06".repeat(20)}` as Address;

const session: VerificationSession = {
  sessionId,
  assetId,
  wallet,
  nonce: `0x${"07".repeat(32)}`,
  context,
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T00:03:00.000Z",
  status: "ANALYZED",
  challenges: [{ id: `0x${"08".repeat(32)}`, sequence: 0, type: "SHOW_FRONT", prompt: "Show front", completedAt: "2026-01-01T00:00:30.000Z" }],
};

const result: VerificationResult = {
  assetId,
  sessionId,
  identityScore: 0.9,
  livenessScore: 0.85,
  integrityScore: 0.92,
  identityScoreBps: 9000,
  livenessScoreBps: 8500,
  integrityScoreBps: 9200,
  verified: true,
  signals: {
    embeddingSimilarity: 0.9,
    localFeatureSimilarity: 0.9,
    identifierExpected: false,
    identifierCriticalMismatch: false,
    multiViewConsistency: 0.9,
    challengeCompletion: 1,
    motionConsistency: 0.85,
    captureFreshness: 1,
    replayRisk: 0.05,
    imageQuality: 0.95,
    visualIntegrity: 0.92,
  },
  reasonCodes: [],
  evidenceHash,
  timestamp: "2026-01-01T00:01:00.000Z",
};

const signed: SignedAttestation = {
  attestation: {
    assetId,
    fingerprintHash: `0x${"15".repeat(32)}`,
    sessionId,
    subject: wallet,
    context,
    identityScore: 9000,
    livenessScore: 8500,
    integrityScore: 9200,
    verified: true,
    evidenceHash,
    issuedAt: 1,
    expiresAt: 2,
  },
  domain: { chainId: 1952, verifyingContract: registry },
  signature: `0x${"09".repeat(65)}`,
  digest: `0x${"10".repeat(32)}`,
  signer: `0x${"11".repeat(20)}`,
};

describe("attestation consumer binding", () => {
  it("rejects a context that differs from the session before settlement", async () => {
    const mismatched = {
      ...signed,
      attestation: { ...signed.attestation, context: `0x${"12".repeat(32)}` as Hex },
    };
    await expect(validateAttestationBinding(session, result, mismatched, 1952, registry)).resolves.toMatch(/context/);
  });

  it("rejects an EIP-712 domain for another chain", async () => {
    await expect(validateAttestationBinding(session, result, signed, 196, registry)).resolves.toMatch(/active chain/);
  });

  it("rejects score fields that differ from the analysis result", async () => {
    const mismatched = {
      ...signed,
      attestation: { ...signed.attestation, identityScore: 8999 },
    };
    await expect(validateAttestationBinding(session, result, mismatched, 1952, registry)).resolves.toMatch(/scores/);
  });

  it("rejects a fingerprint commitment that differs from the asset baseline", async () => {
    await expect(
      validateAttestationBinding(session, result, signed, 1952, registry, undefined, `0x${"16".repeat(32)}`),
    ).resolves.toMatch(/fingerprint commitment/);
  });

  it("rejects a signer that is not authorized by the onchain registry", async () => {
    const account = privateKeyToAccount(`0x${"14".repeat(32)}`);
    const digest = hashAliveAttestation(signed.attestation, signed.domain);
    const signature = await account.signTypedData(getAliveAttestationTypedData(signed.attestation, signed.domain));
    await expect(
      validateAttestationBinding(
        session,
        result,
        { ...signed, digest, signature, signer: account.address },
        1952,
        registry,
        `0x${"13".repeat(20)}`,
      ),
    ).resolves.toMatch(/authorized by the registry/);
  });
});
