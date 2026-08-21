import { z } from "zod";
import { AddressSchema, BasisPointsSchema, IsoDateSchema } from "./schemas.js";

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const AssetClassSchema = z.enum([
  "CASH",
  "TREASURY",
  "EQUITY",
  "ETF",
  "GOLD",
  "COMMODITY",
  "CREDIT",
  "FUND",
]);

export const DataModeSchema = z.enum(["DEMO", "SNAPSHOT", "LIVE"]);

export const AssetIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9][a-z0-9._:-]*$/));

export const IssuerIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9][a-z0-9._:-]*$/));

function knownText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine((value) => value.toUpperCase() !== "UNKNOWN", {
      message:
        "Unknown facts must be omitted, not represented as the string UNKNOWN",
    });
}

export const AssetProvenanceFieldSchema = z.enum([
  "symbol",
  "name",
  "assetClass",
  "issuer",
  "issuerName",
  "underlying",
  "deployments",
  "priceFeed.provider",
  "priceFeed.feedId",
  "priceFeed.type",
  "yield.type",
  "yield.estimatedAprBps",
  "liquidity.score",
  "liquidity.redemptionWindow",
  "liquidity.notes",
  "risk.score",
  "risk.issuerRisk",
  "risk.liquidityRisk",
  "risk.marketRisk",
  "risk.oracleRisk",
  "risk.redemptionRisk",
  "risk.productComplexityRisk",
  "risk.methodology",
  "marketHours.type",
  "marketHours.timezone",
  "fees.managementFeeBps",
  "fees.redemptionFeeBps",
  "restrictions",
  "lastUpdatedAt",
  "redemption.supported",
  "redemption.frequency",
  "redemption.settlementPeriod",
  "redemption.minimum",
  "jurisdiction",
  "eligibleInvestors",
  "custody",
  "documentEffectiveDate",
]);

function sortedUniqueArray<T extends z.ZodTypeAny>(
  itemSchema: T,
  message: string,
) {
  return z
    .array(itemSchema)
    .min(1)
    .superRefine((values, context) => {
      const seen = new Set<unknown>();
      values.forEach((value, index) => {
        if (seen.has(value)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message,
            path: [index],
          });
        }
        seen.add(value);
      });
    })
    .transform((values) =>
      [...values].sort((left, right) =>
        compareCodeUnits(String(left), String(right)),
      ),
    );
}

const AssetSourceBaseShape = {
  id: AssetIdSchema,
  title: knownText(240),
  retrievedAt: IsoDateSchema,
  supportedFields: sortedUniqueArray(
    AssetProvenanceFieldSchema,
    "A source cannot list the same supported field twice",
  ),
};

/**
 * Trust tiers for external sources (catalog-expansion directive §10-11).
 * TIER 1 (PRIMARY) is the issuer/manager/platform/regulator itself.
 * TIER 2 (CHAIN_EXPLORER) is a blockchain explorer or onchain contract
 * state. TIER 3 (DISCOVERY) is an aggregator or metadata index -- it can
 * discover a candidate asset, but alone it never promotes a catalog entry
 * to VERIFIED. Optional (not every existing source has been back-tagged),
 * but new sources should set it.
 */
export const SourceTierSchema = z.enum(["PRIMARY", "CHAIN_EXPLORER", "DISCOVERY"]);

const ExternalAssetSourceSchema = z
  .object({
    ...AssetSourceBaseShape,
    sourceType: z.enum([
      "ISSUER_DOCUMENTATION",
      "OFFICIAL_TOKEN_DOCUMENTATION",
      "OFFICIAL_PROTOCOL_API",
      "CHAINLINK",
      "ONCHAIN",
      "REGULATORY_FILING",
    ]),
    sourceUrl: z.string().url().max(2_048),
    sourceTier: SourceTierSchema.optional(),
  })
  .strict();

