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
  "network",
  "chainId",
  "tokenAddress",
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

export const AssetSourceSchema = z.discriminatedUnion("sourceType", [
  ExternalAssetSourceSchema,
  DemoAssetSourceSchema,
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
    network: knownText(120).optional(),
    chainId: z.number().int().positive().max(4_294_967_295).optional(),
    tokenAddress: AddressSchema.optional(),
    priceFeed: RwaPriceFeedSchema.optional(),
    yield: RwaYieldSchema.optional(),
    liquidity: RwaLiquiditySchema,
    risk: RwaRiskSchema,
    marketHours: RwaMarketHoursSchema.optional(),
    fees: RwaFeesSchema.optional(),
    restrictions: sortedUniqueArray(
      knownText(500),
      "An asset cannot contain duplicate restrictions",
    ).optional(),
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
  ];

  if (asset.network !== undefined) fields.push("network");
  if (asset.chainId !== undefined) fields.push("chainId");
  if (asset.tokenAddress !== undefined) fields.push("tokenAddress");
  if (asset.priceFeed !== undefined) {
    fields.push("priceFeed.provider", "priceFeed.type");
    if (asset.priceFeed.feedId !== undefined) fields.push("priceFeed.feedId");
  }
  if (asset.yield !== undefined) {
    fields.push("yield.type");
    if (asset.yield.estimatedAprBps !== undefined)
      fields.push("yield.estimatedAprBps");
  }
  if (asset.liquidity.redemptionWindow !== undefined)
    fields.push("liquidity.redemptionWindow");
  if (asset.liquidity.notes !== undefined) fields.push("liquidity.notes");
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

  return fields;
}

export const RwaAssetSchema = RwaAssetObjectSchema.superRefine(
  (asset, context) => {
    const deploymentFields = [asset.network, asset.chainId, asset.tokenAddress];
    const deploymentFieldCount = deploymentFields.filter(
      (field) => field !== undefined,
    ).length;
    if (deploymentFieldCount !== 0 && deploymentFieldCount !== 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "network, chainId, and tokenAddress must either all be known or all be omitted",
        path: ["network"],
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
export type RwaAsset = z.infer<typeof RwaAssetSchema>;
export type RwaCatalog = z.infer<typeof RwaCatalogSchema>;
