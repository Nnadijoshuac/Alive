import { afterEach, describe, expect, it, vi } from "vitest";

import type { EligibilityVerdict, RwaAsset } from "@alive/shared";
import {
  eligibilityStatus,
  listAssetSummaries,
  verificationStatus,
  type AssetSummary,
} from "@/lib/asset-intelligence-summary";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function demoAsset(id: string, name: string) {
  return {
    id,
    symbol: id.toUpperCase(),
    name,
    assetClass: "TREASURY",
    issuer: `demo-issuer-${id}`,
    issuerName: `ALIVE Demo Issuer (${id})`,
    underlying: "Synthetic reference",
    liquidity: { score: 90 },
    risk: {
      score: 10,
      issuerRisk: 10,
      liquidityRisk: 10,
      marketRisk: 10,
      oracleRisk: 10,
      redemptionRisk: 10,
      productComplexityRisk: 10,
      methodology: "ALIVE_DEMO_RISK_V1",
    },
    sources: [
      {
        id: `demo-source-${id}`,
        title: "ALIVE synthetic demo fixture",
        sourceType: "DEMO_FIXTURE",
        fixtureId: id,
        retrievedAt: "2026-08-14T12:00:00.000Z",
        supportedFields: ["symbol", "name", "assetClass", "issuer", "issuerName", "underlying", "lastUpdatedAt", "liquidity.score", "risk.score", "risk.issuerRisk", "risk.liquidityRisk", "risk.marketRisk", "risk.methodology", "risk.oracleRisk", "risk.productComplexityRisk", "risk.redemptionRisk"],
        disclaimer: "Synthetic fixture; not live market data.",
      },
    ],
    lastUpdatedAt: "2026-08-14T12:00:00.000Z",
    dataMode: "DEMO",
  };
}

