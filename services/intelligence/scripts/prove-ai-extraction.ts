/**
 * Proof 2 closing script: real Superstate/Invesco USTB documents -> Groq ->
 * strict structured extraction -> Zod validation -> source validation ->
 * persisted Asset Passport, driven entirely through ALIVE's real running
 * HTTP API. No model-call or extraction logic is reimplemented here -- this
 * script only calls the same endpoints a browser or curl would.
 *
 * Prerequisites:
 *   1. GROQ_API_KEY, LLM_PROVIDER=groq, LLM_MODEL=openai/gpt-oss-20b set
 *      (via the repo-root .env, auto-loaded by bootstrap-env.ts, or your
 *      shell environment).
 *   2. The intelligence service running and reachable (see README below /
 *      docs/AI.md for the startup command).
 *
 * Usage:
 *   pnpm --filter @alive/intelligence prove:ai
 *   pnpm --filter @alive/intelligence prove:ai -- --url http://127.0.0.1:4200
 */
import "../src/bootstrap-env.js";

import { RwaAssetSchema } from "@alive/shared";

import { officialSourcesForAsset } from "../src/data/official-sources.js";

const urlFlagIndex = process.argv.indexOf("--url");
const HOST =
  (urlFlagIndex !== -1 ? process.argv[urlFlagIndex + 1] : undefined) ??
  process.env.INTELLIGENCE_URL ??
  "http://127.0.0.1:4200";

const ASSET_ID = "ttbill-b";

// Single source of truth for these documents is official-sources.ts -- the
// same registry the interactive /verify UI's "ingest-official-sources"
// endpoint reads, so this script proves the exact path a real user's
// browser exercises, not a parallel copy of the same text.
const OFFICIAL_SOURCES = officialSourcesForAsset(ASSET_ID) ?? [];

type FetchResult = { status: number; body: unknown };

async function call(
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
): Promise<FetchResult> {
  const response = await fetch(`${HOST}${path}`, {
    method,
    ...(payload !== undefined
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }
      : {}),
  });
  const body = await response.json().catch(() => undefined);
  return { status: response.status, body };
}

function fail(message: string): never {
  process.stderr.write(`\nFAIL: ${message}\n`);
  process.exit(1);
}

function section(title: string): void {
  process.stdout.write(`\n=== ${title} ===\n`);
}

async function main(): Promise<void> {
  section("1. Intelligence API reachability");
  let health: FetchResult;
  try {
    health = await call("GET", "/health");
  } catch (error) {
    fail(
      `Could not reach ${HOST}. Start the intelligence service first (see docs/AI.md). ` +
        `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (health.status !== 200) fail(`GET /health returned HTTP ${health.status}`);
  const healthBody = health.body as { llm?: { provider?: string; configured?: boolean; model?: string } };
  process.stdout.write(`Reachable at ${HOST}\n`);
  process.stdout.write(`LLM provider: ${healthBody.llm?.provider} (configured: ${healthBody.llm?.configured}, model: ${healthBody.llm?.model})\n`);
  if (healthBody.llm?.provider !== "groq" || !healthBody.llm.configured) {
    fail(
      "The running service is not configured for GroqCloud. Set LLM_PROVIDER=groq, " +
        "LLM_MODEL=openai/gpt-oss-20b, and GROQ_API_KEY, then restart the service.",
    );
  }

  section("2-3. Ingesting real official source documents + content hashes");
  if (OFFICIAL_SOURCES.length === 0) {
    fail(`No official sources registered for ${ASSET_ID} in official-sources.ts`);
  }
  const ingestResult = await call("POST", `/api/assets/${ASSET_ID}/ingest-official-sources`);
  if (ingestResult.status !== 201) {
    fail(`POST /ingest-official-sources returned HTTP ${ingestResult.status}: ${JSON.stringify(ingestResult.body)}`);
  }
  const ingested = (ingestResult.body as { sources: { sourceId: string; textHash: string }[] }).sources;
  for (const source of OFFICIAL_SOURCES) {
    const actual = ingested.find((entry) => entry.sourceId === source.sourceId);
    const hashMatch = actual?.textHash === source.expectedTextHash;
    process.stdout.write(
      `${source.sourceId}\n  URL: ${source.uri}\n  textHash: ${actual?.textHash} ${hashMatch ? "(matches documented hash)" : "(DIFFERS from docs/AI.md -- source text has changed)"}\n`,
    );
  }

  section("4-5. Running the real extraction (ttbill-b, live GroqCloud call)");
  const extractResult = await call("POST", `/api/assets/${ASSET_ID}/extract`);
  if (extractResult.status !== 201 && extractResult.status !== 200) {
    fail(`POST /extract returned HTTP ${extractResult.status}: ${JSON.stringify(extractResult.body)}`);
  }
  const extractBody = extractResult.body as {
    extraction?: { mode?: string; model?: string };
    warnings?: string[];
  };
  process.stdout.write(`HTTP ${extractResult.status} -- mode: ${extractBody.extraction?.mode}\n`);
  if (extractBody.warnings?.length) {
    process.stdout.write(`Warnings: ${extractBody.warnings.join(" | ")}\n`);
  }

  section("6. Fetching persisted extraction summary + passport");
  const extraction = await call("GET", `/api/assets/${ASSET_ID}/extraction`);
  if (extraction.status !== 200) fail(`GET /extraction returned HTTP ${extraction.status}`);
  const passport = await call("GET", `/api/assets/${ASSET_ID}/passport`);
  if (passport.status !== 200) fail(`GET /passport returned HTTP ${passport.status}`);

  section("7. Validating payloads against ALIVE's real schemas");
  const passportBody = passport.body as { passport?: unknown };
  const parsedPassport = RwaAssetSchema.safeParse(passportBody.passport);
  if (!parsedPassport.success) {
    fail(`Persisted passport failed RwaAssetSchema validation: ${parsedPassport.error.message}`);
  }
  process.stdout.write("Passport: valid against RwaAssetSchema (source-provenance parity, citation contract).\n");

  const summary = (extraction.body as { extraction: Record<string, unknown> }).extraction;

  section("8. PROOF REPORT");
  const lines = [
    `AI PROVIDER          ${summary.provider ?? "(none -- see mode)"}`,
    `MODEL                ${summary.model ?? "(none -- see mode)"}`,
    `MODE                 ${summary.mode}`,
    `LIVE                 ${summary.live}`,
    `SOURCE COUNT         ${summary.sourceCount}`,
    `FACTS EXTRACTED      ${summary.factsExtracted}`,
    `FACTS CITED          ${summary.factsCited}`,
    `UNKNOWN FIELDS       ${summary.unknownFields}`,
    `REJECTED ATTEMPTS    ${summary.unsupportedClaimsRejected}`,
    `SCHEMA VALIDATION    ${summary.schemaValidation}`,
    `SOURCE VALIDATION    ${summary.sourceValidation}`,
    `COMPLETED AT         ${summary.completedAt}`,
  ];
  process.stdout.write(lines.map((line) => `  ${line}`).join("\n") + "\n");

  if (summary.mode === "AI") {
    process.stdout.write("\nPASS: extraction mode = AI. Proof 2 end-to-end condition satisfied.\n");
  } else {
    process.stdout.write(
      `\nNOT YET: extraction mode = ${summary.mode}, not AI. The pipeline ran correctly and ` +
        `fell back honestly (see warnings above) -- re-run this script; a common cause is Groq's ` +
        "free-tier 8,000-token/minute limit if you ran the probe or another extraction moments earlier.\n",
    );
    process.exit(2);
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
