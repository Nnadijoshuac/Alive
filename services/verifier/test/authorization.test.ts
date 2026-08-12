import {
  createEvidenceCommitment,
  createAssetId,
  getAliveAuthorizationTypedData,
  type AssetMetadata,
  type WalletAuthorization,
} from "@alive/shared";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashCapabilityToken } from "../src/auth.js";
import { loadVerifierConfig } from "../src/config.js";
import { AliveRepository } from "../src/db/repository.js";
import type { EvidenceStore } from "../src/storage.js";
import {
  assetFingerprint,
  assetId,
  authorizationDomain,
  owner,
  ownerAccount,
  registrationNonce,
  testAssetMetadata,
  viewFingerprint,
  zeroBytes32,
} from "./helpers.js";

const attacker = privateKeyToAccount(`0x${"23".repeat(32)}`);
const memoryEvidence: EvidenceStore = {
  async put() {
    throw new Error("Evidence write should not run before authorization");
  },
  async read() {
    throw new Error("not used");
  },
  async reset() {},
};

async function sign(
  account: typeof ownerAccount,
  authorization: WalletAuthorization,
) {
  return account.signTypedData(
    getAliveAuthorizationTypedData(authorization, authorizationDomain),
  );
}

function config() {
  return {
    ...loadVerifierConfig({}),
    databasePath: ":memory:",
    evidencePath: ".",
    authorizationAudience: "http://127.0.0.1:4100",
    authorizationChainId: authorizationDomain.chainId,
  };
}

function seedFingerprint(repository: AliveRepository): void {
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
}

