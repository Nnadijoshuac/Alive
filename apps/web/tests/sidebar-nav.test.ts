import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readComponentSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../components/${relativePath}`, import.meta.url)),
    "utf-8",
  );
}

describe("ALIVE Sidebar Information Architecture", () => {
  it("defines INTELLIGENCE as the first section with Discover, Verify, Portfolio, Watchlist, Activity", () => {
    const source = readComponentSource("site-shell.tsx");
    expect(source).toContain("const intelligenceNav = [");
    expect(source).toContain('{ href: "/explore", label: "Discover"');
    expect(source).toContain('{ href: "/overview", label: "Verify"');
    expect(source).toContain('{ href: "/dashboard", label: "Portfolio"');
    expect(source).toContain('{ href: "/watchlist", label: "Watchlist"');
    expect(source).toContain('{ href: "/activity", label: "Activity"');
  });

  it("defines POLICY & CONTROL as the second section with Mandate, Proof Lab", () => {
    const source = readComponentSource("site-shell.tsx");
    expect(source).toContain("const policyControlNav = [");
    expect(source).toContain('{ href: "/create", label: "Mandate"');
    expect(source).toContain('{ href: "/attack-lab", label: "Proof Lab"');
  });

  it("defines LABS as the third section with Agent Preview, Strategy Library", () => {
    const source = readComponentSource("site-shell.tsx");
    expect(source).toContain("const labsNav = [");
    expect(source).toContain('{ href: "/agents", label: "Agent Preview"');
    expect(source).toContain('{ href: "/strategies", label: "Strategy Library"');
  });

  it("maintains 'More tools' as a secondary collapsible group", () => {
    const source = readComponentSource("site-shell.tsx");
    expect(source).toContain("<summary>More tools</summary>");
  });
});
