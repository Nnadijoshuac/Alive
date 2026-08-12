import {
  AssetRecordSchema,
  SignedAttestationSchema,
  VerificationResultSchema,
  VerificationSessionSchema,
} from "@alive/shared";
import type {
  Address,
  AssetMetadata,
  AssetRecord,
  CaptureFrame,
  Hex,
  SignedAttestation,
  VerificationAnalysis,
  VerificationResult,
  VerificationSession,
} from "./types";

export const verifierUrl = (process.env.NEXT_PUBLIC_VERIFIER_URL ?? "http://127.0.0.1:4100").replace(/\/$/, "");

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

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${verifierUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(`Verifier is unreachable at ${verifierUrl}.`, 0, "VERIFIER_UNAVAILABLE");
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : payload;
    const detail = isRecord(error) ? stringValue(error.message) : undefined;
    const reason = isRecord(error) ? stringValue(error.code) : undefined;
    throw new ApiError(detail ?? `Verifier request failed with status ${response.status}.`, response.status, reason);
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
  if (!isRecord(payload)) throw new ApiError("Verifier returned an invalid JSON object.", 502, "INVALID_RESPONSE");
  if (isRecord(payload.data)) return payload.data;
  return payload;
}

export function normalizeSessionResponse(payload: unknown): VerificationSession {
  const root = unwrap(payload);
  const session = isRecord(root.session) ? root.session : root;
  const parsed = VerificationSessionSchema.safeParse(session);
  if (!parsed.success) {
    throw new ApiError("Verifier session response is incomplete.", 502, "INVALID_SESSION_RESPONSE");
  }
  return parsed.data as VerificationSession;
}

export function normalizeAnalysisResponse(payload: unknown): VerificationAnalysis {
  const root = unwrap(payload);
  const resultValue = isRecord(root.result) ? root.result : root;
  const parsed = VerificationResultSchema.safeParse(resultValue);
  if (!parsed.success) {
    throw new ApiError("Verifier analysis response is incomplete.", 502, "INVALID_ANALYSIS_RESPONSE");
  }
  const analysis: VerificationAnalysis = { result: parsed.data as VerificationResult };
  const signed = isRecord(root.signedAttestation)
    ? root.signedAttestation
    : isRecord(root.attestation) && stringValue(root.signature)
      ? root
      : root.attestation;
  if (isRecord(signed) && stringValue(signed.signature)) {
    const parsedSigned = SignedAttestationSchema.safeParse(signed);
    if (parsedSigned.success) analysis.signedAttestation = parsedSigned.data as SignedAttestation;
  }
  return analysis;
}

export function normalizeSignedAttestationResponse(payload: unknown): SignedAttestation {
  const root = unwrap(payload);
  const signed = isRecord(root.signedAttestation) ? root.signedAttestation : root;
  const parsed = SignedAttestationSchema.safeParse(signed);
  if (!parsed.success) {
    throw new ApiError("Verifier attestation response is incomplete.", 502, "INVALID_ATTESTATION_RESPONSE");
  }
  return parsed.data as SignedAttestation;
}

export async function createAsset(owner: Address, metadata: AssetMetadata): Promise<AssetRecord> {
  const payload = await request("/api/assets", {
    method: "POST",
    body: JSON.stringify({ owner, metadata }),
  });
  const root = unwrap(payload);
  const parsed = AssetRecordSchema.safeParse(isRecord(root.asset) ? root.asset : root);
  if (!parsed.success) throw new ApiError("Verifier asset response is incomplete.", 502, "INVALID_ASSET_RESPONSE");
  return parsed.data as AssetRecord;
}

export async function uploadRegistrationCapture(assetId: Hex, frame: CaptureFrame): Promise<void> {
  await request(`/api/assets/${assetId}/captures`, {
    method: "POST",
    body: JSON.stringify({
      view: frame.view,
      imageBase64: frame.imageBase64,
      mimeType: frame.mimeType,
      capturedAt: frame.capturedAt,
    }),
  });
}

export async function finalizeAsset(assetId: Hex): Promise<AssetRecord> {
  await request(`/api/assets/${assetId}/fingerprint`, { method: "POST" });
  return getAsset(assetId);
}

export async function getAsset(assetId: string): Promise<AssetRecord> {
  const payload = await request(`/api/assets/${assetId}`);
  const root = unwrap(payload);
  const parsed = AssetRecordSchema.safeParse(isRecord(root.asset) ? root.asset : root);
  if (!parsed.success) throw new ApiError("Verifier asset response is incomplete.", 502, "INVALID_ASSET_RESPONSE");
  return parsed.data as AssetRecord;
}

export async function listAssets(owner?: string): Promise<AssetRecord[]> {
  const query = owner ? `?owner=${encodeURIComponent(owner)}` : "";
  const payload = await request(`/api/assets${query}`);
  const root = unwrap(payload);
  const items = root.assets ?? root.items;
  if (!Array.isArray(items)) return [];
  const parsed = AssetRecordSchema.array().safeParse(items);
  if (!parsed.success) throw new ApiError("Verifier asset list is incomplete.", 502, "INVALID_ASSET_LIST_RESPONSE");
  return parsed.data as AssetRecord[];
}

export async function createVerificationSession(
  assetId: Hex,
  wallet: Address,
  context?: Hex,
): Promise<VerificationSession> {
  const body: { assetId: Hex; wallet: Address; context?: Hex } = { assetId, wallet };
  if (context) body.context = context;
  return normalizeSessionResponse(
    await request("/api/verifications/session", { method: "POST", body: JSON.stringify(body) }),
  );
}

export async function uploadVerificationCapture(
  sessionId: Hex,
  challengeId: Hex,
  imageBase64: string,
  capturedAt: string,
): Promise<void> {
  await request(`/api/verifications/${sessionId}/capture`, {
    method: "POST",
    body: JSON.stringify({ challengeId, imageBase64, mimeType: "image/jpeg", capturedAt }),
  });
}

export async function analyzeVerification(sessionId: Hex): Promise<VerificationAnalysis> {
  const analysis = normalizeAnalysisResponse(
    await request(`/api/verifications/${sessionId}/analyze`, { method: "POST" }),
  );
  try {
    analysis.signedAttestation = normalizeSignedAttestationResponse(
      await request(`/api/verifications/${sessionId}/attestation`, { method: "POST" }),
    );
  } catch (error) {
    analysis.attestationError = error instanceof Error ? error.message : "Signed attestation issuance failed.";
  }
  return analysis;
}
