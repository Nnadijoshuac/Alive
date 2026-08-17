import { readFile } from "node:fs/promises";

import { RwaCatalogSchema, type RwaCatalog } from "@alive/shared";

/**
 * The catalog fixture file freezes `lastUpdatedAt` at whatever moment it was
 * authored (e.g. "2026-08-14T12:00:00.000Z"). Left as-is, real wall-clock
 * time keeps advancing past that frozen date, so every catalog-seeded asset
 * that has never been individually analyzed eventually exceeds the
 * eligibility engine's passport-freshness bound (SOURCE_DATA_TOO_OLD) purely
 * because the demo was run more than a day after the fixture was written --
 * not because of any real staleness. These are synthetic, never-monitored
 * placeholders with no genuine "as of" date, so re-stamping them to catalog
 * *load* time on every boot is honest (it says "this synthetic seed was
 * served just now") rather than claiming stale accuracy the fixture cannot
 * actually back up. An asset that is later individually analyzed gets its
 * own real `lastUpdatedAt` from the extraction merge, which supersedes this.
 */
export async function loadRwaCatalog(
  catalogPath: string,
  now: () => Date = () => new Date(),
): Promise<RwaCatalog> {
  const source = await readFile(catalogPath, "utf8");
  const parsed = RwaCatalogSchema.parse(JSON.parse(source) as unknown);
  const loadedAt = now().toISOString();
  return {
    ...parsed,
    assets: parsed.assets.map((asset) => ({ ...asset, lastUpdatedAt: loadedAt })),
  };
}
