import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAssetId,
  hashCreateAssetAuthorizationPayload,
  hashCreateVerificationSessionAuthorizationPayload,
} from "@alive/shared";
import {
  analyzeVerification,
  ApiError,
  createAsset,
  createVerificationSession,
  finalizeAsset,
  normalizeAnalysisResponse,
  normalizeSessionResponse,
  normalizeSignedAttestationResponse,
  requestAssetAuthorization,
  requestVerificationAuthorization,
  uploadRegistrationCapture,
  uploadVerificationCapture,
  ZERO_CONTEXT,
} from "@/lib/api";
import type { Address, CaptureFrame, Hex } from "@/lib/types";

const hex = `0x${"01".repeat(32)}` as Hex;
const capability = `0x${"09".repeat(32)}` as Hex;
const address = `0x${"02".repeat(20)}` as Address;
const metadata = { name: "Laptop", category: "COMPUTER" as const };
const registrationNonce = `0x${"06".repeat(32)}` as Hex;
const authorizedAssetId = createAssetId(address, registrationNonce);
const asset = {
  assetId: hex,
  owner: address,
  metadata,
  createdAt: new Date(0).toISOString(),
  fingerprintHash: hex,
  registrationViewCount: 6,
};
const session = {
  sessionId: hex,
  assetId: hex,
  wallet: address,
  nonce: hex,
  context: ZERO_CONTEXT,
  createdAt: new Date(0).toISOString(),
  expiresAt: new Date(60_000).toISOString(),
  status: "PENDING" as const,
  challenges: [
    {
      id: hex,
      sequence: 0,
      type: "TURN_LEFT" as const,
      prompt: "Turn left",
      completedAt: null,
    },
  ],
};
const domain = {
  name: "ALIVE Verifier Authorization" as const,
  version: "1" as const,
  chainId: 1952,
};
const assetAuthorization = {
  audience: "http://127.0.0.1:4100",
  action: "CREATE_ASSET" as const,
  wallet: address,
  resource: authorizedAssetId,
  context: ZERO_CONTEXT,
  payloadHash: hashCreateAssetAuthorizationPayload({
    assetId: authorizedAssetId,
    owner: address,
    metadata,
  }),
  nonce: registrationNonce,
  issuedAt: 1,
  expiresAt: 61,
};
const verificationAuthorization = {
  ...assetAuthorization,
  action: "CREATE_VERIFICATION_SESSION" as const,
  resource: hex,
  payloadHash: hashCreateVerificationSessionAuthorizationPayload({
    sessionId: hex,
    assetId: hex,
    wallet: address,
    context: ZERO_CONTEXT,
  }),
  nonce: hex,
};
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
    fingerprintHash: hex,
    sessionId: hex,
    subject: address,
    context: ZERO_CONTEXT,
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
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bodyAt(
  fetchMock: ReturnType<typeof vi.fn>,
  index: number,
): Record<string, unknown> {
  return JSON.parse(
    String((fetchMock.mock.calls[index]?.[1] as RequestInit | undefined)?.body),
  ) as Record<string, unknown>;
}

function headersAt(
  fetchMock: ReturnType<typeof vi.fn>,
  index: number,
): Record<string, string> {
  return (fetchMock.mock.calls[index]?.[1] as RequestInit | undefined)
    ?.headers as Record<string, string>;
}

afterEach(() => vi.unstubAllGlobals());

describe("verifier response adapters", () => {
  it("validates sessions and preserves genuine analysis signals", () => {
    expect(
      normalizeSessionResponse({ data: { session } }).challenges[0]?.type,
    ).toBe("TURN_LEFT");
    const result = normalizeAnalysisResponse({ result: analysisResult });
    expect(result.result.identityScoreBps).toBe(4200);
    expect(result.result.reasonCodes).toEqual(["REPLAY_RISK_HIGH"]);
  });

  it("rejects incomplete verifier output", () => {
    expect(() => normalizeSessionResponse({ sessionId: hex })).toThrow(
      ApiError,
    );
  });

  it("accepts the exact signed attestation including fingerprint commitment", () => {
    const signed = normalizeSignedAttestationResponse(signedAttestation);
    expect(signed.attestation.fingerprintHash).toBe(hex);
    expect(signed.domain.chainId).toBe(1952);
  });
});

