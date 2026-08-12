import { z } from "zod";
import type { Address, Hex } from "viem";

export const HexSchema = z.custom<Hex>(
  (value) => typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value),
  "Expected a 0x-prefixed hex value",
);
export const Bytes32Schema = z.custom<Hex>(
  (value) => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value),
  "Expected bytes32 hex",
);
export const AddressSchema = z.custom<Address>(
  (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value),
  "Expected an EVM address",
);
export const SignatureSchema = z.custom<Hex>(
  (value) => typeof value === "string" && /^0x[0-9a-fA-F]{130}$/.test(value),
  "Expected a 65-byte signature",
);
export const IsoDateSchema = z.string().datetime({ offset: true });
export const RatioSchema = z.number().finite().min(0).max(1);
export const BasisPointsSchema = z.number().int().min(0).max(10_000);

export const AssetCategorySchema = z.enum([
  "COMPUTER",
  "PHONE",
  "CAMERA",
  "WATCH",
  "FOOTWEAR",
  "CONSOLE",
  "ELECTRONICS",
  "MACHINERY",
  "OTHER",
]);

export const RegistrationViewSchema = z.enum([
  "FRONT",
  "LEFT",
  "RIGHT",
  "BACK",
  "DETAIL",
  "IDENTIFIER",
]);

export const REQUIRED_REGISTRATION_VIEWS = ["FRONT", "LEFT", "RIGHT", "BACK", "DETAIL"] as const;

export const AssetMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: AssetCategorySchema,
    manufacturer: z.string().trim().min(1).max(120).optional(),
    model: z.string().trim().min(1).max(160).optional(),
    serialNumber: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const AssetCreateRequestSchema = z
  .object({
    owner: AddressSchema,
    metadata: AssetMetadataSchema,
  })
  .strict();

export const AssetRecordSchema = z
  .object({
    assetId: Bytes32Schema,
    owner: AddressSchema,
    metadata: AssetMetadataSchema,
    createdAt: IsoDateSchema,
    fingerprintHash: Bytes32Schema.nullable(),
    registrationViewCount: z.number().int().nonnegative(),
  })
  .strict();

