import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeVerification,
  ApiError,
  createVerificationSession,
  finalizeAsset,
  normalizeAnalysisResponse,
  normalizeSessionResponse,
  normalizeSignedAttestationResponse,
  uploadVerificationCapture,
} from "@/lib/api";
import type { Address, Hex } from "@/lib/types";

const hex = `0x${"01".repeat(32)}` as Hex;
const address = `0x${"02".repeat(20)}` as Address;
const signals = {
  embeddingSimilarity: 0.42,
  localFeatureSimilarity: 0.41,
  identifierExpected: false,
  identifierCriticalMismatch: false,
  multiViewConsistency: 0.4,
  challengeCompletion: 1,
  motionConsistency: 0.18,
  captureFreshness: 1,
  replayRisk: 0.72,
  imageQuality: 0.9,
  visualIntegrity: 0.73,
};
const analysisResult = {
  assetId: hex,
  sessionId: hex,
  identityScore: 0.42,
  livenessScore: 0.18,
  integrityScore: 0.73,
  identityScoreBps: 4200,
  livenessScoreBps: 1800,
  integrityScoreBps: 7300,
  verified: false,
  signals,
  reasonCodes: ["REPLAY_RISK_HIGH"],
  evidenceHash: hex,
  timestamp: new Date(0).toISOString(),
};
const signedAttestation = {
  attestation: {
    assetId: hex,
    sessionId: hex,
    subject: address,
    context: hex,
    identityScore: 9000,
    livenessScore: 8500,
    integrityScore: 9200,
    verified: true,
    evidenceHash: hex,
    issuedAt: 1,
    expiresAt: 2,
  },
  domain: { chainId: 1952, verifyingContract: `0x${"03".repeat(20)}` },
  signature: `0x${"04".repeat(65)}`,
  digest: hex,
  signer: `0x${"05".repeat(20)}`,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifier response adapters", () => {
  it("unwraps a session envelope without replacing challenges", () => {
    const payload = {
      data: {
        session: {
          sessionId: hex,
          assetId: hex,
          wallet: address,
          nonce: hex,
          context: hex,
          createdAt: new Date(0).toISOString(),
          expiresAt: new Date(60_000).toISOString(),
          status: "PENDING",
          challenges: [{ id: hex, sequence: 0, type: "TURN_LEFT", prompt: "Turn left", completedAt: null }],
        },
      },
    };
    expect(normalizeSessionResponse(payload).challenges[0]?.type).toBe("TURN_LEFT");
  });

  it("preserves genuine scores and failure reasons", () => {
    const result = normalizeAnalysisResponse({ result: analysisResult });
    expect(result.result.identityScoreBps).toBe(4200);
    expect(result.result.reasonCodes).toEqual(["REPLAY_RISK_HIGH"]);
  });

  it("rejects incomplete verifier output", () => {
    expect(() => normalizeSessionResponse({ sessionId: hex })).toThrow(ApiError);
  });

  it("accepts the verifier's raw signed attestation response", () => {
    const signed = normalizeSignedAttestationResponse(signedAttestation);
    expect(signed.attestation.context).toBe(hex);
    expect(signed.domain.chainId).toBe(1952);
  });

  it("uses the fingerprint finalization route and refetches the completed asset", async () => {
    const asset = {
      assetId: hex,
      owner: address,
      metadata: { name: "Laptop", category: "COMPUTER" },
      createdAt: new Date(0).toISOString(),
      fingerprintHash: hex,
      registrationViewCount: 6,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ fingerprintHash: hex }, 201))
      .mockResolvedValueOnce(jsonResponse(asset));
    vi.stubGlobal("fetch", fetchMock);

    await expect(finalizeAsset(hex)).resolves.toEqual(asset);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(`/api/assets/${hex}/fingerprint`);
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(`/api/assets/${hex}`);
  });

  it("submits one challenge to the singular capture route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ captureId: hex }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await uploadVerificationCapture(hex, hex, "data:image/jpeg;base64,AAAA", new Date(0).toISOString());
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(`/api/verifications/${hex}/capture`);
  });

  it("analyzes before requesting the separately issued attestation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(analysisResult))
      .mockResolvedValueOnce(jsonResponse(signedAttestation, 201));
    vi.stubGlobal("fetch", fetchMock);

    const returned = await analyzeVerification(hex);
    expect(returned.signedAttestation?.attestation.context).toBe(hex);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      expect.stringMatching(`/api/verifications/${hex}/analyze`),
      expect.stringMatching(`/api/verifications/${hex}/attestation`),
    ]);
  });

  it("surfaces the verifier's nested protocol error code and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: "FINGERPRINT_REQUIRED", message: "Asset registration is incomplete" } }, 409)),
    );

    await expect(createVerificationSession(hex, address)).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      reason: "FINGERPRINT_REQUIRED",
      message: "Asset registration is incomplete",
    });
  });
});
