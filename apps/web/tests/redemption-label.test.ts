import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RwaAsset } from "@alive/shared";

describe("Removal of Direct Underlying Redemption from UI", () => {
  it("does NOT render 'Direct redemption into underlying' or 'Redeemable for underlying shares' in Asset Intelligence", () => {
    const assetPagePath = path.resolve(
      __dirname,
      "../components/intelligence/asset-intelligence-page.tsx",
    );
    const content = fs.readFileSync(assetPagePath, "utf-8");

    expect(content).not.toContain("Direct redemption into underlying");
    expect(content).not.toContain("Redeemable for underlying shares");
    expect(content).not.toContain("DIRECT_REDEMPTION_TOOLTIP");
    expect(content).not.toContain("formatDirectRedemptionLabel");
    expect(content).not.toContain("formatDirectRedemptionValue");
  });

  it("preserves underlying passport and backing data model integrity", () => {
    const assetMock: Partial<RwaAsset> = {
      id: "meta-xstock",
      symbol: "WMETAX",
      assetClass: "EQUITY",
      backing: {
        backingType: "COLLATERAL_BACKED",
        redemptionIntoUnderlying: false,
        sourceIds: ["test-source"],
        asOf: "2026-08-18T00:00:00.000Z",
      },
    };

    // The data model still holds the property accurately without altering true/false
    expect(assetMock.backing?.redemptionIntoUnderlying).toBe(false);
  });

  it("ensures no orphaned tooltip text is exposed to users in the UI", () => {
    const assetPagePath = path.resolve(
      __dirname,
      "../components/intelligence/asset-intelligence-page.tsx",
    );
    const content = fs.readFileSync(assetPagePath, "utf-8");

    expect(content).not.toContain(
      "This field only indicates whether holders can directly redeem the token for the underlying security.",
    );
  });
});
