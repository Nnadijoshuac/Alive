import {
  AddressSchema,
  AuthorizedAssetCreateRequestSchema,
  AuthorizedVerificationSessionCreateRequestSchema,
  RegistrationCaptureRequestSchema,
  REQUIRED_REGISTRATION_VIEWS,
  VerificationCaptureRequestSchema,
  WalletAuthorizationChallengeRequestSchema,
  createAssetId,
  createEvidenceCommitment,
  hashCreateAssetAuthorizationPayload,
  hashCreateVerificationSessionAuthorizationPayload,
  type AssetFingerprint,
  type IdentifierData,
  type RegistrationView,
  type VerificationBurstFingerprint,
  type VerificationCaptureRequest,
  type VerificationSession,
  type WalletAuthorization,
} from "@alive/shared";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { VerifierConfig } from "./config.js";
import {
  assertAuthorizationIntent,
  assertWalletAuthorizationSignature,
  authorizationDomain,
  hashCapabilityToken,
  requireBearerCapability,
} from "./auth.js";
import { AliveRepository } from "./db/repository.js";
import { ProtocolError } from "./errors.js";
import { createChallenges, randomBytes32 } from "./random.js";
import { AttestationSigner } from "./signer.js";
import { decodeCaptureBase64, FileEvidenceStore, type EvidenceStore } from "./storage.js";
import { extractViewFingerprint } from "./vision/features.js";
import { analyzeVerification, computeIntraChallengeMotion } from "./vision/matching.js";
import { normalizeOcrText } from "./vision/ocr.js";

const ZERO_BYTES32 = `0x${"00".repeat(32)}` as const;

export interface AppDependencies {
  repository?: AliveRepository;
  evidenceStore?: EvidenceStore;
  now?: () => Date;
}

function params(request: FastifyRequest): Record<string, string> {
  return request.params as Record<string, string>;
}

function query(request: FastifyRequest): Record<string, unknown> {
  return request.query as Record<string, unknown>;
}

function unixSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1_000);
}

function requireNonzeroAddress(value: string, field: string): void {
  if (/^0x0{40}$/i.test(value)) {
    throw new ProtocolError(400, "INVALID_REQUEST", `${field} cannot be the zero address`);
  }
}

function requireAuthorization(repository: AliveRepository, nonce: string): WalletAuthorization {
  const authorization = repository.getAuthorization(nonce);
  if (authorization === undefined) {
    throw new ProtocolError(401, "AUTHORIZATION_REQUIRED", "Wallet authorization was not issued by this verifier");
  }
  return authorization;
}

function capabilityHash(request: FastifyRequest) {
  return hashCapabilityToken(requireBearerCapability(request.headers.authorization));
}

function requireDemoResetToken(config: VerifierConfig, request: FastifyRequest): void {
  if (config.demoResetToken === undefined) {
    throw new ProtocolError(503, "DEMO_RESET_DISABLED", "Configure DEMO_RESET_TOKEN to enable destructive demo reset");
  }
  const supplied = request.headers["x-alive-demo-token"];
  if (supplied !== config.demoResetToken) {
    throw new ProtocolError(403, "DEMO_RESET_FORBIDDEN", "A valid demo reset token is required");
  }
}

function requireAsset(repository: AliveRepository, assetId: string) {
  const asset = repository.getAsset(assetId);
  if (asset === undefined) throw new ProtocolError(404, "ASSET_NOT_FOUND", "Asset not found");
  return asset;
}

function requireSession(repository: AliveRepository, sessionId: string, now: Date) {
  const session = repository.getSession(sessionId, now);
  if (session === undefined) throw new ProtocolError(404, "SESSION_INVALID", "Verification session not found");
  return session;
}

