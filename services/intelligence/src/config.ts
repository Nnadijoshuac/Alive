import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

export const LlmProviderSchema = z.enum([
  "ollama",
  "openai-compatible",
  "groq",
  "disabled",
]);
export type LlmProviderName = z.infer<typeof LlmProviderSchema>;

export type IntelligenceConfig = {
  host: string;
  port: number;
  databasePath: string;
  catalogPath: string;
  sourceDocumentsPath: string;
  allowedOrigins: string[];
  llm: {
    provider: LlmProviderName;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    timeoutMs: number;
  };
  eligibilitySigner: {
    privateKey?: `0x${string}`;
    chainId?: number;
    verifyingContract?: `0x${string}`;
    ttlSeconds: number;
  };
  /**
   * Enables the /api/demo/* controls that deliberately degrade demo market
   * data (the Attack Lab's "break NAV"). Off unless DEMO_MODE=true, so these
   * mutating routes cannot be reached in a normal deployment.
   */
  demoMode: boolean;
  /**
   * How often the market monitor re-reads each asset. Configurable because
   * the right cadence depends on the source: a NAV feed with a 26.5h
   * heartbeat changes on a daily business cycle, so a few minutes already
   * catches every change that can occur, and polling per second would add
   * load while finding nothing.
   */
  marketMonitorIntervalSeconds: number;
  /**
   * Whether the persistent monitor worker starts with the service. Off by
   * default so a plain `pnpm start` never spins up a background polling
   * loop the operator did not ask for.
   */
  marketMonitorEnabled: boolean;
};

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum = 1,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum)
    throw new Error(`${name} must be an integer >= ${minimum}`);
  return parsed;
}

function workspacePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value);
}

function origins(value: string | undefined): string[] {
  return (value ?? "http://127.0.0.1:3000,http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/u, ""))
    .filter(Boolean);
}

function optionalUrl(
  value: string | undefined,
  name: string,
): string | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new URL(value);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      `${name} must be an HTTP(S) URL without embedded credentials`,
    );
  }
  return parsed.toString().replace(/\/$/u, "");
}

/**
 * GROQ_API_KEY is the documented, provider-specific name; LLM_API_KEY is the
 * generic fallback so an existing openai-compatible/ollama setup keeps
 * working unchanged. Never logged, never defaulted to a placeholder.
 */
function apiKeyFor(
  provider: LlmProviderName,
  environment: NodeJS.ProcessEnv,
): string | undefined {
  if (provider === "groq") {
    return environment.GROQ_API_KEY?.trim() || environment.LLM_API_KEY?.trim();
  }
  return environment.LLM_API_KEY?.trim();
}

export function loadIntelligenceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): IntelligenceConfig {
  const provider = LlmProviderSchema.parse(
    environment.LLM_PROVIDER ?? "disabled",
  );
  const model = environment.LLM_MODEL?.trim();
  const configuredBaseUrl = optionalUrl(
    environment.LLM_BASE_URL,
    "LLM_BASE_URL",
  );
  const baseUrl =
    configuredBaseUrl ??
    (provider === "ollama"
      ? "http://127.0.0.1:11434"
      : provider === "groq"
        ? "https://api.groq.com/openai/v1"
        : undefined);
  if (provider !== "disabled" && !model) {
    throw new Error(
      "LLM_MODEL is required when the AI policy compiler is enabled",
    );
  }
  if (provider !== "disabled" && !baseUrl) {
    throw new Error(
      "LLM_BASE_URL is required when the AI policy compiler is enabled",
    );
  }

  const rawDatabase =
    environment.INTELLIGENCE_DATABASE_URL ??
    "./storage/database/intelligence.sqlite";
  return {
    host: environment.INTELLIGENCE_HOST ?? "127.0.0.1",
    port: positiveInteger(
      environment.INTELLIGENCE_PORT,
      4_200,
      "INTELLIGENCE_PORT",
    ),
    databasePath:
      rawDatabase === ":memory:"
        ? rawDatabase
        : workspacePath(rawDatabase.replace(/^file:/u, "")),
    catalogPath: workspacePath(
      environment.RWA_CATALOG_PATH ?? "./data/rwa-catalog/catalog.demo.json",
    ),
    sourceDocumentsPath: workspacePath(
      environment.RWA_SOURCE_DOCUMENTS_PATH ?? "./data/source-documents",
    ),
    allowedOrigins: origins(environment.INTELLIGENCE_ALLOWED_ORIGINS),
    llm: (() => {
      const apiKey = apiKeyFor(provider, environment);
      return {
        provider,
        ...(model ? { model } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(apiKey ? { apiKey } : {}),
        timeoutMs: positiveInteger(
          environment.LLM_TIMEOUT_MS,
          30_000,
          "LLM_TIMEOUT_MS",
        ),
      };
    })(),
    eligibilitySigner: eligibilitySignerConfig(environment),
    demoMode: environment.DEMO_MODE?.trim().toLowerCase() === "true",
    marketMonitorIntervalSeconds: positiveInteger(
      environment.MARKET_MONITOR_INTERVAL_SECONDS,
      300,
      "MARKET_MONITOR_INTERVAL_SECONDS",
      30,
    ),
    marketMonitorEnabled:
      environment.MARKET_MONITOR_ENABLED?.trim().toLowerCase() === "true",
  };
}

function eligibilitySignerConfig(
  environment: NodeJS.ProcessEnv,
): IntelligenceConfig["eligibilitySigner"] {
  const privateKey = environment.ELIGIBILITY_SIGNER_PRIVATE_KEY?.trim();
  const chainIdRaw = environment.ELIGIBILITY_CHAIN_ID?.trim();
  const verifyingContract = environment.ELIGIBILITY_REGISTRY_ADDRESS?.trim();
  const ttlSeconds = positiveInteger(
    environment.ELIGIBILITY_ATTESTATION_TTL_SECONDS,
    900,
    "ELIGIBILITY_ATTESTATION_TTL_SECONDS",
  );
  if (!privateKey && !chainIdRaw && !verifyingContract) {
    return { ttlSeconds };
  }
  if (!privateKey || !chainIdRaw || !verifyingContract) {
    throw new Error(
      "ELIGIBILITY_SIGNER_PRIVATE_KEY, ELIGIBILITY_CHAIN_ID, and ELIGIBILITY_REGISTRY_ADDRESS must all be set together, or all left unset",
    );
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("ELIGIBILITY_SIGNER_PRIVATE_KEY must be a 32-byte hex value");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(verifyingContract)) {
    throw new Error("ELIGIBILITY_REGISTRY_ADDRESS must be a 20-byte hex address");
  }
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("ELIGIBILITY_CHAIN_ID must be a positive integer");
  }
  return {
    privateKey: privateKey as `0x${string}`,
    chainId,
    verifyingContract: verifyingContract as `0x${string}`,
    ttlSeconds,
  };
}
