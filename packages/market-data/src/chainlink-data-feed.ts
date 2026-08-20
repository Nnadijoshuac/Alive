import type { MarketQuote, MarketStatus } from "@alive/shared";
import { createPublicClient, http, type PublicClient } from "viem";

import {
  CHAINLINK_FEEDS,
  aggregatorV3Abi,
  chainlinkNetwork,
  feedForAsset,
  type ChainlinkFeedDefinition,
} from "./chainlink-feeds.js";
import {
  MarketDataError,
  type DataProviderHealth,
  type MarketDataProvider,
} from "./provider.js";

/** Round tuple returned by AggregatorV3Interface.latestRoundData(). */
type LatestRound = readonly [bigint, bigint, bigint, bigint, bigint];

export interface ChainlinkReader {
  readFeed(feed: ChainlinkFeedDefinition): Promise<{
    decimals: number;
    description: string;
    round: LatestRound;
    blockNumber: bigint;
  }>;
}

/** Default reader: a plain eth_call against a public RPC. No credentials. */
export class RpcChainlinkReader implements ChainlinkReader {
  readonly #clients = new Map<number, PublicClient>();

  constructor(private readonly timeoutMs = 20_000) {}

  #client(chainId: number): PublicClient {
    const existing = this.#clients.get(chainId);
    if (existing) return existing;
    const network = chainlinkNetwork(chainId);
    const client = createPublicClient({
      transport: http(network.rpcUrl, { timeout: this.timeoutMs }),
    }) as PublicClient;
    this.#clients.set(chainId, client);
    return client;
  }

  async readFeed(feed: ChainlinkFeedDefinition) {
    const client = this.#client(feed.chainId);
    const [decimals, description, round, blockNumber] = await Promise.all([
      client.readContract({
        address: feed.address,
        abi: aggregatorV3Abi,
        functionName: "decimals",
      }),
      client.readContract({
        address: feed.address,
        abi: aggregatorV3Abi,
        functionName: "description",
      }),
      client.readContract({
        address: feed.address,
        abi: aggregatorV3Abi,
        functionName: "latestRoundData",
      }),
      client.getBlockNumber(),
    ]);
    return {
      decimals: Number(decimals),
      description,
      round: round as LatestRound,
      blockNumber,
    };
  }
}

