import { z } from "zod";

import { MarketQuoteSchema, type MarketQuote } from "@alive/shared";

import {
  MarketDataError,
  type DataProviderHealth,
  type MarketDataProvider,
} from "./provider.js";

const DEFAULT_REST_ENDPOINT = "https://api.dataengine.chain.link";
const DEFAULT_WS_ENDPOINT = "wss://ws.dataengine.chain.link";
const IntegerLikeSchema = z.union([
  z.bigint(),
  z.number().int(),
  z.string().regex(/^-?\d+$/),
]);
const DecimalsSchema = z.number().int().min(0).max(18);

const DecodedReportSchema = z
  .object({
    version: z.enum([
      "V2",
      "V3",
      "V4",
      "V5",
      "V6",
      "V7",
      "V8",
      "V9",
      "V10",
      "V11",
      "V12",
      "V13",
    ]),
    observationsTimestamp: IntegerLikeSchema,
    price: IntegerLikeSchema.optional(),
    bid: IntegerLikeSchema.optional(),
    ask: IntegerLikeSchema.optional(),
    mid: IntegerLikeSchema.optional(),
    midPrice: IntegerLikeSchema.optional(),
    tokenizedPrice: IntegerLikeSchema.optional(),
    bestBid: IntegerLikeSchema.optional(),
    bestAsk: IntegerLikeSchema.optional(),
    lastTradedPrice: IntegerLikeSchema.optional(),
    navPerShare: IntegerLikeSchema.optional(),
    lastUpdateTimestamp: IntegerLikeSchema.optional(),
    lastSeenTimestampNs: IntegerLikeSchema.optional(),
    navDate: IntegerLikeSchema.optional(),
    marketStatus: z.union([z.string(), z.number().int()]).optional(),
    ripcord: z.union([z.string(), z.number().int()]).optional(),
  })
  .passthrough();

type DecodedReport = z.infer<typeof DecodedReportSchema>;

export type ChainlinkDecodedClient = {
  getLatestDecodedReport(feedId: string): Promise<unknown>;
};

export type ChainlinkDataStreamsConfig = {
  enabled: boolean;
  username?: string;
  password?: string;
  endpoint?: string;
  wsEndpoint?: string;
  feedIds: Record<string, string>;
  decimals?: Record<string, number>;
};

export type ChainlinkClientFactory = (config: {
  apiKey: string;
  userSecret: string;
  endpoint: string;
  wsEndpoint: string;
}) => ChainlinkDecodedClient;

function integer(value: bigint | number | string): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function fixedDecimal(value: bigint, decimals: number): string {
  if (value < 0n) {
    throw new MarketDataError(
      "REPORT_INVALID",
      "Chainlink returned a negative asset price.",
    );
  }
  if (decimals === 0) return value.toString();
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
}

function normalizeStatus(
  value: string | number | undefined,
): MarketQuote["status"] {
  if (value === undefined) return "UNKNOWN";
  const normalized = String(value).toUpperCase();
  if (["2", "OPEN", "ACTIVE", "TRADING"].includes(normalized)) return "OPEN";
  if (["1", "CLOSED", "INACTIVE", "OFFLINE"].includes(normalized))
    return "CLOSED";
  if (["HALTED", "PAUSED"].includes(normalized)) return "HALTED";
  return "UNKNOWN";
}

function unixSeconds(value: bigint | number | string, field: string): number {
  const parsed = integer(value);
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MarketDataError(
      "REPORT_INVALID",
      `Chainlink ${field} is outside the supported range.`,
    );
  }
  return Number(parsed);
}

function reportTimestamp(report: DecodedReport): number {
  if (report.version === "V11" && report.lastSeenTimestampNs !== undefined) {
    return unixSeconds(
      integer(report.lastSeenTimestampNs) / 1_000_000_000n,
      "lastSeenTimestampNs",
    );
  }
  if (
    (report.version === "V8" || report.version === "V10") &&
    report.lastUpdateTimestamp !== undefined
  ) {
    return unixSeconds(report.lastUpdateTimestamp, "lastUpdateTimestamp");
  }
  if (
    (report.version === "V9" || report.version === "V12") &&
    report.navDate !== undefined
  ) {
    return unixSeconds(report.navDate, "navDate");
  }
  return unixSeconds(report.observationsTimestamp, "observationsTimestamp");
}