const DemoAssetSourceSchema = z
  .object({
    ...AssetSourceBaseShape,
    sourceType: z.literal("DEMO_FIXTURE"),
    fixtureId: AssetIdSchema,
    disclaimer: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => /not live/i.test(value), {
        message: "Demo source disclaimer must state that the data is not live",
      }),
  })
  .strict();

/**
 * ALIVE's own computed fields (risk score, liquidity score, yield estimate)
 * are never claimed by document extraction -- no issuer document states
 * "risk score: 16/100," ALIVE's own scoring methodology produces that
 * number. This source type exists so a genuinely LIVE/real asset (real
 * documents, real AI extraction, real market data) can still legally carry
 * those first-party computed fields without being forced to keep a
 * DEMO_FIXTURE source (which asserts "not live," which would be false)
 * just to satisfy the provenance requirement on fields nothing else
 * claims.
 */
const AliveMethodologySourceSchema = z
  .object({
    ...AssetSourceBaseShape,
    sourceType: z.literal("ALIVE_METHODOLOGY"),
    methodology: knownText(120),
    disclaimer: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => /alive/i.test(value), {
        message:
          "ALIVE_METHODOLOGY source disclaimer must identify this as ALIVE's own computed output",
      }),
  })
  .strict();

export const AssetSourceSchema = z.discriminatedUnion("sourceType", [
  ExternalAssetSourceSchema,
  DemoAssetSourceSchema,
  AliveMethodologySourceSchema,
]);

export const RwaYieldSchema = z
  .object({
    type: knownText(120),
    estimatedAprBps: z
      .number()
      .int()
      .nonnegative()
      .max(4_294_967_295)
      .optional(),
  })
  .strict();

export const RwaLiquiditySchema = z
  .object({
    score: z.number().int().min(0).max(100),
    redemptionWindow: knownText(240).optional(),
    notes: knownText(1_000).optional(),
  })
  .strict();

export const RwaRiskSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    issuerRisk: z.number().int().min(0).max(100),
    liquidityRisk: z.number().int().min(0).max(100),
    marketRisk: z.number().int().min(0).max(100),
    oracleRisk: z.number().int().min(0).max(100),
    redemptionRisk: z.number().int().min(0).max(100),
    productComplexityRisk: z.number().int().min(0).max(100),
    methodology: knownText(120),
  })
  .strict();

export const RwaPriceFeedSchema = z
  .object({
    provider: knownText(120),
    feedId: knownText(240).optional(),
    type: knownText(120),
  })
  .strict();

export const RwaMarketHoursSchema = z
  .object({
    type: z.enum(["ALWAYS_OPEN", "TRADITIONAL_MARKET", "ISSUER_DEFINED"]),
    timezone: knownText(120).optional(),
  })
  .strict();

