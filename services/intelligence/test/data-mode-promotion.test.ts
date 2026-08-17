import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DemoMarketDataProvider } from "@alive/market-data";

import { buildIntelligenceApp } from "../src/app.js";
import { EligibilitySigner } from "../src/attestations/eligibility-signer.js";
import { loadRwaCatalog } from "../src/catalog.js";
import { officialSourcesForAsset } from "../src/data/official-sources.js";
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

function nullFact() {
  return { value: null, sourceIds: [] };
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

/** A minimal, fully-populated strict Groq response citing ttbill-b's two real sources. */
function ttbillBWireResponse() {
  const sourceIds = officialSourcesForAsset("ttbill-b")!.map((seed) => seed.sourceId);
  return {
    productName: {
      value: "Invesco Short Duration US Government Securities Fund",
      sourceIds,
    },
    assetClass: { value: "TREASURY", sourceIds },
    issuerName: { value: "Invesco Advisers, Inc.", sourceIds },
    underlying: { value: "short-duration U.S. Treasury Bills", sourceIds },
    jurisdiction: nullFact(),
    eligibleInvestors: nullFact(),
    custody: nullFact(),
    documentEffectiveDate: nullFact(),
    redemptionSupported: { value: "true", sourceIds },
    redemptionFrequency: nullFact(),
    redemptionSettlementPeriod: nullFact(),
    redemptionMinimum: nullFact(),
    managementFeeBps: nullFact(),
    redemptionFeeBps: nullFact(),
    marketHoursType: nullFact(),
    restrictions: nullFact(),
  };
}

describe("data-mode promotion", () => {
  // ttbill-b's catalog seed carries its real, sourced identity (Invesco
  // Short Duration US Government Securities Fund / Invesco Advisers, Inc.)
  // from boot -- never the old synthetic "Test Treasury Fund B" fixture,
  // even before the Analyze flow runs a fresh AI extraction.
  it("ttbill-b starts with its real identity and real sources, never a demo fixture", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const asset = catalog.assets.find((a) => a.id === "ttbill-b");
    expect(asset?.dataMode).toBe("LIVE");
    expect(asset?.name).toBe("Invesco Short Duration US Government Securities Fund");
    expect(asset?.issuerName).toBe("Invesco Advisers, Inc.");
    expect(asset?.sources.some((s) => s.sourceType === "DEMO_FIXTURE")).toBe(false);
    expect(asset?.sources.some((s) => s.sourceType === "ISSUER_DOCUMENTATION")).toBe(true);
  });

  it("GET /api/assets/ttbill-b never returns the old synthetic identity, before or after analysis", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm: mockGroqProvider(() => ttbillBWireResponse()),
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    // Before any analysis: real catalog-seeded identity, not "Test
    // Treasury Fund B" / DEMO_FIXTURE.
    const before = await app.inject({ method: "GET", url: "/api/assets/ttbill-b" });
    expect(before.statusCode).toBe(200);
    const beforeBody = before.json() as { asset: { name: string; dataMode: string } };
    expect(beforeBody.asset.name).toBe("Invesco Short Duration US Government Securities Fund");
    expect(beforeBody.asset.dataMode).toBe("LIVE");

    // After analysis: the persisted, freshly-extracted passport wins --
    // still the same real identity, now with full AI-extracted facts too.
    await app.inject({
      method: "POST",
      url: "/api/assets/ttbill-b/ingest-official-sources",
    });
    await app.inject({ method: "POST", url: "/api/assets/ttbill-b/extract" });
    const after = await app.inject({ method: "GET", url: "/api/assets/ttbill-b" });
    expect(after.statusCode).toBe(200);
    const afterBody = after.json() as { asset: { name: string; dataMode: string } };
    expect(afterBody.asset.name).toBe("Invesco Short Duration US Government Securities Fund");
    expect(afterBody.asset.dataMode).toBe("LIVE");

    await app.close();
  });

  it("promotes ttbill-b to LIVE after real sources + real AI extraction, with no DEMO_FIXTURE remaining", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const llm = mockGroqProvider(() => ttbillBWireResponse());
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm,
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const ingest = await app.inject({
      method: "POST",
      url: "/api/assets/ttbill-b/ingest-official-sources",
    });
    expect(ingest.statusCode).toBe(201);

    const extract = await app.inject({
      method: "POST",
      url: "/api/assets/ttbill-b/extract",
    });
    expect(extract.statusCode).toBe(201);
    const body = extract.json() as {
      passport: { dataMode: string; sources: { sourceType: string }[] };
    };

    expect(body.passport.dataMode).toBe("LIVE");
    expect(
      body.passport.sources.some((s) => s.sourceType === "DEMO_FIXTURE"),
    ).toBe(false);
    expect(
      body.passport.sources.some((s) => s.sourceType === "ISSUER_DOCUMENTATION"),
    ).toBe(true);
    expect(
      body.passport.sources.some((s) => s.sourceType === "ALIVE_METHODOLOGY"),
    ).toBe(true);

    await app.close();
  });

  it("a promoted ttbill-b remains eligible-evaluable without DOCUMENTATION_INCOMPLETE", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const llm = mockGroqProvider(() => ttbillBWireResponse());
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm,
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    await app.inject({
      method: "POST",
      url: "/api/assets/ttbill-b/ingest-official-sources",
    });
    await app.inject({ method: "POST", url: "/api/assets/ttbill-b/extract" });

    const eligibility = await app.inject({
      method: "GET",
      url: "/api/assets/ttbill-b/eligibility",
    });
    const body = eligibility.json() as {
      verdict: { reasons: { code: string }[] };
    };
    expect(body.verdict.reasons.map((r) => r.code)).not.toContain(
      "DOCUMENTATION_INCOMPLETE",
    );

    await app.close();
  });

  it("ttbill-a is never promoted -- it has no real official sources to satisfy promotion", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const llm = mockGroqProvider(() =>
      nullFactResponseCitingDemoFixture("demo-doc-ttbill-a"),
    );
    const app = await buildIntelligenceApp(baseConfig(), {
      repository,
      catalog,
      llm,
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    await app.inject({
      method: "POST",
      url: "/api/assets/ttbill-a/ingest",
      payload: {
        sourceId: "demo-doc-ttbill-a",
        sourceType: "DEMO_FIXTURE",
        input: { kind: "fixture", fixtureId: "ttbill-a", title: "tTBILL-A fact sheet" },
      },
    });
    const extract = await app.inject({
      method: "POST",
      url: "/api/assets/ttbill-a/extract",
    });
    expect(extract.statusCode).toBe(201);
    const body = extract.json() as { passport: { dataMode: string } };
    expect(body.passport.dataMode).toBe("DEMO");

    await app.close();
  });
});

function nullFactResponseCitingDemoFixture(sourceId: string) {
  const nf = { value: null, sourceIds: [] as string[] };
  return {
    productName: nf,
    assetClass: nf,
    issuerName: { value: "ALIVE Demo Treasury Issuer A", sourceIds: [sourceId] },
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