type QuoteValues = {
  price: bigint;
  bid?: bigint;
  ask?: bigint;
  mid?: bigint;
  status: MarketQuote["status"];
};

function quoteValues(report: DecodedReport): QuoteValues {
  switch (report.version) {
    case "V2":
      if (report.price !== undefined)
        return { price: integer(report.price), status: "UNKNOWN" };
      break;
    case "V3":
      if (
        report.price !== undefined &&
        report.bid !== undefined &&
        report.ask !== undefined
      ) {
        return {
          price: integer(report.price),
          bid: integer(report.bid),
          ask: integer(report.ask),
          mid: integer(report.price),
          status: "UNKNOWN",
        };
      }
      break;
    case "V4":
      if (report.price !== undefined) {
        return {
          price: integer(report.price),
          mid: integer(report.price),
          status: normalizeStatus(report.marketStatus),
        };
      }
      break;
    case "V8":
      if (report.midPrice !== undefined) {
        return {
          price: integer(report.midPrice),
          mid: integer(report.midPrice),
          status: normalizeStatus(report.marketStatus),
        };
      }
      break;
    case "V9":
    case "V12":
      if (report.navPerShare !== undefined) {
        const status =
          String(report.ripcord ?? "0") === "1" ? "HALTED" : "UNKNOWN";
        return {
          price: integer(report.navPerShare),
          mid: integer(report.navPerShare),
          status,
        };
      }
      break;
    case "V10":
      if (report.tokenizedPrice !== undefined) {
        return {
          price: integer(report.tokenizedPrice),
          mid: integer(report.tokenizedPrice),
          status: normalizeStatus(report.marketStatus),
        };
      }
      break;
    case "V11":
      if (
        report.mid !== undefined &&
        report.bid !== undefined &&
        report.ask !== undefined
      ) {
        return {
          price: integer(report.mid),
          bid: integer(report.bid),
          ask: integer(report.ask),
          mid: integer(report.mid),
          status: normalizeStatus(report.marketStatus),
        };
      }
      break;
    case "V13":
      if (
        report.lastTradedPrice !== undefined &&
        report.bestBid !== undefined &&
        report.bestAsk !== undefined
      ) {
        return {
          price: integer(report.lastTradedPrice),
          bid: integer(report.bestBid),
          ask: integer(report.bestAsk),
          status: "UNKNOWN",
        };
      }
      break;
    case "V5":
    case "V6":
    case "V7":
      throw new MarketDataError(
        "REPORT_UNSUPPORTED",
        `Chainlink ${report.version} is not an asset-price report supported by this adapter.`,
      );
  }
  throw new MarketDataError(
    "REPORT_INVALID",
    `Chainlink ${report.version} is missing required price fields.`,
  );
}

export function normalizeChainlinkQuote(
  assetId: string,
  decoded: unknown,
  decimals = 18,
): MarketQuote {
  const parsed = DecodedReportSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new MarketDataError(
      "REPORT_UNSUPPORTED",
      `Chainlink report for ${assetId} uses an unsupported decoded schema.`,
      { cause: parsed.error },
    );
  }
  const values = quoteValues(parsed.data);
  const timestamp = new Date(reportTimestamp(parsed.data) * 1_000);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new MarketDataError(
      "REPORT_INVALID",
      `Chainlink report for ${assetId} has an invalid timestamp.`,
    );
  }

  return MarketQuoteSchema.parse({
    assetId,
    price: fixedDecimal(values.price, decimals),
    ...(values.bid === undefined
      ? {}
      : { bid: fixedDecimal(values.bid, decimals) }),
    ...(values.ask === undefined
      ? {}
      : { ask: fixedDecimal(values.ask, decimals) }),
    ...(values.mid === undefined
      ? {}
      : { mid: fixedDecimal(values.mid, decimals) }),
    timestamp: timestamp.toISOString(),
    provider: `CHAINLINK_DATA_STREAMS_${parsed.data.version}`,
    dataMode: "LIVE",
    status: values.status,
  });
}

