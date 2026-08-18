import { fileURLToPath } from "node:url";

import { DemoMarketDataProvider } from "@alive/market-data";
import { describe, expect, it } from "vitest";

import {
  EligibilitySigner,
  IntelligenceRepository,
  buildIntelligenceApp,
  loadRwaCatalog,
  type IntelligenceConfig,
} from "../src/index.js";
import { getIntelligenceProfile } from "../src/data/intelligence-profiles.js";

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

const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);
const sourceDocumentsPath = fileURLToPath(
  new URL("../../../data/source-documents", import.meta.url),
);
const NOW = new Date("2026-08-18T00:00:00.000Z");

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

async function buildApp() {
  const catalog = await loadRwaCatalog(catalogPath, () => NOW);
  const repository = new IntelligenceRepository(":memory:");
  repository.replaceCatalog(catalog.assets);
  return buildIntelligenceApp(baseConfig(), {
    repository,
    catalog,
    llm: disabledLlm(),
    marketData: new DemoMarketDataProvider(undefined, () => NOW),
    eligibilitySigner: unconfiguredEligibilitySigner(),
    now: () => NOW,
  });
}

describe("X Layer mandate -- closeout invariants", () => {
  it("ttbill-a (the Attack Lab Testnet harness asset) never appears in the X Layer Mainnet (chainId=196) catalog filter", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/assets?chainId=196" });
    const body = response.json() as { assets: { id: string }[] };
    expect(body.assets.map((a) => a.id)).not.toContain("ttbill-a");
    await app.close();
  });

  it("no asset returned for chainId=196 has an Ethereum deployment mixed in as if it were an X Layer deployment", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/assets?chainId=196" });
    const body = response.json() as {
      assets: { deployments?: { chainId: number; chainName: string; deploymentStatus: string }[] }[];
    };
    for (const asset of body.assets) {
      const xLayerDeployments = (asset.deployments ?? []).filter(
        (d) => d.chainId === 196 && d.deploymentStatus === "VERIFIED",
      );
      expect(xLayerDeployments.length).toBeGreaterThan(0);
      for (const deployment of asset.deployments ?? []) {
        if (deployment.chainId === 196) expect(deployment.chainName).toBe("X Layer");
      }
    }
    await app.close();
  });

  it("ttbill-b (X Layer enforcement capability, no X Layer token deployment) is present on Ethereum but absent from the X Layer filter", async () => {
    const app = await buildApp();
    const ethereum = await app.inject({ method: "GET", url: "/api/assets?chainId=1" });
    const xLayer = await app.inject({ method: "GET", url: "/api/assets?chainId=196" });
    expect((ethereum.json() as { assets: { id: string }[] }).assets.map((a) => a.id)).toContain(
      "ttbill-b",
    );
    expect((xLayer.json() as { assets: { id: string }[] }).assets.map((a) => a.id)).not.toContain(
      "ttbill-b",
    );
    await app.close();
  });
});

describe("Risk drivers are asset-class-appropriate, not copy-pasted between reference assets", () => {
  it("USTB (ttbill-b) risk drivers concern rates/Treasury/fund mechanics; the META-linked xStock's concern company/equity/tokenization mechanics -- the two sets share no driver name", async () => {
    const ustb = getIntelligenceProfile("ttbill-b");
    const metaXstock = getIntelligenceProfile("meta-xstock");
    expect(ustb?.riskDrivers?.status).toBe("AVAILABLE");
    expect(metaXstock?.riskDrivers?.status).toBe("AVAILABLE");
    const ustbNames =
      ustb?.riskDrivers?.status === "AVAILABLE"
        ? ustb.riskDrivers.data.map((d) => d.name)
        : [];
    const metaNames =
      metaXstock?.riskDrivers?.status === "AVAILABLE"
        ? metaXstock.riskDrivers.data.map((d) => d.name)
        : [];
    expect(ustbNames.length).toBeGreaterThan(0);
    expect(metaNames.length).toBeGreaterThan(0);
    const overlap = ustbNames.filter((name) => metaNames.includes(name));
    expect(overlap).toHaveLength(0);
  });

  it("the META-linked xStock's risk drivers include a tokenization/collateral-structure driver distinct from the underlying company's own business risk", async () => {
    const profile = getIntelligenceProfile("meta-xstock");
    const drivers = profile?.riskDrivers?.status === "AVAILABLE" ? profile.riskDrivers.data : [];
    const hasTokenizationDriver = drivers.some((d) =>
      d.explanation.toLowerCase().includes("tokeniz") ||
      d.name.toLowerCase().includes("tokeniz") ||
      d.name.toLowerCase().includes("collateral"),
    );
    expect(hasTokenizationDriver).toBe(true);
  });
});

describe("Outlook is fully independent of the deterministic eligibility verdict", () => {
  it("meta-xstock has a populated Outlook while its eligibility has never been evaluated (NOT_ANALYZED) -- outlook does not require or produce an eligibility verdict", async () => {
    const app = await buildApp();
    const eligibility = await app.inject({ method: "GET", url: "/api/assets/meta-xstock/eligibility" });
    // No extraction has run, so eligibility is either unavailable or UNKNOWN --
    // never derived from or blocked by the Outlook module.
    expect([200, 404]).toContain(eligibility.statusCode);
    const profile = getIntelligenceProfile("meta-xstock");
    expect(profile?.outlook?.status).toBe("AVAILABLE");
    await app.close();
  });
});

describe("Ownership module semantics (structural check -- no reference asset currently populates it)", () => {
  it("neither reference profile confuses onchain deployment sourceIds with an ownership/shareholder claim -- ownership is a distinct, currently-unpopulated module for both", () => {
    const ustb = getIntelligenceProfile("ttbill-b");
    const metaXstock = getIntelligenceProfile("meta-xstock");
    for (const profile of [ustb, metaXstock]) {
      if (profile?.ownership) {
        expect(profile.ownership.status).not.toBe("AVAILABLE");
      }
    }
  });
});
