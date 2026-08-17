import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DemoMarketDataProvider } from "@alive/market-data";

import { buildIntelligenceApp } from "../src/app.js";
import { EligibilitySigner } from "../src/attestations/eligibility-signer.js";
import { loadRwaCatalog } from "../src/catalog.js";
import { PASSPORT_EXTRACTION_PROMPT_VERSION } from "../src/extraction/passport-prompt.js";
import { IntelligenceRepository } from "../src/repository.js";
import type { IntelligenceConfig } from "../src/config.js";
import type { LlmJsonProvider, LlmPolicyRequest } from "../src/llm.js";

const NOW = new Date("2026-08-17T00:00:00.000Z");
const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);
const sourceDocumentsPath = fileURLToPath(
  new URL("../../../data/source-documents", import.meta.url),
);

function baseConfig(): IntelligenceConfig {
  return {
    host: "127.0.0.1",
    port: 4_200,
    databasePath: ":memory:",
    catalogPath,
    sourceDocumentsPath,
    allowedOrigins: ["http://localhost:3000"],
    llm: { provider: "disabled", timeoutMs: 1_000 },
    eligibilitySigner: { ttlSeconds: 900 },
    demoMode: false,
    marketMonitorIntervalSeconds: 300,
    marketMonitorEnabled: false,
  };
}

function unconfiguredEligibilitySigner(): EligibilitySigner {
  return new EligibilitySigner({});
}

function mockGroqProvider(
  respond: (request: LlmPolicyRequest) => unknown,
): LlmJsonProvider & { calls: LlmPolicyRequest[] } {
  const calls: LlmPolicyRequest[] = [];
  return {
    name: "groq",
    model: "openai/gpt-oss-20b",
    calls,
    async generatePolicyJson(request) {
      calls.push(request);
      return respond(request);
    },
    health() {
      return {
        provider: "groq",
        configured: true,
        mode: "AI",
        model: "openai/gpt-oss-20b",
        message: "configured",
      };
    },
  };
}

function tusdcWireResponse() {
  const nf = { value: null, sourceIds: [] as string[] };
  return {
    productName: nf,
    assetClass: nf,
    issuerName: { value: "ALIVE Demo Cash Issuer", sourceIds: ["demo-doc-tusdc"] },
    underlying: nf,
    jurisdiction: nf,
    eligibleInvestors: nf,
    custody: nf,
    documentEffectiveDate: nf,
    redemptionSupported: nf,
    redemptionFrequency: nf,
    redemptionSettlementPeriod: nf,
    redemptionMinimum: nf,
    managementFeeBps: nf,
    redemptionFeeBps: nf,
    marketHoursType: nf,
    restrictions: nf,
  };
}

async function ingestAndExtractOnce(app: Awaited<ReturnType<typeof buildIntelligenceApp>>) {
  await app.inject({
    method: "POST",
    url: "/api/assets/tusdc/ingest",
    payload: {
      sourceId: "demo-doc-tusdc",
      sourceType: "DEMO_FIXTURE",
      input: { kind: "fixture", fixtureId: "tusdc", title: "tUSDC fact sheet" },
    },
  });
  return app.inject({ method: "POST", url: "/api/assets/tusdc/extract" });
}

describe("extraction cache versioning", () => {
  it("same document + same prompt/pipeline version -> cache hit, no new call", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const llm = mockGroqProvider(() => tusdcWireResponse());
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm,
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const first = await ingestAndExtractOnce(app);
    expect(first.statusCode).toBe(201);
    expect(llm.calls).toHaveLength(1);

    const second = await app.inject({ method: "POST", url: "/api/assets/tusdc/extract" });
    expect(second.statusCode).toBe(200);
    expect(llm.calls).toHaveLength(1);

    await app.close();
  });

  it("same document + stale prompt version on the stored run -> re-extracts", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const llm = mockGroqProvider(() => tusdcWireResponse());
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm,
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const first = await ingestAndExtractOnce(app);
    expect(first.statusCode).toBe(201);
    expect(llm.calls).toHaveLength(1);

    // Simulate the stored run predating a prompt-logic change: overwrite
    // its recorded promptVersion to something older than what's running now.
    const stored = repository.getLatestExtractionRun("tusdc")!;
    repository.saveExtractionRun({
      ...stored,
      id: `${stored.id}-stale`,
      promptVersion: "alive-passport-extract-v0-stale",
      startedAt: new Date(NOW.getTime() + 1_000).toISOString(),
    });

    const second = await app.inject({ method: "POST", url: "/api/assets/tusdc/extract" });
    expect(second.statusCode).toBe(201); // 201, not 200 -- a fresh extraction ran
    expect(llm.calls).toHaveLength(2);

    await app.close();
  });

  it("same document + stale pipeline version on the stored run -> re-extracts", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const llm = mockGroqProvider(() => tusdcWireResponse());
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm,
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const first = await ingestAndExtractOnce(app);
    expect(first.statusCode).toBe(201);
    expect(llm.calls).toHaveLength(1);

    const stored = repository.getLatestExtractionRun("tusdc")!;
    repository.saveExtractionRun({
      ...stored,
      id: `${stored.id}-stale-pipeline`,
      pipelineVersion: "alive-passport-extract-v0-stale",
      startedAt: new Date(NOW.getTime() + 1_000).toISOString(),
    });

    const second = await app.inject({ method: "POST", url: "/api/assets/tusdc/extract" });
    expect(second.statusCode).toBe(201);
    expect(llm.calls).toHaveLength(2);

    await app.close();
  });

  it("a changed source document still invalidates the cache regardless of version", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const llm = mockGroqProvider(() => tusdcWireResponse());
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm,
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    await ingestAndExtractOnce(app);
    expect(llm.calls).toHaveLength(1);

    // Ingest genuinely different document text under a new sourceId --
    // a distinct hash, independent of any version bookkeeping.
    await app.inject({
      method: "POST",
      url: "/api/assets/tusdc/ingest",
      payload: {
        sourceId: "demo-doc-tusdc-v2",
        sourceType: "DEMO_FIXTURE",
        input: {
          kind: "text",
          text: "tUSDC is a fully-reserved USD stablecoin. Updated fact sheet text, deliberately different from the original fixture.",
          title: "tUSDC fact sheet v2",
        },
      },
    });
    const second = await app.inject({ method: "POST", url: "/api/assets/tusdc/extract" });
    expect(second.statusCode).toBe(201);
    expect(llm.calls).toHaveLength(2);

    await app.close();
  });

  it("PASSPORT_EXTRACTION_PROMPT_VERSION is a real, non-empty version identifier", () => {
    expect(PASSPORT_EXTRACTION_PROMPT_VERSION.length).toBeGreaterThan(0);
  });
});
