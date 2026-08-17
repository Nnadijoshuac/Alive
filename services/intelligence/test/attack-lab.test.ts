import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ChainlinkDataFeedProvider,
  CompositeMarketDataProvider,
  ControllableDemoMarketDataProvider,
  type ChainlinkReader,
} from "@alive/market-data";

import { buildIntelligenceApp } from "../src/app.js";
import { EligibilitySigner } from "../src/attestations/eligibility-signer.js";
import { loadRwaCatalog } from "../src/catalog.js";
import { IntelligenceRepository } from "../src/repository.js";
import type { IntelligenceConfig } from "../src/config.js";

const NOW = new Date("2026-08-17T00:00:00.000Z");
const nowSeconds = Math.floor(NOW.getTime() / 1_000);
const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);
const sourceDocumentsPath = fileURLToPath(
  new URL("../../../data/source-documents", import.meta.url),
);

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
      return { provider: "disabled" as const, configured: false, mode: "OFFLINE" as const, message: "offline" };
    },
  };
}

/** Mocks only the RPC transport; the real ChainlinkDataFeedProvider logic runs. */
function reader(): ChainlinkReader {
  return {
    async readFeed() {
      return {
        decimals: 6,
        description: "USTB NAV per Share",
        round: [1n, 11_177_748n, BigInt(nowSeconds - 4_000), BigInt(nowSeconds - 3_600), 1n] as const,
        blockNumber: 1n,
      };
    },
  };
}

function demoConfig(): IntelligenceConfig {
  return {
    host: "127.0.0.1",
    port: 4_200,
    databasePath: ":memory:",
    catalogPath,
    sourceDocumentsPath,
    allowedOrigins: ["http://localhost:3000"],
    llm: { provider: "disabled", timeoutMs: 1_000 },
    eligibilitySigner: { ttlSeconds: 900 },
    demoMode: true,
    marketMonitorIntervalSeconds: 300,
    marketMonitorEnabled: false,
  };
}

async function buildCompositeApp() {
  const catalog = await loadRwaCatalog(catalogPath);
  const repository = new IntelligenceRepository(":memory:");
  repository.replaceCatalog(catalog.assets);
  const marketData = new CompositeMarketDataProvider(
    new ChainlinkDataFeedProvider(reader(), () => NOW),
    new ControllableDemoMarketDataProvider(undefined, () => NOW),
  );
  const app = await buildIntelligenceApp(demoConfig(), {
    repository,
    catalog,
    llm: disabledLlm(),
    marketData,
    eligibilitySigner: unconfiguredEligibilitySigner(),
    now: () => NOW,
  });
  return app;
}

async function prepareTtbillA(app: Awaited<ReturnType<typeof buildCompositeApp>>) {
  await app.inject({
    method: "POST",
    url: "/api/assets/ttbill-a/ingest",
    payload: {
      sourceId: "demo-doc-ttbill-a",
      sourceType: "DEMO_FIXTURE",
      input: { kind: "fixture", fixtureId: "ttbill-a", title: "tTBILL-A fact sheet" },
    },
  });
  await app.inject({ method: "POST", url: "/api/assets/ttbill-a/extract" });
}

describe("Attack Lab demo controls under MARKET_DATA_PROVIDER=chainlink (CompositeMarketDataProvider)", () => {
  // Regression: these routes only ever recognized the bare
  // ControllableDemoMarketDataProvider, so they silently 409'd in the exact
  // configuration (chainlink + composite) that also serves ttbill-b's real
  // feed -- meaning Attack Lab was broken whenever the real showcase asset
  // was live.
  it("nav-age / reset / state all work against the composite provider", async () => {
    const app = await buildCompositeApp();
    await prepareTtbillA(app);

    const applied = await app.inject({
      method: "POST",
      url: "/api/demo/assets/ttbill-a/nav-age",
      payload: { ageSeconds: 31 * 3_600 },
    });
    expect(applied.statusCode).toBe(200);

    const state = await app.inject({ method: "GET", url: "/api/demo/state" });
    expect(state.statusCode).toBe(200);
    expect((state.json() as { overrides: Record<string, unknown> }).overrides).toHaveProperty(
      "ttbill-a",
    );

    const reset = await app.inject({ method: "POST", url: "/api/demo/reset" });
    expect(reset.statusCode).toBe(200);

    await app.close();
  });

  it("fresh ttbill-a is ELIGIBLE, stale NAV makes it RESTRICTED with NAV_STALE, restore makes it ELIGIBLE again", async () => {
    const app = await buildCompositeApp();
    await prepareTtbillA(app);

    const fresh = await app.inject({ method: "GET", url: "/api/assets/ttbill-a/eligibility" });
    expect(fresh.json()).toMatchObject({ verdict: { status: "ELIGIBLE" } });

    await app.inject({
      method: "POST",
      url: "/api/demo/assets/ttbill-a/nav-age",
      payload: { ageSeconds: 31 * 3_600 },
    });
    const restricted = await app.inject({ method: "GET", url: "/api/assets/ttbill-a/eligibility" });
    const restrictedBody = restricted.json() as {
      verdict: { status: string; reasons: { code: string }[] };
    };
    expect(restrictedBody.verdict.status).toBe("RESTRICTED");
    expect(restrictedBody.verdict.reasons.map((r) => r.code)).toContain("NAV_STALE");

    await app.inject({ method: "POST", url: "/api/demo/reset" });
    const restored = await app.inject({ method: "GET", url: "/api/assets/ttbill-a/eligibility" });
    expect(restored.json()).toMatchObject({ verdict: { status: "ELIGIBLE" } });

    await app.close();
  });

  // Attack Lab must only ever be able to degrade the demo asset -- never
  // the live Chainlink-backed showcase.
  it("refuses to degrade ttbill-b -- it is backed by the real Chainlink feed", async () => {
    const app = await buildCompositeApp();

    const attempt = await app.inject({
      method: "POST",
      url: "/api/demo/assets/ttbill-b/nav-age",
      payload: { ageSeconds: 31 * 3_600 },
    });
    expect(attempt.statusCode).toBe(409);
    const body = attempt.json() as { error: { code: string; message: string } };
    expect(body.error.message).toMatch(/live Chainlink feed/i);

    await app.close();
  });
});
