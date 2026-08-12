import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORE_POLICY,
  basisPointsToRatio,
  ratioToBasisPoints,
  scoreVerification,
  type VerificationSignals,
} from "../src/index.js";

const goodSignals: VerificationSignals = {
  embeddingSimilarity: 0.94,
  localFeatureSimilarity: 0.93,
  identifierSimilarity: 1,
  identifierExpected: true,
  identifierCriticalMismatch: false,
  multiViewConsistency: 0.92,
  challengeCompletion: 1,
  motionConsistency: 0.9,
  captureFreshness: 1,
  replayRisk: 0.03,
  imageQuality: 0.9,
  visualIntegrity: 0.91,
};

describe("verification scoring", () => {
  it("produces transparent bounded ratio and basis-point scores", () => {
    const result = scoreVerification(goodSignals);
    expect(result.verified).toBe(true);
    expect(result.identityScoreBps).toBe(
      ratioToBasisPoints(result.identityScore),
    );
    expect(basisPointsToRatio(result.identityScoreBps)).toBeCloseTo(
      result.identityScore,
      4,
    );
    expect(result.identityScoreBps).toBeGreaterThanOrEqual(
      DEFAULT_SCORE_POLICY.thresholds.identity,
    );
  });

  it("redistributes unavailable identifier weight instead of assuming a match", () => {
    const withoutIdentifier = scoreVerification({
      ...goodSignals,
      identifierExpected: false,
      identifierSimilarity: undefined,
    });
    expect(withoutIdentifier.identityScore).toBeGreaterThan(0.9);
    expect(withoutIdentifier.identityScore).toBeLessThanOrEqual(1);
  });

  it("fails on replay, motion, and a critical identifier mismatch", () => {
    const result = scoreVerification({
      ...goodSignals,
      identifierSimilarity: 0,
      identifierCriticalMismatch: true,
      motionConsistency: 0.05,
      replayRisk: 0.98,
    });
    expect(result.verified).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "IDENTIFIER_MISMATCH",
        "MOTION_INSUFFICIENT",
        "REPLAY_RISK_HIGH",
      ]),
    );
  });
});
