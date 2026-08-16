import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createDemoEligibilityPolicy } from "@alive/eligibility-engine";
import {
  ControllableDemoMarketDataProvider,
  MarketDataError,
  type MarketDataProvider,
} from "@alive/market-data";
import type { MarketQuote } from "@alive/shared";

import { loadRwaCatalog } from "../src/catalog.js";
import { MarketMonitor, type OnchainVerdictState } from "../src/monitoring/market-monitor.js";
import { IntelligenceRepository } from "../src/repository.js";

// Close to the demo catalog's own asOf date. Set far past it, every asset
// trips SOURCE_DATA_TOO_OLD on passport age alone and is permanently
// RESTRICTED, which would mask the status transitions under test.
const NOW = new Date("2026-08-14T14:00:00.000Z");
const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);

async function seededRepository(): Promise<IntelligenceRepository> {
  const catalog = await loadRwaCatalog(catalogPath);
  const repository = new IntelligenceRepository(":memory:");
  repository.replaceCatalog(catalog.assets);
  return repository;
}

/** A provider that always fails, to prove failures never become data. */
function failingProvider(): MarketDataProvider {
  return {
    name: "CHAINLINK",
    async getQuote(): Promise<MarketQuote> {
      throw new MarketDataError("PROVIDER_UNAVAILABLE", "RPC unreachable");
    },
    async getQuotes() {
      return [];
    },
    async health() {
      return {
        provider: "CHAINLINK",
        status: "OFFLINE" as const,
        dataMode: "LIVE" as const,
        checkedAt: NOW.toISOString(),
        message: "offline",
      };
    },
  };
}

function monitorWith(
  repository: IntelligenceRepository,
  marketData: MarketDataProvider,
): MarketMonitor {
  return new MarketMonitor({
    repository,
    marketData,
    policy: createDemoEligibilityPolicy(),
    now: () => NOW,
  });
}

function onchain(
  status: string,
  validUntilOffsetSeconds: number,
): OnchainVerdictState {
  return {
    status,
    validUntil: new Date(
      NOW.getTime() + validUntilOffsetSeconds * 1_000,
    ).toISOString(),
  };
}

describe("MarketMonitor observations", () => {
  it("records a live observation with its full source provenance", async () => {
    const repository = await seededRepository();
    const monitor = monitorWith(
      repository,
      new ControllableDemoMarketDataProvider(undefined, () => NOW),
    );

    const decision = await monitor.check("ttbill-a");
    expect(decision.observation.status).toBe("OK");
    expect(decision.observation.value).toBeDefined();
    expect(decision.observation.eligibilityStatus).toBe(
      decision.verdict?.status,
    );
    expect(repository.countMarketObservations("ttbill-a")).toBe(1);
    repository.close();
  });

  it("records a failed read as DATA_UNAVAILABLE and never reuses the last value", async () => {
    const repository = await seededRepository();
    const working = new ControllableDemoMarketDataProvider(undefined, () => NOW);

    // First a good read, so there is a previous value that could be reused.
    const good = await monitorWith(repository, working).check("ttbill-a");
    expect(good.observation.value).toBeDefined();

    // Then the provider fails.
    const failed = await monitorWith(repository, failingProvider()).check(
      "ttbill-a",
    );

    expect(failed.observation.status).toBe("DATA_UNAVAILABLE");
    // The critical property: no value, and no verdict derived from stale data.
    expect(failed.observation.value).toBeUndefined();
    expect(failed.verdict).toBeUndefined();
    expect(failed.shouldPublish).toBe(false);
    expect(failed.reason).toBe("DATA_UNAVAILABLE");

    const latest = repository.latestMarketObservation("ttbill-a");
    expect(latest?.status).toBe("DATA_UNAVAILABLE");
    expect(latest?.value).toBeUndefined();
    repository.close();
  });
});

describe("MarketMonitor publish decisions", () => {
  it("publishes when nothing is onchain yet", async () => {
    const repository = await seededRepository();
    const monitor = monitorWith(
      repository,
      new ControllableDemoMarketDataProvider(undefined, () => NOW),
    );
    const decision = await monitor.check("ttbill-a", undefined);
    expect(decision.shouldPublish).toBe(true);
    expect(decision.reason).toBe("NO_ONCHAIN_VERDICT");
    repository.close();
  });

  it("does not publish when the status is unchanged and the verdict is still valid", async () => {
    const repository = await seededRepository();
    const monitor = monitorWith(
      repository,
      new ControllableDemoMarketDataProvider(undefined, () => NOW),
    );
    const first = await monitor.check("ttbill-a");
    const status = first.verdict!.status;

    // Poll repeatedly with a healthy onchain verdict already in place.
    for (let i = 0; i < 5; i += 1) {
      const decision = await monitor.check("ttbill-a", onchain(status, 600));
      expect(decision.shouldPublish).toBe(false);
      expect(decision.reason).toBe("NO_CHANGE");
    }
    // Polling wrote observations but produced no publish decisions.
    expect(repository.countMarketObservations("ttbill-a")).toBe(6);
    repository.close();
  });

  it("publishes when the eligibility status changes", async () => {
    const repository = await seededRepository();
    const provider = new ControllableDemoMarketDataProvider(
      undefined,
      () => NOW,
    );
    const monitor = monitorWith(repository, provider);

    const healthy = await monitor.check("ttbill-a", undefined);
    const healthyStatus = healthy.verdict!.status;

    // Degrade the demo asset past the policy's NAV bound.
    provider.setOverride("ttbill-a", { ageSeconds: 31 * 3_600 });
    const degraded = await monitor.check("ttbill-a", onchain(healthyStatus, 600));

    expect(degraded.verdict?.status).toBe("RESTRICTED");
    expect(degraded.verdict?.reasons.map((r) => r.code)).toContain("NAV_STALE");
    expect(degraded.shouldPublish).toBe(true);
    expect(degraded.reason).toBe("STATUS_CHANGED");
    repository.close();
  });

  it("republishes when the onchain verdict is close to expiring", async () => {
    const repository = await seededRepository();
    const monitor = monitorWith(
      repository,
      new ControllableDemoMarketDataProvider(undefined, () => NOW),
    );
    const first = await monitor.check("ttbill-a");
    const status = first.verdict!.status;

    // Comfortably valid -> no publish.
    expect((await monitor.check("ttbill-a", onchain(status, 600))).shouldPublish).toBe(
      false,
    );
    // Inside the republish window -> publish, so the asset never lapses.
    const expiring = await monitor.check("ttbill-a", onchain(status, 60));
    expect(expiring.shouldPublish).toBe(true);
    expect(expiring.reason).toBe("VERDICT_EXPIRING");
    repository.close();
  });

  it("recovers: restoring the data flips the decision back to publish ELIGIBLE", async () => {
    const repository = await seededRepository();
    const provider = new ControllableDemoMarketDataProvider(
      undefined,
      () => NOW,
    );
    const monitor = monitorWith(repository, provider);

    provider.setOverride("ttbill-a", { ageSeconds: 31 * 3_600 });
    const restricted = await monitor.check("ttbill-a");
    expect(restricted.verdict?.status).toBe("RESTRICTED");

    provider.clearAllOverrides();
    const recovered = await monitor.check("ttbill-a", onchain("RESTRICTED", 600));
    expect(recovered.verdict?.status).not.toBe("RESTRICTED");
    expect(recovered.shouldPublish).toBe(true);
    expect(recovered.reason).toBe("STATUS_CHANGED");
    repository.close();
  });
});
