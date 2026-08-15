import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { RwaAssetSchema, type RwaAsset } from "@alive/shared";

import { ingestDocument } from "../src/ingestion/ingestion-service.js";
import { mergeExtractedFactsIntoPassport } from "../src/extraction/extraction-normalizer.js";
import { extractPassportFacts } from "../src/extraction/passport-extractor.js";
import {
  ExtractionValidationError,
  validateExtractedFacts,
} from "../src/extraction/extraction-validator.js";
import type { LlmJsonProvider } from "../src/llm.js";

const sourceDocumentsPath = fileURLToPath(
  new URL("../../../data/source-documents", import.meta.url),
);

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

function baseTusdcAsset(): RwaAsset {
  return RwaAssetSchema.parse({
    id: "tusdc",
    symbol: "tUSDC",
    name: "Test USD Cash",
    assetClass: "CASH",
    issuer: "demo-cash-issuer",
    issuerName: "ALIVE Demo Cash Issuer",
    underlying: "Synthetic USD cash reference",
    liquidity: { score: 100 },
    risk: {
      score: 8,
      issuerRisk: 8,
      liquidityRisk: 2,
      marketRisk: 4,
      oracleRisk: 10,
      redemptionRisk: 3,
      productComplexityRisk: 2,
      methodology: "ALIVE_DEMO_RISK_V1",
    },
    sources: [
      {
        id: "catalog-source-tusdc",
        title: "ALIVE synthetic demo fixture",
        sourceType: "DEMO_FIXTURE",
        fixtureId: "catalog-source-tusdc",
        retrievedAt: "2026-08-14T12:00:00.000Z",
        supportedFields: [
          "symbol",
          "name",
          "assetClass",
          "issuer",
          "issuerName",
          "underlying",
          "liquidity.score",
          "risk.score",
          "risk.issuerRisk",
          "risk.liquidityRisk",
          "risk.marketRisk",
          "risk.oracleRisk",
          "risk.redemptionRisk",
          "risk.productComplexityRisk",
          "risk.methodology",
          "lastUpdatedAt",
        ],
        disclaimer: "Synthetic fixture; not live market data.",
      },
    ],
    lastUpdatedAt: "2026-08-14T12:00:00.000Z",
    dataMode: "DEMO",
  });
}

function disabledLlm(): LlmJsonProvider {
  return {
    name: "disabled",
    async generatePolicyJson() {
      throw new Error("offline");
    },
    health() {
      return {
        provider: "disabled",
        configured: false,
        mode: "OFFLINE",
        message: "offline",
      };
    },
  };
}

describe("extraction-validator", () => {
  it("accepts a fully cited candidate", () => {
    const parsed = validateExtractedFacts(
      {
        issuerName: "ALIVE Demo Cash Issuer",
        citations: { issuerName: ["demo-doc-tusdc"] },
      },
      ["demo-doc-tusdc"],
    );
    expect(parsed.issuerName).toBe("ALIVE Demo Cash Issuer");
  });

  it("rejects a field with no citation", () => {
    expect(() =>
      validateExtractedFacts(
        { issuerName: "Invented Issuer", citations: {} },
        ["demo-doc-tusdc"],
      ),
    ).toThrow(ExtractionValidationError);
  });

  it("rejects a citation referencing an unsupplied sourceId (hallucinated source)", () => {
    expect(() =>
      validateExtractedFacts(
        {
          issuerName: "ALIVE Demo Cash Issuer",
          citations: { issuerName: ["source-that-was-never-supplied"] },
        },
        ["demo-doc-tusdc"],
      ),
    ).toThrow(ExtractionValidationError);
  });

  it("rejects an unknown top-level field", () => {
    expect(() =>
      validateExtractedFacts(
        { inventedField: "x", citations: {} },
        ["demo-doc-tusdc"],
      ),
    ).toThrow(ExtractionValidationError);
  });

  it("accepts an explicit unknown redemption status", () => {
    const parsed = validateExtractedFacts(
      {
        redemption: { supported: "unknown" },
        citations: { redemption: ["demo-doc-tusdc"] },
      },
      ["demo-doc-tusdc"],
    );
    expect(parsed.redemption?.supported).toBe("unknown");
  });
});

describe("deterministic extraction (DEMO_FIXTURE / no AI configured)", () => {
  it("reads the Key Facts block and cites the source it read", async () => {
    const document = ingestTusdc();
    const result = await extractPassportFacts({
      sourceDocuments: [document],
      llm: disabledLlm(),
    });
    expect(result.meta.mode).toBe("DEMO_FIXTURE");
    expect(result.facts.issuerName).toBe("ALIVE Demo Cash Issuer");
    expect(result.facts.underlying).toBe("Synthetic USD cash reference");
    expect(result.facts.redemption).toMatchObject({
      supported: true,
      frequency: "Continuous",
      settlementPeriod: "Immediate",
      minimum: 0,
    });
    expect(result.facts.citations.issuerName).toEqual(["demo-doc-tusdc"]);
  });
});

