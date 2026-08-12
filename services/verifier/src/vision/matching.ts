import {
  createEvidenceCommitment,
  scoreVerification,
  type AssetFingerprint,
  type RegistrationView,
  type ScorePolicy,
  type VerificationResult,
  type VerificationSession,
  type VerificationSignals,
  type VerificationBurstFingerprint,
  type ViewFingerprint,
} from "@alive/shared";
import {
  clamp01,
  cosineSimilarity,
  hammingSimilarity,
  mean,
  median,
} from "./math.js";
import { normalizedIdentifierSimilarity } from "./ocr.js";

export interface AnalyzableCapture {
  challengeId: string;
  capturedAt: string;
  receivedAt: string;
  fingerprint: ViewFingerprint;
  frameFingerprints: VerificationBurstFingerprint["frameFingerprints"];
  intraChallengeMotion: number;
}

interface PairScore {
  registrationView: RegistrationView;
  spatial: number;
  local: number;
  neural?: number;
  combined: number;
  phash: number;
}

function scorePair(
  registration: ViewFingerprint,
  observed: ViewFingerprint,
): PairScore {
  const spatial = cosineSimilarity(
    registration.spatialColorEmbedding,
    observed.spatialColorEmbedding,
  );
  const local = cosineSimilarity(
    registration.gradientDescriptor,
    observed.gradientDescriptor,
  );
  const neural =
    registration.neuralEmbedding !== undefined &&
    observed.neuralEmbedding !== undefined
      ? cosineSimilarity(registration.neuralEmbedding, observed.neuralEmbedding)
      : undefined;
  const combined =
    neural === undefined
      ? spatial * 0.55 + local * 0.45
      : spatial * 0.35 + local * 0.35 + neural * 0.3;
  return {
    registrationView: registration.view,
    spatial,
    local,
    ...(neural === undefined ? {} : { neural }),
    combined,
    phash: hammingSimilarity(
      registration.perceptualHash,
      observed.perceptualHash,
    ),
  };
}

function expectedView(
  challengeType: VerificationSession["challenges"][number]["type"],
): RegistrationView {
  switch (challengeType) {
    case "SHOW_FRONT":
      return "FRONT";
    case "SHOW_BACK":
      return "BACK";
    case "TURN_LEFT":
      return "LEFT";
    case "TURN_RIGHT":
      return "RIGHT";
    case "SHOW_IDENTIFIER":
      return "IDENTIFIER";
    case "MOVE_CLOSER":
    case "MOVE_AWAY":
      return "DETAIL";
  }
}

function frameFreshness(
  session: VerificationSession,
  capturedAt: string,
  receivedAt: string,
): number {
  const captured = Date.parse(capturedAt);
  const received = Date.parse(receivedAt);
  const created = Date.parse(session.createdAt);
  const expires = Date.parse(session.expiresAt);
  if (![captured, received, created, expires].every(Number.isFinite)) return 0;
  if (
    captured < created - 2_000 ||
    captured > expires ||
    received < captured ||
    received > expires + 2_000
  )
    return 0;
  return clamp01(1 - (received - captured) / 120_000);
}

function visualChange(
  previous: ViewFingerprint,
  current: ViewFingerprint,
): number {
  const spatialChange = clamp01(
    1 -
      cosineSimilarity(
        previous.spatialColorEmbedding,
        current.spatialColorEmbedding,
      ),
  );
  const localChange = clamp01(
    1 -
      cosineSimilarity(previous.gradientDescriptor, current.gradientDescriptor),
  );
  const hashChange = clamp01(
    1 - hammingSimilarity(previous.perceptualHash, current.perceptualHash),
  );
  const rawChange =
    spatialChange * 0.35 + localChange * 0.35 + hashChange * 0.3;
  // Small-to-moderate feature movement is expected within a short burst. A
  // total scene substitution is intentionally treated as less credible.
  return clamp01(rawChange / 0.08) * clamp01((0.85 - rawChange) / 0.35);
}

