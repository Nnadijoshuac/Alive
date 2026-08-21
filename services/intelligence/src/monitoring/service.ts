import type { MarketDataProvider } from "@alive/market-data";
import type { EligibilityPolicy } from "@alive/shared";

import type { EligibilitySigner } from "../attestations/eligibility-signer.js";
import type { IntelligenceRepository } from "../repository.js";
import {
  MarketMonitor,
  type MonitorDecision,
  type OnchainVerdictState,
} from "./market-monitor.js";

export type MonitorHealthState = "ACTIVE" | "DEGRADED" | "ERROR" | "DISABLED";

export type MonitorStatus = {
  enabled: boolean;
  running: boolean;
  health: MonitorHealthState;
  intervalSeconds: number;
  startedAt?: string;
  lastCycleStartedAt?: string;
  lastCycleCompletedAt?: string;
  nextCycleAt?: string;
  monitoredAssets: string[];
  successfulReads: number;
  failedReads: number;
  lastError?: string;
};

export type AssetMonitorStatus = {
  assetId: string;
  monitoring: boolean;
  provider?: string;
  latestValue?: string;
  sourceUpdatedAt?: string;
  lastAliveCheckAt?: string;
  ageSeconds?: number;
  freshness?: "OK" | "STALE" | "DATA_UNAVAILABLE";
  eligibility?: string;
  lastEligibilityChangeAt?: string;
  lastError?: string;
};

export type MonitorServiceOptions = {
  repository: IntelligenceRepository;
  marketData: MarketDataProvider;
  policy: EligibilityPolicy;
  assetIds: string[];
  intervalSeconds: number;
  /**
   * When configured, a STATUS_CHANGED/NO_ONCHAIN_VERDICT/VERDICT_EXPIRING
   * decision is signed into an attestation and recorded as ALIVE's own
   * record of what it last published. Broadcasting that attestation as an
   * onchain transaction is a deliberately separate, later step -- this
   * service never holds or uses a key to send a transaction itself, only to
   * sign the EIP-712 attestation the caller of `onPublish` can then send.
   */
  signer?: EligibilitySigner;
  now?: () => Date;
  /** Called after a signed attestation is produced for a publish decision. */
  onPublish?: (
    assetId: string,
    decision: MonitorDecision,
    signed?: Awaited<ReturnType<EligibilitySigner["sign"]>>,
  ) => void | Promise<void>;
};

/**
 * Runs `MarketMonitor` continuously inside the service process: starts on
 * boot, polls every configured asset on a fixed interval, and stops
 * cleanly, with no orphan timers and no duplicate loops if start() is
 * called more than once.
 */
export class MonitorService {
  readonly #repository: IntelligenceRepository;
  readonly #monitor: MarketMonitor;
  readonly #signer: EligibilitySigner | undefined;
  readonly #assetIds: string[];
  readonly #intervalSeconds: number;
  readonly #now: () => Date;
  readonly #onPublish: MonitorServiceOptions["onPublish"];

  #abortController: AbortController | undefined;
  #loopPromise: Promise<void> | undefined;
  #startedAt: string | undefined;
  #lastCycleStartedAt: string | undefined;
  #lastCycleCompletedAt: string | undefined;
  #nextCycleAt: string | undefined;
  #successfulReads = 0;
  #failedReads = 0;
  #lastError: string | undefined;
  #lastCycleFailedAssetIds = new Set<string>();
  #assetErrors = new Map<string, string>();
  #lastEligibilityChangeAt = new Map<string, string>();

