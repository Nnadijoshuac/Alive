import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORE_POLICY,
  type AssetFingerprint,
  type RegistrationView,
  type VerificationChallenge,
  type VerificationSession,
  type ViewFingerprint,
} from "@alive/shared";
import { extractViewFingerprint } from "../src/vision/features.js";
import { analyzeVerification, computeIntraChallengeMotion } from "../src/vision/matching.js";
import { cosineSimilarity } from "../src/vision/math.js";
import { assetId, owner, zeroBytes32 } from "./helpers.js";

async function synthetic(seed: number, perturbation = 0): Promise<Buffer> {
  const width = 192;
  const height = 192;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const checker = ((Math.floor(x / (11 + (seed % 5))) + Math.floor(y / (13 + (seed % 7)))) % 2) * 74;
      data[offset] = (x * (3 + (seed % 4)) + y + checker + seed * 17 + perturbation) % 256;
      data[offset + 1] = (y * (4 + (seed % 3)) + x * 2 + checker + seed * 23 + perturbation) % 256;
      data[offset + 2] = ((x ^ (y + seed * 9)) + checker + perturbation) % 256;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).jpeg({ quality: perturbation === 0 ? 92 : 78 }).toBuffer();
}

const views: RegistrationView[] = ["FRONT", "BACK", "LEFT", "RIGHT"];
const challengeTypes = ["SHOW_FRONT", "SHOW_BACK", "TURN_LEFT", "TURN_RIGHT"] as const;

function burst(fingerprint: ViewFingerprint, intraChallengeMotion = 0.75) {
  return {
    frameFingerprints: [fingerprint, fingerprint, fingerprint] as [ViewFingerprint, ViewFingerprint, ViewFingerprint],
    intraChallengeMotion,
  };
}