export function computeIntraChallengeMotion(
  frames: VerificationBurstFingerprint["frameFingerprints"],
): number {
  return clamp01(
    mean([
      visualChange(frames[0], frames[1]),
      visualChange(frames[1], frames[2]),
    ]),
  );
}

function crossChallengeMotion(captures: readonly AnalyzableCapture[]): number {
  if (captures.length < 2) return 0;
  const changes: number[] = [];
  for (let index = 1; index < captures.length; index += 1) {
    const previous = captures[index - 1]?.fingerprint;
    const current = captures[index]?.fingerprint;
    if (previous === undefined || current === undefined) continue;
    changes.push(visualChange(previous, current));
  }
  return mean(changes);
}

function motionConsistency(captures: readonly AnalyzableCapture[]): number {
  const intraChallenge = clamp01(
    mean(captures.map((capture) => clamp01(capture.intraChallengeMotion))),
  );
  if (intraChallenge === 0) return 0;
  const crossChallenge =
    captures.length < 2 ? intraChallenge : crossChallengeMotion(captures);
  // Cross-challenge changes may corroborate a burst but can never rescue a
  // static burst sequence. The server-derived intra-burst score dominates.
  return clamp01(
    intraChallenge * 0.85 + Math.min(intraChallenge, crossChallenge) * 0.15,
  );
}

function collectObservedText(captures: readonly AnalyzableCapture[]): string[] {
  return [
    ...new Set(
      captures.flatMap((capture) =>
        capture.frameFingerprints.flatMap((frame) => frame.ocrText),
      ),
    ),
  ];
}

function expectedIdentifiers(fingerprint: AssetFingerprint): string[] {
  return [
    fingerprint.identifiers.serial,
    fingerprint.identifiers.model,
    fingerprint.identifiers.manufacturer,
  ].filter(
    (value): value is string => value !== undefined && value.trim() !== "",
  );
}