describe("wallet-authorized verifier resources", () => {
  it("creates an asset once, stores only a hashed capability, and protects registration mutations", async () => {
    const repository = new AliveRepository(":memory:");
    const instant = new Date("2026-01-01T00:00:00.000Z");
    const app = await buildApp(config(), {
      repository,
      evidenceStore: memoryEvidence,
      now: () => new Date(instant),
    });
    const metadata: AssetMetadata = {
      name: "Authenticated laptop",
      category: "COMPUTER",
      model: "A1",
    };

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: { owner, metadata },
    });
    expect(unauthenticated.statusCode).toBe(400);
    expect(repository.listAssets()).toHaveLength(0);

    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: { action: "CREATE_ASSET", request: { owner, metadata } },
    });
    expect(challengeResponse.statusCode).toBe(201);
    const challenge = challengeResponse.json();
    expect(challenge.authorization.resource).toBe(
      createAssetId(owner, challenge.authorization.nonce),
    );
    const signature = await sign(ownerAccount, challenge.authorization);
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: {
        assetId: challenge.authorization.resource,
        owner,
        metadata,
        authorization: { nonce: challenge.authorization.nonce, signature },
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json();
    expect(created.asset.assetId).toBe(challenge.authorization.resource);

    const stored = repository.database
      .prepare(
        "SELECT registration_capability_hash FROM assets WHERE asset_id = ?",
      )
      .get(created.asset.assetId) as { registration_capability_hash: string };
    expect(stored.registration_capability_hash).toBe(
      hashCapabilityToken(created.capability.token),
    );
    expect(stored.registration_capability_hash).not.toBe(
      created.capability.token,
    );
    expect(
      JSON.stringify(repository.database.prepare("SELECT * FROM assets").all()),
    ).not.toContain(created.capability.token);
    expect(() =>
      repository.assertAssetCapability(
        created.asset.assetId,
        hashCapabilityToken(created.capability.token),
        Math.floor(Date.parse(created.capability.expiresAt) / 1_000),
      ),
    ).toThrow(/expired/i);

    const publicRead = await app.inject({
      method: "GET",
      url: `/api/assets/${created.asset.assetId}`,
    });
    expect(publicRead.statusCode).toBe(200);
    const missingCapability = await app.inject({
      method: "POST",
      url: `/api/assets/${created.asset.assetId}/captures`,
      payload: {},
    });
    expect(missingCapability.statusCode).toBe(401);
    expect(missingCapability.json()).toMatchObject({
      error: { code: "CAPABILITY_REQUIRED" },
    });
    const wrongCapability = await app.inject({
      method: "POST",
      url: `/api/assets/${created.asset.assetId}/fingerprint`,
      headers: { authorization: `Bearer 0x${"99".repeat(32)}` },
    });
    expect(wrongCapability.statusCode).toBe(403);
    expect(wrongCapability.json()).toMatchObject({
      error: { code: "CAPABILITY_INVALID" },
    });

    const replay = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: {
        assetId: challenge.authorization.resource,
        owner,
        metadata,
        authorization: { nonce: challenge.authorization.nonce, signature },
      },
    });
    expect(replay.statusCode).toBe(409);
    expect(replay.json()).toMatchObject({
      error: { code: "AUTHORIZATION_ALREADY_USED" },
    });
    await app.close();
  });

  it("does not consume an authorization for a wrong signature or mutated payload", async () => {
    const repository = new AliveRepository(":memory:");
    const app = await buildApp(config(), {
      repository,
      evidenceStore: memoryEvidence,
    });
    const metadata: AssetMetadata = { name: "Original", category: "COMPUTER" };
    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: { action: "CREATE_ASSET", request: { owner, metadata } },
    });
    const challenge = challengeResponse.json();

    const attackerSignature = await sign(
      attacker as typeof ownerAccount,
      challenge.authorization,
    );
    const wrongSigner = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: {
        assetId: challenge.authorization.resource,
        owner,
        metadata,
        authorization: {
          nonce: challenge.authorization.nonce,
          signature: attackerSignature,
        },
      },
    });
    expect(wrongSigner.statusCode).toBe(401);
    expect(wrongSigner.json()).toMatchObject({
      error: { code: "AUTHORIZATION_SIGNATURE_INVALID" },
    });
    expect(
      repository.authorizationConsumedAt(challenge.authorization.nonce),
    ).toBeNull();

    const signature = await sign(ownerAccount, challenge.authorization);
    const wrongResource = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: {
        assetId: `0x${"66".repeat(32)}`,
        owner,
        metadata,
        authorization: { nonce: challenge.authorization.nonce, signature },
      },
    });
    expect(wrongResource.statusCode).toBe(403);
    expect(wrongResource.json()).toMatchObject({
      error: { code: "AUTHORIZATION_MISMATCH" },
    });
    expect(
      repository.authorizationConsumedAt(challenge.authorization.nonce),
    ).toBeNull();

    const mutated = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: {
        assetId: challenge.authorization.resource,
        owner,
        metadata: { ...metadata, name: "Poisoned" },
        authorization: { nonce: challenge.authorization.nonce, signature },
      },
    });
    expect(mutated.statusCode).toBe(403);
    expect(mutated.json()).toMatchObject({
      error: { code: "AUTHORIZATION_MISMATCH" },
    });
    expect(
      repository.authorizationConsumedAt(challenge.authorization.nonce),
    ).toBeNull();
    await app.close();
  });

  it("cannot use asset-creation authorization to create a verification session", async () => {
    const repository = new AliveRepository(":memory:");
    seedFingerprint(repository);
    const app = await buildApp(config(), {
      repository,
      evidenceStore: memoryEvidence,
    });
    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: {
        action: "CREATE_ASSET",
        request: { owner, metadata: testAssetMetadata },
      },
    });
    const challenge = challengeResponse.json();
    const signature = await sign(ownerAccount, challenge.authorization);
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
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "AUTHORIZATION_MISMATCH" },
    });
    expect(
      repository.authorizationConsumedAt(challenge.authorization.nonce),
    ).toBeNull();
    await app.close();
  });

  it("expires authorizations and capabilities according to server time", async () => {
    const repository = new AliveRepository(":memory:");
    let instant = new Date("2026-01-01T00:00:00.000Z");
    const app = await buildApp(
      { ...config(), authorizationTtlSeconds: 2 },
      {
        repository,
        evidenceStore: memoryEvidence,
        now: () => new Date(instant),
      },
    );
    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: {
        action: "CREATE_ASSET",
        request: { owner, metadata: testAssetMetadata },
      },
    });
    const challenge = challengeResponse.json();
    const signature = await sign(ownerAccount, challenge.authorization);
    instant = new Date("2026-01-01T00:00:02.000Z");
    const expired = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: {
        assetId: challenge.authorization.resource,
        owner,
        metadata: testAssetMetadata,
        authorization: { nonce: challenge.authorization.nonce, signature },
      },
    });
    expect(expired.statusCode).toBe(410);
    expect(expired.json()).toMatchObject({
      error: { code: "AUTHORIZATION_EXPIRED" },
    });
    await app.close();
  });

  it("rolls nonce consumption back when resource insertion fails", async () => {
    const repository = new AliveRepository(":memory:");
    const app = await buildApp(config(), {
      repository,
      evidenceStore: memoryEvidence,
    });
    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: {
        action: "CREATE_ASSET",
        request: { owner, metadata: testAssetMetadata },
      },
    });
    const challenge = challengeResponse.json();
    repository.createAsset({
      assetId: challenge.authorization.resource,
      owner,
      metadata: testAssetMetadata,
      createdAt: new Date().toISOString(),
    });
    const signature = await sign(ownerAccount, challenge.authorization);
    const failed = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: {
        assetId: challenge.authorization.resource,
        owner,
        metadata: testAssetMetadata,
        authorization: { nonce: challenge.authorization.nonce, signature },
      },
    });
    expect(failed.statusCode).toBe(409);
    expect(
      repository.authorizationConsumedAt(challenge.authorization.nonce),
    ).toBeNull();
    await app.close();
  });

  it("permits exactly one concurrent use of a session authorization and binds its context", async () => {
    const repository = new AliveRepository(":memory:");
    seedFingerprint(repository);
    const app = await buildApp(config(), {
      repository,
      evidenceStore: memoryEvidence,
    });
    const unauthenticated = await app.inject({
      method: "POST",
      url: "/api/verifications/session",
      payload: { assetId, wallet: owner, context: zeroBytes32 },
    });
    expect(unauthenticated.statusCode).toBe(400);
    const context = keccak256(new TextEncoder().encode("escrow-one"));
    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: {
        action: "CREATE_VERIFICATION_SESSION",
        request: { assetId, wallet: owner, context },
      },
    });
    const challenge = challengeResponse.json();
    const signature = await sign(ownerAccount, challenge.authorization);
    const body = {
      sessionId: challenge.authorization.resource,
      assetId,
      wallet: owner,
      context,
      authorization: { nonce: challenge.authorization.nonce, signature },
    };

    const contextMutation = await app.inject({
      method: "POST",
      url: "/api/verifications/session",
      payload: { ...body, context: zeroBytes32 },
    });
    expect(contextMutation.statusCode).toBe(403);
    expect(
      repository.authorizationConsumedAt(challenge.authorization.nonce),
    ).toBeNull();

    const [left, right] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/verifications/session",
        payload: body,
      }),
      app.inject({
        method: "POST",
        url: "/api/verifications/session",
        payload: body,
      }),
    ]);
    expect([left.statusCode, right.statusCode].sort()).toEqual([201, 409]);
    const winner = left.statusCode === 201 ? left.json() : right.json();
    expect(winner.session.context).toBe(context);
    expect(
      repository.authorizationConsumedAt(challenge.authorization.nonce),
    ).not.toBeNull();
    const stored = repository.database
      .prepare(
        "SELECT capability_hash FROM verification_sessions WHERE session_id = ?",
      )
      .get(winner.session.sessionId) as { capability_hash: string };
    expect(stored.capability_hash).toBe(
      hashCapabilityToken(winner.capability.token),
    );
    expect(stored.capability_hash).not.toBe(winner.capability.token);
    expect(
      JSON.stringify(
        repository.database
          .prepare("SELECT * FROM verification_sessions")
          .all(),
      ),
    ).not.toContain(winner.capability.token);
    expect(() =>
      repository.assertSessionCapability(
        winner.session.sessionId,
        hashCapabilityToken(winner.capability.token),
        Math.floor(Date.parse(winner.session.expiresAt) / 1_000),
      ),
    ).toThrow(/expired/i);

    for (const endpoint of [
      { method: "GET", url: `/api/verifications/${winner.session.sessionId}` },
      {
        method: "POST",
        url: `/api/verifications/${winner.session.sessionId}/capture`,
      },
      {
        method: "POST",
        url: `/api/verifications/${winner.session.sessionId}/analyze`,
      },
      {
        method: "POST",
        url: `/api/verifications/${winner.session.sessionId}/attestation`,
      },
    ] as const) {
      const response = await app.inject(
        endpoint.method === "POST" ? { ...endpoint, payload: {} } : endpoint,
      );
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: { code: "CAPABILITY_REQUIRED" },
      });
    }
    await app.close();
  });

  it("refuses to authorize another wallet over an authenticated owner's baseline", async () => {
    const repository = new AliveRepository(":memory:");
    seedFingerprint(repository);
    const app = await buildApp(config(), {
      repository,
      evidenceStore: memoryEvidence,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: {
        action: "CREATE_VERIFICATION_SESSION",
        request: { assetId, wallet: attacker.address, context: zeroBytes32 },
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "ASSET_OWNER_REQUIRED" },
    });
    expect(
      repository.database
        .prepare("SELECT COUNT(*) AS count FROM wallet_authorizations")
        .get(),
    ).toEqual({ count: 0 });
    await app.close();
  });

  it("does not treat pre-authorization legacy asset claims as authenticated owners", async () => {
    const repository = new AliveRepository(":memory:");
    repository.createAsset({
      assetId,
      owner,
      metadata: testAssetMetadata,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const fingerprint = assetFingerprint();
    repository.saveFingerprint(
      fingerprint,
      createEvidenceCommitment(fingerprint),
    );
    const app = await buildApp(config(), {
      repository,
      evidenceStore: memoryEvidence,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: {
        action: "CREATE_VERIFICATION_SESSION",
        request: { assetId, wallet: owner, context: zeroBytes32 },
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: "ASSET_REAUTHORIZATION_REQUIRED" },
    });
    await app.close();
  });

  it("revokes the registration capability when fingerprint finalization succeeds", async () => {
    const repository = new AliveRepository(":memory:");
    const now = new Date("2026-01-01T00:00:00.000Z");
    const auth: WalletAuthorization = {
      audience: "http://127.0.0.1:4100",
      action: "CREATE_ASSET",
      wallet: owner,
      resource: assetId,
      context: zeroBytes32,
      payloadHash: `0x${"44".repeat(32)}`,
      nonce: registrationNonce,
      issuedAt: Math.floor(now.getTime() / 1_000),
      expiresAt: Math.floor(now.getTime() / 1_000) + 120,
    };
    repository.createAuthorization(auth);
    const token = `0x${"46".repeat(32)}` as const;
    repository.createAuthorizedAsset({
      authorization: auth,
      assetId,
      owner,
      metadata: testAssetMetadata,
      createdAt: now.toISOString(),
      consumedAtSeconds: Math.floor(now.getTime() / 1_000),
      capabilityHash: hashCapabilityToken(token),
      capabilityExpiresAt: Math.floor(now.getTime() / 1_000) + 1_800,
    });
    for (const [index, view] of [
      "FRONT",
      "LEFT",
      "RIGHT",
      "BACK",
      "DETAIL",
    ].entries()) {
      repository.saveRegistrationCapture(
        assetId,
        `memory://${view}`,
        viewFingerprint(view as "FRONT", String(index + 1).padStart(2, "0")),
        now.toISOString(),
      );
    }
    const app = await buildApp(config(), {
      repository,
      evidenceStore: memoryEvidence,
      now: () => new Date(now),
    });
    const finalized = await app.inject({
      method: "POST",
      url: `/api/assets/${assetId}/fingerprint`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(finalized.statusCode).toBe(201);
    expect(() =>
      repository.assertAssetCapability(
        assetId,
        hashCapabilityToken(token),
        Math.floor(now.getTime() / 1_000),
      ),
    ).toThrow(/invalid/i);
    await app.close();
  });
});