describe("image-dependent instance matching", () => {
  it("derives stronger visual similarity for the same patterned object than a different one", async () => {
    const original = await extractViewFingerprint(await synthetic(3), {
      view: "FRONT",
      capturedAt: "2026-01-01T00:00:00.000Z",
      enableOcr: false,
      enableNeuralEmbedding: false,
      neuralModel: "unused",
    });
    const sameObject = await extractViewFingerprint(await synthetic(3, 2), {
      view: "FRONT",
      capturedAt: "2026-01-01T00:00:02.000Z",
      enableOcr: false,
      enableNeuralEmbedding: false,
      neuralModel: "unused",
    });
    const differentObject = await extractViewFingerprint(await synthetic(41, 2), {
      view: "FRONT",
      capturedAt: "2026-01-01T00:00:02.000Z",
      enableOcr: false,
      enableNeuralEmbedding: false,
      neuralModel: "unused",
    });
    const sameScore =
      cosineSimilarity(original.spatialColorEmbedding, sameObject.spatialColorEmbedding) * 0.55 +
      cosineSimilarity(original.gradientDescriptor, sameObject.gradientDescriptor) * 0.45;
    const differentScore =
      cosineSimilarity(original.spatialColorEmbedding, differentObject.spatialColorEmbedding) * 0.55 +
      cosineSimilarity(original.gradientDescriptor, differentObject.gradientDescriptor) * 0.45;
    expect(sameScore).toBeGreaterThan(differentScore + 0.08);
    expect(original.evidenceHash).not.toBe(sameObject.evidenceHash);
  });

  it("derives zero motion for an identical burst and nonzero bounded motion for real visual changes", async () => {
    const first = await extractViewFingerprint(await synthetic(12), {
      view: "FRONT",
      capturedAt: "2026-01-01T00:00:01.000Z",
      enableOcr: false,
      enableNeuralEmbedding: false,
      neuralModel: "unused",
    });
    const second = await extractViewFingerprint(await synthetic(12, 2), {
      view: "FRONT",
      capturedAt: "2026-01-01T00:00:01.100Z",
      enableOcr: false,
      enableNeuralEmbedding: false,
      neuralModel: "unused",
    });
    const third = await extractViewFingerprint(await synthetic(12, 4), {
      view: "FRONT",
      capturedAt: "2026-01-01T00:00:01.200Z",
      enableOcr: false,
      enableNeuralEmbedding: false,
      neuralModel: "unused",
    });
    expect(computeIntraChallengeMotion([first, first, first])).toBe(0);
    const changed = computeIntraChallengeMotion([first, second, third]);
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(1);
  });

  it("raises the aggregate identity score only from derived capture features", async () => {
    const registrationViews = await Promise.all(
      views.map(async (view, index) =>
        extractViewFingerprint(await synthetic(index + 2), {
          view,
          capturedAt: "2026-01-01T00:00:00.000Z",
          enableOcr: false,
          enableNeuralEmbedding: false,
          neuralModel: "unused",
        }),
      ),
    );
    const fingerprint: AssetFingerprint = {
      fingerprintVersion: 1,
      assetId,
      views: registrationViews,
      identifiers: { normalizedText: [], source: "NONE" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const challenges: VerificationChallenge[] = challengeTypes.map((type, sequence) => ({
      id: `0x${String(sequence + 1).padStart(2, "0").repeat(32)}` as `0x${string}`,
      sequence,
      type,
      prompt: type,
      completedAt: `2026-01-01T00:00:0${sequence + 2}.000Z`,
    }));
    const session: VerificationSession = {
      sessionId: `0x${"61".repeat(32)}`,
      assetId,
      wallet: owner,
      nonce: `0x${"62".repeat(32)}`,
      context: zeroBytes32,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
      status: "ANALYZING",
      challenges,
    };
    async function captures(seedOffset: number) {
      return Promise.all(
        views.map(async (view, index) => {
          const fingerprint = await extractViewFingerprint(await synthetic(index + 2 + seedOffset, 2), {
            view,
            capturedAt: `2026-01-01T00:00:0${index + 2}.000Z`,
            enableOcr: false,
            enableNeuralEmbedding: false,
            neuralModel: "unused",
          });
          return {
            challengeId: challenges[index]!.id,
            capturedAt: `2026-01-01T00:00:0${index + 2}.000Z`,
            receivedAt: `2026-01-01T00:00:0${index + 2}.500Z`,
            fingerprint,
            ...burst(fingerprint),
          };
        }),
      );
    }
    const genuine = analyzeVerification({
      session,
      registration: fingerprint,
      captures: await captures(0),
      policy: DEFAULT_SCORE_POLICY,
      now: new Date("2026-01-01T00:00:10.000Z"),
    });
    const substitution = analyzeVerification({
      session,
      registration: fingerprint,
      captures: await captures(50),
      policy: DEFAULT_SCORE_POLICY,
      now: new Date("2026-01-01T00:00:10.000Z"),
    });
    expect(genuine.identityScore).toBeGreaterThan(substitution.identityScore + 0.05);
  });

  it("reweights identity when expected identifier text is not observed", async () => {
    const registrationView = await extractViewFingerprint(await synthetic(7), {
      view: "FRONT",
      capturedAt: "2026-01-01T00:00:00.000Z",
      enableOcr: false,
      enableNeuralEmbedding: false,
      neuralModel: "unused",
    });
    const observation = await extractViewFingerprint(await synthetic(7, 2), {
      view: "FRONT",
      capturedAt: "2026-01-01T00:00:02.000Z",
      enableOcr: false,
      enableNeuralEmbedding: false,
      neuralModel: "unused",
    });
    const verificationChallenge: VerificationChallenge = {
      id: `0x${"71".repeat(32)}`,
      sequence: 0,
      type: "SHOW_FRONT",
      prompt: "Show front",
      completedAt: "2026-01-01T00:00:02.500Z",
    };
    const verificationSession: VerificationSession = {
      sessionId: `0x${"72".repeat(32)}`,
      assetId,
      wallet: owner,
      nonce: `0x${"73".repeat(32)}`,
      context: zeroBytes32,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
      status: "ANALYZING",
      challenges: [verificationChallenge],
    };
    const captures = [{
      challengeId: verificationChallenge.id,
      capturedAt: "2026-01-01T00:00:02.000Z",
      receivedAt: "2026-01-01T00:00:02.500Z",
      fingerprint: observation,
      ...burst(observation),
    }];
    const base = {
      fingerprintVersion: 1 as const,
      assetId,
      views: [registrationView],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const withoutIdentifier = analyzeVerification({
      session: verificationSession,
      registration: { ...base, identifiers: { normalizedText: [], source: "NONE" } },
      captures,
      policy: DEFAULT_SCORE_POLICY,
      now: new Date("2026-01-01T00:00:03.000Z"),
    });
    const unavailableIdentifier = analyzeVerification({
      session: verificationSession,
      registration: {
        ...base,
        identifiers: { model: "MODEL-7", normalizedText: ["MODEL", "7"], source: "USER" },
      },
      captures,
      policy: DEFAULT_SCORE_POLICY,
      now: new Date("2026-01-01T00:00:03.000Z"),
    });
    expect(unavailableIdentifier.signals.identifierExpected).toBe(true);
    expect(unavailableIdentifier.signals.identifierSimilarity).toBeUndefined();
    expect(unavailableIdentifier.identityScoreBps).toBe(withoutIdentifier.identityScoreBps);
  });
});