export function analyzeVerification(input: {
  session: VerificationSession;
  registration: AssetFingerprint;
  captures: readonly AnalyzableCapture[];
  policy: ScorePolicy;
  now: Date;
}): VerificationResult {
  const { session, registration, captures, policy, now } = input;
  const challengeById = new Map(
    session.challenges.map((challenge) => [
      challenge.id.toLowerCase(),
      challenge,
    ]),
  );
  const pairScores: PairScore[] = [];
  const matchedViews = new Set<RegistrationView>();

  for (const capture of captures) {
    const challenge = challengeById.get(capture.challengeId.toLowerCase());
    const expected =
      challenge === undefined ? undefined : expectedView(challenge.type);
    const candidates = registration.views.map((view) =>
      scorePair(view, capture.fingerprint),
    );
    const preferred = candidates.find(
      (candidate) => candidate.registrationView === expected,
    );
    const best = [...candidates].sort(
      (left, right) => right.combined - left.combined,
    )[0];
    // A response is scored against the requested viewpoint whenever that
    // registration view exists. Silently choosing another, better-matching
    // angle would let a presenter ignore the active challenge.
    const selected = preferred ?? best;
    if (selected !== undefined) {
      pairScores.push(selected);
      matchedViews.add(selected.registrationView);
    }
  }

  const observedText = collectObservedText(captures);
  const identifiers = expectedIdentifiers(registration);
  const identifierExpected = identifiers.length > 0;
  const identifierScores = identifiers.map((identifier) =>
    normalizedIdentifierSimilarity(identifier, observedText),
  );
  const identifierSimilarity =
    identifierExpected && observedText.length > 0
      ? mean(identifierScores)
      : undefined;
  const serialMismatch =
    registration.identifiers.serial !== undefined &&
    observedText.length > 0 &&
    normalizedIdentifierSimilarity(
      registration.identifiers.serial,
      observedText,
    ) < 0.45;
  const burstFrames = captures.flatMap((capture) => capture.frameFingerprints);
  const captureQuality = mean(
    burstFrames.map((frame) =>
      Math.sqrt(frame.quality.blurScore * frame.quality.exposureScore),
    ),
  );
  const embeddingSimilarity = mean(pairScores.map((pair) => pair.spatial));
  const localFeatureSimilarity = mean(pairScores.map((pair) => pair.local));
  const neuralValues = pairScores.flatMap((pair) =>
    pair.neural === undefined ? [] : [pair.neural],
  );
  const neuralSimilarity =
    neuralValues.length === 0 ? undefined : mean(neuralValues);
  const multiViewConsistency = clamp01(
    matchedViews.size /
      Math.max(
        1,
        Math.min(registration.views.length, session.challenges.length),
      ),
  );
  const replaySimilarities = burstFrames.map((frame) =>
    Math.max(
      ...registration.views.map((view) =>
        hammingSimilarity(view.perceptualHash, frame.perceptualHash),
      ),
    ),
  );
  const exactReplay = burstFrames.some((frame) =>
    registration.views.some(
      (view) =>
        view.evidenceHash.toLowerCase() === frame.evidenceHash.toLowerCase(),
    ),
  );
  const highHashMatches = replaySimilarities.filter(
    (similarity) => similarity >= 0.96875,
  ).length;
  const replayRisk = exactReplay
    ? 1
    : clamp01(
        (highHashMatches / Math.max(1, burstFrames.length)) * 0.8 +
          Math.max(0, median(replaySimilarities) - 0.9),
      );
  const challengeCompletion = clamp01(
    captures.length / session.challenges.length,
  );
  const motion = motionConsistency(captures);
  const captureFreshness = mean(
    captures.flatMap((capture) =>
      capture.frameFingerprints.map((frame) =>
        frameFreshness(session, frame.capturedAt, capture.receivedAt),
      ),
    ),
  );
  const visualIntegrity = clamp01(
    localFeatureSimilarity * 0.45 +
      embeddingSimilarity * 0.35 +
      multiViewConsistency * 0.2,
  );

  const signals: VerificationSignals = {
    embeddingSimilarity,
    localFeatureSimilarity,
    ...(identifierSimilarity === undefined ? {} : { identifierSimilarity }),
    identifierExpected,
    identifierCriticalMismatch: serialMismatch,
    multiViewConsistency,
    challengeCompletion,
    motionConsistency: motion,
    captureFreshness,
    replayRisk,
    imageQuality: captureQuality,
    visualIntegrity,
    ...(neuralSimilarity === undefined ? {} : { neuralSimilarity }),
  };
  const scored = scoreVerification(signals, policy);
  const timestamp = now.toISOString();
  const evidenceHash = createEvidenceCommitment({
    commitmentVersion: 1,
    assetId: session.assetId,
    sessionId: session.sessionId,
    nonce: session.nonce,
    context: session.context,
    challenges: session.challenges.map(({ id, sequence, type }) => ({
      id,
      sequence,
      type,
    })),
    captureBursts: captures.map((capture) => ({
      challengeId: capture.challengeId,
      frames: capture.frameFingerprints.map((frame) => ({
        evidenceHash: frame.evidenceHash,
        capturedAt: frame.capturedAt,
      })),
      intraChallengeMotion: capture.intraChallengeMotion,
    })),
    registrationFingerprintHash: createEvidenceCommitment(registration),
    signals,
    scores: {
      identity: scored.identityScoreBps,
      liveness: scored.livenessScoreBps,
      integrity: scored.integrityScoreBps,
    },
  });

  return {
    assetId: session.assetId,
    sessionId: session.sessionId,
    identityScore: scored.identityScore,
    livenessScore: scored.livenessScore,
    integrityScore: scored.integrityScore,
    identityScoreBps: scored.identityScoreBps,
    livenessScoreBps: scored.livenessScoreBps,
    integrityScoreBps: scored.integrityScoreBps,
    verified: scored.verified,
    signals,
    reasonCodes: scored.reasonCodes,
    evidenceHash,
    timestamp,
  };
}
