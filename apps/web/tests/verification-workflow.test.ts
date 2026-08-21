import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useEffect: vi.fn(),
  useMemo: vi.fn(),
  useState: vi.fn(),
}));
vi.mock("@phosphor-icons/react", () => ({}));
vi.mock("wagmi", () => ({
  usePublicClient: vi.fn(),
  useWriteContract: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ ZERO_CONTEXT: `0x${"00".repeat(32)}` }));
vi.mock("@/lib/authorization", () => ({}));
vi.mock("@/lib/attestation-binding", () => ({}));
vi.mock("@/lib/chain", () => ({
  activeChain: { id: 1952, name: "X Layer" },
  contractAddresses: {},
  contractsConfigured: false,
  explorerTransactionUrl: vi.fn(),
}));
vi.mock("@/lib/contracts", () => ({}));
vi.mock("@/lib/format", () => ({}));
vi.mock("@/lib/local-state", () => ({}));
vi.mock("@/components/attestation-card", () => ({}));
vi.mock("@/components/camera-capture", () => ({}));
vi.mock("@/components/ui", () => ({}));
vi.mock("@/components/transaction-flow", () => ({}));
vi.mock("@/components/wallet-shell", () => ({}));

import {
  attestationDestination,
  isVerificationSessionExpired,
  preserveAnalysisAfterConsumerFailure,
} from "@/components/verification-workflow";
import type { Hex, VerificationResult } from "@/lib/types";

const result: VerificationResult = {
  assetId: `0x${"01".repeat(32)}`,
  sessionId: `0x${"02".repeat(32)}`,
  identityScore: 0.9,
  livenessScore: 0.85,
  integrityScore: 0.92,
  identityScoreBps: 9000,
  livenessScoreBps: 8500,
  integrityScoreBps: 9200,
  verified: true,
  signals: {
    embeddingSimilarity: 0.9,
    localFeatureSimilarity: 0.88,
    identifierExpected: false,
    identifierCriticalMismatch: false,
    multiViewConsistency: 0.87,
    challengeCompletion: 1,
    motionConsistency: 0.9,
    captureFreshness: 1,
    replayRisk: 0.03,
    imageQuality: 0.91,
    visualIntegrity: 0.92,
  },
  reasonCodes: [],
  evidenceHash: `0x${"03".repeat(32)}`,
  timestamp: "2026-08-14T00:00:00.000Z",
};

describe("verification result recovery", () => {
  it("preserves a consumed analysis while withholding an unvalidated signature", () => {
    const preserved = preserveAnalysisAfterConsumerFailure(
      result,
      new Error("RPC timed out"),
    );

    expect(preserved.result).toBe(result);
    expect(preserved.signedAttestation).toBeUndefined();
    expect(preserved.attestationError).toContain("Analysis completed");
    expect(preserved.attestationError).toContain("RPC timed out");
    expect(preserved.attestationError).toContain("do not repeat");
  });

  it("distinguishes an unconfigured escrow from an unbound verification", () => {
    const escrowId = `0x${"04".repeat(32)}` as Hex;

    expect(attestationDestination(escrowId, false)).toBe("escrow-unconfigured");
    expect(attestationDestination(undefined, false)).toBe("unbound");
    expect(attestationDestination(escrowId, true)).toBe("escrow-ready");
  });

  it("treats the exact expiry instant as expired", () => {
    const expiry = "2026-08-14T01:00:00.000Z";

    expect(
      isVerificationSessionExpired(
        expiry,
        new Date("2026-08-14T00:59:59.999Z").getTime(),
      ),
    ).toBe(false);
    expect(
      isVerificationSessionExpired(
        expiry,
        new Date("2026-08-14T01:00:00.000Z").getTime(),
      ),
    ).toBe(true);
  });
});
