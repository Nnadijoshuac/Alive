import { describe, expect, it } from "vitest";
import { AliveRepository } from "../src/db/repository.js";
import { createChallenges } from "../src/random.js";
import { assetFingerprint, assetId, challenge, owner, session, viewFingerprint } from "./helpers.js";

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
    expect(first.map((item) => item.sequence)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(first.map((item) => `${item.type}:${item.id}`)).not.toEqual(second.map((item) => `${item.type}:${item.id}`));
  });

  it("expires a session and prevents further capture", () => {
    const repository = seededRepository();
    const created = repository.createSession(
      session({ expiresAt: "2026-01-01T00:00:01.000Z" }),
    );
    expect(repository.getSession(created.sessionId, new Date("2026-01-01T00:00:02.000Z"))?.status).toBe("EXPIRED");
    expect(() =>
      repository.assertCaptureAllowed(created.sessionId, created.challenges[0]?.id ?? "", new Date("2026-01-01T00:00:02.000Z")),
    ).toThrow(/expired/i);
    repository.close();
  });

  it("enforces challenge order", () => {
    const repository = seededRepository();
    const first = challenge(0, "31");
    const second = { ...challenge(1, "32"), type: "SHOW_BACK" as const };
    const created = repository.createSession(session({ challenges: [first, second] }));
    expect(() =>
      repository.assertCaptureAllowed(created.sessionId, second.id, new Date("2026-01-01T00:00:01.000Z")),
    ).toThrow(/next challenge/i);
    repository.close();
  });

  it("allows analysis to claim a session only once", () => {
    const repository = seededRepository();
    const complete = { ...challenge(0, "39"), completedAt: "2026-01-01T00:00:05.000Z" };
    const created = repository.createSession(session({ challenges: [complete] }));
    const first = repository.beginAnalysis(created.sessionId, new Date("2026-01-01T00:00:10.000Z"));
    expect(first.session.status).toBe("ANALYZING");
    expect(() => repository.beginAnalysis(created.sessionId, new Date("2026-01-01T00:00:11.000Z"))).toThrow(/already/);
    repository.close();
  });

  it("rejects capture reuse for a completed challenge", () => {
    const repository = seededRepository();
    const created = repository.createSession(session());
    const receivedAt = "2026-01-01T00:00:05.000Z";
    repository.addVerificationCapture({
      sessionId: created.sessionId,
      challengeId: created.challenges[0]?.id ?? "",
      evidencePath: "memory://one",
      fingerprint: viewFingerprint("FRONT", "09"),
      capturedAt: receivedAt,
      receivedAt,
    });
    expect(() =>
      repository.addVerificationCapture({
        sessionId: created.sessionId,
        challengeId: created.challenges[0]?.id ?? "",
        evidencePath: "memory://two",
        fingerprint: viewFingerprint("FRONT", "08"),
        capturedAt: receivedAt,
        receivedAt,
      }),
    ).toThrow();
    repository.close();
  });
});
