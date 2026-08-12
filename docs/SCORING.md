# Verification scoring

## Principle

No single signal establishes physical identity. ALIVE combines multiple observable signals, returns the underlying values, and emits machine-readable reasons whenever policy fails. Scores are estimates from the submitted camera evidence, not probabilities of legal authenticity.

The canonical policy lives in `packages/shared/src/scoring.ts`. Override it only with a complete, schema-valid `ALIVE_SCORE_POLICY_JSON`; partial policy objects are rejected at startup.

## Pairing an observation with registration views

Each verification observation is compared with every registered view.

Without a neural vector, the candidate-pair score is:

```text
55% spatial color similarity + 45% local gradient similarity
```

When both frames have neural vectors:

```text
35% spatial color + 35% local gradient + 30% neural similarity
```

That combined value is diagnostic when the requested registration view is missing. Whenever the requested registration view exists, the observation is scored against that exact view; the verifier never silently substitutes a better-matching angle. The optional neural signal is reported diagnostically and can participate in a fallback pair when a baseline view is absent, but it is not currently an additional direct term in the final identity aggregate.

## Identity score

Default weights when an identifier is expected and available:

| Signal                   | Weight | Current implementation                                           |
| ------------------------ | -----: | ---------------------------------------------------------------- |
| `embeddingSimilarity`    |    45% | Mean cosine similarity of spatial RGB histogram embeddings       |
| `localFeatureSimilarity` |    30% | Mean cosine similarity of gradient-orientation descriptors       |
| `identifierSimilarity`   |    15% | Normalized serial, model, and manufacturer token similarity      |
| `multiViewConsistency`   |    10% | Distinct matched baseline views relative to available challenges |

When no trusted identifier exists, its weight is excluded and the available 8,500 basis points are normalized. The effective remaining weights become approximately 52.94% spatial, 35.29% local, and 11.76% multi-view.

A visible serial that scores below `0.45` against observed OCR tokens is treated as a critical mismatch. With the default policy, that emits `IDENTIFIER_MISMATCH` even if the weighted aggregate is high.

## Liveness score

| Signal                | Weight | Meaning                                                                           |
| --------------------- | -----: | --------------------------------------------------------------------------------- |
| `challengeCompletion` |    45% | Accepted three-frame bursts divided by issued challenges                          |
| `motionConsistency`   |    25% | Server-derived bounded change inside bursts, combined with cross-challenge change |
| `captureFreshness`    |    15% | All frame timestamps relative to server receipt, burst order, and session window  |
| `replaySafety`        |    15% | `1 - replayRisk` from ordered byte hashes and perceptual hashes                   |

Each challenge requires exactly three frames with strictly increasing timestamps across no more than five seconds. The server quality-checks and fingerprints every frame, computes intra-burst motion itself, then sets `motionConsistency` to 85% mean intra-burst motion plus 15% of the smaller of intra-burst and cross-challenge motion. Moving only between challenges cannot rescue motionless bursts. Motion is expected, but a total visual discontinuity is also suspicious, so the transform rewards bounded change rather than treating maximum change as automatically live.

Liveness is active camera evidence. It is not bank-grade presentation-attack detection and cannot rule out synchronized screens, camera injection, relay, or sophisticated generated video.

## Visual integrity score

The base visual-integrity signal is:

```text
45% local feature similarity
+ 35% spatial embedding similarity
+ 20% multi-view consistency
```

The final integrity aggregate is:

| Signal                   | Weight |
| ------------------------ | -----: |
| Base `visualIntegrity`   |    60% |
| Local feature similarity |    20% |
| Multi-view consistency   |    10% |
| Image quality            |    10% |

The product must label this `Visual integrity` or `Observable change`. It does not inspect hidden components, grade condition, appraise value, or certify authenticity.

## Default thresholds

| Policy                     | Basis points | Ratio |
| -------------------------- | -----------: | ----: |
| Minimum identity           |        8,500 |  0.85 |
| Minimum liveness           |        8,000 |  0.80 |
| Minimum visual integrity   |        6,000 |  0.60 |
| Maximum replay risk        |        3,500 |  0.35 |
| Minimum motion consistency |        2,500 |  0.25 |
| Minimum image quality      |        3,000 |  0.30 |

All onchain scores are integers from `0` to `10,000`; `9,120` means `91.20%`. The result is verified only when no policy reason code is emitted.

## Reason codes produced by scoring

- `IDENTITY_BELOW_THRESHOLD`
- `LIVENESS_BELOW_THRESHOLD`
- `INTEGRITY_BELOW_THRESHOLD`
- `REPLAY_RISK_HIGH`
- `MOTION_INSUFFICIENT`
- `CAPTURE_QUALITY_LOW`
- `IDENTIFIER_MISMATCH`

Session and capture state can additionally reject a request with codes such as `SESSION_INVALID`, `CHALLENGE_OUT_OF_ORDER`, `CHALLENGE_INCOMPLETE`, `CAPTURE_STALE`, and `INSUFFICIENT_VIEWS` before an aggregate is produced.

## Evidence commitment

The verification evidence hash commits to a `captureBursts` array whose entries contain the challenge ID, the three ordered `{ evidenceHash, capturedAt }` frame records, and `intraChallengeMotion`, together with:

- asset and session IDs;
- random nonce;
- immutable context;
- issued challenge IDs, sequence, and types;
- registration fingerprint commitment;
- raw signals;
- all three basis-point scores.

The commitment proves that the signed result refers to one canonical evidence package. It does not make the private evidence publicly available or independently prove the verifier computed it honestly.

## Calibration protocol

Do not publish accuracy, false-accept, or false-reject claims from the current unit tests. A meaningful calibration set should include:

1. the same physical unit under realistic lighting, distance, orientation, and camera variation;
2. a different unit of the same manufacturer and model;
3. visually unrelated objects;
4. static registration images shown on paper and screens;
5. prerecorded sequences attempting to follow challenges;
6. glare, blur, partial occlusion, and low-light failures;
7. readable, unreadable, absent, and forged identifiers.

Keep real fixtures outside tracked source, record device and environment metadata, and report both false accept and false reject rates by asset class. Threshold changes must remain evidence-driven and must never replace computed signals with fixed demo outcomes.
