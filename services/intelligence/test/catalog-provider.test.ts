import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadRwaCatalog } from "../src/catalog.js";
import { SeededCatalogProvider } from "../src/data/catalog-providers/seeded-provider.js";

const catalogPath = fileURLToPath(
  new URL("../../../data/rwa-catalog/catalog.demo.json", import.meta.url),
);

describe("SeededCatalogProvider", () => {
  it("discovers only real assets (never the DEMO_FIXTURE-only synthetic catalog) as candidates", async () => {
    const catalog = await loadRwaCatalog(catalogPath);
    const provider = new SeededCatalogProvider(catalog.assets);
    const candidates = await provider.discover();

    expect(candidates.length).toBeGreaterThanOrEqual(13);
    expect(candidates.some((c) => c.providerCandidateId === "ttbill-a")).toBe(false);
    expect(candidates.some((c) => c.providerCandidateId === "tgold")).toBe(false);

    const ousg = candidates.find((c) => c.providerCandidateId === "ousg");
    expect(ousg?.symbol).toBe("OUSG");
    expect(ousg?.deployments.some((d) => d.chainId === 1 && d.claimedBy === "alive-seeded-catalog")).toBe(
      true,
    );
    expect(ousg?.sources.length).toBeGreaterThan(0);
  });
});
