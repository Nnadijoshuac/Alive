import { describe, expect, it } from "vitest";
import { BackingProfileSchema, RwaAssetSchema } from "../src/index.js";

function validDemoAsset() {
  return {
    id: "ttbill-a",
    symbol: "tTBILL-A",
    name: "Demo Treasury A",
    assetClass: "TREASURY" as const,
    issuer: "demo-issuer-a",
    issuerName: "Demo Issuer A",
    underlying: "Synthetic Treasury reference basket",
    liquidity: { score: 90 },
    risk: {
      score: 22,
      issuerRisk: 20,
      liquidityRisk: 10,
      marketRisk: 18,
      oracleRisk: 25,
      redemptionRisk: 20,
      productComplexityRisk: 15,
      methodology: "ALIVE_DEMO_RISK_V1",
    },
    sources: [
      {
        id: "demo-source-ttbill-a",
        title: "ALIVE synthetic demo fixture",
        sourceType: "DEMO_FIXTURE" as const,
        fixtureId: "rwa-demo-2026-08-14",
        retrievedAt: "2026-08-14T12:00:00.000Z",
        supportedFields: [
          "symbol",
          "name",
          "assetClass",
          "issuer",
          "issuerName",
          "underlying",
          "liquidity.score",
          "risk.score",
          "risk.issuerRisk",
          "risk.liquidityRisk",
          "risk.marketRisk",
          "risk.oracleRisk",
          "risk.redemptionRisk",
          "risk.productComplexityRisk",
          "risk.methodology",
          "lastUpdatedAt",
        ],
        disclaimer: "Synthetic fixture; not live market data.",
      },
    ],
    lastUpdatedAt: "2026-08-14T12:00:00.000Z",
    dataMode: "DEMO" as const,
  };
}

describe("BackingProfileSchema -- evidence requirements", () => {
  it("requires at least one sourceId -- a classification with no evidence is rejected", () => {
    expect(
      BackingProfileSchema.safeParse({
        backingType: "COLLATERAL_BACKED",
        sourceIds: [],
        asOf: "2026-08-18T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires asOf -- a classification with no timestamp is rejected", () => {
    expect(
      BackingProfileSchema.safeParse({
        backingType: "COLLATERAL_BACKED",
        sourceIds: ["some-source"],
      }).success,
    ).toBe(false);
  });

  it("accepts UNKNOWN as a first-class, honest classification when evidence is insufficient", () => {
    expect(
      BackingProfileSchema.safeParse({
        backingType: "UNKNOWN",
        sourceIds: ["some-source"],
        asOf: "2026-08-18T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("SYNTHETIC_EXPOSURE is a valid, non-pejorative classification -- it parses like any other backing type", () => {
    const result = BackingProfileSchema.safeParse({
      backingType: "SYNTHETIC_EXPOSURE",
      sourceIds: ["some-source"],
      asOf: "2026-08-18T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("descriptive fields (custodian, collateralizationRatio, proofOfReserveAvailable) are all optional -- an unknown detail stays absent, never guessed", () => {
    expect(
      BackingProfileSchema.parse({
        backingType: "RESERVE_BACKED",
        sourceIds: ["some-source"],
        asOf: "2026-08-18T00:00:00.000Z",
      }),
    ).toEqual({
      backingType: "RESERVE_BACKED",
      sourceIds: ["some-source"],
      asOf: "2026-08-18T00:00:00.000Z",
    });
  });
});

describe("Backing classification does not imply verification, eligibility, or fraud", () => {
  it("an asset can carry COLLATERAL_BACKED with zero verified deployments and zero sources beyond a demo fixture -- backing and deployment verification are independent axes", () => {
    const asset = {
      ...validDemoAsset(),
      backing: {
        backingType: "COLLATERAL_BACKED" as const,
        sourceIds: ["demo-source-ttbill-a"],
        asOf: "2026-08-14T12:00:00.000Z",
      },
    };
    const parsed = RwaAssetSchema.parse(asset);
    expect(parsed.backing?.backingType).toBe("COLLATERAL_BACKED");
    // No deployments at all -- COLLATERAL_BACKED never implies a verified deployment exists.
    expect(parsed.deployments ?? []).toHaveLength(0);
  });
});
