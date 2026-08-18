import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALIVE_ICON_SIZE_PX } from "@/components/ui/alive-icon";

describe("AliveIcon size tokens", () => {
  it("defines all four intentional size tiers", () => {
    expect(Object.keys(ALIVE_ICON_SIZE_PX).sort()).toEqual(["huge", "lg", "md", "sm"]);
  });

  it("sizes increase monotonically from sm to huge", () => {
    expect(ALIVE_ICON_SIZE_PX.sm).toBeLessThan(ALIVE_ICON_SIZE_PX.md);
    expect(ALIVE_ICON_SIZE_PX.md).toBeLessThan(ALIVE_ICON_SIZE_PX.lg);
    expect(ALIVE_ICON_SIZE_PX.lg).toBeLessThan(ALIVE_ICON_SIZE_PX.huge);
  });

  it("HUGE maps to an explicit large dimension (>=40px), not a CSS transform on a small icon", () => {
    expect(ALIVE_ICON_SIZE_PX.huge).toBeGreaterThanOrEqual(40);
    expect(ALIVE_ICON_SIZE_PX.huge).toBeLessThanOrEqual(56);
  });

  it("HUGE is visibly distinct from the normal control (MD) size -- at least double", () => {
    expect(ALIVE_ICON_SIZE_PX.huge).toBeGreaterThanOrEqual(ALIVE_ICON_SIZE_PX.md * 2);
  });

  it("SM matches the documented dense/metadata scale (16px)", () => {
    expect(ALIVE_ICON_SIZE_PX.sm).toBe(16);
  });
});

function readComponentSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../components/${relativePath}`, import.meta.url)),
    "utf-8",
  );
}

describe("Explore product-name 2-line clamp", () => {
  it("asset-identity.module.css clamps the product name to exactly 2 lines using -webkit-line-clamp", () => {
    const css = readComponentSource("intelligence/asset-identity.module.css");
    const nameBlock = css.slice(css.indexOf(".name {"));
    expect(nameBlock).toMatch(/-webkit-line-clamp:\s*2;/);
    expect(nameBlock).toMatch(/-webkit-box-orient:\s*vertical;/);
    expect(nameBlock).toMatch(/display:\s*-webkit-box;/);
  });

  it("does not manually slice or truncate the asset name string in JavaScript -- the full value is passed through to the DOM", () => {
    const identitySource = readComponentSource("intelligence/asset-identity.tsx");
    expect(identitySource).toContain("{asset.name}");
    expect(identitySource).not.toMatch(/asset\.name\.(slice|substring|substr)/);
  });

  it("the issuer table cell clamps to a single line via CSS ellipsis, not string slicing", () => {
    const tableSource = readComponentSource("intelligence/asset-table.tsx");
    expect(tableSource).toContain("{summary.asset.issuerName}");
    expect(tableSource).not.toMatch(/issuerName\.(slice|substring|substr)/);

    const tableCss = readComponentSource("intelligence/asset-table.module.css");
    const issuerBlock = tableCss.slice(tableCss.indexOf(".issuer {"));
    expect(issuerBlock).toMatch(/text-overflow:\s*ellipsis;/);
    expect(issuerBlock).toMatch(/white-space:\s*nowrap;/);
  });

  it("clicking an Explore/table result still navigates by canonical asset id, unaffected by clamping", () => {
    const tableSource = readComponentSource("intelligence/asset-table.tsx");
    expect(tableSource).toContain("router.push(`/assets/${summary.asset.id}`)");
  });
});
