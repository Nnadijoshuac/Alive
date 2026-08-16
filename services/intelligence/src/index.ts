import { pathToFileURL } from "node:url";
import { z } from "zod";

import {
  ChainlinkDataStreamsProvider,
  ControllableDemoMarketDataProvider,
  DemoMarketDataProvider,
  chainlinkConfigFromEnvironment,
  createOfficialChainlinkClientFactory,
  type MarketDataProvider,
} from "@alive/market-data";

import { buildIntelligenceApp } from "./app.js";
import { EligibilitySigner } from "./attestations/eligibility-signer.js";
import { loadRwaCatalog } from "./catalog.js";
import { loadIntelligenceConfig } from "./config.js";
import { createLlmProvider } from "./llm.js";
import { IntelligenceRepository } from "./repository.js";

export {
  buildIntelligenceApp,
  type IntelligenceAppDependencies,
} from "./app.js";
export {
  EligibilitySigner,
  EligibilitySignerError,
} from "./attestations/eligibility-signer.js";
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
  if (selected !== "chainlink") {
    throw new Error("MARKET_DATA_PROVIDER must be demo or chainlink");
  }
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

async function start(): Promise<void> {
  const config = loadIntelligenceConfig();
  const catalog = await loadRwaCatalog(config.catalogPath);
  const repository = new IntelligenceRepository(config.databasePath);
  repository.replaceCatalog(catalog.assets);
  const app = await buildIntelligenceApp(config, {
    repository,
    catalog,
    llm: createLlmProvider(config.llm),
    marketData: await marketDataFromEnvironment(),
    eligibilitySigner: new EligibilitySigner(config.eligibilitySigner),
  });
  await app.listen({ host: config.host, port: config.port });
  process.stdout.write(
    `ALIVE intelligence listening on http://${config.host}:${config.port}\n`,
  );
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
