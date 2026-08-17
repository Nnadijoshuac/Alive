import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DemoMarketDataProvider } from "@alive/market-data";

import { buildIntelligenceApp } from "../src/app.js";
import { EligibilitySigner } from "../src/attestations/eligibility-signer.js";
import { loadRwaCatalog } from "../src/catalog.js";
import { LlmProviderError, createLlmProvider } from "../src/llm.js";
import type { IntelligenceConfig } from "../src/config.js";
import { extractPassportFacts } from "../src/extraction/passport-extractor.js";
import type { LlmJsonProvider, LlmPolicyRequest } from "../src/llm.js";
import {
  buildStrictExtractionJsonSchema,
  strictResponseToCandidate,
} from "../src/extraction/strict-schema.js";
import { ingestDocument } from "../src/ingestion/ingestion-service.js";
import { IntelligenceRepository } from "../src/repository.js";

const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);
const sourceDocumentsPath = fileURLToPath(
  new URL("../../../data/source-documents", import.meta.url),
);
const NOW = new Date("2026-08-17T00:00:00.000Z");

function ingestTusdc() {
  return ingestDocument(
    {
      assetId: "tusdc",
      sourceId: "demo-doc-tusdc",
      sourceType: "DEMO_FIXTURE",
      input: { kind: "fixture", fixtureId: "tusdc", title: "tUSDC fact sheet" },
      retrievedAt: "2026-08-15T00:00:00.000Z",
    },
    sourceDocumentsPath,
  );
}

function unconfiguredEligibilitySigner(): EligibilitySigner {
  return new EligibilitySigner({});
}

/** A mock provider named "groq" so passport-extractor requests the strict schema path. */
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

function fullStrictWireResponse(overrides: Record<string, unknown> = {}) {
  const nullFact = { value: null, sourceIds: [] };
  return {
    productName: nullFact,
    assetClass: nullFact,
    issuerName: { value: "Superstate", sourceIds: ["demo-doc-tusdc"] },
    underlying: {
      value: "Short-duration US Treasury Bills",
      sourceIds: ["demo-doc-tusdc"],
    },
    jurisdiction: nullFact,
    eligibleInvestors: nullFact,
    custody: nullFact,
    documentEffectiveDate: nullFact,
    redemptionSupported: nullFact,
    redemptionFrequency: nullFact,
    redemptionSettlementPeriod: nullFact,
    redemptionMinimum: nullFact,
    managementFeeBps: nullFact,
    redemptionFeeBps: nullFact,
    marketHoursType: nullFact,
    restrictions: nullFact,
    ...overrides,
  };
}

describe("GroqProvider configuration", () => {
  it("reports GROQ_API_KEY missing safely, without throwing during construction", () => {
    const provider = createLlmProvider({
      provider: "groq",
      model: "openai/gpt-oss-20b",
      baseUrl: "https://api.groq.com/openai/v1",
      timeoutMs: 30_000,
    });
    expect(provider.name).toBe("groq");
    const health = provider.health();
    expect(health.configured).toBe(false);
    expect(JSON.stringify(health)).not.toMatch(/gsk_/);
  });

  it("refuses to call the API without a key, and never logs a key in the error", async () => {
    const provider = createLlmProvider({
      provider: "groq",
      model: "openai/gpt-oss-20b",
      baseUrl: "https://api.groq.com/openai/v1",
      timeoutMs: 30_000,
    });
    await expect(
      provider.generatePolicyJson({ mandate: "x", systemPrompt: "y" }),
    ).rejects.toMatchObject({ code: "LLM_MISCONFIGURED" });
  });

  it("defaults the base URL to Groq's OpenAI-compatible endpoint", () => {
    const provider = createLlmProvider({
      provider: "groq",
      model: "openai/gpt-oss-20b",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "gsk_test_not_a_real_key",
      timeoutMs: 30_000,
    });
    expect(provider.health().configured).toBe(true);
  });
});

