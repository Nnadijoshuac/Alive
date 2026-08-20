import { randomUUID } from "node:crypto";

import { MarketDataError, type MarketDataProvider } from "@alive/market-data";
import {
  evaluateEligibility,
  selectEligibilityPolicy,
} from "@alive/eligibility-engine";
import {
  MarketSnapshotSchema,
  hashMarketSnapshot,
  type EligibilityPolicy,
  type EligibilityVerdict,
  type MarketQuote,
} from "@alive/shared";

import type {
  IntelligenceRepository,
  MarketObservationRecord,
} from "../repository.js";

/** Why the monitor decided to publish, or not. */
export type PublishReason =
  | "NO_CHANGE"
  | "STATUS_CHANGED"
  | "NO_ONCHAIN_VERDICT"
  | "VERDICT_EXPIRING"
  | "DATA_UNAVAILABLE";

export type MonitorDecision = {
  assetId: string;
  observation: MarketObservationRecord;
  /** Absent when the market read failed -- no data, no verdict. */
  verdict?: EligibilityVerdict;
  previousStatus?: string;
  shouldPublish: boolean;
  reason: PublishReason;
};

/** The current onchain verdict, as far as the monitor knows. */
export type OnchainVerdictState = {
  status: string;
  validUntil: string;
};

export type MarketMonitorOptions = {
  repository: IntelligenceRepository;
  marketData: MarketDataProvider;
  policy: EligibilityPolicy;
  /**
   * Republish this long before a verdict expires, so an asset never lapses
   * into having no valid onchain verdict just because nothing changed.
   */
  republishBeforeExpirySeconds?: number;
  now?: () => Date;
};

/**
 * Watches market data for the assets it is given and decides when the
 * onchain verdict needs to change.
 *
 * Deliberately does not broadcast anything itself. It returns a decision;
 * the caller owns the key and the transaction. That keeps the polling loop
 * testable without a chain, and keeps signing authority in one place.
 *
 * The publish rule (this is the part that matters for not spamming the
 * chain): a verdict is published only when the eligibility status actually
 * changes, when nothing is published yet, or when the existing verdict is
 * about to expire. A steady ELIGIBLE asset produces no transactions at all,
 * however often it is polled.
 */
export class MarketMonitor {
  readonly #repository: IntelligenceRepository;
  readonly #marketData: MarketDataProvider;
  readonly #policy: EligibilityPolicy;
  readonly #republishBefore: number;
  readonly #now: () => Date;

  constructor(options: MarketMonitorOptions) {
    this.#repository = options.repository;
    this.#marketData = options.marketData;
    this.#policy = options.policy;
    this.#republishBefore = options.republishBeforeExpirySeconds ?? 180;
    this.#now = options.now ?? (() => new Date());
  }

