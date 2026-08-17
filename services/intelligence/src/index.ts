import { pathToFileURL } from "node:url";
import { z } from "zod";

import {
  ChainlinkDataFeedProvider,
  ChainlinkDataStreamsProvider,
  CompositeMarketDataProvider,
  ControllableDemoMarketDataProvider,
  DemoMarketDataProvider,
  chainlinkConfigFromEnvironment,
  createOfficialChainlinkClientFactory,
  CHAINLINK_FEEDS,
  type MarketDataProvider,
} from "@alive/market-data";
import { createDemoEligibilityPolicy } from "@alive/eligibility-engine";

import { buildIntelligenceApp } from "./app.js";
import { EligibilitySigner } from "./attestations/eligibility-signer.js";
import { loadRwaCatalog } from "./catalog.js";
import { loadIntelligenceConfig } from "./config.js";
import { createLlmProvider } from "./llm.js";
import { MonitorService } from "./monitoring/service.js";
import { IntelligenceRepository } from "./repository.js";

export {
  buildIntelligenceApp,
  type IntelligenceAppDependencies,
} from "./app.js";
export {
  EligibilitySigner,
  EligibilitySignerError,
} from "./attestations/eligibility-signer.js";
export {
  MarketMonitor,
  runMonitorLoop,
  type MarketMonitorOptions,
  type MonitorDecision,
  type MonitorLoopOptions,
  type OnchainVerdictState,
  type PublishReason,
} from "./monitoring/market-monitor.js";
export {
  MonitorService,
  type AssetMonitorStatus,
  type MonitorHealthState,
  type MonitorServiceOptions,
  type MonitorStatus,
} from "./monitoring/service.js";
export { loadRwaCatalog } from "./catalog.js";
export {
  compileMandate,
  explainPolicy,
  type CompiledPolicy,
} from "./compiler.js";
export { loadIntelligenceConfig, type IntelligenceConfig } from "./config.js";
export {
  createLlmProvider,
  LlmProviderError,
  type LlmHealth,
  type LlmJsonProvider,
} from "./llm.js";
export {
  IntelligenceRepository,
  type PolicyRecord,
  type ProposalRecord,
  type MarketObservationRecord,
  type PublishedVerdictRecord,
} from "./repository.js";

const FeedMapSchema = z.record(
  z.string().trim().min(1),
  z.string().trim().min(1),
);

function recordEnvironmentJson(
  value: string | undefined,
  name: string,
): Record<string, string> {
  if (!value?.trim()) return {};
  try {
    return FeedMapSchema.parse(JSON.parse(value) as unknown);
  } catch (error) {
    throw new Error(
      `${name} must be a JSON object of non-empty string values`,
      { cause: error },
    );
  }
}

async function marketDataFromEnvironment(): Promise<MarketDataProvider> {
  const selected =
    process.env.MARKET_DATA_PROVIDER?.trim().toLowerCase() ?? "demo";
  if (selected === "demo") {
    // In DEMO_MODE the provider must be the controllable variant so the
    // Attack Lab can degrade a single asset's freshness on purpose. Outside
    // demo mode the plain provider is used and no override path exists.
    return process.env.DEMO_MODE?.trim().toLowerCase() === "true"
      ? new ControllableDemoMarketDataProvider()
      : new DemoMarketDataProvider();
  }
  if (selected === "chainlink") {
    // Free path: a plain `view` call against a deployed Chainlink Data Feed,
    // no API key or subscription. Chainlink-backed assets (ttbill-b et al.,
    // see packages/market-data/src/chainlink-feeds.ts) read live; every
    // other asset still falls through to the labelled demo provider, which
    // is also how the Attack Lab's degradation controls stay scoped to
    // demo-backed assets only -- CompositeMarketDataProvider.degrade() throws
    // if asked to touch a live asset.
    return new CompositeMarketDataProvider(
      new ChainlinkDataFeedProvider(),
      new ControllableDemoMarketDataProvider(),
    );
  }
  if (selected !== "chainlink-streams") {
    throw new Error(
      "MARKET_DATA_PROVIDER must be demo, chainlink, or chainlink-streams",
    );
  }
  // Legacy paid path: Chainlink Data Streams, which needs API key + HMAC
  // credentials and a subscription. Kept only for callers that already
  // configured it; the free `chainlink` path above is the live default.
  const feedIds = recordEnvironmentJson(
    process.env.CHAINLINK_DATA_STREAMS_FEED_IDS_JSON,
    "CHAINLINK_DATA_STREAMS_FEED_IDS_JSON",
  );
  const decimals = recordEnvironmentJson(
    process.env.CHAINLINK_DATA_STREAMS_DECIMALS_JSON,
    "CHAINLINK_DATA_STREAMS_DECIMALS_JSON",
  );
  const parsedDecimals = Object.fromEntries(
    Object.entries(decimals).map(([assetId, value]) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 18) {
        throw new Error(`Invalid Chainlink decimals for ${assetId}`);
      }
      return [assetId, parsed];
    }),
  );
  const factory = await createOfficialChainlinkClientFactory();
  return new ChainlinkDataStreamsProvider(
    {
      ...chainlinkConfigFromEnvironment(process.env, feedIds),
      decimals: parsedDecimals,
    },
    factory,
  );
}

/** Assets the monitor watches by default: every Chainlink-backed asset. */
function defaultMonitoredAssetIds(): string[] {
  return Object.values(CHAINLINK_FEEDS)
    .map((feed) => feed.assetId)
    .filter((assetId) => !assetId.startsWith("__unassigned:"));
}

function monitoredAssetIdsFromEnvironment(): string[] {
  const raw = process.env.MARKET_MONITOR_ASSET_IDS?.trim();
  if (!raw) return defaultMonitoredAssetIds();
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function start(): Promise<void> {
  const config = loadIntelligenceConfig();
  const catalog = await loadRwaCatalog(config.catalogPath);
  const repository = new IntelligenceRepository(config.databasePath);
  repository.replaceCatalog(catalog.assets);
  const marketData = await marketDataFromEnvironment();
  const eligibilitySigner = new EligibilitySigner(config.eligibilitySigner);

  let monitorService: MonitorService | undefined;
  if (config.marketMonitorEnabled) {
    monitorService = new MonitorService({
      repository,
      marketData,
      policy: createDemoEligibilityPolicy(),
      assetIds: monitoredAssetIdsFromEnvironment(),
      intervalSeconds: config.marketMonitorIntervalSeconds,
      signer: eligibilitySigner,
    });
  }

  const app = await buildIntelligenceApp(config, {
    repository,
    catalog,
    llm: createLlmProvider(config.llm),
    marketData,
    eligibilitySigner,
    ...(monitorService ? { monitorService } : {}),
  });

  // Start the monitor loop only after the app (and its onClose hook that
  // closes the database) exists, and stop it before that hook runs, so the
  // loop never touches a closed database.
  monitorService?.start();
  app.addHook("onClose", async () => {
    await monitorService?.stop();
  });

  await app.listen({ host: config.host, port: config.port });
  process.stdout.write(
    `ALIVE intelligence listening on http://${config.host}:${config.port}\n`,
  );
  if (monitorService) {
    process.stdout.write(
      `Market monitor running: interval=${config.marketMonitorIntervalSeconds}s assets=${monitoredAssetIdsFromEnvironment().join(",")}\n`,
    );
  }

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`${signal} received, shutting down cleanly...\n`);
    app
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        process.stderr.write(
          `Error during shutdown: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exit(1);
      });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(entrypoint).href
) {
  start().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
