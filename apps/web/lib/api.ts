import {
  AssetRecordSchema,
  AuthorizedAssetCreateResponseSchema,
  AuthorizedVerificationSessionCreateResponseSchema,
  createAssetId,
  hashCreateAssetAuthorizationPayload,
  hashCreateVerificationSessionAuthorizationPayload,
  SignedAttestationSchema,
  VerificationResultSchema,
  VerificationSessionSchema,
  WalletAuthorizationChallengeResponseSchema,
  type WalletAuthorization,
  type WalletAuthorizationDomain,
} from "@alive/shared";
import type {
  Address,
  AssetMetadata,
  AssetRecord,
  CaptureFrame,
  Hex,
  ResourceCapability,
  SignedAttestation,
  VerificationAnalysis,
  VerificationResult,
  VerificationSession,
} from "./types";

export const verifierUrl = (
  process.env.NEXT_PUBLIC_VERIFIER_URL ?? "http://127.0.0.1:4100"
).replace(/\/$/, "");
export const authorizationAudience = (
  process.env.NEXT_PUBLIC_ALIVE_AUTH_AUDIENCE ?? verifierUrl
).replace(/\/$/, "");
export const ZERO_CONTEXT = `0x${"00".repeat(32)}` as Hex;

export interface AuthorizationChallenge {
  authorization: WalletAuthorization;
  domain: WalletAuthorizationDomain;
}

export interface AuthorizedAssetResource {
  asset: AssetRecord;
  capability: ResourceCapability;
}