export const RwaFeesSchema = z
  .object({
    managementFeeBps: BasisPointsSchema.optional(),
    redemptionFeeBps: BasisPointsSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.managementFeeBps !== undefined ||
      value.redemptionFeeBps !== undefined,
    { message: "At least one known fee must be provided" },
  );

/**
 * `supported` is the only mandatory field: "redemption status is unknown" is
 * itself a fact worth representing (as `supported: "unknown"`), distinct from
 * omitting the whole object. See directive: UNKNOWN is preferable to
 * hallucination.
 */
export const RwaRedemptionSchema = z
  .object({
    supported: z.union([z.boolean(), z.literal("unknown")]),
    frequency: knownText(120).optional(),
    settlementPeriod: knownText(120).optional(),
    minimum: z.number().nonnegative().optional(),
  })
  .strict();

/** Metadata about how a passport was produced. Not a "fact" field: it is not
 * subject to the sources[].supportedFields provenance-parity check below. */
export const RwaExtractionMetadataSchema = z
  .object({
    pipelineVersion: knownText(60),
    extractedAt: IsoDateSchema,
    model: knownText(120).optional(),
    promptVersion: knownText(60).optional(),
    confidence: z.number().min(0).max(1).optional(),
    mode: z.enum(["AI", "DETERMINISTIC_FALLBACK", "DEMO_FIXTURE"]),
  })
  .strict();

/**
 * Deployment status (catalog-expansion directive §6). Only VERIFIED
 * deployments satisfy public chain filters (e.g. "X Layer") -- a
 * DISCOVERED or UNVERIFIED deployment is a lead, not a fact ALIVE will
 * assert. DEPRECATED marks a deployment ALIVE once verified but no
 * longer trusts (e.g. a migrated contract).
 */
export const DeploymentStatusSchema = z.enum([
  "VERIFIED",
  "DISCOVERED",
  "UNVERIFIED",
  "DEPRECATED",
]);

/**
 * A real financial product can have one canonical identity and several
 * token deployments across chains (directive §4-5). `contractAddress` is
 * deliberately a free-form string, not an EVM-only AddressSchema: ALIVE's
 * chain model must not assume every future deployment is EVM-shaped
 * (Solana program-derived addresses, for example, are not 0x-hex).
 */
export const RwaDeploymentSchema = z
  .object({
    chainId: z.number().int().positive().max(4_294_967_295),
    chainName: knownText(60),
    contractAddress: knownText(160),
    tokenStandard: knownText(40),
    deploymentStatus: DeploymentStatusSchema,
    explorerUrl: z.string().url().max(2_048).optional(),
    sourceIds: z.array(AssetIdSchema).optional(),
    verifiedAt: IsoDateSchema.optional(),
  })
  .strict();

/**
 * Catalog inclusion is not the same claim as ALIVE verification (directive
 * §2, §40): IDENTIFIED means ALIVE has enough evidence the product is
 * real and sourced -- not that ALIVE has analyzed it. PENDING_IDENTITY is
 * an internal discovery-pipeline state that should never be shown as a
 * public catalog entry (directive §2). DEPRECATED marks an entry ALIVE no
 * longer considers current (e.g. a fund that wound down).
 */
export const CatalogStatusSchema = z.enum(["IDENTIFIED", "PENDING_IDENTITY", "DEPRECATED"]);

/**
 * Whether ALIVE's Analyze pipeline can currently run for this asset
 * (directive §18). READY means real official documents are registered for
 * extraction (the ttbill-b/USTB path). SOURCE_DISCOVERY_REQUIRED means the
 * asset's canonical identity is established but ALIVE has not yet
 * registered documents to extract from -- Analyze should say why, never
 * fabricate a result. UNSUPPORTED marks an asset class/source type ALIVE's
 * extraction pipeline does not yet handle at all.
 */
export const AnalysisCapabilitySchema = z.enum([
  "READY",
  "SOURCE_DISCOVERY_REQUIRED",
  "UNSUPPORTED",
]);

/**
 * Separate from deployment chain (directive §9, §42-43): whether ALIVE's
 * own eligibility-signing + onchain enforcement infrastructure exists for
 * this asset on X Layer. An asset can be deployed on Ethereum with zero
 * X Layer token deployment and still have enforcementCapability "X_LAYER"
 * (ttbill-b: real Chainlink NAV, signed verdicts, and a proven X Layer
 * Testnet gateway) -- enforcement capability is about ALIVE's own
 * infrastructure, not about where the token contract lives.
 */
export const EnforcementCapabilitySchema = z.enum(["X_LAYER", "NONE"]);

/**
 * How an asset's value is actually claimed to be connected to the real
 * world (catalog-expansion follow-on directive, "Backing/Synthetic
 * classification"). Never inferred from marketing language -- only set
 * when a real source states the mechanism. "Synthetic != fake, backed !=
 * safe": SYNTHETIC_EXPOSURE is an honest, first-class category, not a
 * red flag, and RESERVE_BACKED/COLLATERAL_BACKED say nothing about
 * quality on their own.
 */
export const BackingTypeSchema = z.enum([
  "DIRECT_CLAIM",
  "RESERVE_BACKED",
  "COLLATERAL_BACKED",
  "FUND_SHARE",
  "DEBT_CLAIM",
  "SYNTHETIC_EXPOSURE",
  "HYBRID",
  "UNKNOWN",
]);

/**
 * Self-contained provenance (its own `sourceIds`/`asOf`), like `visual` --
 * ALIVE's own classification of already-sourced facts, not itself subject
 * to the sources[].supportedFields provenance-parity check. Every field
 * beyond `backingType` is optional: an unknown detail stays absent, never
 * guessed.
 */
export const BackingProfileSchema = z
  .object({
    backingType: BackingTypeSchema,
    underlyingAssets: knownText(500).optional(),
    directLegalClaim: z.boolean().optional(),
    redemptionIntoUnderlying: z.union([z.boolean(), z.literal("unknown")]).optional(),
    custodian: knownText(200).optional(),
    reserveManager: knownText(200).optional(),
    collateralDescription: knownText(500).optional(),
    collateralizationRatio: z.number().nonnegative().optional(),
    proofOfReserveAvailable: z.boolean().optional(),
    sourceIds: z.array(AssetIdSchema).min(1),
    asOf: IsoDateSchema,
  })
  .strict();

export const LogoSourceSchema = z.enum([
  "COINGECKO",
  "TRUST_WALLET",
  "OFFICIAL_ISSUER",
  "OFFICIAL_PLATFORM",
]);

/**
 * A token's logo is either RESOLVED against a verified identity (the
 * requested network+contractAddress genuinely matched what the source
 * returned, or the image came from a canonical ALIVE-trusted official
 * source) or UNAVAILABLE. There is no third state that lets a caller claim
 * a logo without also recording where it came from and when it was
 * checked -- an "official-looking" image is worthless without that
 * provenance, and a generated placeholder must never be able to satisfy
 * this shape (a fallback badge is a UI decision made from UNAVAILABLE, not
 * a kind of resolved logo).
 *
 * Like `extraction`, this is presentation/provenance metadata about how
 * ALIVE renders an asset it already knows about, not a "fact" claimed
 * about the issuer or product -- it is deliberately not subject to the
 * sources[].supportedFields provenance-parity check below.
 */
export const RwaAssetVisualSchema = z.discriminatedUnion("logoStatus", [
  z
    .object({
      logoStatus: z.literal("RESOLVED"),
      logoUrl: z.string().url().max(2_048),
      logoSource: LogoSourceSchema,
      logoSourceId: knownText(160).optional(),
      logoContractAddress: AddressSchema.optional(),
      logoNetwork: knownText(60).optional(),
      logoVerifiedAt: IsoDateSchema,
    })
    .strict(),
  z
    .object({
      logoStatus: z.literal("UNAVAILABLE"),
    })
    .strict(),
]);

const RwaAssetObjectSchema = z
  .object({
    id: AssetIdSchema,
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._-]*$/)),
    name: knownText(200),
    assetClass: AssetClassSchema,
    issuer: IssuerIdSchema,
    issuerName: knownText(200),
    underlying: knownText(500),
    deployments: z.array(RwaDeploymentSchema).min(1).optional(),
    catalogStatus: CatalogStatusSchema.optional(),
    analysisCapability: AnalysisCapabilitySchema.optional(),
    enforcementCapability: EnforcementCapabilitySchema.optional(),
    priceFeed: RwaPriceFeedSchema.optional(),
    yield: RwaYieldSchema.optional(),
    liquidity: RwaLiquiditySchema.optional(),
    risk: RwaRiskSchema.optional(),
    marketHours: RwaMarketHoursSchema.optional(),
    fees: RwaFeesSchema.optional(),
    redemption: RwaRedemptionSchema.optional(),
    restrictions: sortedUniqueArray(
      knownText(500),
      "An asset cannot contain duplicate restrictions",
    ).optional(),
    jurisdiction: knownText(120).optional(),
    eligibleInvestors: knownText(300).optional(),
    custody: knownText(300).optional(),
    documentEffectiveDate: IsoDateSchema.optional(),
    extraction: RwaExtractionMetadataSchema.optional(),
    visual: RwaAssetVisualSchema.optional(),
    backing: BackingProfileSchema.optional(),
    sources: z
      .array(AssetSourceSchema)
      .min(1)
      .superRefine((sources, context) => {
        const seen = new Set<string>();
        sources.forEach((source, index) => {
          if (seen.has(source.id)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: "An asset cannot contain duplicate source IDs",
              path: [index, "id"],
            });
          }
          seen.add(source.id);
        });
      })
      .transform((sources) =>
        [...sources].sort((left, right) => compareCodeUnits(left.id, right.id)),
      ),
    lastUpdatedAt: IsoDateSchema,
    dataMode: DataModeSchema,
  })
  .strict();

