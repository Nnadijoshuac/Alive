import { readFile } from "node:fs/promises";

import { RwaCatalogSchema, type RwaCatalog } from "@alive/shared";

export async function loadRwaCatalog(catalogPath: string): Promise<RwaCatalog> {
  const source = await readFile(catalogPath, "utf8");
  return RwaCatalogSchema.parse(JSON.parse(source) as unknown);
}