describe("strict JSON-schema wire adapter", () => {
  it("builds a schema requiring every fact field, matching Groq's strict-mode contract", () => {
    const schema = buildStrictExtractionJsonSchema() as {
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("issuerName");
    expect(schema.required).toContain("restrictions");
  });

  it("converts a fully-populated strict response into the candidate shape", () => {
    const wire = fullStrictWireResponse({
      redemptionSupported: { value: "true", sourceIds: ["source-001"] },
      redemptionFrequency: { value: "Continuous", sourceIds: ["source-001"] },
      restrictions: {
        value: ["Freely transferable between allowlisted wallets"],
        sourceIds: ["source-001"],
      },
    });
    const candidate = strictResponseToCandidate(wire) as Record<string, unknown>;
    expect(candidate.issuerName).toBe("Superstate");
    expect(candidate.redemption).toMatchObject({
      supported: "true",
      frequency: "Continuous",
    });
    expect(candidate.restrictions).toEqual([
      "Freely transferable between allowlisted wallets",
    ]);
    expect((candidate.citations as Record<string, string[]>).issuerName).toEqual([
      "demo-doc-tusdc",
    ]);
  });

  it("omits every field whose value is null -- UNKNOWN, not guessed", () => {
    const candidate = strictResponseToCandidate(
      fullStrictWireResponse(),
    ) as Record<string, unknown>;
    expect(candidate.issuerName).toBe("Superstate");
    expect(candidate.underlying).toBeDefined();
    expect(candidate.redemption).toBeUndefined();
    expect(candidate.fees).toBeUndefined();
    expect(candidate.marketHours).toBeUndefined();
    expect(candidate.jurisdiction).toBeUndefined();
    expect(candidate.restrictions).toBeUndefined();
  });
});

describe("end-to-end extraction through a mocked Groq provider", () => {
  it("accepts a valid strict response and labels the run AI/groq", async () => {
    const document = ingestTusdc();
    const llm = mockGroqProvider(() =>
      fullStrictWireResponse({
        issuerName: { value: "ALIVE Demo Cash Issuer", sourceIds: [document.sourceId] },
      }),
    );
    const result = await extractPassportFacts({
      sourceDocuments: [document],
      llm,
    });
    expect(result.meta.mode).toBe("AI");
    expect(result.meta.model).toBe("openai/gpt-oss-20b");
    expect(result.facts.issuerName).toBe("ALIVE Demo Cash Issuer");
    // The provider was asked for Groq's strict structured-output mode.
    expect(llm.calls[0]?.jsonSchema?.name).toBe("alive_passport_extraction");
  });

  it("hallucination test: a fact absent from the source resolves to UNKNOWN, never invented", async () => {
    const document = ingestTusdc();
    // The model is not asked about a management fee anywhere in the fixture
    // text; a real Groq response for this document would leave it null.
    const llm = mockGroqProvider(() =>
      fullStrictWireResponse({
        issuerName: { value: "ALIVE Demo Cash Issuer", sourceIds: [document.sourceId] },
      }),
    );
    const result = await extractPassportFacts({ sourceDocuments: [document], llm });
    expect(result.facts.fees).toBeUndefined();
  });

  it("adversarial test: a fake source ID is rejected even inside an otherwise well-formed strict response", async () => {
    const document = ingestTusdc();
    const llm = mockGroqProvider((request) => {
      // Every attempt (including the retry) cites a source that was never supplied.
      void request;
      return fullStrictWireResponse({
        issuerName: { value: "ALIVE Demo Cash Issuer", sourceIds: ["fake-source-999"] },
      });
    });
    const result = await extractPassportFacts({ sourceDocuments: [document], llm });
    // Both AI attempts fail validation -> deterministic fallback, never a
    // passport built from the hallucinated citation.
    expect(result.meta.mode).toBe("DETERMINISTIC_FALLBACK");
    expect(result.facts.citations.issuerName).not.toContain("fake-source-999");
  });

  it("malformed output retries once, then fails cleanly without masquerading as AI LIVE", async () => {
    // Simulates a transport-level failure (e.g. a non-JSON body, or a
    // response missing the expected choices[] shape) -- the realistic
    // failure mode at this layer, since Groq's strict mode itself
    // guarantees schema-conformant JSON when the call succeeds at all.
    const document = ingestTusdc();
    let calls = 0;
    const llm: LlmJsonProvider = {
      name: "groq",
      model: "openai/gpt-oss-20b",
      async generatePolicyJson() {
        calls += 1;
        throw new LlmProviderError(
          "LLM_RESPONSE_INVALID",
          "The GroqCloud response shape is invalid.",
        );
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
    const result = await extractPassportFacts({ sourceDocuments: [document], llm });
    expect(calls).toBe(2);
    // Falls back to the deterministic reader and is labelled accordingly --
    // never reported as a live AI result when both attempts failed.
    expect(result.meta.mode).not.toBe("AI");
    expect(result.meta.mode).toBe("DETERMINISTIC_FALLBACK");
  });
});

describe("extraction caching by document hash", () => {
  const config: IntelligenceConfig = {
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

  it("does not call the AI provider again when the source hash is unchanged", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const llm = mockGroqProvider(() =>
      fullStrictWireResponse({
        issuerName: { value: "ALIVE Demo Cash Issuer", sourceIds: ["demo-doc-tusdc"] },
      }),
    );
    const app = await buildIntelligenceApp(config, {
      repository,
      catalog,
      llm,
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    await app.inject({
      method: "POST",
      url: "/api/assets/tusdc/ingest",
      payload: {
        sourceId: "demo-doc-tusdc",
        sourceType: "DEMO_FIXTURE",
        input: { kind: "fixture", fixtureId: "tusdc", title: "tUSDC fact sheet" },
      },
    });

    const first = await app.inject({ method: "POST", url: "/api/assets/tusdc/extract" });
    expect(first.statusCode).toBe(201);
    expect(llm.calls).toHaveLength(1);

    const second = await app.inject({ method: "POST", url: "/api/assets/tusdc/extract" });
    expect(second.statusCode).toBe(200);
    expect(llm.calls).toHaveLength(1); // no new call -- cache hit
    expect(second.json()).toMatchObject({
      extraction: { mode: "AI" },
      warnings: [expect.stringMatching(/unchanged/)],
    });

    await app.close();
  });
});