function realAsset() {
  return {
    id: "ttbill-b",
    symbol: "tTBILL-B",
    name: "Invesco Short Duration US Government Securities Fund",
    assetClass: "TREASURY",
    issuer: "invesco-advisers",
    issuerName: "Invesco Advisers, Inc.",
    underlying: "Short-duration U.S. Treasury Bills",
    liquidity: { score: 97 },
    risk: {
      score: 16,
      issuerRisk: 15,
      liquidityRisk: 6,
      marketRisk: 12,
      oracleRisk: 18,
      redemptionRisk: 10,
      productComplexityRisk: 11,
      methodology: "ALIVE_RISK_V1",
    },
    sources: [
      {
        id: "superstate-catalog-seed-issuer-doc",
        title: "Invesco USTB | Superstate",
        sourceType: "ISSUER_DOCUMENTATION",
        sourceUrl: "https://docs.superstate.com/investors/tokenized-funds/available-funds/invesco-ustb",
        retrievedAt: "2026-08-17T00:00:00.000Z",
        supportedFields: ["symbol", "name", "assetClass", "issuer", "issuerName", "underlying", "lastUpdatedAt"],
      },
      {
        id: "alive-methodology-ttbill-b",
        title: "ALIVE risk & liquidity methodology",
        sourceType: "ALIVE_METHODOLOGY",
        methodology: "ALIVE_RISK_V1",
        retrievedAt: "2026-08-17T00:00:00.000Z",
        supportedFields: ["liquidity.score", "risk.issuerRisk", "risk.liquidityRisk", "risk.marketRisk", "risk.methodology", "risk.oracleRisk", "risk.productComplexityRisk", "risk.redemptionRisk", "risk.score"],
        disclaimer: "ALIVE's own computed risk and liquidity methodology output -- not a claim from any third-party document.",
      },
    ],
    lastUpdatedAt: "2026-08-14T12:00:00.000Z",
    dataMode: "LIVE",
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("listAssetSummaries", () => {
  it("excludes the synthetic demo catalog and returns only real, sourced assets", async () => {
    const catalog = [realAsset(), demoAsset("ttbill-a", "Test Treasury Fund A"), demoAsset("tgold", "Test Gold")];
    const policy = {
      version: 1,
      policyId: "alive-demo-eligibility-v1",
      allowedAssetClasses: ["CASH", "TREASURY", "GOLD", "EQUITY", "FUND"],
      requireApprovedIssuer: true,
      approvedIssuers: ["invesco-advisers"],
      requiredSourceTypes: ["DEMO_FIXTURE"],
      maxNavAgeSeconds: 86_400,
      maxPriceAgeSeconds: 108_000,
      requireRedemptionActive: true,
      maxPriceDeviationBps: 500,
      verdictValiditySeconds: 900,
    };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/eligibility")) {
        return Promise.resolve(
          jsonResponse({
            verdict: {
              version: 1,
              assetId: "ttbill-b",
              eligible: true,
              status: "ELIGIBLE",
              reasons: [{ code: "OK", message: "All eligibility checks passed." }],
              evaluatedAt: "2026-08-18T00:00:00.000Z",
              validUntil: "2026-08-18T00:15:00.000Z",
              passportHash: `0x${"aa".repeat(32)}`,
              policyHash: `0x${"bb".repeat(32)}`,
            },
            policy,
            disclaimer: "mixed",
          }),
        );
      }
      if (url.includes("/api/markets")) {
        return Promise.resolve(
          jsonResponse({ dataMode: "SNAPSHOT", capturedAt: "2026-08-18T00:00:00Z", disclaimer: "mixed", quotes: [] }),
        );
      }
      if (url.includes("/api/query")) {
        return Promise.resolve(
          jsonResponse({
            status: "success",
            value: catalog,
          }),
        );
      }
      if (url.endsWith("/api/assets")) {
        return Promise.resolve(
          jsonResponse({
            catalog: {
              id: "alive-rwa-demo-2026-08-14",
              label: "ALIVE RWA catalog",
              dataMode: "SNAPSHOT",
              asOf: "2026-08-14T12:00:00.000Z",
              disclaimer: "mixed",
            },
            assets: catalog,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const summaries = await listAssetSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.asset.id).toBe("ttbill-b");
    expect(summaries[0]!.asset.name).not.toMatch(/Test Treasury Fund/);
    expect(summaries.some((s) => s.asset.id === "ttbill-a")).toBe(false);
    expect(summaries.some((s) => s.asset.id === "tgold")).toBe(false);
  });
});

function unanalyzedRealSummary(): AssetSummary {
  const asset = realAsset() as unknown as RwaAsset;
  const verdict: EligibilityVerdict = {
    version: 1,
    assetId: asset.id,
    eligible: false,
    status: "RESTRICTED",
    reasons: [{ code: "ISSUER_NOT_APPROVED", message: "Issuer is not approved." }],
    evaluatedAt: "2026-08-18T00:00:00.000Z",
    validUntil: "2026-08-18T00:15:00.000Z",
    passportHash: `0x${"aa".repeat(32)}`,
    policyHash: `0x${"bb".repeat(32)}`,
  };
  return { asset, verdict };
}

describe("verificationStatus / eligibilityStatus", () => {
  it("a real, unanalyzed asset reads NOT_ANALYZED / NOT_EVALUATED -- never RESTRICTED, even when the raw verdict is RESTRICTED", () => {
    const summary = unanalyzedRealSummary();
    expect(verificationStatus(summary)).toBe("NOT_ANALYZED");
    // The invariant this test protects: an asset ALIVE has not analyzed
    // must never surface as RESTRICTED in the product, even though the
    // deterministic engine legitimately computed that verdict (e.g. for an
    // unapproved issuer) -- "not analyzed" and "restricted" are different
    // claims and must stay visually and semantically distinct.
    expect(eligibilityStatus(summary)).toBe("NOT_EVALUATED");
  });

  it("a demo-only asset (no real source) reads UNVERIFIED", () => {
    const summary: AssetSummary = {
      asset: demoAsset("ttbill-a", "Test Treasury Fund A") as unknown as RwaAsset,
    };
    expect(verificationStatus(summary)).toBe("UNVERIFIED");
    expect(eligibilityStatus(summary)).toBe("NOT_EVALUATED");
  });
});
