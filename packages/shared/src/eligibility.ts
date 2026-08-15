import {
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
  toBytes,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";
import { z } from "zod";
import { hashCanonical } from "./canonical.js";
import { AssetClassSchema, AssetIdSchema, IssuerIdSchema } from "./rwa.js";
import {
  AddressSchema,
  BasisPointsSchema,
  Bytes32Schema,
  IsoDateSchema,
  SignatureSchema,
} from "./schemas.js";

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

/**
 * Matches packages/contracts/scripts/deploy-rwa.ts's `hashLabel(key)`
 * convention (`ethers.id(value)` = keccak256(utf8Bytes(value))) exactly, so
 * an off-chain passport `id` string and its on-chain bytes32 asset ID are
 * always derivable from each other the same way everywhere.
 */
export function hashAssetId(assetId: string): `0x${string}` {
  return keccak256(toBytes(assetId));
}

export function hashEligibilityReasons(
  reasons: readonly EligibilityReason[],
): `0x${string}` {
  return hashCanonical({ eligibilityReasonsCommitmentVersion: 1, reasons });
}

/**
 * The signed on-chain attestation. Deliberately narrower than
 * EligibilityVerdict: it carries only commitment hashes plus the boolean
 * outcome and a nonce, mirroring how AliveStrategyVerifier's Strategy
 * struct commits to hashes rather than re-encoding full nested objects
 * on-chain. `assetIdHash` = keccak256(utf8Bytes(passport.id)), matching
 * packages/contracts/scripts/deploy-rwa.ts's hashLabel(key) convention, so
 * the same bytes32 identifies an asset across AliveRwaAssetRegistry and
 * this attestation. chainId is not repeated as a message field — the
 * EIP-712 domain separator already binds it, matching the Strategy struct.
 */
export const EligibilityAttestationSchema = z
  .object({
    assetIdHash: Bytes32Schema,
    eligible: z.boolean(),
    reasonHash: Bytes32Schema,
    passportHash: Bytes32Schema,
    marketSnapshotHash: Bytes32Schema,
    policyHash: Bytes32Schema,
    issuedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    validUntil: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    nonce: Bytes32Schema,
  })
  .strict()
  .refine((a) => a.validUntil > a.issuedAt, {
    message: "Attestation validUntil must be after issuedAt",
    path: ["validUntil"],
  })
  .refine((a) => a.validUntil - a.issuedAt <= 86_400, {
    message: "Attestation lifetime cannot exceed 86400 seconds",
    path: ["validUntil"],
  })
  .refine(
    (a) =>
      [a.reasonHash, a.passportHash, a.policyHash, a.nonce].every(
        (value) => value !== `0x${"00".repeat(32)}`,
      ),
    {
      message: "Attestation commitments and nonce cannot be zero bytes32",
      path: ["nonce"],
    },
  );

export type EligibilityAttestation = z.infer<typeof EligibilityAttestationSchema>;

export const EligibilityAttestationDomainSchema = z
  .object({
    chainId: z.number().int().positive(),
    verifyingContract: AddressSchema,
  })
  .strict();

export type EligibilityAttestationDomain = z.infer<
  typeof EligibilityAttestationDomainSchema
>;

export const SignedEligibilityAttestationSchema = z
  .object({
    attestation: EligibilityAttestationSchema,
    domain: EligibilityAttestationDomainSchema,
    signature: SignatureSchema,
    digest: Bytes32Schema,
    signer: AddressSchema,
  })
  .strict();

export type SignedEligibilityAttestation = z.infer<
  typeof SignedEligibilityAttestationSchema
>;

export const ALIVE_ELIGIBILITY_DOMAIN_NAME = "ALIVE Eligibility Gateway";
export const ALIVE_ELIGIBILITY_DOMAIN_VERSION = "1";
export const ALIVE_ELIGIBILITY_PRIMARY_TYPE = "EligibilityAttestation";
export const ALIVE_ELIGIBILITY_TYPE_STRING =
  "EligibilityAttestation(bytes32 assetIdHash,bool eligible,bytes32 reasonHash,bytes32 passportHash,bytes32 marketSnapshotHash,bytes32 policyHash,uint64 issuedAt,uint64 validUntil,bytes32 nonce)";

export const aliveEligibilityAttestationTypes = {
  EligibilityAttestation: [
    { name: "assetIdHash", type: "bytes32" },
    { name: "eligible", type: "bool" },
    { name: "reasonHash", type: "bytes32" },
    { name: "passportHash", type: "bytes32" },
    { name: "marketSnapshotHash", type: "bytes32" },
    { name: "policyHash", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "validUntil", type: "uint64" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function getAliveEligibilityDomain(
  input: EligibilityAttestationDomain,
): TypedDataDomain {
  const domain = EligibilityAttestationDomainSchema.parse(input);
  return {
    name: ALIVE_ELIGIBILITY_DOMAIN_NAME,
    version: ALIVE_ELIGIBILITY_DOMAIN_VERSION,
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract as Address,
  };
}

export function getAliveEligibilityTypedData(
  attestationInput: EligibilityAttestation,
  domainInput: EligibilityAttestationDomain,
) {
  const attestation = EligibilityAttestationSchema.parse(attestationInput);
  return {
    domain: getAliveEligibilityDomain(domainInput),
    types: aliveEligibilityAttestationTypes,
    primaryType: ALIVE_ELIGIBILITY_PRIMARY_TYPE,
    message: {
      assetIdHash: attestation.assetIdHash as Hex,
      eligible: attestation.eligible,
      reasonHash: attestation.reasonHash as Hex,
      passportHash: attestation.passportHash as Hex,
      marketSnapshotHash: attestation.marketSnapshotHash as Hex,
      policyHash: attestation.policyHash as Hex,
      issuedAt: BigInt(attestation.issuedAt),
      validUntil: BigInt(attestation.validUntil),
      nonce: attestation.nonce as Hex,
    },
  } as const;
}

export function hashAliveEligibilityAttestation(
  attestation: EligibilityAttestation,
  domain: EligibilityAttestationDomain,
): Hex {
  return hashTypedData(getAliveEligibilityTypedData(attestation, domain));
}

export async function recoverAliveEligibilitySigner(
  attestation: EligibilityAttestation,
  domain: EligibilityAttestationDomain,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    ...getAliveEligibilityTypedData(attestation, domain),
    signature,
  });
}