type RwaAssetCandidate = z.output<typeof RwaAssetObjectSchema>;
type ProvenanceField = z.infer<typeof AssetProvenanceFieldSchema>;

function presentProvenanceFields(asset: RwaAssetCandidate): ProvenanceField[] {
  const fields: ProvenanceField[] = [
    "symbol",
    "name",
    "assetClass",
    "issuer",
    "issuerName",
    "underlying",
    "lastUpdatedAt",
  ];

  if (asset.deployments !== undefined) fields.push("deployments");
  if (asset.priceFeed !== undefined) {
    fields.push("priceFeed.provider", "priceFeed.type");
    if (asset.priceFeed.feedId !== undefined) fields.push("priceFeed.feedId");
  }
  if (asset.yield !== undefined) {
    fields.push("yield.type");
    if (asset.yield.estimatedAprBps !== undefined)
      fields.push("yield.estimatedAprBps");
  }
  if (asset.liquidity !== undefined) {
    fields.push("liquidity.score");
    if (asset.liquidity.redemptionWindow !== undefined)
      fields.push("liquidity.redemptionWindow");
    if (asset.liquidity.notes !== undefined) fields.push("liquidity.notes");
  }
  if (asset.risk !== undefined) {
    fields.push(
      "risk.score",
      "risk.issuerRisk",
      "risk.liquidityRisk",
      "risk.marketRisk",
      "risk.oracleRisk",
      "risk.redemptionRisk",
      "risk.productComplexityRisk",
      "risk.methodology",
    );
  }
  if (asset.marketHours !== undefined) {
    fields.push("marketHours.type");
    if (asset.marketHours.timezone !== undefined)
      fields.push("marketHours.timezone");
  }
  if (asset.fees !== undefined) {
    if (asset.fees.managementFeeBps !== undefined)
      fields.push("fees.managementFeeBps");
    if (asset.fees.redemptionFeeBps !== undefined)
      fields.push("fees.redemptionFeeBps");
  }
  if (asset.restrictions !== undefined) fields.push("restrictions");
  if (asset.redemption !== undefined) {
    fields.push("redemption.supported");
    if (asset.redemption.frequency !== undefined)
      fields.push("redemption.frequency");
    if (asset.redemption.settlementPeriod !== undefined)
      fields.push("redemption.settlementPeriod");
    if (asset.redemption.minimum !== undefined)
      fields.push("redemption.minimum");
  }
  if (asset.jurisdiction !== undefined) fields.push("jurisdiction");
  if (asset.eligibleInvestors !== undefined) fields.push("eligibleInvestors");
  if (asset.custody !== undefined) fields.push("custody");
  if (asset.documentEffectiveDate !== undefined)
    fields.push("documentEffectiveDate");

  return fields;
}

