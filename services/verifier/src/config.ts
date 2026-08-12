import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SCORE_POLICY,
  ScorePolicySchema,
  type ScorePolicy,
} from "@alive/shared";
import type { Address, Hex } from "viem";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

export interface VerifierConfig {
  host: string;
  port: number;
  databasePath: string;
  evidencePath: string;
  evidenceResetBoundary: string;
  sessionTtlSeconds: number;
  attestationTtlSeconds: number;
  authorizationAudience: string;
  authorizationChainId: number;
  authorizationTtlSeconds: number;
  registrationCapabilityTtlSeconds: number;
  demoMode: boolean;
  signingPrivateKey?: Hex;
  chainId?: number;
  verifyingContract?: Address;
  enableOcr: boolean;
  enableNeuralEmbedding: boolean;
  neuralModel: string;
  maximumImageBytes: number;
  allowedOrigins: string[];
  demoResetToken?: string;
  scorePolicy: ScorePolicy;
}

function integer(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function enabled(value: string | undefined): boolean {
  return value?.toLowerCase() === "true" || value === "1";
}

function optionalPrivateKey(value: string | undefined): Hex | undefined {
  if (value === undefined || value.includes("YOUR_DEVELOPMENT"))
    return undefined;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value))
    throw new Error("ALIVE_VERIFIER_PRIVATE_KEY must be 32-byte hex");
  return value as Hex;
}

function optionalAddress(value: string | undefined): Address | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value))
    throw new Error("Attestation registry address is invalid");
  return value as Address;
}

function workspacePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value);
}

function databasePath(value: string | undefined): string {
  if (value === ":memory:") return value;
  const normalized = value?.startsWith("file:")
    ? value.slice(5)
    : (value ?? "./storage/database/alive.sqlite");
  return workspacePath(normalized);
}

function allowedOrigins(value: string | undefined): string[] {
  return (value ?? "http://127.0.0.1:3000,http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => origin.length > 0);
}

function authorizationAudience(value: string | undefined): string {
  const parsed = new URL(value ?? "http://127.0.0.1:4100");
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search
  ) {
    throw new Error(
      "ALIVE_AUTH_AUDIENCE must be a canonical HTTP(S) URL without credentials, query, or fragment",
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

export function loadVerifierConfig(
  environment: NodeJS.ProcessEnv = process.env,
): VerifierConfig {
  const rawPolicy = environment.ALIVE_SCORE_POLICY_JSON;
  const scorePolicy =
    rawPolicy === undefined
      ? DEFAULT_SCORE_POLICY
      : ScorePolicySchema.parse(JSON.parse(rawPolicy) as unknown);
  const chainValue =
    environment.ALIVE_CHAIN_ID ?? environment.NEXT_PUBLIC_CHAIN_ID;
  const signingPrivateKey = optionalPrivateKey(
    environment.ALIVE_VERIFIER_PRIVATE_KEY,
  );
  const verifyingContract = optionalAddress(
    environment.ALIVE_ATTESTATION_REGISTRY_ADDRESS ??
      environment.NEXT_PUBLIC_ATTESTATION_REGISTRY_ADDRESS,
  );

  return {
    host: environment.VERIFIER_HOST ?? "127.0.0.1",
    port: integer(environment.VERIFIER_PORT, 4_100, "VERIFIER_PORT"),
    databasePath: databasePath(environment.DATABASE_URL),
    evidencePath: workspacePath(
      environment.EVIDENCE_STORAGE_PATH ?? "./storage/evidence",
    ),
    evidenceResetBoundary: workspacePath("./storage"),
    sessionTtlSeconds: integer(
      environment.VERIFICATION_SESSION_TTL_SECONDS,
      300,
      "VERIFICATION_SESSION_TTL_SECONDS",
    ),
    attestationTtlSeconds: integer(
      environment.ATTESTATION_TTL_SECONDS,
      300,
      "ATTESTATION_TTL_SECONDS",
    ),
    authorizationAudience: authorizationAudience(
      environment.ALIVE_AUTH_AUDIENCE,
    ),
    authorizationChainId: integer(
      environment.ALIVE_AUTH_CHAIN_ID ?? chainValue,
      31_337,
      "ALIVE_AUTH_CHAIN_ID",
    ),
    authorizationTtlSeconds: integer(
      environment.WALLET_AUTH_TTL_SECONDS,
      120,
      "WALLET_AUTH_TTL_SECONDS",
    ),
    registrationCapabilityTtlSeconds: integer(
      environment.REGISTRATION_CAPABILITY_TTL_SECONDS,
      1_800,
      "REGISTRATION_CAPABILITY_TTL_SECONDS",
    ),
    demoMode: enabled(environment.DEMO_MODE),
    ...(signingPrivateKey === undefined ? {} : { signingPrivateKey }),
    ...(chainValue === undefined
      ? {}
      : { chainId: integer(chainValue, 1_952, "ALIVE_CHAIN_ID") }),
    ...(verifyingContract === undefined ? {} : { verifyingContract }),
    enableOcr: enabled(environment.ALIVE_ENABLE_OCR),
    enableNeuralEmbedding: enabled(environment.ALIVE_ENABLE_NEURAL_EMBEDDING),
    neuralModel:
      environment.ALIVE_NEURAL_MODEL ?? "Xenova/clip-vit-base-patch32",
    maximumImageBytes: integer(
      environment.ALIVE_MAX_IMAGE_BYTES,
      8 * 1024 * 1024,
      "ALIVE_MAX_IMAGE_BYTES",
    ),
    allowedOrigins: allowedOrigins(environment.VERIFIER_ALLOWED_ORIGINS),
    ...(environment.DEMO_RESET_TOKEN?.trim()
      ? { demoResetToken: environment.DEMO_RESET_TOKEN.trim() }
      : {}),
    scorePolicy,
  };
}
