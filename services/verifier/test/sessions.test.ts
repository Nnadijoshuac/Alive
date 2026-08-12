import { describe, expect, it } from "vitest";
import { AliveRepository } from "../src/db/repository.js";
import { createChallenges } from "../src/random.js";
import {
  assetFingerprint,
  assetId,
  challenge,
  owner,
  session,
  verificationBurst,
} from "./helpers.js";

function seededRepository(): AliveRepository {
  const repository = new AliveRepository(":memory:");
  repository.createAsset({
    assetId,
    owner,
    metadata: { name: "Test asset", category: "COMPUTER" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  repository.saveFingerprint(assetFingerprint(), `0x${"77".repeat(32)}`);
  return repository;
}

describe("verification session capabilities", () => {
  it("creates cryptographically random challenge orders and unique IDs", () => {
    const first = createChallenges(true, 6);
    const second = createChallenges(true, 6);
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
    expect(first.map((item) => item.sequence)).toEqual([0, 1, 2, 3, 4]);
    expect(first.map((item) => item.type)).toContain("SHOW_IDENTIFIER");
    expect(first.map((item) => item.type)).not.toContain("MOVE_CLOSER");
    expect(first.map((item) => item.type)).not.toContain("MOVE_AWAY");
    expect(first.map((item) => `${item.type}:${item.id}`)).not.toEqual(
      second.map((item) => `${item.type}:${item.id}`),
    );
  });

  it("expires a session and prevents further capture", () => {
    const repository = seededRepository();
    const created = repository.createSession(
      session({ expiresAt: "2026-01-01T00:00:01.000Z" }),
    );
    expect(
      repository.getSession(
        created.sessionId,
        new Date("2026-01-01T00:00:02.000Z"),
      )?.status,
    ).toBe("EXPIRED");
    expect(() =>
      repository.assertCaptureAllowed(
        created.sessionId,
        created.challenges[0]?.id ?? "",
        new Date("2026-01-01T00:00:02.000Z"),
      ),
    ).toThrow(/expired/i);
    repository.close();
  });

  it("enforces challenge order", () => {
    const repository = seededRepository();
    const first = challenge(0, "31");
    const second = { ...challenge(1, "32"), type: "SHOW_BACK" as const };
    const created = repository.createSession(
      session({ challenges: [first, second] }),
    );
    expect(() =>
      repository.assertCaptureAllowed(
        created.sessionId,
        second.id,
        new Date("2026-01-01T00:00:01.000Z"),
      ),
    ).toThrow(/next challenge/i);
    repository.close();
  });

  it("allows analysis to claim a session only once", () => {
    const repository = seededRepository();
    const complete = {
      ...challenge(0, "39"),
      completedAt: "2026-01-01T00:00:05.000Z",
    };
    const created = repository.createSession(
      session({ challenges: [complete] }),
    );
    const first = repository.beginAnalysis(
      created.sessionId,
      new Date("2026-01-01T00:00:10.000Z"),
    );
    expect(first.session.status).toBe("ANALYZING");
    expect(() =>
      repository.beginAnalysis(
        created.sessionId,
        new Date("2026-01-01T00:00:11.000Z"),
      ),
    ).toThrow(/already/);
    repository.close();
  });

  it("expires a session that crosses its deadline during analysis", () => {
    const repository = seededRepository();
    const complete = {
      ...challenge(0, "38"),
      completedAt: "2026-01-01T00:00:00.500Z",
    };
    const created = repository.createSession(
      session({
        challenges: [complete],
        expiresAt: "2026-01-01T00:00:02.000Z",
      }),
    );
    repository.beginAnalysis(
      created.sessionId,
      new Date("2026-01-01T00:00:01.000Z"),
    );
    expect(() =>
      repository.completeAnalysis(
        created.sessionId,
        {
          assetId,
          sessionId: created.sessionId,
          identityScore: 0.9,
          livenessScore: 0.9,
          integrityScore: 0.9,
          identityScoreBps: 9_000,
          livenessScoreBps: 9_000,
          integrityScoreBps: 9_000,
          verified: true,
          signals: {
            embeddingSimilarity: 0.9,
            localFeatureSimilarity: 0.9,
            identifierExpected: false,
            identifierCriticalMismatch: false,
            multiViewConsistency: 1,
            challengeCompletion: 1,
            motionConsistency: 0.9,
            captureFreshness: 1,
            replayRisk: 0,
            imageQuality: 0.9,
            visualIntegrity: 0.9,
          },
          reasonCodes: [],
          evidenceHash: `0x${"88".repeat(32)}`,
          timestamp: "2026-01-01T00:00:01.000Z",
        },
        "2026-01-01T00:00:03.000Z",
      ),
    ).toThrow(/expired during analysis/i);
    expect(
      repository.getSession(
        created.sessionId,
        new Date("2026-01-01T00:00:03.000Z"),
      )?.status,
    ).toBe("EXPIRED");
    repository.close();
  });

  it("rejects capture reuse for a completed challenge", () => {
    const repository = seededRepository();
    const created = repository.createSession(session());
    const receivedAt = "2026-01-01T00:00:05.000Z";
    repository.addVerificationCapture({
      sessionId: created.sessionId,
      challengeId: created.challenges[0]?.id ?? "",
      evidencePaths: ["memory://one/0", "memory://one/1", "memory://one/2"],
      burstFingerprint: verificationBurst("FRONT"),
      receivedAt,
    });
    expect(() =>
      repository.addVerificationCapture({
        sessionId: created.sessionId,
        challengeId: created.challenges[0]?.id ?? "",
        evidencePaths: ["memory://two/0", "memory://two/1", "memory://two/2"],
        burstFingerprint: verificationBurst("FRONT", ["08", "07", "06"]),
        receivedAt,
      }),
    ).toThrow();
    const snapshot = repository.beginAnalysis(
      created.sessionId,
      new Date("2026-01-01T00:00:06.000Z"),
    );
    expect(snapshot.captures[0]).toMatchObject({
      evidencePaths: ["memory://one/0", "memory://one/1", "memory://one/2"],
      evidenceHashes: [
        `0x${"09".repeat(32)}`,
        `0x${"0a".repeat(32)}`,
        `0x${"0b".repeat(32)}`,
      ],
      intraChallengeMotion: 0.5,
    });
    expect(snapshot.captures[0]?.frameFingerprints).toHaveLength(3);
    repository.close();
  });
});