function viewForChallenge(type: VerificationSession["challenges"][number]["type"]): RegistrationView {
  switch (type) {
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

function identifierData(
  metadata: ReturnType<typeof requireAsset>["metadata"],
  ocrText: readonly string[],
): IdentifierData {
  const userText = [metadata.manufacturer, metadata.model, metadata.serialNumber]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  const normalizedText = [...new Set([...ocrText, ...normalizeOcrText(userText)])];
  const hasUserIdentifiers =
    metadata.manufacturer !== undefined || metadata.model !== undefined || metadata.serialNumber !== undefined;
  return {
    ...(metadata.manufacturer === undefined ? {} : { manufacturer: metadata.manufacturer }),
    ...(metadata.model === undefined ? {} : { model: metadata.model }),
    ...(metadata.serialNumber === undefined ? {} : { serial: metadata.serialNumber }),
    normalizedText,
    source: hasUserIdentifiers && ocrText.length > 0 ? "COMBINED" : hasUserIdentifiers ? "USER" : ocrText.length > 0 ? "OCR" : "NONE",
  };
}

function ensureFreshCapture(session: VerificationSession, capturedAt: string, receivedAt: Date): void {
  const captured = Date.parse(capturedAt);
  const created = Date.parse(session.createdAt);
  const expires = Date.parse(session.expiresAt);
  if (
    !Number.isFinite(captured) ||
    captured < created - 2_000 ||
    captured > receivedAt.getTime() + 5_000 ||
    captured > expires ||
    receivedAt.getTime() - captured > 120_000
  ) {
    throw new ProtocolError(422, "CAPTURE_STALE", "Capture timestamp is outside the active session window");
  }
}

function ensureFreshBurst(
  session: VerificationSession,
  frames: VerificationCaptureRequest["frames"],
  receivedAt: Date,
): void {
  for (const frame of frames) ensureFreshCapture(session, frame.capturedAt, receivedAt);
  const timestamps = frames.map((frame) => Date.parse(frame.capturedAt)) as [number, number, number];
  if (timestamps[0] >= timestamps[1] || timestamps[1] >= timestamps[2]) {
    throw new ProtocolError(422, "CAPTURE_SEQUENCE_INVALID", "Burst frame timestamps must be strictly increasing");
  }
  if (timestamps[2] - timestamps[0] > 5_000) {
    throw new ProtocolError(422, "CAPTURE_SEQUENCE_INVALID", "Burst frames must be captured within five seconds");
  }
}

export async function buildApp(config: VerifierConfig, dependencies: AppDependencies = {}): Promise<FastifyInstance> {
  const repository = dependencies.repository ?? new AliveRepository(config.databasePath);
  const evidenceStore = dependencies.evidenceStore ?? new FileEvidenceStore(config.evidencePath, config.evidenceResetBoundary);
  const now = dependencies.now ?? (() => new Date());
  const signer = new AttestationSigner({
    ...(config.signingPrivateKey === undefined ? {} : { privateKey: config.signingPrivateKey }),
    ...(config.chainId === undefined ? {} : { chainId: config.chainId }),
    ...(config.verifyingContract === undefined ? {} : { verifyingContract: config.verifyingContract }),
    attestationTtlSeconds: config.attestationTtlSeconds,
  });
  const app = Fastify({
    logger: false,
    bodyLimit: Math.ceil(config.maximumImageBytes * 3 * 1.5) + 32_768,
    requestIdHeader: "x-request-id",
  });
  await app.register(cors, {
    origin: (origin, callback) => {
      if (origin === undefined || config.allowedOrigins.includes(origin.replace(/\/$/, ""))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Alive-Demo-Token", "X-Request-Id"],
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      void reply.status(400).send({
        error: { code: "INVALID_REQUEST", message: "Request validation failed", details: error.flatten() },
      });
      return;
    }
    if (error instanceof ProtocolError) {
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected verifier error";
    void reply.status(500).send({ error: { code: "INTERNAL_ERROR", message } });
  });

  const health = async () => ({
    status: "ok",
    service: "@alive/verifier",
    time: now().toISOString(),
    signingConfigured: signer.configured,
    ...(signer.address === undefined ? {} : { verifierAddress: signer.address }),
    capabilities: {
      walletAuthorization: true,
      hashedResourceCapabilities: true,
      deterministicVisualFallback: true,
      ocrEnabled: config.enableOcr,
      neuralEmbeddingEnabled: config.enableNeuralEmbedding,
    },
  });
  app.get("/health", health);
  app.get("/api/health", health);

  app.post("/api/auth/challenge", async (request, reply) => {
    const input = WalletAuthorizationChallengeRequestSchema.parse(request.body);
    const issued = now();
    const issuedAt = unixSeconds(issued);
    repository.pruneAuthorizations(issuedAt);
    const expiresAt = issuedAt + config.authorizationTtlSeconds;

    let authorization: WalletAuthorization;
    if (input.action === "CREATE_ASSET") {
      requireNonzeroAddress(input.request.owner, "Asset owner");
      const registrationNonce = randomBytes32();
      const resource = createAssetId(input.request.owner, registrationNonce);
      authorization = {
        audience: config.authorizationAudience,
        action: input.action,
        wallet: input.request.owner,
        resource,
        context: ZERO_BYTES32,
        payloadHash: hashCreateAssetAuthorizationPayload({
          assetId: resource,
          owner: input.request.owner,
          metadata: input.request.metadata,
        }),
        nonce: registrationNonce,
        issuedAt,
        expiresAt,
      };
    } else {
      requireNonzeroAddress(input.request.wallet, "Verification wallet");
      const resource = randomBytes32();
      const asset = requireAsset(repository, input.request.assetId);
      if (!repository.isAssetOwnerAuthorized(input.request.assetId)) {
        throw new ProtocolError(409, "ASSET_REAUTHORIZATION_REQUIRED", "Legacy asset owner was not wallet-authenticated");
      }
      if (asset.owner.toLowerCase() !== input.request.wallet.toLowerCase()) {
        throw new ProtocolError(403, "ASSET_OWNER_REQUIRED", "Verification wallet must be the authenticated asset owner");
      }
      if (repository.getFingerprint(input.request.assetId) === undefined) {
        throw new ProtocolError(409, "FINGERPRINT_REQUIRED", "Asset registration is incomplete");
      }
      authorization = {
        audience: config.authorizationAudience,
        action: input.action,
        wallet: input.request.wallet,
        resource,
        context: input.request.context,
        payloadHash: hashCreateVerificationSessionAuthorizationPayload({
          sessionId: resource,
          assetId: input.request.assetId,
          wallet: input.request.wallet,
          context: input.request.context,
        }),
        nonce: randomBytes32(),
        issuedAt,
        expiresAt,
      };
    }

    repository.createAuthorization(authorization);
    return reply.status(201).send({
      authorization,
      domain: authorizationDomain(config.authorizationChainId),
    });
  });

  app.post("/api/assets", async (request, reply) => {
    const input = AuthorizedAssetCreateRequestSchema.parse(request.body);
    requireNonzeroAddress(input.owner, "Asset owner");
    const requestTime = now();
    const requestTimeSeconds = unixSeconds(requestTime);
    const authorization = requireAuthorization(repository, input.authorization.nonce);
    assertAuthorizationIntent(authorization, {
      audience: config.authorizationAudience,
      action: "CREATE_ASSET",
      wallet: input.owner,
      resource: input.assetId,
      context: ZERO_BYTES32,
      payloadHash: hashCreateAssetAuthorizationPayload(input),
    }, requestTimeSeconds);
    await assertWalletAuthorizationSignature(
      authorization,
      config.authorizationChainId,
      input.authorization.signature,
    );
    const token = randomBytes32();
    const capabilityExpiresAt = requestTimeSeconds + config.registrationCapabilityTtlSeconds;
    const asset = repository.createAuthorizedAsset({
      authorization,
      assetId: input.assetId,
      owner: input.owner,
      metadata: input.metadata,
      createdAt: requestTime.toISOString(),
      consumedAtSeconds: requestTimeSeconds,
      capabilityHash: hashCapabilityToken(token),
      capabilityExpiresAt,
    });
    return reply.status(201).send({
      asset,
      capability: {
        token,
        expiresAt: new Date(capabilityExpiresAt * 1_000).toISOString(),
      },
    });
  });

  app.get("/api/assets", async (request) => {
    const owner = query(request).owner;
    const parsedOwner = owner === undefined ? undefined : AddressSchema.parse(owner);
    return { assets: repository.listAssets(parsedOwner) };
  });

  app.get("/api/assets/:assetId", async (request) => requireAsset(repository, params(request).assetId ?? ""));

  app.post("/api/assets/:assetId/captures", async (request, reply) => {
    const assetId = params(request).assetId ?? "";
    const receivedAt = now();
    const suppliedCapabilityHash = capabilityHash(request);
    repository.assertAssetCapability(assetId, suppliedCapabilityHash, unixSeconds(receivedAt));
    requireAsset(repository, assetId);
    if (repository.getFingerprint(assetId) !== undefined) {
      throw new ProtocolError(409, "FINGERPRINT_EXISTS", "Registration is already finalized");
    }
    const input = RegistrationCaptureRequestSchema.parse(request.body);
    if (repository.listRegistrationCaptures(assetId).some((capture) => capture.fingerprint.view === input.view)) {
      throw new ProtocolError(409, "REGISTRATION_VIEW_EXISTS", `${input.view} was already captured`);
    }
    const bytes = decodeCaptureBase64(input.imageBase64, config.maximumImageBytes);
    const fingerprint = await extractViewFingerprint(bytes, {
      view: input.view,
      capturedAt: input.capturedAt,
      enableOcr: config.enableOcr && input.view === "IDENTIFIER",
      enableNeuralEmbedding: config.enableNeuralEmbedding,
      neuralModel: config.neuralModel,
    });
    if (!fingerprint.quality.usable) {
      throw new ProtocolError(422, "CAPTURE_QUALITY_LOW", "Image is too blurred or poorly exposed", fingerprint.quality);
    }
    const stored = await evidenceStore.put("registration", assetId, bytes, input.mimeType);
    const captureId = repository.saveAuthorizedRegistrationCapture({
      assetId,
      capabilityHash: suppliedCapabilityHash,
      evidencePath: stored.path,
      fingerprint,
      createdAt: receivedAt.toISOString(),
      nowSeconds: unixSeconds(now()),
    });
    return reply.status(201).send({ captureId, view: input.view, evidenceHash: stored.evidenceHash, quality: fingerprint.quality });
  });

  app.post("/api/assets/:assetId/fingerprint", async (request, reply) => {
    const assetId = params(request).assetId ?? "";
    const requestTime = now();
    const suppliedCapabilityHash = capabilityHash(request);
    repository.assertAssetCapability(assetId, suppliedCapabilityHash, unixSeconds(requestTime));
    const asset = requireAsset(repository, assetId);
    if (repository.getFingerprint(assetId) !== undefined) {
      throw new ProtocolError(409, "FINGERPRINT_EXISTS", "Registration is already finalized");
    }
    const captures = repository.listRegistrationCaptures(assetId);
    const capturedViews = new Set(captures.map((capture) => capture.fingerprint.view));
    const missingViews = REQUIRED_REGISTRATION_VIEWS.filter((view) => !capturedViews.has(view));
    if (missingViews.length > 0) {
      throw new ProtocolError(409, "INSUFFICIENT_VIEWS", "Required registration views are missing", { missingViews });
    }
    const createdAt = now().toISOString();
    const fingerprint: AssetFingerprint = {
      fingerprintVersion: 1,
      assetId: asset.assetId,
      views: captures.map((capture) => capture.fingerprint),
      identifiers: identifierData(asset.metadata, captures.flatMap((capture) => capture.fingerprint.ocrText)),
      createdAt,
    };
    const fingerprintHash = createEvidenceCommitment(fingerprint);
    repository.saveAuthorizedFingerprint({
      fingerprint,
      fingerprintHash,
      capabilityHash: suppliedCapabilityHash,
      nowSeconds: unixSeconds(now()),
    });
    return reply.status(201).send({
      assetId,
      fingerprintHash,
      fingerprintVersion: fingerprint.fingerprintVersion,
      registrationViews: fingerprint.views.map((view) => view.view),
      identifiers: fingerprint.identifiers,
      createdAt,
    });
  });

  app.post("/api/verifications/session", async (request, reply) => {
    const input = AuthorizedVerificationSessionCreateRequestSchema.parse(request.body);
    requireNonzeroAddress(input.wallet, "Verification wallet");
    const asset = requireAsset(repository, input.assetId);
    if (!repository.isAssetOwnerAuthorized(input.assetId)) {
      throw new ProtocolError(409, "ASSET_REAUTHORIZATION_REQUIRED", "Legacy asset owner was not wallet-authenticated");
    }
    if (asset.owner.toLowerCase() !== input.wallet.toLowerCase()) {
      throw new ProtocolError(403, "ASSET_OWNER_REQUIRED", "Verification wallet must be the authenticated asset owner");
    }
    const fingerprint = repository.getFingerprint(input.assetId);
    if (fingerprint === undefined) throw new ProtocolError(409, "FINGERPRINT_REQUIRED", "Asset registration is incomplete");
    const createdAt = now();
    const createdAtSeconds = unixSeconds(createdAt);
    const authorization = requireAuthorization(repository, input.authorization.nonce);
    assertAuthorizationIntent(authorization, {
      audience: config.authorizationAudience,
      action: "CREATE_VERIFICATION_SESSION",
      wallet: input.wallet,
      resource: input.sessionId,
      context: input.context,
      payloadHash: hashCreateVerificationSessionAuthorizationPayload(input),
    }, createdAtSeconds);
    await assertWalletAuthorizationSignature(
      authorization,
      config.authorizationChainId,
      input.authorization.signature,
    );
    const session: VerificationSession = {
      sessionId: input.sessionId,
      assetId: asset.assetId,
      wallet: input.wallet,
      nonce: randomBytes32(),
      context: input.context,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + config.sessionTtlSeconds * 1_000).toISOString(),
      status: "PENDING",
      challenges: createChallenges(fingerprint.identifiers.serial !== undefined || fingerprint.identifiers.model !== undefined),
    };
    const token = randomBytes32();
    const created = repository.createAuthorizedSession({
      authorization,
      session,
      consumedAtSeconds: createdAtSeconds,
      capabilityHash: hashCapabilityToken(token),
    });
    return reply.status(201).send({
      session: created,
      capability: { token, expiresAt: created.expiresAt },
    });
  });

  app.get("/api/verifications/:sessionId", async (request) => {
    const sessionId = params(request).sessionId ?? "";
    const requestTime = now();
    repository.assertSessionCapability(sessionId, capabilityHash(request), unixSeconds(requestTime));
    const session = requireSession(repository, sessionId, requestTime);
    const result = repository.getResult(sessionId);
    const attestation = repository.getAttestation(sessionId);
    return { session, ...(result === undefined ? {} : { result }), ...(attestation === undefined ? {} : { attestation }) };
  });

  app.post("/api/verifications/:sessionId/capture", async (request, reply) => {
    const sessionId = params(request).sessionId ?? "";
    const receivedAt = now();
    const suppliedCapabilityHash = capabilityHash(request);
    repository.assertSessionCapability(sessionId, suppliedCapabilityHash, unixSeconds(receivedAt));
    const input = VerificationCaptureRequestSchema.parse(request.body);
    const session = requireSession(repository, sessionId, receivedAt);
    repository.assertCaptureAllowed(sessionId, input.challengeId, receivedAt);
    ensureFreshBurst(session, input.frames, receivedAt);
    const challenge = session.challenges.find((candidate) => candidate.id.toLowerCase() === input.challengeId.toLowerCase());
    if (challenge === undefined) throw new ProtocolError(404, "CHALLENGE_NOT_FOUND", "Challenge not found");
    const frameBytes = input.frames.map((frame) => decodeCaptureBase64(frame.imageBase64, config.maximumImageBytes)) as [
      Buffer,
      Buffer,
      Buffer,
    ];
    const frameFingerprints = (await Promise.all(
      input.frames.map((frame, index) =>
        extractViewFingerprint(frameBytes[index]!, {
          view: viewForChallenge(challenge.type),
          capturedAt: frame.capturedAt,
          enableOcr: config.enableOcr && challenge.type === "SHOW_IDENTIFIER",
          enableNeuralEmbedding: config.enableNeuralEmbedding,
          neuralModel: config.neuralModel,
        }),
      ),
    )) as VerificationBurstFingerprint["frameFingerprints"];
    const unusableFrame = frameFingerprints.findIndex((fingerprint) => !fingerprint.quality.usable);
    if (unusableFrame !== -1) {
      throw new ProtocolError(422, "CAPTURE_QUALITY_LOW", "Every burst frame must be sharp and properly exposed", {
        frameIndex: unusableFrame,
        quality: frameFingerprints[unusableFrame]?.quality,
      });
    }
    const storedFrames = (await Promise.all(
      input.frames.map((frame, index) => evidenceStore.put("verification", sessionId, frameBytes[index]!, frame.mimeType)),
    )) as [Awaited<ReturnType<EvidenceStore["put"]>>, Awaited<ReturnType<EvidenceStore["put"]>>, Awaited<ReturnType<EvidenceStore["put"]>>];
    if (
      storedFrames.some(
        (stored, index) => stored.evidenceHash.toLowerCase() !== frameFingerprints[index]?.evidenceHash.toLowerCase(),
      )
    ) {
      throw new ProtocolError(500, "EVIDENCE_HASH_MISMATCH", "Stored evidence does not match its extracted fingerprint");
    }
    const intraChallengeMotion = computeIntraChallengeMotion(frameFingerprints);
    const captureId = repository.addAuthorizedVerificationCapture({
      sessionId,
      challengeId: input.challengeId,
      capabilityHash: suppliedCapabilityHash,
      evidencePaths: storedFrames.map((stored) => stored.path) as [string, string, string],
      burstFingerprint: { frameFingerprints, intraChallengeMotion },
      receivedAt: receivedAt.toISOString(),
    });
    const updated = requireSession(repository, sessionId, receivedAt);
    return reply.status(201).send({
      captureId,
      challengeId: input.challengeId,
      evidenceHashes: storedFrames.map((stored) => stored.evidenceHash),
      qualities: frameFingerprints.map((fingerprint) => fingerprint.quality),
      intraChallengeMotion,
      completedChallenges: updated.challenges.filter((item) => item.completedAt !== null).length,
      totalChallenges: updated.challenges.length,
    });
  });

  app.post("/api/verifications/:sessionId/analyze", async (request) => {
    const sessionId = params(request).sessionId ?? "";
    const analysisTime = now();
    const snapshot = repository.beginAuthorizedAnalysis(
      sessionId,
      capabilityHash(request),
      analysisTime,
    );
    try {
      const result = analyzeVerification({
        session: snapshot.session,
        registration: snapshot.fingerprint,
        captures: snapshot.captures,
        policy: config.scorePolicy,
        now: analysisTime,
      });
      repository.completeAnalysis(sessionId, result, now().toISOString());
      return result;
    } catch (error) {
      repository.abortAnalysis(sessionId);
      throw error;
    }
  });

  app.post("/api/verifications/:sessionId/attestation", async (request, reply) => {
    const sessionId = params(request).sessionId ?? "";
    const requestTime = now();
    const suppliedCapabilityHash = capabilityHash(request);
    repository.assertSessionCapability(sessionId, suppliedCapabilityHash, unixSeconds(requestTime));
    const existing = repository.getAttestation(sessionId);
    if (existing !== undefined) return existing;
    const session = requireSession(repository, sessionId, requestTime);
    const result = repository.getResult(sessionId);
    if (result === undefined) throw new ProtocolError(409, "ANALYSIS_REQUIRED", "Analyze this session before attestation");
    const asset = requireAsset(repository, session.assetId);
    if (asset.fingerprintHash === null) {
      throw new ProtocolError(409, "FINGERPRINT_REQUIRED", "Asset registration is incomplete");
    }
    const signed = await signer.sign(session, result, asset.fingerprintHash, requestTime);
    return reply.status(201).send(repository.saveAuthorizedAttestation(
      sessionId,
      suppliedCapabilityHash,
      signed,
      now().toISOString(),
    ));
  });

  if (config.demoMode) {
    app.post("/api/demo/reset", async (request) => {
      requireDemoResetToken(config, request);
      repository.resetDemoState();
      await evidenceStore.reset();
      return { reset: true, timestamp: now().toISOString() };
    });
  }

  app.addHook("onClose", async () => repository.close());
  return app;
}