/** Scales an integer answer to a fixed-decimal string. Never uses floats. */
export function scaleAnswer(answer: bigint, decimals: number): string {
  if (answer < 0n) {
    throw new MarketDataError(
      "REPORT_INVALID",
      "Chainlink returned a negative answer for a value ALIVE treats as a price or NAV",
    );
  }
  const digits = answer.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals) : "";
  const trimmed = fraction.replace(/0+$/u, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/**
 * Reads live Chainlink Data Feeds (including NAVLink and Proof-of-Reserve
 * feeds, which share AggregatorV3Interface) and converts them to ALIVE's
 * canonical MarketQuote.
 *
 * Costs nothing and needs no credentials: reading a deployed feed is a
 * `view` call. Chainlink only requires API keys and a paid subscription for
 * Data Streams, which ALIVE deliberately does not use.
 *
 * Two things this provider refuses to do:
 *
 *  - It never reports a value as fresh just because the call succeeded. The
 *    quote's timestamp is the feed's own `updatedAt`, so staleness is always
 *    measured at the source, and each feed carries its own bound derived
 *    from its documented heartbeat.
 *  - It never silently returns the wrong asset. `description()` is checked
 *    against the configured feed, so a mistyped or repointed address fails
 *    loudly instead of quietly pricing one asset off another.
 */
export class ChainlinkDataFeedProvider implements MarketDataProvider {
  readonly name = "CHAINLINK";

  constructor(
    private readonly reader: ChainlinkReader = new RpcChainlinkReader(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getQuote(assetId: string): Promise<MarketQuote> {
    const feed = feedForAsset(assetId);
    if (!feed) {
      throw new MarketDataError(
        "ASSET_NOT_SUPPORTED",
        `${assetId} has no configured Chainlink feed.`,
      );
    }

    let result: Awaited<ReturnType<ChainlinkReader["readFeed"]>>;
    try {
      result = await this.reader.readFeed(feed);
    } catch (error) {
      // A provider failure must never be mistaken for fresh data. Surface it
      // as unavailable and let the caller decide, rather than falling back to
      // a cached or default value.
      throw new MarketDataError(
        "PROVIDER_UNAVAILABLE",
        `Chainlink feed ${feed.label} could not be read: ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`,
        { cause: error },
      );
    }

    const { decimals, description, round, blockNumber } = result;
    const [roundId, answer, , updatedAt, answeredInRound] = round;

    if (description.trim().toLowerCase() !== feed.expectedDescription.toLowerCase()) {
      throw new MarketDataError(
        "REPORT_INVALID",
        `Chainlink feed at ${feed.address} reports "${description}" but ALIVE expects "${feed.expectedDescription}". Refusing to price ${assetId} from an unverified feed.`,
      );
    }
    // Chainlink documents a zero timestamp as an incomplete round that must
    // not be used.
    if (updatedAt === 0n) {
      throw new MarketDataError(
        "REPORT_INVALID",
        `Chainlink feed ${feed.label} returned an incomplete round (updatedAt = 0).`,
      );
    }
    if (answer === 0n) {
      throw new MarketDataError(
        "REPORT_INVALID",
        `Chainlink feed ${feed.label} returned a zero answer.`,
      );
    }

    const observed = this.now();
    const sourceUpdatedAtMs = Number(updatedAt) * 1_000;
    if (sourceUpdatedAtMs > observed.getTime()) {
      throw new MarketDataError(
        "REPORT_INVALID",
        `Chainlink feed ${feed.label} reports an update in the future.`,
      );
    }

    const ageSeconds = Math.floor(
      (observed.getTime() - sourceUpdatedAtMs) / 1_000,
    );
    // Staleness is a property of the source, not of the fetch. Exceeding the
    // feed's own bound is reported as UNKNOWN status so the eligibility engine
    // sees a degraded signal rather than a confident one.
    const status: MarketStatus =
      ageSeconds > feed.maxAgeSeconds ? "UNKNOWN" : "OPEN";

    return {
      assetId,
      price: scaleAnswer(answer, decimals),
      timestamp: new Date(sourceUpdatedAtMs).toISOString(),
      provider: this.name,
      status,
      dataMode: "LIVE",
      onchainSource: {
        network: chainlinkNetwork(feed.chainId).name,
        chainId: feed.chainId,
        feedAddress: feed.address,
        description,
        decimals,
        roundId: roundId.toString(),
        answeredInRound: answeredInRound.toString(),
        sourceUpdatedAt: new Date(sourceUpdatedAtMs).toISOString(),
        observedAt: observed.toISOString(),
        blockNumber: Number(blockNumber),
      },
    };
  }

  async getQuotes(assetIds: string[]): Promise<MarketQuote[]> {
    const unique = [...new Set(assetIds)].sort();
    const settled = await Promise.allSettled(
      unique.map((assetId) => this.getQuote(assetId)),
    );
    // Assets without a Chainlink feed are omitted rather than faked. A caller
    // asking for the whole catalog still gets the ones Chainlink covers.
    return settled
      .filter(
        (entry): entry is PromiseFulfilledResult<MarketQuote> =>
          entry.status === "fulfilled",
      )
      .map((entry) => entry.value);
  }

  async health(): Promise<DataProviderHealth> {
    const checkedAt = this.now().toISOString();
    const [primaryKey] = Object.keys(CHAINLINK_FEEDS) as [string];
    const primary = CHAINLINK_FEEDS[primaryKey as keyof typeof CHAINLINK_FEEDS];
    try {
      const quote = await this.getQuote(primary.assetId);
      const stale = quote.status !== "OPEN";
      return {
        provider: this.name,
        status: stale ? "DEGRADED" : "HEALTHY",
        dataMode: "LIVE",
        checkedAt,
        message: stale
          ? `Live Chainlink data is reachable but ${primary.label} is older than its ${primary.maxAgeSeconds}s bound.`
          : `Live Chainlink data feeds are reachable. Primary reference: ${primary.label}.`,
      };
    } catch (error) {
      return {
        provider: this.name,
        status: "OFFLINE",
        dataMode: "LIVE",
        checkedAt,
        message: `Chainlink data feeds are unreachable: ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`,
      };
    }
  }
}
