import { z } from "zod";
import { IsoDateSchema } from "./schemas.js";
import { AssetIdSchema } from "./rwa.js";

/**
 * Deep asset intelligence lives in its own domain object, separate from
 * `RwaAsset` (catalog identity + deployments + eligibility-relevant
 * facts). Overloading RwaAsset with news/macro/ownership/outlook would
 * conflate "what ALIVE needs to evaluate eligibility" with "what ALIVE
 * has learned about this asset's broader context" -- two very different
 * lifecycles (the former is deterministic-engine input; the latter is
 * editorial/research content that can be partial, stale, or entirely
 * unavailable without affecting eligibility at all).
 *
 * Every module is independently AVAILABLE or not: a failure or absence
 * in one module (say, `news`) must never take down `fundProfile` or the
 * page that renders it. `intelligenceModule()` encodes that failure
 * isolation directly in the type -- there is no way to have "some" data
 * under a module without also declaring where it's AVAILABLE from.
 */

function knownText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine((value) => value.toUpperCase() !== "UNKNOWN", {
      message: "Unknown facts must be omitted, not represented as the string UNKNOWN",
    });
}

export const ModuleStatusSchema = z.enum(["AVAILABLE", "UNAVAILABLE", "FAILED", "NOT_APPLICABLE"]);
export const ConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const DirectionSchema = z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED"]);

function intelligenceModule<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("AVAILABLE"),
        data: dataSchema,
        asOf: IsoDateSchema,
        sourceIds: z.array(AssetIdSchema).min(1),
      })
      .strict(),
    z
      .object({
        status: z.enum(["UNAVAILABLE", "FAILED", "NOT_APPLICABLE"]),
        reason: knownText(300).optional(),
      })
      .strict(),
  ]);
}

// -- Fund / company profiles (Phase 6: do not force one shape onto the other) --

export const FundProfileSchema = z
  .object({
    aum: knownText(140).optional(),
    nav: knownText(140).optional(),
    yield: knownText(140).optional(),
    managementFeeBps: z.number().int().nonnegative().max(10_000).optional(),
    manager: knownText(200).optional(),
    custodian: knownText(200).optional(),
    administrator: knownText(200).optional(),
    redemption: knownText(300).optional(),
    subscription: knownText(300).optional(),
    eligibleInvestors: knownText(300).optional(),
    holdingsSummary: knownText(500).optional(),
    durationDays: z.number().int().nonnegative().optional(),
  })
  .strict();

export const CompanyProfileSchema = z
  .object({
    revenue: knownText(140).optional(),
    revenueGrowth: knownText(140).optional(),
    earnings: knownText(140).optional(),
    margins: knownText(140).optional(),
    cash: knownText(140).optional(),
    debt: knownText(140).optional(),
    marketCap: knownText(140).optional(),
    leadership: knownText(300).optional(),
    headcount: knownText(140).optional(),
    headcountTrend: knownText(200).optional(),
    creditRating: knownText(140).optional(),
  })
  .strict();

// -- Ownership (Phase 7): issuer/company shareholders, never onchain token holders --

export const OwnershipRelationshipSchema = z.enum([
  "MAJOR_SHAREHOLDER",
  "INSTITUTIONAL_SHAREHOLDER",
  "PARENT_COMPANY",
  "VENTURE_INVESTOR",
  "STRATEGIC_INVESTOR",
  "FUNDING_ROUND_INVESTOR",
  "SPONSOR",
  "FINANCIAL_BACKER",
  "PARTNER",
]);

export const OwnershipEntrySchema = z
  .object({
    name: knownText(200),
    relationship: OwnershipRelationshipSchema,
    detail: knownText(400).optional(),
    sourceIds: z.array(AssetIdSchema).min(1),
  })
  .strict();

// -- News (Phase 5) --

export const NewsImpactAreaSchema = z.enum([
  "ISSUER",
  "MANAGER",
  "UNDERLYING",
  "REGULATION",
  "MARKET",
  "OPERATIONS",
  "TOKENIZATION_PLATFORM",
]);