describe("AI extraction path", () => {
  it("uses a validated AI response directly", async () => {
    const document = ingestTusdc();
    const llm: LlmJsonProvider = {
      name: "ollama",
      model: "test-model",
      async generatePolicyJson() {
        return {
          issuerName: "ALIVE Demo Cash Issuer",
          underlying: "Synthetic USD cash reference",
          citations: {
            issuerName: ["demo-doc-tusdc"],
            underlying: ["demo-doc-tusdc"],
          },
        };
      },
      health() {
        return {
          provider: "ollama",
          configured: true,
          mode: "AI",
          model: "test-model",
          message: "configured",
        };
      },
    };
    const result = await extractPassportFacts({
      sourceDocuments: [document],
      llm,
    });
    expect(result.meta.mode).toBe("AI");
    expect(result.warnings).toEqual([]);
    expect(result.facts.issuerName).toBe("ALIVE Demo Cash Issuer");
  });

  it("retries once on an invalid response, then accepts a corrected one", async () => {
    const document = ingestTusdc();
    let calls = 0;
    const llm: LlmJsonProvider = {
      name: "ollama",
      model: "test-model",
      async generatePolicyJson() {
        calls += 1;
        if (calls === 1) {
          return { issuerName: "Invented Issuer With No Citation", citations: {} };
        }
        return {
          issuerName: "ALIVE Demo Cash Issuer",
          citations: { issuerName: ["demo-doc-tusdc"] },
        };
      },
      health() {
        return {
          provider: "ollama",
          configured: true,
          mode: "AI",
          model: "test-model",
          message: "configured",
        };
      },
    };
    const result = await extractPassportFacts({
      sourceDocuments: [document],
      llm,
    });
    expect(calls).toBe(2);
    expect(result.meta.mode).toBe("AI");
    expect(result.warnings).toHaveLength(1);
    expect(result.facts.issuerName).toBe("ALIVE Demo Cash Issuer");
  });

  it("falls back to the deterministic extractor after two invalid AI responses, and never invents a fact", async () => {
    const document = ingestTusdc();
    const llm: LlmJsonProvider = {
      name: "ollama",
      model: "test-model",
      async generatePolicyJson() {
        return {
          issuerName: "A Completely Different Fictional Issuer",
          citations: { issuerName: ["source-that-does-not-exist"] },
        };
      },
      health() {
        return {
          provider: "ollama",
          configured: true,
          mode: "AI",
          model: "test-model",
          message: "configured",
        };
      },
    };
    const result = await extractPassportFacts({
      sourceDocuments: [document],
      llm,
    });
    expect(result.meta.mode).toBe("DETERMINISTIC_FALLBACK");
    expect(result.warnings[0]).toMatch(/failed twice/);
    expect(result.facts.issuerName).toBe("ALIVE Demo Cash Issuer");
  });
});

describe("extraction-normalizer", () => {
  it("merges cited facts and moves their provenance to the new source, keeping the passport schema-valid", () => {
    const document = ingestTusdc();
    const existing = baseTusdcAsset();
    const merged = mergeExtractedFactsIntoPassport({
      existing,
      facts: {
        issuerName: "ALIVE Demo Cash Issuer",
        redemption: { supported: true, frequency: "Continuous" },
        citations: {
          issuerName: ["demo-doc-tusdc"],
          redemption: ["demo-doc-tusdc"],
        },
      },
      sourceDocuments: [document],
      extraction: {
        pipelineVersion: "alive-passport-extract-v1",
        promptVersion: "alive-passport-extract-v1",
        mode: "DEMO_FIXTURE",
        extractedAt: "2026-08-15T00:00:00.000Z",
      },
      lastUpdatedAt: "2026-08-15T00:00:00.000Z",
    });

    expect(merged.redemption).toEqual({ supported: true, frequency: "Continuous" });
    expect(merged.extraction?.mode).toBe("DEMO_FIXTURE");

    const newSource = merged.sources.find((s) => s.id === "demo-doc-tusdc");
    expect(newSource?.supportedFields).toEqual(
      expect.arrayContaining([
        "issuerName",
        "redemption.supported",
        "redemption.frequency",
      ]),
    );

    const oldSource = merged.sources.find((s) => s.id === "catalog-source-tusdc");
    expect(oldSource?.supportedFields).not.toContain("issuerName");
    expect(oldSource?.supportedFields).toContain("underlying");

    // Re-parsing must succeed: provenance parity holds across both sources.
    expect(() => RwaAssetSchema.parse(merged)).not.toThrow();
  });

  it("drops a source entirely if every field it supported was reassigned", () => {
    const document = ingestTusdc();
    const existing = baseTusdcAsset();
    const merged = mergeExtractedFactsIntoPassport({
      existing,
      facts: {
        issuerName: "ALIVE Demo Cash Issuer",
        underlying: "Synthetic USD cash reference",
        citations: {
          issuerName: ["demo-doc-tusdc"],
          underlying: ["demo-doc-tusdc"],
        },
      },
      sourceDocuments: [document],
      extraction: {
        pipelineVersion: "alive-passport-extract-v1",
        promptVersion: "alive-passport-extract-v1",
        mode: "DEMO_FIXTURE",
        extractedAt: "2026-08-15T00:00:00.000Z",
      },
      lastUpdatedAt: "2026-08-15T00:00:00.000Z",
    });
    // catalog source still supports plenty of other fields (symbol, risk.*, etc.)
    expect(merged.sources.some((s) => s.id === "catalog-source-tusdc")).toBe(true);
  });
});
