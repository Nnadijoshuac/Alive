import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDemoEligibilityPolicy } from "@alive/eligibility-engine";
import {
  ControllableDemoMarketDataProvider,
  MarketDataError,
  type MarketDataProvider,
} from "@alive/market-data";
import type { MarketQuote } from "@alive/shared";

import { loadRwaCatalog } from "../src/catalog.js";
import { MonitorService } from "../src/monitoring/service.js";
import { IntelligenceRepository } from "../src/repository.js";

const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);

async function seededRepository(): Promise<IntelligenceRepository> {
  const catalog = await loadRwaCatalog(catalogPath);
  const repository = new IntelligenceRepository(":memory:");
  repository.replaceCatalog(catalog.assets);
  return repository;
}

/** Counts reads and can be told to fail on demand, to test transient RPC failures. */
class CountingProvider implements MarketDataProvider {
  readonly name = "CHAINLINK";
  calls = 0;
  #inner: ControllableDemoMarketDataProvider;
  #failNextCalls = 0;

  constructor(inner: ControllableDemoMarketDataProvider) {
    this.#inner = inner;
  }

  failNext(times: number): void {
    this.#failNextCalls = times;
  }

  async getQuote(assetId: string): Promise<MarketQuote> {
    this.calls += 1;
    if (this.#failNextCalls > 0) {
      this.#failNextCalls -= 1;
      throw new MarketDataError("PROVIDER_UNAVAILABLE", "RPC unreachable");
    }
    return this.#inner.getQuote(assetId);
  }

  async getQuotes(assetIds: string[]): Promise<MarketQuote[]> {
    return Promise.all(assetIds.map((id) => this.getQuote(id))).catch(() => []);
  }

  async health() {
    return this.#inner.health();
  }
}