export const RwaAssetSchema = RwaAssetObjectSchema.superRefine(
  (asset, context) => {
    if (asset.deployments) {
      const seen = new Set<string>();
      asset.deployments.forEach((deployment, index) => {
        const key = `${deployment.chainId}:${deployment.contractAddress.toLowerCase()}`;
        if (seen.has(key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "An asset cannot list the same chain+contract deployment twice",
            path: ["deployments", index],
          });
        }
        seen.add(key);
      });
    }

    const demoSources = asset.sources.filter(
      (source) => source.sourceType === "DEMO_FIXTURE",
    );
    if (asset.dataMode === "DEMO" && demoSources.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Demo assets require an explicit DEMO_FIXTURE source",
        path: ["sources"],
      });
    }
    if (
      asset.dataMode !== "DEMO" &&
      demoSources.length === asset.sources.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Snapshot/live assets require at least one external primary source",
        path: ["sources"],
      });
    }

    const presentFields = new Set(presentProvenanceFields(asset));
    const supportedFields = new Set(
      asset.sources.flatMap((source) => source.supportedFields),
    );
    presentFields.forEach((field) => {
      if (!supportedFields.has(field)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `No source supports the field ${field}`,
          path: ["sources"],
        });
      }
    });
    supportedFields.forEach((field) => {
      if (!presentFields.has(field)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Source claims support for omitted field ${field}`,
          path: ["sources"],
        });
      }
    });
  },
);

export const RwaCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalogId: AssetIdSchema,
    label: knownText(200),
    dataMode: z.enum(["DEMO", "SNAPSHOT"]),
    asOf: IsoDateSchema,
    disclaimer: z.string().trim().min(1).max(1_000),
    assets: z
      .array(RwaAssetSchema)
      .min(1)
      .superRefine((assets, context) => {
        const seen = new Set<string>();
        assets.forEach((asset, index) => {
          if (seen.has(asset.id)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: "A catalog cannot contain duplicate asset IDs",
              path: [index, "id"],
            });
          }
          seen.add(asset.id);
        });
      })
      .transform((assets) =>
        [...assets].sort((left, right) => compareCodeUnits(left.id, right.id)),
      ),
  })
  .strict()
  .superRefine((catalog, context) => {
    if (catalog.dataMode === "DEMO") {
      if (!/not live market data/i.test(catalog.disclaimer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Demo catalog disclaimer must state NOT LIVE MARKET DATA",
          path: ["disclaimer"],
        });
      }
      catalog.assets.forEach((asset, index) => {
        if (asset.dataMode !== "DEMO") {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Every asset in a demo catalog must use DEMO data mode",
            path: ["assets", index, "dataMode"],
          });
        }
      });
    }
  });

export type AssetClass = z.infer<typeof AssetClassSchema>;
export type DataMode = z.infer<typeof DataModeSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;
export type AssetProvenanceField = z.infer<typeof AssetProvenanceFieldSchema>;
export type AssetSource = z.infer<typeof AssetSourceSchema>;
export type RwaYield = z.infer<typeof RwaYieldSchema>;
export type RwaLiquidity = z.infer<typeof RwaLiquiditySchema>;
export type RwaRisk = z.infer<typeof RwaRiskSchema>;
export type RwaRedemption = z.infer<typeof RwaRedemptionSchema>;
export type RwaExtractionMetadata = z.infer<
  typeof RwaExtractionMetadataSchema
>;
export type RwaAssetVisual = z.infer<typeof RwaAssetVisualSchema>;
export type LogoSource = z.infer<typeof LogoSourceSchema>;
export type RwaDeployment = z.infer<typeof RwaDeploymentSchema>;
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;
export type CatalogStatus = z.infer<typeof CatalogStatusSchema>;
export type AnalysisCapability = z.infer<typeof AnalysisCapabilitySchema>;
export type EnforcementCapability = z.infer<typeof EnforcementCapabilitySchema>;
export type SourceTier = z.infer<typeof SourceTierSchema>;
export type BackingType = z.infer<typeof BackingTypeSchema>;
export type BackingProfile = z.infer<typeof BackingProfileSchema>;
export type RwaAsset = z.infer<typeof RwaAssetSchema>;
export type RwaCatalog = z.infer<typeof RwaCatalogSchema>;
