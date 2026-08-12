import { describe, expect, it } from "vitest";
import {
  AliveAttestationSchema,
  BasisPointsSchema,
  RegistrationCaptureRequestSchema,
  VerificationCaptureRequestSchema,
  VerificationResultSchema,
  WalletAuthorizationSchema,
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
      fingerprintHash: `0x${"12".repeat(32)}`,
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

  it("requires wallet authorization expiry to follow issuance", () => {
    const parsed = WalletAuthorizationSchema.safeParse({
      audience: "https://verifier.alive.example",
      action: "CREATE_ASSET",
      wallet: `0x${"22".repeat(20)}`,
      resource: bytes32,
      context: `0x${"00".repeat(32)}`,
      payloadHash: bytes32,
      nonce: `0x${"33".repeat(32)}`,
      issuedAt: 100,
      expiresAt: 100,
    });
    expect(parsed.success).toBe(false);
  });

  it("requires verification captures to contain exactly three ordered burst-frame fields", () => {
    const frame = {
      imageBase64: "aGVsbG8gd29ybGQhISE=",
      mimeType: "image/jpeg" as const,
      capturedAt: "2026-01-01T00:00:01.000Z",
    };
    expect(VerificationCaptureRequestSchema.safeParse({ challengeId: bytes32, frames: [frame, frame, frame] }).success).toBe(true);
    expect(VerificationCaptureRequestSchema.safeParse({ challengeId: bytes32, frames: [frame, frame] }).success).toBe(false);
    expect(VerificationCaptureRequestSchema.safeParse({ challengeId: bytes32, frames: [frame, frame, frame, frame] }).success).toBe(false);
    expect(VerificationCaptureRequestSchema.safeParse({ challengeId: bytes32, ...frame }).success).toBe(false);
    expect(RegistrationCaptureRequestSchema.safeParse({ ...frame, view: "FRONT" }).success).toBe(true);
  });
});