describe("MonitorService lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T14:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts, runs a cycle immediately, and stops cleanly with no orphan timers", async () => {
    const repository = await seededRepository();
    const provider = new CountingProvider(
      new ControllableDemoMarketDataProvider(undefined, () => new Date()),
    );
    const service = new MonitorService({
      repository,
      marketData: provider,
      policy: createDemoEligibilityPolicy(),
      assetIds: ["ttbill-a"],
      intervalSeconds: 30,
    });

    expect(service.running).toBe(false);
    service.start();
    expect(service.running).toBe(true);

    await vi.advanceTimersByTimeAsync(0);
    expect(provider.calls).toBe(1);
    expect(repository.countMarketObservations("ttbill-a")).toBe(1);

    await service.stop();
    expect(service.running).toBe(false);

    // No pending timers left behind -- advancing time does nothing further.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(provider.calls).toBe(1);
    repository.close();
  });

  it("does not start a second loop when start() is called while already running", async () => {
    const repository = await seededRepository();
    const provider = new CountingProvider(
      new ControllableDemoMarketDataProvider(undefined, () => new Date()),
    );
    const service = new MonitorService({
      repository,
      marketData: provider,
      policy: createDemoEligibilityPolicy(),
      assetIds: ["ttbill-a"],
      intervalSeconds: 30,
    });

    service.start();
    service.start();
    service.start();
    await vi.advanceTimersByTimeAsync(0);
    // One loop -> one read for this cycle, not three.
    expect(provider.calls).toBe(1);

    await service.stop();
    repository.close();
  });

  it("respects the configured interval between cycles", async () => {
    const repository = await seededRepository();
    const provider = new CountingProvider(
      new ControllableDemoMarketDataProvider(undefined, () => new Date()),
    );
    const service = new MonitorService({
      repository,
      marketData: provider,
      policy: createDemoEligibilityPolicy(),
      assetIds: ["ttbill-a"],
      intervalSeconds: 30,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.calls).toBe(1);

    // Short of the interval: no second cycle yet.
    await vi.advanceTimersByTimeAsync(29_000);
    expect(provider.calls).toBe(1);

    // Crossing the interval triggers the second cycle.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(provider.calls).toBe(2);
    expect(repository.countMarketObservations("ttbill-a")).toBe(2);

    await service.stop();
    repository.close();
  });

  it("rejects an interval below the 30-second minimum", async () => {
    const repository = await seededRepository();
    const provider = new CountingProvider(
      new ControllableDemoMarketDataProvider(undefined, () => new Date()),
    );
    expect(
      () =>
        new MonitorService({
          repository,
          marketData: provider,
          policy: createDemoEligibilityPolicy(),
          assetIds: ["ttbill-a"],
          intervalSeconds: 29,
        }),
    ).toThrow(RangeError);
    repository.close();
  });

  it("records the ALIVE-observed timestamp and a re-evaluated eligibility status each cycle", async () => {
    const repository = await seededRepository();
    const provider = new CountingProvider(
      new ControllableDemoMarketDataProvider(undefined, () => new Date()),
    );
    const service = new MonitorService({
      repository,
      marketData: provider,
      policy: createDemoEligibilityPolicy(),
      assetIds: ["ttbill-a"],
      intervalSeconds: 30,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    const observation = repository.latestMarketObservation("ttbill-a");
    expect(observation?.observedAt).toBeDefined();
    expect(observation?.eligibilityStatus).toBeDefined();

    await service.stop();
    repository.close();
  });

  it("five steady healthy cycles produce zero publish decisions", async () => {
    const repository = await seededRepository();
    const provider = new CountingProvider(
      new ControllableDemoMarketDataProvider(undefined, () => new Date()),
    );
    const publishes: string[] = [];
    const service = new MonitorService({
      repository,
      marketData: provider,
      policy: createDemoEligibilityPolicy(),
      assetIds: ["ttbill-a"],
      intervalSeconds: 30,
      onPublish: (assetId) => {
        publishes.push(assetId);
      },
    });

    service.start();
    // First cycle always publishes: nothing is onchain yet.
    await vi.advanceTimersByTimeAsync(0);
    expect(publishes).toEqual(["ttbill-a"]);

    for (let i = 0; i < 5; i += 1) {
      await vi.advanceTimersByTimeAsync(30_000);
    }
    // Steady state after the first publish: no further transactions.
    expect(publishes).toEqual(["ttbill-a"]);
    expect(repository.countMarketObservations("ttbill-a")).toBe(6);

    await service.stop();
    repository.close();
  });

  it("publishes on every eligibility status transition and stops once steady", async () => {
    const repository = await seededRepository();
    const demo = new ControllableDemoMarketDataProvider(undefined, () => new Date());
    const provider = new CountingProvider(demo);
    const publishes: string[] = [];
    const service = new MonitorService({
      repository,
      marketData: provider,
      policy: createDemoEligibilityPolicy(),
      assetIds: ["ttbill-a"],
      intervalSeconds: 30,
      onPublish: (_assetId, decision) => {
        publishes.push(decision.verdict?.status ?? "NONE");
      },
    });

    service.start();
    // Nothing published onchain yet -> the first read always publishes,
    // regardless of status.
    await vi.advanceTimersByTimeAsync(0);
    expect(publishes).toHaveLength(1);
    const baseline = publishes[0];

    // Degrading the demo asset's NAV past the policy bound must flip the
    // status and publish again.
    demo.setOverride("ttbill-a", { ageSeconds: 31 * 3_600 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(publishes).toEqual([baseline, "RESTRICTED"]);

    // Steady RESTRICTED: no further publishes.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(publishes).toEqual([baseline, "RESTRICTED"]);

    // Restoring the data must flip the status back and publish again.
    demo.clearAllOverrides();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(publishes).toEqual([baseline, "RESTRICTED", baseline]);
    expect(publishes[2]).not.toBe("RESTRICTED");

    const published = repository.latestPublishedVerdict("ttbill-a");
    expect(published?.status).toBe(baseline);

    await service.stop();
    repository.close();
  });

  it("records DATA_UNAVAILABLE on a failed read and never republishes a stale value", async () => {
    const repository = await seededRepository();
    const demo = new ControllableDemoMarketDataProvider(undefined, () => new Date());
    const provider = new CountingProvider(demo);
    const service = new MonitorService({
      repository,
      marketData: provider,
      policy: createDemoEligibilityPolicy(),
      assetIds: ["ttbill-a", "tgold"],
      intervalSeconds: 30,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    const good = repository.latestMarketObservation("ttbill-a");
    expect(good?.value).toBeDefined();

    // Only the next read (ttbill-a, read first) fails -- tgold still succeeds.
    provider.failNext(1);
    await vi.advanceTimersByTimeAsync(30_000);
    const failed = repository.latestMarketObservation("ttbill-a");
    expect(failed?.status).toBe("DATA_UNAVAILABLE");
    expect(failed?.value).toBeUndefined();
    expect(repository.latestMarketObservation("tgold")?.status).toBe("OK");

    const status = service.status();
    expect(status.failedReads).toBeGreaterThanOrEqual(1);
    expect(status.health).toBe("DEGRADED");

    await service.stop();
    repository.close();
  });

  it("survives a transient RPC failure and resumes clean reads on the next cycle", async () => {
    const repository = await seededRepository();
    const demo = new ControllableDemoMarketDataProvider(undefined, () => new Date());
    const provider = new CountingProvider(demo);
    const service = new MonitorService({
      repository,
      marketData: provider,
      policy: createDemoEligibilityPolicy(),
      assetIds: ["ttbill-a"],
      intervalSeconds: 30,
    });

    provider.failNext(1);
    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.running).toBe(true);
    expect(repository.latestMarketObservation("ttbill-a")?.status).toBe(
      "DATA_UNAVAILABLE",
    );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(service.running).toBe(true);
    const recovered = repository.latestMarketObservation("ttbill-a");
    expect(recovered?.status).toBe("OK");
    expect(recovered?.value).toBeDefined();

    await service.stop();
    repository.close();
  });

  it("monitoring multiple assets does not create duplicate monitors per asset", async () => {
    const repository = await seededRepository();
    const provider = new CountingProvider(
      new ControllableDemoMarketDataProvider(undefined, () => new Date()),
    );
    const service = new MonitorService({
      repository,
      marketData: provider,
      policy: createDemoEligibilityPolicy(),
      assetIds: ["ttbill-a", "ttbill-a", "ttbill-a"],
      intervalSeconds: 30,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    // Duplicate ids in the config collapse to one monitor, one read.
    expect(provider.calls).toBe(1);

    await service.stop();
    repository.close();
  });
});

describe("MonitorService status reporting", () => {
  it("reports DISABLED health before start", async () => {
    const repository = await seededRepository();
    const provider = new CountingProvider(
      new ControllableDemoMarketDataProvider(undefined, () => new Date()),
    );
    const service = new MonitorService({
      repository,
      marketData: provider,
      policy: createDemoEligibilityPolicy(),
      assetIds: ["ttbill-a"],
      intervalSeconds: 30,
    });
    expect(service.status().health).toBe("DISABLED");
    expect(service.status().running).toBe(false);
    repository.close();
  });
});

describe("published verdict tie-breaking under fast polling", () => {
  it("keeps the newest observation as latest even with identical timestamps", async () => {
    const repository = await seededRepository();
    const observedAt = new Date("2026-08-14T14:00:00.000Z").toISOString();
    repository.saveMarketObservation({
      id: "first",
      assetId: "ttbill-a",
      provider: "DEMO",
      dataMode: "DEMO",
      value: "1.00",
      observedAt,
      status: "OK",
    });
    repository.saveMarketObservation({
      id: "second",
      assetId: "ttbill-a",
      provider: "DEMO",
      dataMode: "DEMO",
      value: "1.01",
      observedAt,
      status: "OK",
    });
    const latest = repository.latestMarketObservation("ttbill-a");
    expect(latest?.id).toBe("second");
    expect(latest?.value).toBe("1.01");
    repository.close();
  });
});