export const CaptureQualitySchema = z
  .object({
    blurScore: RatioSchema,
    exposureScore: RatioSchema,
    usable: z.boolean(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export const ImageCaptureSchema = z
  .object({
    imageBase64: z.string().min(16),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    capturedAt: IsoDateSchema,
  })
  .strict();

export const RegistrationCaptureRequestSchema = ImageCaptureSchema.extend({
  view: RegistrationViewSchema,
}).strict();

export const IdentifierDataSchema = z
  .object({
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    serial: z.string().optional(),
    normalizedText: z.array(z.string()),
    source: z.enum(["USER", "OCR", "COMBINED", "NONE"]),
  })
  .strict();

export const ViewFingerprintSchema = z
  .object({
    view: RegistrationViewSchema,
    evidenceHash: Bytes32Schema,
    spatialColorEmbedding: z.array(z.number().finite()).min(1),
    gradientDescriptor: z.array(z.number().finite()).min(1),
    neuralEmbedding: z.array(z.number().finite()).min(1).optional(),
    perceptualHash: z.string().regex(/^[0-9a-f]{16}$/),
    quality: CaptureQualitySchema,
    ocrText: z.array(z.string()),
    capturedAt: IsoDateSchema,
  })
  .strict();

export const AssetFingerprintSchema = z
  .object({
    fingerprintVersion: z.literal(1),
    assetId: Bytes32Schema,
    views: z.array(ViewFingerprintSchema).min(1),
    identifiers: IdentifierDataSchema,
    createdAt: IsoDateSchema,
  })
  .strict();

export const ChallengeTypeSchema = z.enum([
  "SHOW_FRONT",
  "SHOW_BACK",
  "TURN_LEFT",
  "TURN_RIGHT",
  "SHOW_IDENTIFIER",
  "MOVE_CLOSER",
  "MOVE_AWAY",
]);

export const VerificationChallengeSchema = z
  .object({
    id: Bytes32Schema,
    sequence: z.number().int().nonnegative(),
    type: ChallengeTypeSchema,
    prompt: z.string().min(1),
    completedAt: IsoDateSchema.nullable(),
  })
  .strict();

export const VerificationSessionStatusSchema = z.enum([
  "PENDING",
  "ANALYZING",
  "ANALYZED",
  "ATTESTED",
  "EXPIRED",
]);

export const VerificationSessionCreateSchema = z
  .object({
    assetId: Bytes32Schema,
    wallet: AddressSchema,
    context: Bytes32Schema.optional(),
  })
  .strict();

export const VerificationSessionSchema = z
  .object({
    sessionId: Bytes32Schema,
    assetId: Bytes32Schema,
    wallet: AddressSchema,
    nonce: Bytes32Schema,
    context: Bytes32Schema,
    createdAt: IsoDateSchema,
    expiresAt: IsoDateSchema,
    status: VerificationSessionStatusSchema,
    challenges: z.array(VerificationChallengeSchema).min(1),
  })
  .strict();

export const VerificationCaptureRequestSchema = ImageCaptureSchema.extend({
  challengeId: Bytes32Schema,
}).strict();

export const VerificationSignalsSchema = z
  .object({
    embeddingSimilarity: RatioSchema,
    localFeatureSimilarity: RatioSchema,
    identifierSimilarity: RatioSchema.optional(),
    identifierExpected: z.boolean(),
    identifierCriticalMismatch: z.boolean(),
    multiViewConsistency: RatioSchema,
    challengeCompletion: RatioSchema,
    motionConsistency: RatioSchema,
    captureFreshness: RatioSchema,
    replayRisk: RatioSchema,
    imageQuality: RatioSchema,
    visualIntegrity: RatioSchema,
    neuralSimilarity: RatioSchema.optional(),
  })
  .strict();

export const ReasonCodeSchema = z.enum([
  "SESSION_EXPIRED",
  "SESSION_ALREADY_USED",
  "SESSION_INVALID",
  "CHALLENGE_OUT_OF_ORDER",
  "CHALLENGE_INCOMPLETE",
  "CAPTURE_STALE",
  "CAPTURE_QUALITY_LOW",
  "INSUFFICIENT_VIEWS",
  "IDENTITY_BELOW_THRESHOLD",
  "LIVENESS_BELOW_THRESHOLD",
  "INTEGRITY_BELOW_THRESHOLD",
  "IDENTIFIER_MISMATCH",
  "REPLAY_RISK_HIGH",
  "MOTION_INSUFFICIENT",
  "VISUAL_MISMATCH",
  "OCR_UNAVAILABLE",
  "NEURAL_EMBEDDING_UNAVAILABLE",
]);

export const VerificationResultSchema = z
  .object({
    assetId: Bytes32Schema,
    sessionId: Bytes32Schema,
    identityScore: RatioSchema,
    livenessScore: RatioSchema,
    integrityScore: RatioSchema,
    identityScoreBps: BasisPointsSchema,
    livenessScoreBps: BasisPointsSchema,
    integrityScoreBps: BasisPointsSchema,
    verified: z.boolean(),
    signals: VerificationSignalsSchema,
    reasonCodes: z.array(ReasonCodeSchema),
    evidenceHash: Bytes32Schema,
    timestamp: IsoDateSchema,
  })
  .strict();

export const AliveAttestationSchema = z
  .object({
    assetId: Bytes32Schema,
    sessionId: Bytes32Schema,
    subject: AddressSchema,
    context: Bytes32Schema,
    identityScore: BasisPointsSchema,
    livenessScore: BasisPointsSchema,
    integrityScore: BasisPointsSchema,
    verified: z.boolean(),
    evidenceHash: Bytes32Schema,
    issuedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    expiresAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine((value) => value.expiresAt > value.issuedAt, {
    message: "Attestation expiry must be after issue time",
    path: ["expiresAt"],
  });

export const AttestationDomainSchema = z
  .object({
    chainId: z.number().int().positive(),
    verifyingContract: AddressSchema,
  })
  .strict();

export const SignedAttestationSchema = z
  .object({
    attestation: AliveAttestationSchema,
    domain: AttestationDomainSchema,
    signature: SignatureSchema,
    digest: Bytes32Schema,
    signer: AddressSchema,
  })
  .strict();

export type AssetCategory = z.infer<typeof AssetCategorySchema>;
export type RegistrationView = z.infer<typeof RegistrationViewSchema>;
export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;
export type AssetCreateRequest = z.infer<typeof AssetCreateRequestSchema>;
export type AssetRecord = z.infer<typeof AssetRecordSchema>;
export type CaptureQuality = z.infer<typeof CaptureQualitySchema>;
export type RegistrationCaptureRequest = z.infer<typeof RegistrationCaptureRequestSchema>;
export type IdentifierData = z.infer<typeof IdentifierDataSchema>;
export type ViewFingerprint = z.infer<typeof ViewFingerprintSchema>;
export type AssetFingerprint = z.infer<typeof AssetFingerprintSchema>;
export type ChallengeType = z.infer<typeof ChallengeTypeSchema>;
export type VerificationChallenge = z.infer<typeof VerificationChallengeSchema>;
export type VerificationSessionStatus = z.infer<typeof VerificationSessionStatusSchema>;
export type VerificationSessionCreate = z.infer<typeof VerificationSessionCreateSchema>;
export type VerificationSession = z.infer<typeof VerificationSessionSchema>;
export type VerificationCaptureRequest = z.infer<typeof VerificationCaptureRequestSchema>;
export type VerificationSignals = z.infer<typeof VerificationSignalsSchema>;
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
export type AliveAttestation = z.infer<typeof AliveAttestationSchema>;
export type AttestationDomain = z.infer<typeof AttestationDomainSchema>;
export type SignedAttestation = z.infer<typeof SignedAttestationSchema>;
