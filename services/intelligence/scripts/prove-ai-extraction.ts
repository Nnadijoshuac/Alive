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

const urlFlagIndex = process.argv.indexOf("--url");
const HOST =
  (urlFlagIndex !== -1 ? process.argv[urlFlagIndex + 1] : undefined) ??
  process.env.INTELLIGENCE_URL ??
  "http://127.0.0.1:4200";

const ASSET_ID = "ttbill-b";

// Verbatim page text captured from the two real official sources this proof
// documents (docs/AI.md). Re-ingesting identical text reproduces the same
// content hashes recorded there -- a change in hash means the live page
// text has genuinely changed, not a script bug.
const SOURCE_1 = {
  sourceId: "superstate-docs-invesco-ustb-2026-08-17",
  sourceType: "ISSUER_DOCUMENTATION",
  title: "Invesco USTB | Superstate (docs.superstate.com)",
  uri: "https://docs.superstate.com/investors/tokenized-funds/available-funds/invesco-ustb",
  expectedHash: "0x4d4039faca6e6970ef9a58fda804daab28673a9a3eaf3ae3efdc2a6e14eb2e7a",
  text: `Invesco USTB — Invesco Short Duration US Government Securities Fund

The Invesco Short Duration US Government Securities Fund (USTB) invests in short-duration U.S. Treasury Bills. Shares of the Fund are issued as USTB tokens on Ethereum, Solana, and Plume, or held in book-entry by Superstate. USTB is freely transferable between wallet addresses on the Allowlist. Purchases and redemptions are facilitated through USD or USDC, with liquidity each market day.

Fund information
USTB invests in short-duration U.S. Treasury Bills. Return accrues as interest income, reflected in a continuously increasing NAV per share rather than distributions. Its NAV/S started at $10.000000 and updates continuously.

Subscribing
Investors can view subscription instructions in the Superstate portal. Subscriptions can be sent with a USD wire or USDC (on Ethereum, Solana, or Plume). USTB is continuously priced, so a purchase is priced at the NAV/S when funds are received: shares are delivered immediately for orders paid in USDC (including non-business days), or same-day for USD wires received before 5pm ET. Shares are delivered as tokens to an allowlisted address or as book-entry. The minimum initial investment is $100,000 unless waived by Superstate.

Redeeming
Investors can view redemption instructions in the Superstate portal. Proceeds are paid as U.S. Dollars to a bank account, or USDC to an Ethereum, Solana, or Plume address. Proceeds are delivered immediately (including non-business days, subject to available liquidity) for payout requests in USDC, or same-day for USD if received before 1pm ET.

Tokenizing book-entry shares
Investors can convert book-entry USTB shares into tokens on Ethereum, Solana, or Plume. Tokenization works the same across all Superstate funds; only the supported networks differ.

Market days & holidays
On U.S. market holidays, USDC purchases and redemptions may still be made, but no Treasury Bills are bought or sold.

For Disclosures and Risk Factors related to the Invesco Short Duration US Government Securities Fund visit superstate.com/assets/ustb#disclaimers
`,
};

const SOURCE_2 = {
  sourceId: "superstate-product-page-ustb-2026-08-17",
  sourceType: "OFFICIAL_TOKEN_DOCUMENTATION",
  title: "USTB — Invesco Short Duration US Government Securities Fund (superstate.com)",
  uri: "https://superstate.com/assets/ustb",
  expectedHash: "0xf3bb20fee94bc44018b353e1772d4769b87c355fa3e60eb37c82764efa77815e",
  text: `Superstate — USTB — Invesco Short Duration US Government Securities Fund
TOKENIZED PRIVATE FUND

About USTB
The Invesco Short Duration US Government Securities Fund (the "Fund") offers Accredited Investors and Qualified Purchasers access to short-duration Treasury Bills. The Fund's investment objective is to seek current income as is consistent with liquidity and stability of principal. Ownership in the Fund is represented by USTB, held either as a token or in book-entry record keeping. Subscriptions and redemptions are facilitated through USD or USDC, with liquidity each market day.

CUSIP: 86851T204
Custodian: The Bank of New York Mellon
Auditor: PricewaterhouseCoopers LLP
NAV calculation agent: NAV Fund Services
Investment manager: Invesco Advisers, Inc.
Transfer agent: Superstate Services LLC
Domicile: United States
Structure: The Fund is a series of a Delaware Statutory Trust
Eligible investors: Accredited Investors and Qualified Purchasers
Subscription timing: Same-day. Shares are delivered immediately for orders paid in USDC (including non-business days), or same-day for USD wires received before 5pm ET.
Redemption timing: Same-day. Proceeds are delivered immediately (including non-business days, subject to available liquidity) for USDC payout requests, or same-day for USD if received before 1pm ET.

Management fee: All investors are subject to a 0.15% management fee, accrued daily. The Investment Manager provides a monthly rebate of 0.10% of the management fee for the average daily holding that is greater than $25 million. USTB is not subject to a performance-based fee or allocation.

Disclaimers
The Invesco Short Duration US Government Securities Fund ("USTB") is limited to investors that meet certain criteria. This Website shall not constitute an offer to buy or sell, which may be made only at the time a qualified offeree receives the USTB offering materials, which will describe the offering and its terms.

Transfer restrictions: Transfers of Shares are subject to consent requirements and, for Tokenized Shares, automated smart contract controls. Tokenized Shares are not listed on any exchange or trading system and may only be transferred through limited peer-to-peer transactions, subject to restrictions.

The Fund is not registered as an investment company under the Investment Company Act and is therefore not subject to the regulatory protections applicable to registered funds, including requirements relating to governance, custody of assets and limitations on affiliated transactions.
`,
};

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
  for (const source of [SOURCE_1, SOURCE_2]) {
    const result = await call("POST", `/api/assets/${ASSET_ID}/ingest`, {
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      input: { kind: "text", text: source.text, title: source.title, uri: source.uri },
    });
    if (result.status !== 201 && result.status !== 200) {
      fail(`Ingesting ${source.sourceId} returned HTTP ${result.status}: ${JSON.stringify(result.body)}`);
    }
    const body = result.body as { textHash?: string };
    const hashMatch = body.textHash === source.expectedHash;
    process.stdout.write(
      `${source.sourceId}\n  URL: ${source.uri}\n  textHash: ${body.textHash} ${hashMatch ? "(matches documented hash)" : "(DIFFERS from docs/AI.md -- source text has changed)"}\n`,
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