  constructor(options: MonitorServiceOptions) {
    if (options.intervalSeconds < 30) {
      throw new RangeError(
        "MonitorService intervalSeconds must be at least 30",
      );
    }
    this.#repository = options.repository;
    this.#assetIds = [...new Set(options.assetIds)];
    this.#intervalSeconds = options.intervalSeconds;
    this.#signer = options.signer;
    this.#now = options.now ?? (() => new Date());
    this.#onPublish = options.onPublish;
    this.#monitor = new MarketMonitor({
      repository: options.repository,
      marketData: options.marketData,
      policy: options.policy,
      now: this.#now,
    });
  }

  get running(): boolean {
    return this.#abortController !== undefined;
  }

  /**
   * Starts the poll loop. Calling start() while already running is a no-op
   * -- it returns the existing loop rather than creating a second one, so a
   * duplicate boot call (or a hot-reload) can never produce two monitors
   * for the same asset.
   */
  start(): void {
    if (this.running) return;
    const controller = new AbortController();
    this.#abortController = controller;
    this.#startedAt = this.#now().toISOString();
    this.#loopPromise = this.#loop(controller.signal);
  }

  /**
   * Signals the loop to stop and waits for the current cycle to finish
   * before returning, so shutdown never interrupts a read mid-flight.
   */
  async stop(): Promise<void> {
    if (!this.#abortController) return;
    this.#abortController.abort();
    await this.#loopPromise;
    this.#abortController = undefined;
    this.#loopPromise = undefined;
  }

  async #loop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.#runCycle();
      if (signal.aborted) return;
      this.#nextCycleAt = new Date(
        this.#now().getTime() + this.#intervalSeconds * 1_000,
      ).toISOString();
      await this.#sleep(this.#intervalSeconds * 1_000, signal);
    }
  }

  #sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  async #runCycle(): Promise<void> {
    this.#lastCycleStartedAt = this.#now().toISOString();
    const failedThisCycle = new Set<string>();
    for (const assetId of this.#assetIds) {
      try {
        const onchain = this.#onchainState(assetId);
        const decision = await this.#monitor.check(assetId, onchain);
        if (decision.observation.status === "DATA_UNAVAILABLE") {
          this.#failedReads += 1;
          failedThisCycle.add(assetId);
          this.#assetErrors.set(
            assetId,
            "Market data unavailable on last cycle.",
          );
        } else {
          this.#successfulReads += 1;
          this.#assetErrors.delete(assetId);
        }
        if (
          decision.previousStatus !== undefined &&
          decision.verdict !== undefined &&
          decision.previousStatus !== decision.verdict.status
        ) {
          this.#lastEligibilityChangeAt.set(assetId, this.#now().toISOString());
        }
        if (decision.shouldPublish) {
          await this.#publish(assetId, decision);
        }
      } catch (error) {
        this.#failedReads += 1;
        failedThisCycle.add(assetId);
        const message = error instanceof Error ? error.message : String(error);
        this.#assetErrors.set(assetId, message);
        this.#lastError = message;
        // One asset's unexpected failure must never stop the others, and
        // must never crash the whole service.
        process.stderr.write(`market monitor: ${assetId} failed: ${message}\n`);
      }
    }
    this.#lastCycleFailedAssetIds = failedThisCycle;
    this.#lastCycleCompletedAt = this.#now().toISOString();
  }

  #onchainState(assetId: string): OnchainVerdictState | undefined {
    const published = this.#repository.latestPublishedVerdict(assetId);
    if (!published) return undefined;
    return { status: published.status, validUntil: published.validUntil };
  }

  async #publish(assetId: string, decision: MonitorDecision): Promise<void> {
    if (!decision.verdict) return;
    const now = this.#now();
    let signed: Awaited<ReturnType<EligibilitySigner["sign"]>> | undefined;
    if (this.#signer?.configured) {
      signed = await this.#signer.sign(assetId, decision.verdict, now);
    }
    // ALIVE's own record of what it decided to publish, so the next cycle's
    // comparison does not require reading the chain. Recorded regardless of
    // whether a signer is configured, so a demo/no-key deployment still
    // exercises real publish-decision bookkeeping.
    this.#repository.savePublishedVerdict({
      assetId,
      status: decision.verdict.status,
      validUntil: decision.verdict.validUntil,
      publishedAt: now.toISOString(),
      ...(signed ? { digest: signed.digest } : {}),
    });
    await this.#onPublish?.(assetId, decision, signed);
  }

  status(): MonitorStatus {
    const running = this.running;
    let health: MonitorHealthState;
    if (!running) {
      health = "DISABLED";
    } else if (this.#lastCycleCompletedAt === undefined) {
      health = "ACTIVE";
    } else if (this.#lastCycleFailedAssetIds.size === 0) {
      health = "ACTIVE";
    } else if (this.#lastCycleFailedAssetIds.size < this.#assetIds.length) {
      health = "DEGRADED";
    } else {
      health = "ERROR";
    }
    return {
      enabled: true,
      running,
      health,
      intervalSeconds: this.#intervalSeconds,
      ...(this.#startedAt ? { startedAt: this.#startedAt } : {}),
      ...(this.#lastCycleStartedAt
        ? { lastCycleStartedAt: this.#lastCycleStartedAt }
        : {}),
      ...(this.#lastCycleCompletedAt
        ? { lastCycleCompletedAt: this.#lastCycleCompletedAt }
        : {}),
      ...(this.#nextCycleAt ? { nextCycleAt: this.#nextCycleAt } : {}),
      monitoredAssets: this.#assetIds,
      successfulReads: this.#successfulReads,
      failedReads: this.#failedReads,
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
    };
  }

  assetStatus(assetId: string): AssetMonitorStatus {
    const monitoring = this.#assetIds.includes(assetId);
    const latest = this.#repository.latestMarketObservation(assetId);
    const changeAt = this.#lastEligibilityChangeAt.get(assetId);
    const error = this.#assetErrors.get(assetId);
    return {
      assetId,
      monitoring,
      ...(latest
        ? {
            provider: latest.provider,
            ...(latest.value !== undefined ? { latestValue: latest.value } : {}),
            ...(latest.sourceUpdatedAt
              ? { sourceUpdatedAt: latest.sourceUpdatedAt }
              : {}),
            lastAliveCheckAt: latest.observedAt,
            ...(latest.ageSeconds !== undefined
              ? { ageSeconds: latest.ageSeconds }
              : {}),
            freshness: latest.status,
            ...(latest.eligibilityStatus
              ? { eligibility: latest.eligibilityStatus }
              : {}),
          }
        : {}),
      ...(changeAt ? { lastEligibilityChangeAt: changeAt } : {}),
      ...(error ? { lastError: error } : {}),
    };
  }
}