export class ChainlinkDataStreamsProvider implements MarketDataProvider {
  readonly name = "CHAINLINK_DATA_STREAMS";
  readonly #client: ChainlinkDecodedClient;

  constructor(
    private readonly config: ChainlinkDataStreamsConfig,
    clientFactory: ChainlinkClientFactory,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!config.enabled) {
      throw new MarketDataError(
        "PROVIDER_DISABLED",
        "Chainlink Data Streams is disabled.",
      );
    }
    if (!config.username || !config.password) {
      throw new MarketDataError(
        "PROVIDER_MISCONFIGURED",
        "Chainlink Data Streams credentials are required server-side.",
      );
    }
    this.#client = clientFactory({
      apiKey: config.username,
      userSecret: config.password,
      endpoint: config.endpoint ?? DEFAULT_REST_ENDPOINT,
      wsEndpoint: config.wsEndpoint ?? DEFAULT_WS_ENDPOINT,
    });
  }

  async getQuote(assetId: string): Promise<MarketQuote> {
    const feedId = this.config.feedIds[assetId];
    if (!feedId) {
      throw new MarketDataError(
        "ASSET_NOT_SUPPORTED",
        `${assetId} has no configured Chainlink Data Streams feed.`,
      );
    }

    let decoded: unknown;
    try {
      decoded = await this.#client.getLatestDecodedReport(feedId);
    } catch (error) {
      if (error instanceof MarketDataError) throw error;
      throw new MarketDataError(
        "PROVIDER_UNAVAILABLE",
        `Chainlink Data Streams could not return ${assetId}.`,
        { cause: error },
      );
    }
    const decimals = DecimalsSchema.parse(
      this.config.decimals?.[assetId] ?? 18,
    );
    return normalizeChainlinkQuote(assetId, decoded, decimals);
  }

  async getQuotes(assetIds: string[]): Promise<MarketQuote[]> {
    return Promise.all(
      [...new Set(assetIds)].sort().map((assetId) => this.getQuote(assetId)),
    );
  }

  async health(): Promise<DataProviderHealth> {
    const configuredFeeds = Object.keys(this.config.feedIds).length;
    return {
      provider: this.name,
      status: configuredFeeds > 0 ? "HEALTHY" : "DEGRADED",
      dataMode: "LIVE",
      checkedAt: this.now().toISOString(),
      message:
        configuredFeeds > 0
          ? `${configuredFeeds} server-side feed mappings are configured.`
          : "Credentials are configured, but no asset-to-feed mappings exist.",
    };
  }
}

export async function createOfficialChainlinkClientFactory(): Promise<ChainlinkClientFactory> {
  const sdk = await import("@chainlink/data-streams-sdk");
  return (config) => {
    const client = sdk.createClient(config);
    return {
      async getLatestDecodedReport(feedId: string) {
        const report = await client.getLatestReport(feedId);
        return {
          ...sdk.decodeReport(report.fullReport, report.feedID),
          feedID: report.feedID,
          validFromTimestamp: report.validFromTimestamp,
          observationsTimestamp: report.observationsTimestamp,
        };
      },
    };
  };
}

export function chainlinkConfigFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  feedIds: Record<string, string> = {},
): ChainlinkDataStreamsConfig {
  return {
    enabled: environment.CHAINLINK_DATA_STREAMS_ENABLED === "true",
    ...(environment.CHAINLINK_DATA_STREAMS_USERNAME
      ? { username: environment.CHAINLINK_DATA_STREAMS_USERNAME }
      : {}),
    ...(environment.CHAINLINK_DATA_STREAMS_PASSWORD
      ? { password: environment.CHAINLINK_DATA_STREAMS_PASSWORD }
      : {}),
    ...(environment.CHAINLINK_DATA_STREAMS_ENDPOINT
      ? { endpoint: environment.CHAINLINK_DATA_STREAMS_ENDPOINT }
      : {}),
    ...(environment.CHAINLINK_DATA_STREAMS_WS_ENDPOINT
      ? { wsEndpoint: environment.CHAINLINK_DATA_STREAMS_WS_ENDPOINT }
      : {}),
    feedIds,
  };
}
