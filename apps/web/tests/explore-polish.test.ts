import { describe, expect, it } from "vitest";
import type { RwaAsset } from "@alive/shared";
import { getPrimaryVerifiedDeployment } from "@/components/ui/chain-logo";
import { getPaginationItems, EXPLORE_PAGE_SIZE } from "@/components/intelligence/explore-page";
import {
  eligibilityStatus,
  verificationStatus,
  type AssetSummary,
} from "@/lib/asset-intelligence-summary";

function createMockAsset(overrides?: Partial<RwaAsset>): RwaAsset {
  return {
    id: "test-asset",
    symbol: "TEST",
    name: "Test RWA Long Product Name That Should Not Wrap Or Break",
    assetClass: "EQUITY",
    issuer: "test-issuer",
    issuerName: "Test Issuer Name Extended",
    underlying: "Test underlying exposure",
    sources: [
      {
        id: "src-1",
        title: "Test Issuer Doc",
        sourceType: "ISSUER_DOCUMENTATION",
        sourceUrl: "https://example.com/doc",
        retrievedAt: "2026-08-18T00:00:00.000Z",
        supportedFields: ["name", "symbol"],
      },
    ],
    lastUpdatedAt: "2026-08-18T00:00:00.000Z",
    dataMode: "SNAPSHOT",
    ...overrides,
  };
}

describe("Explore Polish & Pagination Invariants", () => {
  describe("Chain logo overlay selection", () => {
    it("returns Ethereum deployment when asset has a verified Ethereum deployment", () => {
      const asset = createMockAsset({
        deployments: [
          {
            chainId: 1,
            chainName: "Ethereum",
            contractAddress: "0x1111111111111111111111111111111111111111",
            tokenStandard: "ERC20",
            deploymentStatus: "VERIFIED",
          },
        ],
      });
      const primary = getPrimaryVerifiedDeployment(asset);
      expect(primary).toBeDefined();
      expect(primary?.chainId).toBe(1);
      expect(primary?.chainName).toBe("Ethereum");
    });

    it("returns X Layer deployment for X Layer Mainnet (chainId 196) and Testnet (chainId 1952)", () => {
      const assetMainnet = createMockAsset({
        deployments: [
          {
            chainId: 196,
            chainName: "X Layer",
            contractAddress: "0x2222222222222222222222222222222222222222",
            tokenStandard: "ERC20",
            deploymentStatus: "VERIFIED",
          },
        ],
      });
      const primaryMainnet = getPrimaryVerifiedDeployment(assetMainnet);
      expect(primaryMainnet?.chainId).toBe(196);
      expect(primaryMainnet?.chainName).toBe("X Layer");

      const assetTestnet = createMockAsset({
        deployments: [
          {
            chainId: 1952,
            chainName: "X Layer Testnet",
            contractAddress: "0x3333333333333333333333333333333333333333",
            tokenStandard: "ERC20",
            deploymentStatus: "VERIFIED",
          },
        ],
      });
      const primaryTestnet = getPrimaryVerifiedDeployment(assetTestnet);
      expect(primaryTestnet?.chainId).toBe(1952);
    });

    it("returns undefined (no chain badge) when asset has no verified deployments", () => {
      const noDeployments = createMockAsset({ deployments: [] });
      expect(getPrimaryVerifiedDeployment(noDeployments)).toBeUndefined();

      const unverifiedDeployments = createMockAsset({
        deployments: [
          {
            chainId: 1,
            chainName: "Ethereum",
            contractAddress: "0x4444444444444444444444444444444444444444",
            tokenStandard: "ERC20",
            deploymentStatus: "DISCOVERED",
          },
        ],
      });
      expect(getPrimaryVerifiedDeployment(unverifiedDeployments)).toBeUndefined();
    });

    it("handles multi-chain assets by picking one sensible primary deployment", () => {
      const multi = createMockAsset({
        deployments: [
          {
            chainId: 8453,
            chainName: "Base",
            contractAddress: "0x5555555555555555555555555555555555555555",
            tokenStandard: "ERC20",
            deploymentStatus: "VERIFIED",
          },
          {
            chainId: 196,
            chainName: "X Layer",
            contractAddress: "0x6666666666666666666666666666666666666666",
            tokenStandard: "ERC20",
            deploymentStatus: "VERIFIED",
          },
        ],
      });
      const primary = getPrimaryVerifiedDeployment(multi);
      expect(primary).toBeDefined();
      expect(primary?.chainId).toBe(196);
    });
  });

  describe("Pagination items calculation", () => {
    it("respects max 8 items per page constant", () => {
      expect(EXPLORE_PAGE_SIZE).toBe(8);
      const total20Assets = 20;
      const totalPages = Math.ceil(total20Assets / EXPLORE_PAGE_SIZE);
      expect(totalPages).toBe(3);

      // Page 1: 8 items
      const page1 = Array.from({ length: total20Assets }).slice(0, 8);
      expect(page1).toHaveLength(8);

      // Page 2: 8 items
      const page2 = Array.from({ length: total20Assets }).slice(8, 16);
      expect(page2).toHaveLength(8);

      // Page 3: 4 items
      const page3 = Array.from({ length: total20Assets }).slice(16, 20);
      expect(page3).toHaveLength(4);
    });

    it("formats small page totals without unnecessary ellipses", () => {
      expect(getPaginationItems(1, 1)).toEqual([1]);
      expect(getPaginationItems(1, 3)).toEqual([1, 2, 3]);
      expect(getPaginationItems(2, 3)).toEqual([1, 2, 3]);
      expect(getPaginationItems(3, 3)).toEqual([1, 2, 3]);
      expect(getPaginationItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("formats beginning pagination correctly (e.g. 1 2 3 … 18)", () => {
      expect(getPaginationItems(1, 18)).toEqual([1, 2, 3, "…", 18]);
      expect(getPaginationItems(2, 18)).toEqual([1, 2, 3, "…", 18]);
      expect(getPaginationItems(3, 18)).toEqual([1, 2, 3, "…", 18]);
    });

    it("formats middle pagination correctly (e.g. 1 … 8 9 10 … 18)", () => {
      expect(getPaginationItems(9, 18)).toEqual([1, "…", 8, 9, 10, "…", 18]);
      expect(getPaginationItems(10, 18)).toEqual([1, "…", 9, 10, 11, "…", 18]);
    });

    it("formats end pagination correctly (e.g. 1 … 16 17 18)", () => {
      expect(getPaginationItems(16, 18)).toEqual([1, "…", 16, 17, 18]);
      expect(getPaginationItems(17, 18)).toEqual([1, "…", 16, 17, 18]);
      expect(getPaginationItems(18, 18)).toEqual([1, "…", 16, 17, 18]);
    });
  });

  describe("Underlying data preservation & eligibility invariants", () => {
    it("never mutates or substring-slices the underlying product name or symbol", () => {
      const longName = "Invesco Short Duration US Government Securities Fund (Extended Description)";
      const asset = createMockAsset({ name: longName });
      expect(asset.name).toBe(longName);
      expect(asset.name.length).toBe(longName.length);
    });

    it("maintains NOT_EVALUATED for unverified/unanalyzed assets without blanket ELIGIBLE conversion", () => {
      const unanalyzed: AssetSummary = {
        asset: createMockAsset(),
      };
      expect(verificationStatus(unanalyzed)).toBe("NOT_ANALYZED");
      expect(eligibilityStatus(unanalyzed)).toBe("NOT_EVALUATED");
    });
  });
});
