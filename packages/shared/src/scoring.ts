import { z } from "zod";
import {
  BasisPointsSchema,
  RatioSchema,
  VerificationSignalsSchema,
  type ReasonCode,
  type VerificationSignals,
} from "./schemas.js";

const WeightSetSchema = z.record(z.string(), BasisPointsSchema).refine(
  (weights) => Object.values(weights).reduce((sum, value) => sum + value, 0) === 10_000,
  "Weights must total 10,000 basis points",
);

export const ScorePolicySchema = z
  .object({
    thresholds: z
      .object({
        identity: BasisPointsSchema,
        liveness: BasisPointsSchema,
        integrity: BasisPointsSchema,
        maximumReplayRisk: BasisPointsSchema,
        minimumMotion: BasisPointsSchema,
        minimumImageQuality: BasisPointsSchema,
      })
      .strict(),
    identityWeights: WeightSetSchema,
    livenessWeights: WeightSetSchema,
    integrityWeights: WeightSetSchema,
    criticalIdentifierMismatchFails: z.boolean(),
  })
  .strict();

export type ScorePolicy = z.infer<typeof ScorePolicySchema>;

export const DEFAULT_SCORE_POLICY: ScorePolicy = ScorePolicySchema.parse({
  thresholds: {
    identity: 8_500,
    liveness: 8_000,
    integrity: 6_000,
    maximumReplayRisk: 3_500,
    minimumMotion: 2_500,
    minimumImageQuality: 3_000,
  },
  identityWeights: {
    embeddingSimilarity: 4_500,
    localFeatureSimilarity: 3_000,
    identifierSimilarity: 1_500,
    multiViewConsistency: 1_000,
  },
  livenessWeights: {
    challengeCompletion: 4_500,
    motionConsistency: 2_500,
    captureFreshness: 1_500,
    replaySafety: 1_500,
  },
  integrityWeights: {
    visualIntegrity: 6_000,
    localFeatureSimilarity: 2_000,
    multiViewConsistency: 1_000,
    imageQuality: 1_000,
  },
  criticalIdentifierMismatchFails: true,
});

export function ratioToBasisPoints(ratio: number): number {
  return Math.round(RatioSchema.parse(ratio) * 10_000);
}

export function basisPointsToRatio(basisPoints: number): number {
  return BasisPointsSchema.parse(basisPoints) / 10_000;
}

function weightedScore(values: Record<string, number | undefined>, weights: Record<string, number>): number {
  let weighted = 0;
  let availableWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = values[key];
    if (value === undefined) continue;
    weighted += RatioSchema.parse(value) * weight;
    availableWeight += weight;
  }
  return availableWeight === 0 ? 0 : weighted / availableWeight;
}

export interface ScoredVerification {
  identityScore: number;
  livenessScore: number;
  integrityScore: number;
  identityScoreBps: number;
  livenessScoreBps: number;
  integrityScoreBps: number;
  verified: boolean;
  reasonCodes: ReasonCode[];
}

export function scoreVerification(
  rawSignals: VerificationSignals,
  rawPolicy: ScorePolicy = DEFAULT_SCORE_POLICY,
): ScoredVerification {
  const signals = VerificationSignalsSchema.parse(rawSignals);
  const policy = ScorePolicySchema.parse(rawPolicy);
  const identifierSimilarity = signals.identifierExpected ? signals.identifierSimilarity : undefined;

  const identityScore = weightedScore(
    {
      embeddingSimilarity: signals.embeddingSimilarity,
      localFeatureSimilarity: signals.localFeatureSimilarity,
      identifierSimilarity,
      multiViewConsistency: signals.multiViewConsistency,
    },
    policy.identityWeights,
  );
  const livenessScore = weightedScore(
    {
      challengeCompletion: signals.challengeCompletion,
      motionConsistency: signals.motionConsistency,
      captureFreshness: signals.captureFreshness,
      replaySafety: 1 - signals.replayRisk,
    },
    policy.livenessWeights,
  );
  const integrityScore = weightedScore(
    {
      visualIntegrity: signals.visualIntegrity,
      localFeatureSimilarity: signals.localFeatureSimilarity,
      multiViewConsistency: signals.multiViewConsistency,
      imageQuality: signals.imageQuality,
    },
    policy.integrityWeights,
  );

  const identityScoreBps = ratioToBasisPoints(identityScore);
  const livenessScoreBps = ratioToBasisPoints(livenessScore);
  const integrityScoreBps = ratioToBasisPoints(integrityScore);
  const reasonCodes: ReasonCode[] = [];

  if (identityScoreBps < policy.thresholds.identity) reasonCodes.push("IDENTITY_BELOW_THRESHOLD");
  if (livenessScoreBps < policy.thresholds.liveness) reasonCodes.push("LIVENESS_BELOW_THRESHOLD");
  if (integrityScoreBps < policy.thresholds.integrity) reasonCodes.push("INTEGRITY_BELOW_THRESHOLD");
  if (signals.replayRisk * 10_000 > policy.thresholds.maximumReplayRisk) reasonCodes.push("REPLAY_RISK_HIGH");
  if (signals.motionConsistency * 10_000 < policy.thresholds.minimumMotion) reasonCodes.push("MOTION_INSUFFICIENT");
  if (signals.imageQuality * 10_000 < policy.thresholds.minimumImageQuality) reasonCodes.push("CAPTURE_QUALITY_LOW");
  if (policy.criticalIdentifierMismatchFails && signals.identifierCriticalMismatch) {
    reasonCodes.push("IDENTIFIER_MISMATCH");
  }

  return {
    identityScore,
    livenessScore,
    integrityScore,
    identityScoreBps,
    livenessScoreBps,
    integrityScoreBps,
    verified: reasonCodes.length === 0,
    reasonCodes,
  };
}
