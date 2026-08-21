/**
 * Read-only Chainlink Data Feed probe.
 *
 * Proves ALIVE can read a live Chainlink feed with no API key, no
 * subscription, and no payment -- a plain eth_call against a public RPC.
 *
 * Every feed is self-verified: the probe calls description() and decimals()
 * on the contract rather than trusting a hardcoded label, so a wrong address
 * shows up as a mismatch instead of silently reporting the wrong asset.
 *
 * Usage:
 *   pnpm --filter @alive/market-data probe:chainlink
 *   pnpm --filter @alive/market-data probe:chainlink ustb-nav
 */
import { createPublicClient, http } from "viem";

import {
  CHAINLINK_FEEDS,
  aggregatorV3Abi,
  chainlinkNetwork,
  type ChainlinkFeedKey,
} from "../src/chainlink-feeds.js";

function formatAge(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5_400) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3_600).toFixed(1)}h`;
}

/** Renders an integer answer at its feed decimals without floating point. */
function formatFixed(answer: bigint, decimals: number): string {
  const negative = answer < 0n;
  const digits = (negative ? -answer : answer).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals) : "";
  const trimmed = fraction.replace(/0+$/u, "");
  return `${negative ? "-" : ""}${whole}${trimmed ? `.${trimmed}` : ""}`;
}

async function probe(key: ChainlinkFeedKey): Promise<void> {
  const feed = CHAINLINK_FEEDS[key];
  const network = chainlinkNetwork(feed.chainId);
  const client = createPublicClient({
    transport: http(network.rpcUrl, { timeout: 20_000 }),
  });

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

  const [roundId, answer, , updatedAt] = round;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const ageSeconds = nowSeconds - Number(updatedAt);
  const fresh = ageSeconds <= feed.maxAgeSeconds;

  process.stdout.write(`\nCHAINLINK LIVE DATA PROBE\n`);
  process.stdout.write(`Product:        Chainlink Data Feeds (${feed.product})\n`);
  process.stdout.write(`Feed:           ${feed.label}\n`);
  process.stdout.write(`description():  ${description}\n`);
  process.stdout.write(`Network:        ${network.name}\n`);
  process.stdout.write(`Chain ID:       ${feed.chainId}\n`);
  process.stdout.write(`Feed address:   ${feed.address}\n`);
  process.stdout.write(`Value:          ${formatFixed(answer, Number(decimals))}\n`);
  process.stdout.write(`Decimals:       ${decimals}\n`);
  process.stdout.write(
    `Updated at:     ${new Date(Number(updatedAt) * 1_000).toISOString()}\n`,
  );
  process.stdout.write(
    `Age:            ${formatAge(ageSeconds)} (heartbeat ${formatAge(feed.heartbeatSeconds)}, ALIVE max ${formatAge(feed.maxAgeSeconds)})\n`,
  );
  process.stdout.write(`Round:          ${roundId}\n`);
  process.stdout.write(`Block:          ${blockNumber}\n`);
  process.stdout.write(`Source:         CHAINLINK\n`);
  process.stdout.write(`Status:         ${fresh ? "FRESH" : "STALE"}\n`);

  if (description.trim().toLowerCase() !== feed.expectedDescription.toLowerCase()) {
    process.stdout.write(
      `\nWARNING: description() is "${description}" but this feed is configured as "${feed.expectedDescription}".\n`,
    );
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const requested = process.argv[2] as ChainlinkFeedKey | undefined;
  const keys = requested
    ? [requested]
    : (Object.keys(CHAINLINK_FEEDS) as ChainlinkFeedKey[]);
  for (const key of keys) {
    if (!CHAINLINK_FEEDS[key]) {
      throw new Error(
        `Unknown feed "${key}". Known: ${Object.keys(CHAINLINK_FEEDS).join(", ")}`,
      );
    }
    try {
      await probe(key);
    } catch (error) {
      process.stdout.write(
        `\nCHAINLINK LIVE DATA PROBE\nFeed:   ${key}\nStatus: UNAVAILABLE\nReason: ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }\n`,
      );
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
