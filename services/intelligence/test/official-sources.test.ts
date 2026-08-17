import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DemoMarketDataProvider } from "@alive/market-data";
import { describe, expect, it } from "vitest";

import {
  EligibilitySigner,
  IntelligenceRepository,
  buildIntelligenceApp,
  loadRwaCatalog,
  officialSourcesForAsset,
  type IntelligenceConfig,
} from "../src/index.js";

function unconfiguredEligibilitySigner(): EligibilitySigner {
  return new EligibilitySigner({});
}

function disabledLlm() {
  return {
    name: "disabled" as const,
    async generatePolicyJson(): Promise<never> {
      throw new Error("offline");
    },
    health() {
      return {
        provider: "disabled" as const,
        configured: false,
        mode: "OFFLINE" as const,
        message: "offline",
      };
    },
  };
}

const NOW = new Date("2026-08-17T00:00:00.000Z");
const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);
const sourceDocumentsPath = fileURLToPath(
  new URL("../../../data/source-documents", import.meta.url),
);
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

describe("official-sources registry", () => {
  it("has real sources registered for ttbill-b", () => {
    const seeds = officialSourcesForAsset("ttbill-b");
    expect(seeds).toBeDefined();
    expect(seeds).toHaveLength(2);
    expect(seeds?.every((seed) => seed.sourceType !== "DEMO_FIXTURE")).toBe(true);
  });

  it("has no official sources registered for ttbill-a -- Attack Lab stays demo-only", () => {
    expect(officialSourcesForAsset("ttbill-a")).toBeUndefined();
  });
});

// Regression guard: the interactive verify flow used to depend on
// data/source-documents/ttbill-b.txt existing on disk (the legacy
// DEMO_FIXTURE filesystem loader), which fails with ENOENT because that
// file was never meant to exist -- ttbill-b uses real, not demo, sources.
describe("ttbill-b verification does not depend on the legacy fixture file", () => {
  it("data/source-documents/ttbill-b.txt does not exist", () => {
    const fixturePath = fileURLToPath(
      new URL("../../../data/source-documents/ttbill-b.txt", import.meta.url),
    );
    expect(existsSync(fixturePath)).toBe(false);
  });

  it("POST /ingest-official-sources ingests real sources for ttbill-b without touching the fixture loader", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const app = await buildIntelligenceApp(config, {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/assets/ttbill-b/ingest-official-sources",
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      sources: { sourceId: string; sourceType: string; textHash: string }[];
    };
    expect(body.sources).toHaveLength(2);
    expect(body.sources.every((source) => source.sourceType !== "DEMO_FIXTURE")).toBe(
      true,
    );

    const expectedHashes = officialSourcesForAsset("ttbill-b")!.map(
      (seed) => seed.expectedTextHash,
    );
    for (const source of body.sources) {
      expect(expectedHashes).toContain(source.textHash);
    }

    const sourcesResponse = await app.inject({
      method: "GET",
      url: "/api/assets/ttbill-b/sources",
    });
    expect(sourcesResponse.statusCode).toBe(200);
    const sourcesBody = sourcesResponse.json() as { sources: unknown[] };
    expect(sourcesBody.sources).toHaveLength(2);

    await app.close();
  });

  it("POST /ingest-official-sources returns 404 for an asset with no registered official sources (ttbill-a, Attack Lab)", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const app = await buildIntelligenceApp(config, {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/assets/ttbill-a/ingest-official-sources",
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "ASSET_HAS_NO_OFFICIAL_SOURCES" },
    });

    await app.close();
  });

  it("ttbill-a's demo fixture ingestion still works unchanged (Attack Lab preserved)", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const app = await buildIntelligenceApp(config, {
      repository,
      catalog,
      llm: disabledLlm(),
      marketData: new DemoMarketDataProvider(undefined, () => NOW),
      eligibilitySigner: unconfiguredEligibilitySigner(),
      now: () => NOW,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/assets/ttbill-a/ingest",
      payload: {
        sourceId: "demo-doc-ttbill-a",
        sourceType: "DEMO_FIXTURE",
        input: { kind: "fixture", fixtureId: "ttbill-a", title: "tTBILL-A fact sheet" },
      },
    });
    expect(response.statusCode).toBe(201);

    await app.close();
  });
});
