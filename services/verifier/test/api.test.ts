import { createEvidenceCommitment } from "@alive/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadVerifierConfig } from "../src/config.js";
import { AliveRepository } from "../src/db/repository.js";
import type { EvidenceStore } from "../src/storage.js";
import { assetFingerprint, assetId, owner } from "./helpers.js";

const memoryEvidence: EvidenceStore = {
  async put() {
    throw new Error("not used");
  },
  async read() {
    throw new Error("not used");
  },
  async reset() {},
};

describe("verifier API", () => {
  it("reports health and creates an expiring random session for a fingerprinted asset", async () => {
    const repository = new AliveRepository(":memory:");
    repository.createAsset({
      assetId,
      owner,
      metadata: { name: "API test asset", category: "COMPUTER" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const fingerprint = assetFingerprint();
    repository.saveFingerprint(fingerprint, createEvidenceCommitment(fingerprint));
    const fixedNow = new Date("2026-01-01T00:01:00.000Z");
    const app = await buildApp(
      { ...loadVerifierConfig({}), databasePath: ":memory:", evidencePath: ".", sessionTtlSeconds: 180 },
      { repository, evidenceStore: memoryEvidence, now: () => new Date(fixedNow) },
    );

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok", service: "@alive/verifier", signingConfigured: false });

    const response = await app.inject({
      method: "POST",
      url: "/api/verifications/session",
      payload: { assetId, wallet: owner },
    });
    expect(response.statusCode).toBe(201);
    const created = response.json();
    expect(created.sessionId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(created.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(created.context).toBe(`0x${"00".repeat(32)}`);
    expect(Date.parse(created.expiresAt) - Date.parse(created.createdAt)).toBe(180_000);
    expect(new Set(created.challenges.map((challenge: { id: string }) => challenge.id)).size).toBe(created.challenges.length);
    await app.close();
  }, 20_000);
});
