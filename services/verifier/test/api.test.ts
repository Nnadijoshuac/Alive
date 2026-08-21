import { createEvidenceCommitment, hashEvidenceBytes } from "@alive/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadVerifierConfig } from "../src/config.js";
import { AliveRepository } from "../src/db/repository.js";
import type { EvidenceStore } from "../src/storage.js";
import {
  assetFingerprint,
  assetId,
  owner,
  signAuthorization,
  testAssetMetadata,
  zeroBytes32,
} from "./helpers.js";

const memoryEvidence: EvidenceStore = {
  async put() {
    throw new Error("not used");
  },
  async read() {
    throw new Error("not used");
  },
  async reset() {},
};

async function patternedFrame(perturbation: number): Promise<Buffer> {
  const width = 192;
  const height = 192;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const checker = ((Math.floor(x / 11) + Math.floor(y / 13)) % 2) * 74;
      data[offset] = (x * 4 + y + checker + perturbation) % 256;
      data[offset + 1] = (y * 5 + x * 2 + checker + perturbation) % 256;
      data[offset + 2] = ((x ^ (y + 27)) + checker + perturbation) % 256;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe("verifier API", () => {
  it("reports health and creates an authorized expiring session", async () => {
    const repository = new AliveRepository(":memory:");
    repository.createAsset({
      assetId,
      owner,
      metadata: testAssetMetadata,
      createdAt: "2026-01-01T00:00:00.000Z",
      ownerAuthorized: true,
    });
    const fingerprint = assetFingerprint();
    repository.saveFingerprint(
      fingerprint,
      createEvidenceCommitment(fingerprint),
    );
    const fixedNow = new Date("2026-01-01T00:01:00.000Z");
    const persistedFrames: Buffer[] = [];
    const captureEvidence: EvidenceStore = {
      async put(_namespace, _ownerId, bytes) {
        const frame = Buffer.from(bytes);
        const index = persistedFrames.push(frame) - 1;
        return {
          path: `memory://verification/${index}`,
          evidenceHash: hashEvidenceBytes(frame),
          byteLength: frame.byteLength,
        };
      },
      async read() {
        throw new Error("not used");
      },
      async reset() {},
    };
    const app = await buildApp(
      {
        ...loadVerifierConfig({}),
        databasePath: ":memory:",
        evidencePath: ".",
        sessionTtlSeconds: 180,
      },
      {
        repository,
        evidenceStore: captureEvidence,
        now: () => new Date(fixedNow),
      },
    );

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      status: "ok",
      service: "@alive/verifier",
      signingConfigured: false,
      capabilities: {
        walletAuthorization: true,
        hashedResourceCapabilities: true,
      },
    });

    const listed = await app.inject({
      method: "GET",
      url: `/api/assets?owner=${owner}`,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      assets: [{ assetId, owner, registrationViewCount: 0 }],
    });

    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: {
        action: "CREATE_VERIFICATION_SESSION",
        request: { assetId, wallet: owner, context: zeroBytes32 },
      },
    });
    expect(challengeResponse.statusCode).toBe(201);
    const challenge = challengeResponse.json();
    const signature = await signAuthorization(challenge.authorization);
    const response = await app.inject({
      method: "POST",
      url: "/api/verifications/session",
      payload: {
        sessionId: challenge.authorization.resource,
        assetId,
        wallet: owner,
        context: zeroBytes32,
        authorization: { nonce: challenge.authorization.nonce, signature },
      },
    });
    expect(response.statusCode).toBe(201);
    const created = response.json();
    expect(created.session.sessionId).toBe(challenge.authorization.resource);
    expect(created.session.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(created.session.context).toBe(zeroBytes32);
    expect(created.capability.token).toMatch(/^0x[0-9a-f]{64}$/);
    expect(
      Date.parse(created.session.expiresAt) -
        Date.parse(created.session.createdAt),
    ).toBe(180_000);
    expect(
      new Set(created.session.challenges.map((item: { id: string }) => item.id))
        .size,
    ).toBe(created.session.challenges.length);

    const forbiddenRead = await app.inject({
      method: "GET",
      url: `/api/verifications/${created.session.sessionId}`,
    });
    expect(forbiddenRead.statusCode).toBe(401);
    expect(forbiddenRead.json()).toMatchObject({
      error: { code: "CAPABILITY_REQUIRED" },
    });

    const authorizedRead = await app.inject({
      method: "GET",
      url: `/api/verifications/${created.session.sessionId}`,
      headers: { authorization: `Bearer ${created.capability.token}` },
    });
    expect(authorizedRead.statusCode).toBe(200);

    const images = await Promise.all([
      patternedFrame(0),
      patternedFrame(2),
      patternedFrame(4),
    ]);
    const frames = images.map((image, index) => ({
      imageBase64: image.toString("base64"),
      mimeType: "image/jpeg",
      capturedAt: `2026-01-01T00:00:59.${String(600 + index * 100).padStart(3, "0")}Z`,
    }));
    const firstChallengeId = created.session.challenges[0].id as string;
    const outOfOrder = await app.inject({
      method: "POST",
      url: `/api/verifications/${created.session.sessionId}/capture`,
      headers: { authorization: `Bearer ${created.capability.token}` },
      payload: {
        challengeId: firstChallengeId,
        frames: [frames[1], frames[0], frames[2]],
      },
    });
    expect(outOfOrder.statusCode).toBe(422);
    expect(outOfOrder.json()).toMatchObject({
      error: { code: "CAPTURE_SEQUENCE_INVALID" },
    });
    expect(persistedFrames).toHaveLength(0);

    const acceptedCapture = await app.inject({
      method: "POST",
      url: `/api/verifications/${created.session.sessionId}/capture`,
      headers: { authorization: `Bearer ${created.capability.token}` },
      payload: { challengeId: firstChallengeId, frames },
    });
    expect(acceptedCapture.statusCode).toBe(201);
    expect(acceptedCapture.json()).toMatchObject({
      challengeId: firstChallengeId,
      evidenceHashes: persistedFrames.map((frame) => hashEvidenceBytes(frame)),
    });
    expect(acceptedCapture.json().qualities).toHaveLength(3);
    expect(acceptedCapture.json().intraChallengeMotion).toBeGreaterThan(0);
    expect(persistedFrames).toHaveLength(3);
    await app.close();
  }, 20_000);

  it("requires an explicit secret before deleting demo state and exposes no seed bypass", async () => {
    const app = await buildApp(
      {
        ...loadVerifierConfig({
          DEMO_MODE: "true",
          DEMO_RESET_TOKEN: "test-reset-secret",
        }),
        databasePath: ":memory:",
        evidencePath: ".",
      },
      { evidenceStore: memoryEvidence },
    );
    const seed = await app.inject({
      method: "POST",
      url: "/api/demo/seed",
      payload: { owner },
    });
    expect(seed.statusCode).toBe(404);
    const forbidden = await app.inject({
      method: "POST",
      url: "/api/demo/reset",
    });
    expect(forbidden.statusCode).toBe(403);
    const accepted = await app.inject({
      method: "POST",
      url: "/api/demo/reset",
      headers: { "x-alive-demo-token": "test-reset-secret" },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ reset: true });
    await app.close();
  });
});