describe("wallet authorization", () => {
  it("requests an asset challenge and creates the server-selected resource", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ authorization: assetAuthorization, domain }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            asset: { ...asset, assetId: authorizedAssetId },
            capability: {
              token: capability,
              expiresAt: new Date(60_000).toISOString(),
            },
          },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const challenge = await requestAssetAuthorization(address, metadata);
    const created = await createAsset(
      address,
      metadata,
      challenge,
      `0x${"08".repeat(65)}`,
    );
    expect(bodyAt(fetchMock, 0)).toEqual({
      action: "CREATE_ASSET",
      request: { owner: address, metadata },
    });
    expect(challenge.authorization.nonce).toBe(registrationNonce);
    expect(challenge.authorization.resource).toBe(
      createAssetId(address, challenge.authorization.nonce),
    );
    expect(bodyAt(fetchMock, 1)).toMatchObject({
      assetId: authorizedAssetId,
      owner: address,
      authorization: { nonce: registrationNonce },
    });
    expect(created.capability.token).toBe(capability);
  });

  it("requests a context-bound session challenge and creates its selected session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ authorization: verificationAuthorization, domain }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            session,
            capability: { token: capability, expiresAt: session.expiresAt },
          },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const challenge = await requestVerificationAuthorization(
      hex,
      address,
      ZERO_CONTEXT,
    );
    const created = await createVerificationSession(
      hex,
      address,
      ZERO_CONTEXT,
      challenge,
      `0x${"08".repeat(65)}`,
    );
    expect(bodyAt(fetchMock, 0)).toEqual({
      action: "CREATE_VERIFICATION_SESSION",
      request: { assetId: hex, wallet: address, context: ZERO_CONTEXT },
    });
    expect(bodyAt(fetchMock, 1)).toMatchObject({
      sessionId: hex,
      assetId: hex,
      wallet: address,
      context: ZERO_CONTEXT,
    });
    expect(created.session.sessionId).toBe(hex);
  });

  it("surfaces the verifier's nested protocol error code and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "ASSET_OWNER_REQUIRED",
              message:
                "Verification wallet must be the authenticated asset owner",
            },
          },
          403,
        ),
      ),
    );
    await expect(
      requestVerificationAuthorization(hex, address),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      reason: "ASSET_OWNER_REQUIRED",
      message: "Verification wallet must be the authenticated asset owner",
    });
  });

  it("refuses to sign a challenge whose committed payload differs from the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            authorization: {
              ...assetAuthorization,
              payloadHash: `0x${"77".repeat(32)}`,
            },
            domain,
          },
          201,
        ),
      ),
    );
    await expect(
      requestAssetAuthorization(address, metadata),
    ).rejects.toMatchObject({
      reason: "AUTHORIZATION_CHALLENGE_MISMATCH",
    });
  });

  it("refuses an asset challenge whose resource is not derived from its signed nonce", async () => {
    const unboundResource = `0x${"77".repeat(32)}` as Hex;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            authorization: {
              ...assetAuthorization,
              resource: unboundResource,
              payloadHash: hashCreateAssetAuthorizationPayload({
                assetId: unboundResource,
                owner: address,
                metadata,
              }),
            },
            domain,
          },
          201,
        ),
      ),
    );
    await expect(
      requestAssetAuthorization(address, metadata),
    ).rejects.toMatchObject({
      reason: "AUTHORIZATION_CHALLENGE_MISMATCH",
    });
  });
});

describe("resource capabilities", () => {
  it("sends the asset capability on captures and finalization", async () => {
    const frame = {
      view: "FRONT",
      imageBase64: "data:image/jpeg;base64,AAAA",
      mimeType: "image/jpeg",
      capturedAt: new Date(0).toISOString(),
      quality: {},
    } as CaptureFrame;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ captureId: hex }, 201))
      .mockResolvedValueOnce(jsonResponse({ fingerprintHash: hex }, 201))
      .mockResolvedValueOnce(jsonResponse(asset));
    vi.stubGlobal("fetch", fetchMock);

    await uploadRegistrationCapture(hex, frame, capability);
    await expect(finalizeAsset(hex, capability)).resolves.toEqual(asset);
    expect(headersAt(fetchMock, 0).Authorization).toBe(`Bearer ${capability}`);
    expect(headersAt(fetchMock, 1).Authorization).toBe(`Bearer ${capability}`);
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(
      `/api/assets/${hex}/fingerprint`,
    );
  });

  it("recovers a lost successful finalization response from the public asset", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "CAPABILITY_INVALID",
              message: "Capability was revoked",
            },
          },
          403,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(asset));
    vi.stubGlobal("fetch", fetchMock);

    await expect(finalizeAsset(hex, capability)).resolves.toEqual(asset);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rethrows finalization failure when public state is still incomplete", async () => {
    const incomplete = { ...asset, fingerprintHash: null };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "INSUFFICIENT_VIEWS",
              message: "Required views are missing",
            },
          },
          409,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(incomplete));
    vi.stubGlobal("fetch", fetchMock);

    await expect(finalizeAsset(hex, capability)).rejects.toMatchObject({
      reason: "INSUFFICIENT_VIEWS",
    });
  });

  it("sends the session capability on capture, analysis, and attestation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ captureId: hex }, 201))
      .mockResolvedValueOnce(jsonResponse(analysisResult))
      .mockResolvedValueOnce(jsonResponse(signedAttestation, 201));
    vi.stubGlobal("fetch", fetchMock);

    const frames = [0, 1, 2].map((index) => ({
      imageBase64: `data:image/jpeg;base64,AAAA${index}`,
      mimeType: "image/jpeg" as const,
      capturedAt: new Date(index + 1).toISOString(),
    }));
    await uploadVerificationCapture(hex, hex, frames, capability);
    const returned = await analyzeVerification(hex, capability);
    expect(returned.signedAttestation?.attestation.fingerprintHash).toBe(hex);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      expect.stringMatching(`/api/verifications/${hex}/capture`),
      expect.stringMatching(`/api/verifications/${hex}/analyze`),
      expect.stringMatching(`/api/verifications/${hex}/attestation`),
    ]);
    expect(
      [0, 1, 2].map((index) => headersAt(fetchMock, index).Authorization),
    ).toEqual([
      `Bearer ${capability}`,
      `Bearer ${capability}`,
      `Bearer ${capability}`,
    ]);
    expect(bodyAt(fetchMock, 0)).toEqual({ challengeId: hex, frames });
  });

  it("does not leak capabilities into a URL or JSON body", async () => {
    const frames = [1, 2, 3].map((millisecond) => ({
      imageBase64: "data:image/jpeg;base64,AAAA",
      mimeType: "image/jpeg" as const,
      capturedAt: new Date(millisecond).toISOString(),
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ captureId: hex }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await uploadVerificationCapture(hex, hex, frames, capability);

    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(capability);
    expect(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    ).not.toContain(capability);
    expect(headersAt(fetchMock, 0).Authorization).toBe(`Bearer ${capability}`);
  });
});
