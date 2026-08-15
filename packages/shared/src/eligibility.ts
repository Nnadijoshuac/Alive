import { z } from "zod";
import { hashCanonical } from "./canonical.js";
import { AssetClassSchema, AssetIdSchema, IssuerIdSchema } from "./rwa.js";
import { BasisPointsSchema, Bytes32Schema, IsoDateSchema } from "./schemas.js";

/**
 * Same vocabulary as AssetSourceSchema's sourceType (see rwa.ts) — kept as a
 * plain enum here rather than re-derived from the discriminated union, since
 * zod does not expose a clean way to pull literal members back out of one.
 */
export const RequiredSourceTypeSchema = z.enum([
  "ISSUER_DOCUMENTATION",
  "OFFICIAL_TOKEN_DOCUMENTATION",
  "OFFICIAL_PROTOCOL_API",
  "CHAINLINK",
  "ONCHAIN",
  "REGULATORY_FILING",
  "DEMO_FIXTURE",
]);

export const EligibilityReasonCodeSchema = z.enum([
  "OK",
  "ISSUER_NOT_APPROVED",
  "ASSET_CLASS_NOT_ALLOWED",
  "DOCUMENTATION_INCOMPLETE",
  "NAV_UNAVAILABLE",
  "NAV_STALE",
  "PRICE_UNAVAILABLE",
  "PRICE_STALE",
  "PRICE_DEVIATION_TOO_HIGH",
  "REDEMPTION_DISABLED",
  "REDEMPTION_UNKNOWN",
  "SOURCE_DATA_TOO_OLD",
  "ASSET_DISABLED",
  // Reserved for forward compatibility with the directive's reason-code
  // vocabulary. RwaAssetSchema has no structured jurisdiction/investor-type
  // facts yet (only a free-text restrictions[] array), so evaluateEligibility
  // never emits these two — doing so from unstructured text would be a
  // guess, and UNKNOWN is preferable to a guess.
  "JURISDICTION_RESTRICTED",
  "INVESTOR_RESTRICTION_FAILED",
  // Not emitted by evaluateEligibility itself (a verdict cannot be expired
  // at the moment it is created) — used by isVerdictExpired() and by
  // on-chain/consumer-side checks when a stored verdict is read back later.
  "VERDICT_EXPIRED",
]);

export const EligibilityReasonSchema = z
  .object({
    code: EligibilityReasonCodeSchema,
    message: z.string().trim().min(1).max(500),
  })
  .strict();

export const EligibilityStatusSchema = z.enum([
  "ELIGIBLE",
  "RESTRICTED",
  "UNKNOWN",
]);

export const EligibilityPolicySchema = z
  .object({
    version: z.literal(1),
    policyId: z.string().trim().min(1).max(128),
    allowedAssetClasses: z.array(AssetClassSchema).min(1),
    requireApprovedIssuer: z.boolean(),
    approvedIssuers: z.array(IssuerIdSchema),
    requiredSourceTypes: z.array(RequiredSourceTypeSchema),
    maxNavAgeSeconds: z.number().int().positive(),
    maxPriceAgeSeconds: z.number().int().positive(),
    requireRedemptionActive: z.boolean(),
    maxPriceDeviationBps: BasisPointsSchema,
    verdictValiditySeconds: z.number().int().positive(),
  })
  .strict();

export type RequiredSourceType = z.infer<typeof RequiredSourceTypeSchema>;
export type EligibilityReasonCode = z.infer<typeof EligibilityReasonCodeSchema>;
export type EligibilityReason = z.infer<typeof EligibilityReasonSchema>;
export type EligibilityStatus = z.infer<typeof EligibilityStatusSchema>;
export type EligibilityPolicy = z.infer<typeof EligibilityPolicySchema>;

export const EligibilityVerdictSchema = z
  .object({
    version: z.literal(1),
    assetId: AssetIdSchema,
    eligible: z.boolean(),
    status: EligibilityStatusSchema,
    reasons: z.array(EligibilityReasonSchema).min(1),
    evaluatedAt: IsoDateSchema,
    validUntil: IsoDateSchema,
    passportHash: Bytes32Schema,
    policyHash: Bytes32Schema,
    marketSnapshotHash: Bytes32Schema.optional(),
  })
  .strict();

export type EligibilityVerdict = z.infer<typeof EligibilityVerdictSchema>;

/** Compact commitment hash, analogous to how the legacy AliveAssetRegistry
 * committed to a metadataHash rather than a full EIP-712 struct — the
 * verdict itself (milestone 5) is what gets an EIP-712 signature; this is
 * just the passport-content binding inside it. */
export function hashPassport(passport: unknown): `0x${string}` {
  return hashCanonical({ passportCommitmentVersion: 1, passport });
}

export function hashEligibilityPolicy(policy: EligibilityPolicy): `0x${string}` {
  const parsed = EligibilityPolicySchema.parse(policy);
  return hashCanonical({ eligibilityPolicyCommitmentVersion: 1, policy: parsed });
}

export function isVerdictExpired(
  verdict: Pick<EligibilityVerdict, "validUntil">,
  now: Date,
): boolean {
  return Date.parse(verdict.validUntil) <= now.getTime();
}
