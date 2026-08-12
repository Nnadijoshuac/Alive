import type {
  AssetFingerprint,
  RegistrationView,
  VerificationChallenge,
  VerificationResult,
  VerificationSession,
  VerificationBurstFingerprint,
  ViewFingerprint,
} from "@alive/shared";
import {
  createAssetId,
  getAliveAuthorizationTypedData,
  type AssetMetadata,
  type WalletAuthorization,
  type WalletAuthorizationDomain,
} from "@alive/shared";
import { privateKeyToAccount } from "viem/accounts";

export const ownerAccount = privateKeyToAccount(`0x${"22".repeat(32)}`);
export const owner = ownerAccount.address;
export const registrationNonce = `0x${"11".repeat(32)}` as const;
export const assetId = createAssetId(owner, registrationNonce);
export const zeroBytes32 = `0x${"00".repeat(32)}` as const;

export function viewFingerprint(view: RegistrationView, suffix = "01"): ViewFingerprint {
  return {
    view,
    evidenceHash: `0x${suffix.repeat(32)}`,
    spatialColorEmbedding: [0.8, 0.4, 0.2],
    gradientDescriptor: [0.7, 0.3, 0.1],
    perceptualHash: suffix.repeat(8),
    quality: { blurScore: 0.9, exposureScore: 0.9, usable: true, width: 192, height: 192 },
    ocrText: [],
    capturedAt: "2026-01-01T00:00:01.000Z",
  };
}

export function assetFingerprint(): AssetFingerprint {
  return {
    fingerprintVersion: 1,
    assetId,
    views: [viewFingerprint("FRONT")],
    identifiers: { normalizedText: [], source: "NONE" },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

export function verificationBurst(
  view: RegistrationView,
  suffixes: [string, string, string] = ["09", "0a", "0b"],
  intraChallengeMotion = 0.5,
): VerificationBurstFingerprint {
  return {
    frameFingerprints: suffixes.map((suffix, index) => ({
      ...viewFingerprint(view, suffix),
      capturedAt: `2026-01-01T00:00:04.${String(index * 100).padStart(3, "0")}Z`,
    })) as VerificationBurstFingerprint["frameFingerprints"],
    intraChallengeMotion,
  };
}

export function challenge(sequence = 0, suffix = "33"): VerificationChallenge {
  return {
    id: `0x${suffix.repeat(32)}`,
    sequence,
    type: "SHOW_FRONT",
    prompt: "Show front",
    completedAt: null,
  };
}

export function session(overrides: Partial<VerificationSession> = {}): VerificationSession {
  return {
    sessionId: `0x${"44".repeat(32)}`,
    assetId,
    wallet: owner,
    nonce: `0x${"55".repeat(32)}`,
    context: zeroBytes32,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T00:05:00.000Z",
    status: "PENDING",
    challenges: [challenge()],
    ...overrides,
  };
}

export function result(sessionId: VerificationResult["sessionId"]): VerificationResult {
  return {
    assetId,
    sessionId,
    identityScore: 0.9,
    livenessScore: 0.9,
    integrityScore: 0.9,
    identityScoreBps: 9_000,
    livenessScoreBps: 9_000,
    integrityScoreBps: 9_000,
    verified: true,
    signals: {
      embeddingSimilarity: 0.9,
      localFeatureSimilarity: 0.9,
      identifierExpected: false,
      identifierCriticalMismatch: false,
      multiViewConsistency: 1,
      challengeCompletion: 1,
      motionConsistency: 0.9,
      captureFreshness: 1,
      replayRisk: 0,
      imageQuality: 0.9,
      visualIntegrity: 0.9,
    },
    reasonCodes: [],
    evidenceHash: `0x${"66".repeat(32)}`,
    timestamp: "2026-01-01T00:00:30.000Z",
  };
}

export const authorizationDomain: WalletAuthorizationDomain = {
  name: "ALIVE Verifier Authorization",
  version: "1",
  chainId: 31_337,
};

export async function signAuthorization(authorization: WalletAuthorization): Promise<`0x${string}`> {
  return ownerAccount.signTypedData(getAliveAuthorizationTypedData(authorization, authorizationDomain));
}

export const testAssetMetadata: AssetMetadata = { name: "API test asset", category: "COMPUTER" };
