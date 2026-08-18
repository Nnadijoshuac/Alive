/**
 * Resolves real token logos for every real catalog asset that has a known
 * network + contract address, verifies the resolved identity actually
 * matches what was requested, and writes the result back into
 * `data/rwa-catalog/catalog.demo.json` as each asset's `visual` block --
 * the "resolve once, cache the result" step the frontend then just reads.
 *
 * Never invents an image: an asset with no network/tokenAddress, or one
 * no trusted source recognizes, is written as `{ logoStatus: "UNAVAILABLE" }`.
 *
 * Usage:
 *   pnpm --filter @alive/intelligence resolve:logos
 *   pnpm --filter @alive/intelligence resolve:logos -- --dry-run
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveTokenLogo } from "../src/data/logo-resolver.js";

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find repo root (pnpm-workspace.yaml not found).");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(__dirname);
const catalogPath = path.join(repoRoot, "data/rwa-catalog/catalog.demo.json");

type CatalogAsset = {
  id: string;
  symbol: string;
  network?: string;
  tokenAddress?: string;
  sources: Array<{ sourceType: string }>;
  visual?: unknown;
  [key: string]: unknown;
};

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const raw = await readFile(catalogPath, "utf8");
  const catalog = JSON.parse(raw) as { assets: CatalogAsset[] };

  const report: Array<{
    asset: string;
    network: string;
    contractAddress: string;
    logoSource: string;
    resolved: boolean;
    identityMatch: boolean;
  }> = [];

  for (const asset of catalog.assets) {
    const isReal = asset.sources.some((s) => s.sourceType !== "DEMO_FIXTURE");
    if (!isReal) continue; // never resolve/cache a logo for the synthetic demo catalog

    if (!asset.network || !asset.tokenAddress) {
      report.push({
        asset: asset.id,
        network: asset.network ?? "-",
        contractAddress: asset.tokenAddress ?? "-",
        logoSource: "-",
        resolved: false,
        identityMatch: false,
      });
      continue;
    }

    // Already resolved (and pointed at the same contract) from a prior
    // run: this is exactly the "resolve once, cache the result" behavior
    // the directive asks for. Re-resolving unconditionally on every run
    // would spend CoinGecko's free-tier rate limit re-checking assets
    // that never changed, and risks flipping an already-good result to a
    // transient 429-driven "unavailable."
    const cached = asset.visual as
      | { logoStatus: string; logoContractAddress?: string; logoSource?: string }
      | undefined;
    if (
      !process.argv.includes("--force") &&
      cached?.logoStatus === "RESOLVED" &&
      cached.logoContractAddress?.toLowerCase() === asset.tokenAddress.toLowerCase()
    ) {
      report.push({
        asset: asset.id,
        network: asset.network,
        contractAddress: asset.tokenAddress,
        logoSource: `${cached.logoSource ?? "?"} (cached)`,
        resolved: true,
        identityMatch: true,
      });
      continue;
    }

    // CoinGecko's free public API rate-limits aggressively across the
    // whole run, not just per-request; a longer pause between assets
    // (on top of the resolver's own per-request 429 backoff) keeps this
    // batch run from spending its retries before it even gets going.
    await new Promise((resolve) => setTimeout(resolve, 8_000));

    const resolution = await resolveTokenLogo({
      network: asset.network,
      tokenAddress: asset.tokenAddress,
    });

    asset.visual = resolution;
    report.push({
      asset: asset.id,
      network: asset.network,
      contractAddress: asset.tokenAddress,
      logoSource: resolution.logoStatus === "RESOLVED" ? resolution.logoSource : "-",
      resolved: resolution.logoStatus === "RESOLVED",
      // The resolver itself refuses to return RESOLVED on a mismatch, so
      // reaching RESOLVED here already means the identity check passed.
      identityMatch: resolution.logoStatus === "RESOLVED",
    });
  }

  console.log("\nasset            | network  | contract                                   | source     | resolved | identity match");
  console.log("-".repeat(110));
  for (const row of report) {
    console.log(
      `${row.asset.padEnd(17)} | ${row.network.padEnd(8)} | ${row.contractAddress.padEnd(42)} | ${row.logoSource.padEnd(10)} | ${String(row.resolved).padEnd(8)} | ${row.identityMatch}`,
    );
  }
  console.log("");

  if (dryRun) {
    console.log("Dry run -- catalog not written.");
    return;
  }

  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`Wrote resolved logos to ${catalogPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
