import { describe, expect, it } from "vitest";
import {
  DIRECT_REDEMPTION_TOOLTIP,
  formatDirectRedemptionLabel,
  formatDirectRedemptionValue,
} from "@/lib/rwa-format";
import type { RwaAsset } from "@alive/shared";

describe("Direct Underlying Redemption Terminology", () => {
  it("renders 'Redeemable for underlying shares' for EQUITY / tokenized stock assets", () => {
    expect(formatDirectRedemptionLabel("EQUITY")).toBe(
      "Redeemable for underlying shares",
    );
  });

  it("renders 'Direct redemption into underlying' for non-equity asset classes", () => {
    expect(formatDirectRedemptionLabel("TREASURY")).toBe(
      "Direct redemption into underlying",
    );
    expect(formatDirectRedemptionLabel("FUND")).toBe(
      "Direct redemption into underlying",
    );
    expect(formatDirectRedemptionLabel("CREDIT")).toBe(
      "Direct redemption into underlying",
    );
    expect(formatDirectRedemptionLabel("ETF")).toBe(
      "Direct redemption into underlying",
    );
    expect(formatDirectRedemptionLabel("COMMODITY")).toBe(
      "Direct redemption into underlying",
    );
    expect(formatDirectRedemptionLabel("GOLD")).toBe(
      "Direct redemption into underlying",
    );
    expect(formatDirectRedemptionLabel("CASH")).toBe(
      "Direct redemption into underlying",
    );
    expect(formatDirectRedemptionLabel(undefined)).toBe(
      "Direct redemption into underlying",
    );
  });

  it("formats boolean values correctly without altering true/false/unknown semantics", () => {
    expect(formatDirectRedemptionValue(false)).toBe("No");
    expect(formatDirectRedemptionValue(true)).toBe("Yes");
    expect(formatDirectRedemptionValue("unknown")).toBe("UNKNOWN");
    expect(formatDirectRedemptionValue(undefined)).toBe("UNKNOWN");
  });

  it("preserves exact clarifying supporting text and tooltip", () => {
    expect(DIRECT_REDEMPTION_TOOLTIP).toBe(
      "The token may still be tradable or redeemable through supported issuer or market mechanisms. This field only indicates whether holders can directly redeem the token for the underlying security.",
    );
  });

  it("does not mutate underlying asset or backing profile data structure", () => {
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

    const label = formatDirectRedemptionLabel(assetMock.assetClass);
    const value = formatDirectRedemptionValue(
      assetMock.backing?.redemptionIntoUnderlying,
    );

    expect(label).toBe("Redeemable for underlying shares");
    expect(value).toBe("No");
    expect(assetMock.backing?.redemptionIntoUnderlying).toBe(false);
  });
});