export interface AuthorizedVerificationResource {
  session: VerificationSession;
  capability: ResourceCapability;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(
  path: string,
  init: RequestInit = {},
  capability?: Hex,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${verifierUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(capability ? { Authorization: `Bearer ${capability}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      `Verifier is unreachable at ${verifierUrl}.`,
      0,
      "VERIFIER_UNAVAILABLE",
    );
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error =
      isRecord(payload) && isRecord(payload.error) ? payload.error : payload;
    const detail = isRecord(error) ? stringValue(error.message) : undefined;
    const reason = isRecord(error) ? stringValue(error.code) : undefined;
    throw new ApiError(
      detail ?? `Verifier request failed with status ${response.status}.`,
      response.status,
      reason,
    );
  }
  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function unwrap(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload))
    throw new ApiError(
      "Verifier returned an invalid JSON object.",
      502,
      "INVALID_RESPONSE",
    );
  if (isRecord(payload.data)) return payload.data;
  return payload;
}

function normalizeAsset(payload: unknown): AssetRecord {
  const root = unwrap(payload);
  const parsed = AssetRecordSchema.safeParse(
    isRecord(root.asset) ? root.asset : root,
  );
  if (!parsed.success)
    throw new ApiError(
      "Verifier asset response is incomplete.",
      502,
      "INVALID_ASSET_RESPONSE",
    );
  return parsed.data as AssetRecord;
}

function sameHex(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function assertAuthorizationChallenge(
  challenge: AuthorizationChallenge,
  expected: {
    action: WalletAuthorization["action"];
    wallet: Address;
    context: Hex;
    payloadHash: Hex;
  },
): void {
  const authorization = challenge.authorization;
  if (
    authorization.action !== expected.action ||
    !sameHex(authorization.wallet, expected.wallet) ||
    !sameHex(authorization.context, expected.context) ||
    !sameHex(authorization.payloadHash, expected.payloadHash) ||
    authorization.audience.replace(/\/$/, "") !== authorizationAudience ||
    /^0x0{64}$/i.test(authorization.resource)
  ) {
    throw new ApiError(
      "Verifier authorization challenge does not match the requested operation.",
      502,
      "AUTHORIZATION_CHALLENGE_MISMATCH",
    );
  }
}

export function normalizeSessionResponse(
  payload: unknown,
): VerificationSession {
  const root = unwrap(payload);
  const session = isRecord(root.session) ? root.session : root;
  const parsed = VerificationSessionSchema.safeParse(session);
  if (!parsed.success)
    throw new ApiError(
      "Verifier session response is incomplete.",
      502,
      "INVALID_SESSION_RESPONSE",
    );
  return parsed.data as VerificationSession;
}

export function normalizeAnalysisResponse(
  payload: unknown,
): VerificationAnalysis {
  const root = unwrap(payload);
  const resultValue = isRecord(root.result) ? root.result : root;
  const parsed = VerificationResultSchema.safeParse(resultValue);
  if (!parsed.success)
    throw new ApiError(
      "Verifier analysis response is incomplete.",
      502,
      "INVALID_ANALYSIS_RESPONSE",
    );
  const analysis: VerificationAnalysis = {
    result: parsed.data as VerificationResult,
  };
  const signed = isRecord(root.signedAttestation)
    ? root.signedAttestation
    : isRecord(root.attestation) && stringValue(root.signature)
      ? root
      : root.attestation;
  if (isRecord(signed) && stringValue(signed.signature)) {
    const parsedSigned = SignedAttestationSchema.safeParse(signed);
    if (parsedSigned.success)
      analysis.signedAttestation = parsedSigned.data as SignedAttestation;
  }
  return analysis;
}

export function normalizeSignedAttestationResponse(
  payload: unknown,
): SignedAttestation {
  const root = unwrap(payload);
  const signed = isRecord(root.signedAttestation)
    ? root.signedAttestation
    : root;
  const parsed = SignedAttestationSchema.safeParse(signed);
  if (!parsed.success)
    throw new ApiError(
      "Verifier attestation response is incomplete.",
      502,
      "INVALID_ATTESTATION_RESPONSE",
    );
  return parsed.data as SignedAttestation;
}

export async function requestAssetAuthorization(
  owner: Address,
  metadata: AssetMetadata,
): Promise<AuthorizationChallenge> {
  const payload = await request("/api/auth/challenge", {
    method: "POST",
    body: JSON.stringify({
      action: "CREATE_ASSET",
      request: { owner, metadata },
    }),
  });
  const parsed = WalletAuthorizationChallengeResponseSchema.safeParse(payload);
  if (!parsed.success || parsed.data.authorization.action !== "CREATE_ASSET") {
    throw new ApiError(
      "Verifier authorization challenge is incomplete.",
      502,
      "INVALID_AUTHORIZATION_RESPONSE",
    );
  }
  const challenge = parsed.data;
  assertAuthorizationChallenge(challenge, {
    action: "CREATE_ASSET",
    wallet: owner,
    context: ZERO_CONTEXT,
    payloadHash: hashCreateAssetAuthorizationPayload({
      assetId: challenge.authorization.resource,
      owner,
      metadata,
    }),
  });
  if (
    !sameHex(
      challenge.authorization.resource,
      createAssetId(owner, challenge.authorization.nonce),
    )
  ) {
    throw new ApiError(
      "Verifier asset authorization is not bound to the requested owner and registration nonce.",
      502,
      "AUTHORIZATION_CHALLENGE_MISMATCH",
    );
  }
  return challenge;
}

export async function createAsset(
  owner: Address,
  metadata: AssetMetadata,
  challenge: AuthorizationChallenge,
  signature: Hex,
): Promise<AuthorizedAssetResource> {
  const payload = await request("/api/assets", {
    method: "POST",
    body: JSON.stringify({
      assetId: challenge.authorization.resource,
      owner,
      metadata,
      authorization: { nonce: challenge.authorization.nonce, signature },
    }),
  });
  const parsed = AuthorizedAssetCreateResponseSchema.safeParse(payload);
  if (!parsed.success)
    throw new ApiError(
      "Verifier asset authorization response is incomplete.",
      502,
      "INVALID_ASSET_RESPONSE",
    );
  return parsed.data as AuthorizedAssetResource;
}

export async function uploadRegistrationCapture(
  assetId: Hex,
  frame: CaptureFrame,
  capability: Hex,
): Promise<void> {
  await request(
    `/api/assets/${assetId}/captures`,
    {
      method: "POST",
      body: JSON.stringify({
        view: frame.view,
        imageBase64: frame.imageBase64,
        mimeType: frame.mimeType,
        capturedAt: frame.capturedAt,
      }),
    },
    capability,
  );
}

export async function finalizeAsset(
  assetId: Hex,
  capability: Hex,
): Promise<AssetRecord> {
  try {
    await request(
      `/api/assets/${assetId}/fingerprint`,
      { method: "POST" },
      capability,
    );
  } catch (originalError) {
    try {
      const recovered = await getAsset(assetId);
      if (recovered.fingerprintHash) return recovered;
    } catch {
      // Preserve the mutation error if recovery cannot prove finalization.
    }
    throw originalError;
  }
  return getAsset(assetId);
}

export async function getAsset(assetId: string): Promise<AssetRecord> {
  return normalizeAsset(await request(`/api/assets/${assetId}`));
}

export async function listAssets(owner?: string): Promise<AssetRecord[]> {
  const query = owner ? `?owner=${encodeURIComponent(owner)}` : "";
  const root = unwrap(await request(`/api/assets${query}`));
  const items = root.assets ?? root.items;
  if (!Array.isArray(items)) return [];
  const parsed = AssetRecordSchema.array().safeParse(items);
  if (!parsed.success)
    throw new ApiError(
      "Verifier asset list is incomplete.",
      502,
      "INVALID_ASSET_LIST_RESPONSE",
    );
  return parsed.data as AssetRecord[];
}

export async function requestVerificationAuthorization(
  assetId: Hex,
  wallet: Address,
  context: Hex = ZERO_CONTEXT,
): Promise<AuthorizationChallenge> {
  const payload = await request("/api/auth/challenge", {
    method: "POST",
    body: JSON.stringify({
      action: "CREATE_VERIFICATION_SESSION",
      request: { assetId, wallet, context },
    }),
  });
  const parsed = WalletAuthorizationChallengeResponseSchema.safeParse(payload);
  if (
    !parsed.success ||
    parsed.data.authorization.action !== "CREATE_VERIFICATION_SESSION"
  ) {
    throw new ApiError(
      "Verifier authorization challenge is incomplete.",
      502,
      "INVALID_AUTHORIZATION_RESPONSE",
    );
  }
  const challenge = parsed.data;
  assertAuthorizationChallenge(challenge, {
    action: "CREATE_VERIFICATION_SESSION",
    wallet,
    context,
    payloadHash: hashCreateVerificationSessionAuthorizationPayload({
      sessionId: challenge.authorization.resource,
      assetId,
      wallet,
      context,
    }),
  });
  return challenge;
}

export async function createVerificationSession(
  assetId: Hex,
  wallet: Address,
  context: Hex,
  challenge: AuthorizationChallenge,
  signature: Hex,
): Promise<AuthorizedVerificationResource> {
  const payload = await request("/api/verifications/session", {
    method: "POST",
    body: JSON.stringify({
      sessionId: challenge.authorization.resource,
      assetId,
      wallet,
      context,
      authorization: { nonce: challenge.authorization.nonce, signature },
    }),
  });
  const parsed =
    AuthorizedVerificationSessionCreateResponseSchema.safeParse(payload);
  if (!parsed.success)
    throw new ApiError(
      "Verifier session authorization response is incomplete.",
      502,
      "INVALID_SESSION_RESPONSE",
    );
  return parsed.data as AuthorizedVerificationResource;
}

export async function uploadVerificationCapture(
  sessionId: Hex,
  challengeId: Hex,
  frames: Array<{
    imageBase64: string;
    mimeType: "image/jpeg";
    capturedAt: string;
  }>,
  capability: Hex,
): Promise<void> {
  await request(
    `/api/verifications/${sessionId}/capture`,
    {
      method: "POST",
      body: JSON.stringify({ challengeId, frames }),
    },
    capability,
  );
}

export async function analyzeVerification(
  sessionId: Hex,
  capability: Hex,
): Promise<VerificationAnalysis> {
  const analysis = normalizeAnalysisResponse(
    await request(
      `/api/verifications/${sessionId}/analyze`,
      { method: "POST" },
      capability,
    ),
  );
  try {
    analysis.signedAttestation = normalizeSignedAttestationResponse(
      await request(
        `/api/verifications/${sessionId}/attestation`,
        { method: "POST" },
        capability,
      ),
    );
  } catch (error) {
    analysis.attestationError =
      error instanceof Error
        ? error.message
        : "Signed attestation issuance failed.";
  }
  return analysis;
}