  /**
   * Reads one asset, records the observation, re-runs eligibility, and
   * decides whether the onchain verdict must change.
   */
  async check(
    assetId: string,
    onchain?: OnchainVerdictState,
  ): Promise<MonitorDecision> {
    const observedAt = this.#now();
    const passport = this.#repository.getAsset(assetId);
    const previous = this.#repository.latestMarketObservation(assetId);

    let quote: MarketQuote | undefined;
    let readError: string | undefined;
    try {
      quote = await this.#marketData.getQuote(assetId);
    } catch (error) {
      if (!(error instanceof MarketDataError)) throw error;
      readError = error.message;
    }

    // A failed read is recorded as its own observation. The previous value is
    // never carried forward as if it were current -- that is exactly how a
    // stale number gets treated as fresh.
    if (!quote || !passport) {
      const observation: MarketObservationRecord = {
        id: randomUUID(),
        assetId,
        provider: this.#marketData.name,
        dataMode: "UNKNOWN",
        observedAt: observedAt.toISOString(),
        status: "DATA_UNAVAILABLE",
        ...(readError ? { reasonCodes: ["DATA_UNAVAILABLE"] } : {}),
      };
      this.#repository.saveMarketObservation(observation);
      return {
        assetId,
        observation,
        shouldPublish: false,
        reason: "DATA_UNAVAILABLE",
        ...(previous?.eligibilityStatus
          ? { previousStatus: previous.eligibilityStatus }
          : {}),
      };
    }

    const snapshot = MarketSnapshotSchema.parse({
      version: 1,
      dataMode: quote.dataMode,
      capturedAt: new Date(
        Math.max(observedAt.getTime(), Date.parse(quote.timestamp)),
      ).toISOString(),
      quotes: [quote],
    });
    const marketSnapshotHash = hashMarketSnapshot(snapshot);
    this.#repository.saveMarketSnapshot(marketSnapshotHash, snapshot);
    this.#repository.saveQuotes([quote], observedAt.toISOString());

    const policy = selectEligibilityPolicy(passport) ?? this.#policy;
    const verdict = evaluateEligibility({
      passport,
      policy,
      quote,
      marketSnapshotHash,
      now: observedAt,
    });

    const ageSeconds = Math.max(
      0,
      Math.floor((observedAt.getTime() - Date.parse(quote.timestamp)) / 1_000),
    );
    const observation: MarketObservationRecord = {
      id: randomUUID(),
      assetId,
      provider: quote.provider,
      dataMode: quote.dataMode,
      value: quote.price,
      observedAt: observedAt.toISOString(),
      ageSeconds,
      status: quote.status === "OPEN" ? "OK" : "STALE",
      eligibilityStatus: verdict.status,
      reasonCodes: verdict.reasons.map((reason) => reason.code),
      ...(quote.onchainSource
        ? {
            sourceChainId: quote.onchainSource.chainId,
            sourceAddress: quote.onchainSource.feedAddress,
            sourceUpdatedAt: quote.onchainSource.sourceUpdatedAt,
            blockNumber: quote.onchainSource.blockNumber,
          }
        : {}),
    };
    this.#repository.saveMarketObservation(observation);

    const decision = this.#decide(verdict, onchain, observedAt);
    return {
      assetId,
      observation,
      verdict,
      ...(previous?.eligibilityStatus
        ? { previousStatus: previous.eligibilityStatus }
        : {}),
      ...decision,
    };
  }

  #decide(
    verdict: EligibilityVerdict,
    onchain: OnchainVerdictState | undefined,
    now: Date,
  ): { shouldPublish: boolean; reason: PublishReason } {
    if (!onchain) {
      return { shouldPublish: true, reason: "NO_ONCHAIN_VERDICT" };
    }
    if (onchain.status !== verdict.status) {
      return { shouldPublish: true, reason: "STATUS_CHANGED" };
    }
    const remainingSeconds =
      (Date.parse(onchain.validUntil) - now.getTime()) / 1_000;
    if (remainingSeconds <= this.#republishBefore) {
      return { shouldPublish: true, reason: "VERDICT_EXPIRING" };
    }
    // Same status, verdict still comfortably valid: publishing again would
    // cost gas and change nothing.
    return { shouldPublish: false, reason: "NO_CHANGE" };
  }
}

export type MonitorLoopOptions = {
  assetIds: string[];
  intervalSeconds: number;
  monitor: MarketMonitor;
  onDecision: (decision: MonitorDecision) => void | Promise<void>;
  signal?: AbortSignal;
};

/**
 * Polls each asset on a fixed interval until aborted.
 *
 * The interval is configurable rather than fixed because the right cadence
 * depends on the source: a NAV feed with a 26.5h heartbeat changes on a daily
 * business cycle, so polling it every few minutes already catches every
 * change that can occur. Polling per second would add load and find nothing.
 */
export async function runMonitorLoop(
  options: MonitorLoopOptions,
): Promise<void> {
  const { assetIds, intervalSeconds, monitor, onDecision, signal } = options;
  if (intervalSeconds <= 0) {
    throw new RangeError("intervalSeconds must be positive");
  }
  while (!signal?.aborted) {
    for (const assetId of assetIds) {
      if (signal?.aborted) return;
      try {
        await onDecision(await monitor.check(assetId));
      } catch (error) {
        // One asset failing must not stop the loop for the others.
        process.stderr.write(
          `market monitor: ${assetId} failed: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1_000));
  }
}
