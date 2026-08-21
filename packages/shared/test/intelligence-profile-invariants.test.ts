import { describe, expect, it } from "vitest";
import {
  NewsItemSchema,
  OutlookSchema,
  OwnershipEntrySchema,
  RiskDriverSchema,
  RwaIntelligenceProfileSchema,
} from "../src/index.js";

const SOURCE = ["some-source"];
const ASOF = "2026-08-18T00:00:00.000Z";

describe("Ownership -- issuer/company shareholders, never onchain token holders", () => {
  it("every ownership entry requires at least one sourceId -- a relationship can never be inferred without a real source", () => {
    expect(
      OwnershipEntrySchema.safeParse({
        name: "Example Capital Partners",
        relationship: "MAJOR_SHAREHOLDER",
        sourceIds: [],
      }).success,
    ).toBe(false);
  });

  it("accepts the documented relationship taxonomy, all of which describe company/issuer-level relationships, not token-holder addresses", () => {
    const relationships = [
      "MAJOR_SHAREHOLDER",
      "INSTITUTIONAL_SHAREHOLDER",
      "PARENT_COMPANY",
      "VENTURE_INVESTOR",
      "STRATEGIC_INVESTOR",
      "FUNDING_ROUND_INVESTOR",
      "SPONSOR",
      "FINANCIAL_BACKER",
      "PARTNER",
    ] as const;
    for (const relationship of relationships) {
      expect(
        OwnershipEntrySchema.safeParse({
          name: "Example Entity",
          relationship,
          sourceIds: SOURCE,
        }).success,
      ).toBe(true);
    }
    // No relationship value in the schema represents "wallet holding tokens" --
    // an onchain address is structurally never a valid `name` substitute for
    // a sourced shareholder/backer identity because the schema requires a
    // real sourceId, not a chain read, to populate this module at all.
  });
});

describe("Outlook -- never a trading signal, always evidence-backed, always separable from eligibility", () => {
  it("requires at least one piece of evidence -- an outlook with no evidence is rejected", () => {
    expect(
      OutlookSchema.safeParse({
        sentiment: "POSITIVE",
        horizon: "Near-term",
        confidence: "MEDIUM",
        summary: "Some summary text long enough to pass validation.",
        evidence: [],
      }).success,
    ).toBe(false);
  });

  it("INSUFFICIENT_DATA is a first-class sentiment for when evidence does not support a directional call", () => {
    expect(
      OutlookSchema.safeParse({
        sentiment: "INSUFFICIENT_DATA",
        horizon: "N/A",
        confidence: "LOW",
        summary: "Not enough real, sourced information exists to form a view.",
        evidence: ["No qualifying sources found."],
      }).success,
    ).toBe(true);
  });

  it("the schema has no field for a trade direction or price target -- only sentiment/horizon/drivers/evidence", () => {
    const shape = Object.keys(OutlookSchema.shape);
    expect(shape).not.toContain("action");
    expect(shape).not.toContain("priceTarget");
    expect(shape).not.toContain("recommendation");
  });
});

describe("Risk drivers -- asset-class-appropriate, evidence-backed", () => {
  it("requires at least one piece of evidence per driver", () => {
    expect(
      RiskDriverSchema.safeParse({
        name: "Fed policy",
        category: "MACRO",
        direction: "NEUTRAL",
        currentState: "Steady",
        importance: "HIGH",
        confidence: "HIGH",
        explanation: "Explanation text long enough to pass validation checks here.",
        evidence: [],
        updatedAt: ASOF,
      }).success,
    ).toBe(false);
  });
});

describe("News -- reasoning is mandatory, provenance is preserved", () => {
  it("rejects a news item with no explicit relevance reasoning", () => {
    expect(
      NewsItemSchema.safeParse({
        headline: "Some headline",
        publisher: "Some Publisher",
        url: "https://example.com/story",
        publishedAt: ASOF,
        summary: "Summary text long enough to pass the minimum length check here.",
        entities: ["Example Co"],
        categories: ["EARNINGS"],
        impactDirection: "NEUTRAL",
        impactAreas: ["ISSUER"],
        reasoning: "",
        sourceConfidence: "MEDIUM",
      }).success,
    ).toBe(false);
  });

  it("retains publishedAt and the source url as required fields (provenance survives)", () => {
    const parsed = NewsItemSchema.parse({
      headline: "Some headline",
      publisher: "Some Publisher",
      url: "https://example.com/story",
      publishedAt: ASOF,
      summary: "Summary text long enough to pass the minimum length check here.",
      entities: ["Example Co"],
      categories: ["EARNINGS"],
      impactDirection: "NEUTRAL",
      impactAreas: ["ISSUER"],
      reasoning: "Directly discusses this asset's issuer.",
      sourceConfidence: "MEDIUM",
    });
    expect(parsed.publishedAt).toBe(ASOF);
    expect(parsed.url).toBe("https://example.com/story");
  });
});

describe("Module failure isolation -- one module's absence never invalidates another", () => {
  it("a profile with FAILED news alongside AVAILABLE outlook parses cleanly -- failure in one module cannot take down another", () => {
    const result = RwaIntelligenceProfileSchema.safeParse({
      assetId: "example-asset",
      news: { status: "FAILED", reason: "Upstream fetch timed out." },
      outlook: {
        status: "AVAILABLE",
        data: {
          sentiment: "NEUTRAL",
          horizon: "Near-term",
          confidence: "MEDIUM",
          summary: "Enough real evidence exists to reach a neutral view here.",
          positiveDrivers: [],
          negativeDrivers: [],
          uncertainties: [],
          evidence: ["Some real evidence citation."],
        },
        asOf: ASOF,
        sourceIds: SOURCE,
      },
      updatedAt: ASOF,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.news?.status).toBe("FAILED");
      expect(result.data.outlook?.status).toBe("AVAILABLE");
    }
  });

  it("AVAILABLE status requires data, asOf, and at least one sourceId together -- partial provenance is rejected", () => {
    const result = RwaIntelligenceProfileSchema.safeParse({
      assetId: "example-asset",
      outlook: {
        status: "AVAILABLE",
        data: {
          sentiment: "NEUTRAL",
          horizon: "Near-term",
          confidence: "MEDIUM",
          summary: "Enough real evidence exists to reach a neutral view here.",
          evidence: ["Some real evidence citation."],
        },
        asOf: ASOF,
        sourceIds: [],
      },
      updatedAt: ASOF,
    });
    expect(result.success).toBe(false);
  });
});
