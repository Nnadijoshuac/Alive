import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ControllableDemoMarketDataProvider } from "@alive/market-data";

import { buildIntelligenceApp } from "../src/app.js";
import { EligibilitySigner } from "../src/attestations/eligibility-signer.js";
import { loadRwaCatalog } from "../src/catalog.js";
import { resolveGatewayClientConfig } from "../src/onchain/gateway-client.js";
import { IntelligenceRepository } from "../src/repository.js";
import type { IntelligenceConfig } from "../src/config.js";

const NOW = new Date("2026-08-17T00:00:00.000Z");
const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);
const sourceDocumentsPath = fileURLToPath(
  new URL("../../../data/source-documents", import.meta.url),
);

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

async function buildApp(eligibilitySigner: EligibilitySigner) {
  const catalog = await loadRwaCatalog(catalogPath);
  const repository = new IntelligenceRepository(":memory:");
  repository.replaceCatalog(catalog.assets);
  const app = await buildIntelligenceApp(demoConfig(), {
    repository,
    catalog,
    llm: disabledLlm(),
    marketData: new ControllableDemoMarketDataProvider(undefined, () => NOW),
    eligibilitySigner,
    now: () => NOW,
  });
  return app;
}

const ENV_KEYS = [
  "DEPLOYER_PRIVATE_KEY",
  "ELIGIBILITY_CHAIN_ID",
  "X_LAYER_TESTNET_RPC_URL",
] as const;

describe("gateway-proof config resolution (no network calls)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("reports every missing required var when none are set", () => {
    const status = resolveGatewayClientConfig("ttbill-a");
    expect(status.configured).toBe(false);
    if (!status.configured) {
      expect(status.missing).toContain("DEPLOYER_PRIVATE_KEY");
      expect(status.missing).toContain("ELIGIBILITY_CHAIN_ID");
    }
  });

  it("still reports missing when only the deployer key is set", () => {
    process.env.DEPLOYER_PRIVATE_KEY = `0x${"11".repeat(32)}`;
    const status = resolveGatewayClientConfig("ttbill-a");
    expect(status.configured).toBe(false);
    if (!status.configured) {
      expect(status.missing).toContain("ELIGIBILITY_CHAIN_ID");
    }
  });

  it("resolves real deployment addresses once every required var is set (chain 1952)", () => {
    process.env.DEPLOYER_PRIVATE_KEY = `0x${"11".repeat(32)}`;
    process.env.ELIGIBILITY_CHAIN_ID = "1952";
    // X_LAYER_TESTNET_RPC_URL intentionally omitted -- 1952 has a documented fallback RPC.
    const status = resolveGatewayClientConfig("ttbill-a");
    expect(status.configured).toBe(true);
    if (status.configured) {
      expect(status.config.chainId).toBe(1952);
      expect(status.config.eligibilityRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(status.config.vault).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(status.config.token).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it("fails clearly for an asset with no deployed demo token", () => {
    process.env.DEPLOYER_PRIVATE_KEY = `0x${"11".repeat(32)}`;
    process.env.ELIGIBILITY_CHAIN_ID = "1952";
    const status = resolveGatewayClientConfig("not-a-real-asset");
    expect(status.configured).toBe(false);
  });
});

describe("POST /api/demo/assets/:assetId/gateway-proof", () => {
  it("refuses ttbill-b -- it is backed by the real Chainlink feed", async () => {
    const app = await buildApp(new EligibilitySigner({}));
    const response = await app.inject({
      method: "POST",
      url: "/api/demo/assets/ttbill-b/gateway-proof",
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "PROVIDER_DISABLED" } });
    await app.close();
  });

  it("returns 404 for an asset with no passport", async () => {
    const app = await buildApp(
      new EligibilitySigner({
        privateKey: `0x${"42".repeat(32)}`,
        chainId: 31_337,
        verifyingContract: `0x${"aa".repeat(20)}`,
      }),
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/demo/assets/not-a-real-asset/gateway-proof",
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns 503 SIGNER_NOT_CONFIGURED before ever attempting to broadcast", async () => {
    const app = await buildApp(new EligibilitySigner({}));
    const response = await app.inject({
      method: "POST",
      url: "/api/demo/assets/ttbill-a/gateway-proof",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "SIGNER_NOT_CONFIGURED" } });
    await app.close();
  });

  it("returns 503 GATEWAY_CLIENT_UNAVAILABLE when signing works but no broadcasting key is configured", async () => {
    const saved = process.env.DEPLOYER_PRIVATE_KEY;
    delete process.env.DEPLOYER_PRIVATE_KEY;
    try {
      const app = await buildApp(
        new EligibilitySigner({
          privateKey: `0x${"42".repeat(32)}`,
          chainId: 31_337,
          verifyingContract: `0x${"aa".repeat(20)}`,
        }),
      );
      const response = await app.inject({
        method: "POST",
        url: "/api/demo/assets/ttbill-a/gateway-proof",
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: { code: "GATEWAY_CLIENT_UNAVAILABLE" } });
      await app.close();
    } finally {
      if (saved !== undefined) process.env.DEPLOYER_PRIVATE_KEY = saved;
    }
  });

  it("does not register the route unless DEMO_MODE is on", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const repository = new IntelligenceRepository(":memory:");
    repository.replaceCatalog(catalog.assets);
    const app = await buildIntelligenceApp(
      { ...demoConfig(), demoMode: false },
      {
        repository,
        catalog,
        llm: disabledLlm(),
        marketData: new ControllableDemoMarketDataProvider(undefined, () => NOW),
        eligibilitySigner: new EligibilitySigner({}),
        now: () => NOW,
      },
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/demo/assets/ttbill-a/gateway-proof",
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
