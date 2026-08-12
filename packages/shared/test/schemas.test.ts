import { describe, expect, it } from "vitest";
import {
  AliveAttestationSchema,
  BasisPointsSchema,
  VerificationResultSchema,
} from "../src/index.js";

const bytes32 = `0x${"11".repeat(32)}`;

describe("protocol schema bounds", () => {
  it("enforces score basis-point bounds", () => {
    expect(BasisPointsSchema.safeParse(10_000).success).toBe(true);
    expect(BasisPointsSchema.safeParse(10_001).success).toBe(false);
    expect(BasisPointsSchema.safeParse(-1).success).toBe(false);
    expect(BasisPointsSchema.safeParse(1.25).success).toBe(false);
  });

  it("requires an attestation to expire after it is issued", () => {
    const parsed = AliveAttestationSchema.safeParse({
      assetId: bytes32,
      sessionId: bytes32,
      subject: `0x${"22".repeat(20)}`,
      context: bytes32,
      identityScore: 9_000,
      livenessScore: 9_000,
      integrityScore: 9_000,
      verified: true,
      evidenceHash: bytes32,
      issuedAt: 100,
      expiresAt: 100,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects result ratios outside zero through one", () => {
    const parsed = VerificationResultSchema.safeParse({
      assetId: bytes32,
      sessionId: bytes32,
      identityScore: 1.01,
      livenessScore: 0.9,
      integrityScore: 0.9,
      identityScoreBps: 10_000,
      livenessScoreBps: 9_000,
      integrityScoreBps: 9_000,
      verified: true,
      signals: {},
      reasonCodes: [],
      evidenceHash: bytes32,
      timestamp: new Date().toISOString(),
    });
    expect(parsed.success).toBe(false);
  });
});