export const NewsItemSchema = z
  .object({
    headline: knownText(300),
    publisher: knownText(120),
    url: z.string().url().max(2_048),
    publishedAt: IsoDateSchema,
    summary: knownText(600),
    entities: z.array(knownText(120)).min(1),
    categories: z.array(knownText(60)).min(1),
    impactDirection: DirectionSchema,
    impactAreas: z.array(NewsImpactAreaSchema).min(1),
    /** Why this specific story is relevant to THIS asset -- required, never left implicit. */
    reasoning: knownText(400),
    sourceConfidence: ConfidenceSchema,
  })
  .strict();

// -- Macro (Phase 8) and benchmark (Phase 9) --

export const MacroSignalSchema = z
  .object({
    name: knownText(120),
    value: knownText(120),
    asOf: IsoDateSchema,
    relevance: knownText(400),
    sourceIds: z.array(AssetIdSchema).min(1),
  })
  .strict();

export const BenchmarkSchema = z
  .object({
    name: knownText(200),
    benchmarkType: knownText(80),
    value: knownText(120).optional(),
    asOf: IsoDateSchema,
    sourceIds: z.array(AssetIdSchema).min(1),
  })
  .strict();

// -- Risk drivers (Phase 10) --

export const RiskDriverSchema = z
  .object({
    name: knownText(150),
    category: knownText(80),
    direction: DirectionSchema,
    currentState: knownText(300),
    importance: ConfidenceSchema,
    confidence: ConfidenceSchema,
    explanation: knownText(500),
    evidence: z.array(knownText(300)).min(1),
    updatedAt: IsoDateSchema,
  })
  .strict();

// -- Outlook (Phase 11): never BUY/SELL/price target, always separate from eligibility --

export const OutlookSentimentSchema = z.enum([
  "POSITIVE",
  "NEUTRAL",
  "NEGATIVE",
  "MIXED",
  "INSUFFICIENT_DATA",
]);

export const OutlookSchema = z
  .object({
    sentiment: OutlookSentimentSchema,
    horizon: knownText(80),
    confidence: ConfidenceSchema,
    summary: knownText(600),
    positiveDrivers: z.array(knownText(200)).default([]),
    negativeDrivers: z.array(knownText(200)).default([]),
    uncertainties: z.array(knownText(200)).default([]),
    evidence: z.array(knownText(300)).min(1),
  })
  .strict();

export const RwaIntelligenceProfileSchema = z
  .object({
    assetId: AssetIdSchema,
    fundProfile: intelligenceModule(FundProfileSchema).optional(),
    companyProfile: intelligenceModule(CompanyProfileSchema).optional(),
    ownership: intelligenceModule(z.array(OwnershipEntrySchema)).optional(),
    news: intelligenceModule(z.array(NewsItemSchema)).optional(),
    macro: intelligenceModule(z.array(MacroSignalSchema)).optional(),
    benchmark: intelligenceModule(BenchmarkSchema).optional(),
    riskDrivers: intelligenceModule(z.array(RiskDriverSchema)).optional(),
    outlook: intelligenceModule(OutlookSchema).optional(),
    updatedAt: IsoDateSchema,
  })
  .strict();

export type ModuleStatus = z.infer<typeof ModuleStatusSchema>;
export type FundProfile = z.infer<typeof FundProfileSchema>;
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;
export type OwnershipEntry = z.infer<typeof OwnershipEntrySchema>;
export type NewsItem = z.infer<typeof NewsItemSchema>;
export type MacroSignal = z.infer<typeof MacroSignalSchema>;
export type Benchmark = z.infer<typeof BenchmarkSchema>;
export type RiskDriver = z.infer<typeof RiskDriverSchema>;
export type Outlook = z.infer<typeof OutlookSchema>;
export type RwaIntelligenceProfile = z.infer<typeof RwaIntelligenceProfileSchema>;
