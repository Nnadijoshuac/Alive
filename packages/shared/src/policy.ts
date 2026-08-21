import {
  concat,
  encodeAbiParameters,
  keccak256,
  toBytes,
  type Hex,
} from "viem";
import { z } from "zod";
import { AssetClassSchema, AssetIdSchema, IssuerIdSchema } from "./rwa.js";
import { BasisPointsSchema } from "./schemas.js";

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const PolicyObjectiveSchema = z.enum([
  "CAPITAL_PRESERVATION",
  "INCOME",
  "BALANCED",
  "GROWTH",
  "CUSTOM",
]);

export const PolicyAssetClassLimitSchema = z
  .object({
    assetClass: AssetClassSchema,
    minimumBps: BasisPointsSchema,
    maximumBps: BasisPointsSchema,
  })
  .strict()
  .refine((limit) => limit.minimumBps <= limit.maximumBps, {
    message: "Asset-class minimum cannot exceed its maximum",
    path: ["minimumBps"],
  });

const assetClassOrder = new Map(
  AssetClassSchema.options.map((assetClass, index) => [assetClass, index]),
);

function normalizedIdentifierArray<T extends z.ZodTypeAny>(
  schema: T,
  duplicateMessage: string,
) {
  return z
    .array(schema)
    .superRefine((values, context) => {
      const seen = new Set<unknown>();
      values.forEach((value, index) => {
        if (seen.has(value)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: duplicateMessage,
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
    )
    .default([]);
}

const PortfolioPolicyObjectSchema = z
  .object({
    version: z.literal(1),
    objective: PolicyObjectiveSchema,
    minimumCashBps: BasisPointsSchema,
    assetClassLimits: z
      .array(PolicyAssetClassLimitSchema)
      .superRefine((limits, context) => {
        const seen = new Set<string>();
        limits.forEach((limit, index) => {
          if (seen.has(limit.assetClass)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate asset-class limit for ${limit.assetClass}`,
              path: [index, "assetClass"],
            });
          }
          seen.add(limit.assetClass);
        });
      })
      .transform((limits) =>
        [...limits].sort(
          (left, right) =>
            (assetClassOrder.get(left.assetClass) ?? 0) -
            (assetClassOrder.get(right.assetClass) ?? 0),
        ),
      ),
    maximumSingleAssetBps: BasisPointsSchema.min(1),
    maximumSingleIssuerBps: BasisPointsSchema.min(1),
    minimumLiquidityScore: z.number().int().min(0).max(100),
    maximumPortfolioRiskScore: z.number().int().min(0).max(100),
    maximumPriceAgeSeconds: z.number().int().positive().max(4_294_967_295),
    maximumSlippageBps: BasisPointsSchema,
    allowedAssetIds: normalizedIdentifierArray(
      AssetIdSchema,
      "Duplicate allowed asset ID",
    ),
    blockedAssetIds: normalizedIdentifierArray(
      AssetIdSchema,
      "Duplicate blocked asset ID",
    ),
    allowedIssuers: normalizedIdentifierArray(
      IssuerIdSchema,
      "Duplicate allowed issuer",
    ),
    blockedIssuers: normalizedIdentifierArray(
      IssuerIdSchema,
      "Duplicate blocked issuer",
    ),
    userApprovalRequired: z.boolean(),
  })
  .strict();

export const PortfolioPolicySchema = PortfolioPolicyObjectSchema.superRefine(
  (policy, context) => {
    const limitsByClass = new Map(
      policy.assetClassLimits.map((limit) => [limit.assetClass, limit]),
    );
    const cashLimit = limitsByClass.get("CASH");
    if (policy.minimumCashBps > 0 && cashLimit === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A positive minimumCashBps requires an explicit CASH asset-class limit",
        path: ["assetClassLimits"],
      });
    }
    if (
      cashLimit !== undefined &&
      cashLimit.maximumBps < policy.minimumCashBps
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Cash floor ${policy.minimumCashBps} BPS exceeds the CASH maximum ${cashLimit.maximumBps} BPS`,
        path: ["minimumCashBps"],
      });
    }

    const totalEffectiveMinimum = policy.assetClassLimits.reduce(
      (total, limit) =>
        total +
        (limit.assetClass === "CASH"
          ? Math.max(limit.minimumBps, policy.minimumCashBps)
          : limit.minimumBps),
      cashLimit === undefined ? policy.minimumCashBps : 0,
    );
    if (totalEffectiveMinimum > 10_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Effective asset-class minima total ${totalEffectiveMinimum} BPS, above 10000 BPS`,
        path: ["assetClassLimits"],
      });
    }

    if (limitsByClass.size === AssetClassSchema.options.length) {
      const totalMaximum = policy.assetClassLimits.reduce(
        (total, limit) => total + limit.maximumBps,
        0,
      );
      if (totalMaximum < 10_000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Asset-class maxima total only ${totalMaximum} BPS, below the required 10000 BPS allocation`,
          path: ["assetClassLimits"],
        });
      }
    }

    const blockedAssets = new Set(policy.blockedAssetIds);
    policy.allowedAssetIds.forEach((assetId, index) => {
      if (blockedAssets.has(assetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Asset ${assetId} cannot be both allowed and blocked`,
          path: ["allowedAssetIds", index],
        });
      }
    });

    const blockedIssuers = new Set(policy.blockedIssuers);
    policy.allowedIssuers.forEach((issuer, index) => {
      if (blockedIssuers.has(issuer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Issuer ${issuer} cannot be both allowed and blocked`,
          path: ["allowedIssuers", index],
        });
      }
    });
  },
);

export type PolicyObjective = z.infer<typeof PolicyObjectiveSchema>;
export type PolicyAssetClassLimit = z.infer<typeof PolicyAssetClassLimitSchema>;
export type PortfolioPolicyInput = z.input<typeof PortfolioPolicySchema>;
export type PortfolioPolicy = z.output<typeof PortfolioPolicySchema>;

export function normalizePortfolioPolicy(
  input: PortfolioPolicyInput,
): PortfolioPolicy {
  return PortfolioPolicySchema.parse(input);
}

export function safeNormalizePortfolioPolicy(input: unknown) {
  return PortfolioPolicySchema.safeParse(input);
}

export const POLICY_ASSET_CLASS_CODE = {
  CASH: 0,
  TREASURY: 1,
  EQUITY: 2,
  ETF: 3,
  GOLD: 4,
  COMMODITY: 5,
  CREDIT: 6,
  FUND: 7,
} as const;

export const POLICY_OBJECTIVE_CODE = {
  CAPITAL_PRESERVATION: 0,
  INCOME: 1,
  BALANCED: 2,
  GROWTH: 3,
  CUSTOM: 4,
} as const;

export const POLICY_ASSET_CLASS_LIMIT_TYPE_STRING =
  "PolicyAssetClassLimit(uint8 assetClass,uint16 minimumBps,uint16 maximumBps)";
export const PORTFOLIO_POLICY_TYPE_STRING =
  "PortfolioPolicy(uint16 version,uint8 objective,uint16 minimumCashBps,bytes32 assetClassLimitsHash,uint16 maximumSingleAssetBps,uint16 maximumSingleIssuerBps,uint8 minimumLiquidityScore,uint8 maximumPortfolioRiskScore,uint32 maximumPriceAgeSeconds,uint16 maximumSlippageBps,bytes32 allowedAssetIdsHash,bytes32 blockedAssetIdsHash,bytes32 allowedIssuersHash,bytes32 blockedIssuersHash,bool userApprovalRequired)";

export const POLICY_ASSET_CLASS_LIMIT_TYPEHASH = keccak256(
  toBytes(POLICY_ASSET_CLASS_LIMIT_TYPE_STRING),
);
export const PORTFOLIO_POLICY_TYPEHASH = keccak256(
  toBytes(PORTFOLIO_POLICY_TYPE_STRING),
);

function hashHashArray(hashes: readonly Hex[]): Hex {
  return keccak256(hashes.length === 0 ? "0x" : concat(hashes));
}

function hashStringArray(values: readonly string[]): Hex {
  return hashHashArray(values.map((value) => keccak256(toBytes(value))));
}

function hashAssetClassLimits(limits: readonly PolicyAssetClassLimit[]): Hex {
  return hashHashArray(
    limits.map((limit) =>
      keccak256(
        encodeAbiParameters(
          [
            { type: "bytes32" },
            { type: "uint8" },
            { type: "uint16" },
            { type: "uint16" },
          ],
          [
            POLICY_ASSET_CLASS_LIMIT_TYPEHASH,
            POLICY_ASSET_CLASS_CODE[limit.assetClass],
            limit.minimumBps,
            limit.maximumBps,
          ],
        ),
      ),
    ),
  );
}

export type PortfolioPolicyHashComponents = {
  readonly policy: PortfolioPolicy;
  readonly assetClassLimitsHash: Hex;
  readonly allowedAssetIdsHash: Hex;
  readonly blockedAssetIdsHash: Hex;
  readonly allowedIssuersHash: Hex;
  readonly blockedIssuersHash: Hex;
};

export function getPortfolioPolicyHashComponents(
  input: PortfolioPolicyInput,
): PortfolioPolicyHashComponents {
  const policy = normalizePortfolioPolicy(input);
  return {
    policy,
    assetClassLimitsHash: hashAssetClassLimits(policy.assetClassLimits),
    allowedAssetIdsHash: hashStringArray(policy.allowedAssetIds),
    blockedAssetIdsHash: hashStringArray(policy.blockedAssetIds),
    allowedIssuersHash: hashStringArray(policy.allowedIssuers),
    blockedIssuersHash: hashStringArray(policy.blockedIssuers),
  };
}

/**
 * EIP-712-style struct hash for Onchain Enforceable Policy V1.
 *
 * Dynamic arrays are represented by the Keccak hash of concatenated element
 * hashes. String elements are UTF-8 Keccak hashes. This is directly
 * reproducible with Solidity `keccak256(abi.encode(...))` and contains no JSON.
 */
export function hashPortfolioPolicy(input: PortfolioPolicyInput): Hex {
  const components = getPortfolioPolicyHashComponents(input);
  const policy = components.policy;
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint16" },
        { type: "uint8" },
        { type: "uint16" },
        { type: "bytes32" },
        { type: "uint16" },
        { type: "uint16" },
        { type: "uint8" },
        { type: "uint8" },
        { type: "uint32" },
        { type: "uint16" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bool" },
      ],
      [
        PORTFOLIO_POLICY_TYPEHASH,
        policy.version,
        POLICY_OBJECTIVE_CODE[policy.objective],
        policy.minimumCashBps,
        components.assetClassLimitsHash,
        policy.maximumSingleAssetBps,
        policy.maximumSingleIssuerBps,
        policy.minimumLiquidityScore,
        policy.maximumPortfolioRiskScore,
        policy.maximumPriceAgeSeconds,
        policy.maximumSlippageBps,
        components.allowedAssetIdsHash,
        components.blockedAssetIdsHash,
        components.allowedIssuersHash,
        components.blockedIssuersHash,
        policy.userApprovalRequired,
      ],
    ),
  );
}
