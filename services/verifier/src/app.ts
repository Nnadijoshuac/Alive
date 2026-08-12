import {
  AssetCreateRequestSchema,
  RegistrationCaptureRequestSchema,
  REQUIRED_REGISTRATION_VIEWS,
  VerificationCaptureRequestSchema,
  VerificationSessionCreateSchema,
  createEvidenceCommitment,
  type AssetFingerprint,
  type IdentifierData,
  type RegistrationView,
  type VerificationSession,
} from "@alive/shared";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { VerifierConfig } from "./config.js";
import { AliveRepository } from "./db/repository.js";
import { ProtocolError } from "./errors.js";
import { createChallenges, randomBytes32 } from "./random.js";
import { AttestationSigner } from "./signer.js";
import { decodeCaptureBase64, FileEvidenceStore, type EvidenceStore } from "./storage.js";
import { extractViewFingerprint } from "./vision/features.js";
import { analyzeVerification } from "./vision/matching.js";
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

export async function buildApp(config: VerifierConfig, dependencies: AppDependencies = {}): Promise<FastifyInstance> {
  const repository = dependencies.repository ?? new AliveRepository(config.databasePath);
  const evidenceStore = dependencies.evidenceStore ?? new FileEvidenceStore(config.evidencePath);
  const now = dependencies.now ?? (() => new Date());
  const signer = new AttestationSigner({
    ...(config.signingPrivateKey === undefined ? {} : { privateKey: config.signingPrivateKey }),
    ...(config.chainId === undefined ? {} : { chainId: config.chainId }),
    ...(config.verifyingContract === undefined ? {} : { verifyingContract: config.verifyingContract }),
    attestationTtlSeconds: config.attestationTtlSeconds,
  });
  const app = Fastify({
    logger: false,
    bodyLimit: Math.ceil(config.maximumImageBytes * 1.5) + 32_768,
    requestIdHeader: "x-request-id",
  });
  await app.register(cors, { origin: true, methods: ["GET", "POST"] });

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
      deterministicVisualFallback: true,
      ocrEnabled: config.enableOcr,
      neuralEmbeddingEnabled: config.enableNeuralEmbedding,
    },
  });
  app.get("/health", health);
  app.get("/api/health", health);

  app.post("/api/assets", async (request, reply) => {
    const input = AssetCreateRequestSchema.parse(request.body);
    const asset = repository.createAsset({
      assetId: randomBytes32(),
      owner: input.owner,
      metadata: input.metadata,
      createdAt: now().toISOString(),
    });
    return reply.status(201).send(asset);
  });

  app.get("/api/assets/:assetId", async (request) => requireAsset(repository, params(request).assetId ?? ""));

  app.post("/api/assets/:assetId/captures", async (request, reply) => {
    const assetId = params(request).assetId ?? "";
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
    const captureId = repository.saveRegistrationCapture(assetId, stored.path, fingerprint, now().toISOString());
    return reply.status(201).send({ captureId, view: input.view, evidenceHash: stored.evidenceHash, quality: fingerprint.quality });
  });

  app.post("/api/assets/:assetId/fingerprint", async (request, reply) => {
    const assetId = params(request).assetId ?? "";
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
    repository.saveFingerprint(fingerprint, fingerprintHash);
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
    const input = VerificationSessionCreateSchema.parse(request.body);
    const asset = requireAsset(repository, input.assetId);
    const fingerprint = repository.getFingerprint(input.assetId);
    if (fingerprint === undefined) throw new ProtocolError(409, "FINGERPRINT_REQUIRED", "Asset registration is incomplete");
    const createdAt = now();
    const session: VerificationSession = {
      sessionId: randomBytes32(),
      assetId: asset.assetId,
      wallet: input.wallet,
      nonce: randomBytes32(),
      context: input.context ?? ZERO_BYTES32,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + config.sessionTtlSeconds * 1_000).toISOString(),
      status: "PENDING",
      challenges: createChallenges(fingerprint.identifiers.serial !== undefined || fingerprint.identifiers.model !== undefined),
    };
    return reply.status(201).send(repository.createSession(session));
  });

  app.get("/api/verifications/:sessionId", async (request) => {
    const sessionId = params(request).sessionId ?? "";
    const session = requireSession(repository, sessionId, now());
    const result = repository.getResult(sessionId);
    const attestation = repository.getAttestation(sessionId);
    return { session, ...(result === undefined ? {} : { result }), ...(attestation === undefined ? {} : { attestation }) };
  });

  app.post("/api/verifications/:sessionId/capture", async (request, reply) => {
    const sessionId = params(request).sessionId ?? "";
    const receivedAt = now();
    const input = VerificationCaptureRequestSchema.parse(request.body);
    const session = requireSession(repository, sessionId, receivedAt);
    repository.assertCaptureAllowed(sessionId, input.challengeId, receivedAt);
    ensureFreshCapture(session, input.capturedAt, receivedAt);
    const challenge = session.challenges.find((candidate) => candidate.id.toLowerCase() === input.challengeId.toLowerCase());
    if (challenge === undefined) throw new ProtocolError(404, "CHALLENGE_NOT_FOUND", "Challenge not found");
    const bytes = decodeCaptureBase64(input.imageBase64, config.maximumImageBytes);
    const fingerprint = await extractViewFingerprint(bytes, {
      view: viewForChallenge(challenge.type),
      capturedAt: input.capturedAt,
      enableOcr: config.enableOcr && challenge.type === "SHOW_IDENTIFIER",
      enableNeuralEmbedding: config.enableNeuralEmbedding,
      neuralModel: config.neuralModel,
    });
    if (!fingerprint.quality.usable) {
      throw new ProtocolError(422, "CAPTURE_QUALITY_LOW", "Image is too blurred or poorly exposed", fingerprint.quality);
    }
    const stored = await evidenceStore.put("verification", sessionId, bytes, input.mimeType);
    const captureId = repository.addVerificationCapture({
      sessionId,
      challengeId: input.challengeId,
      evidencePath: stored.path,
      fingerprint,
      capturedAt: input.capturedAt,
      receivedAt: receivedAt.toISOString(),
    });
    const updated = requireSession(repository, sessionId, receivedAt);
    return reply.status(201).send({
      captureId,
      challengeId: input.challengeId,
      evidenceHash: stored.evidenceHash,
      quality: fingerprint.quality,
      completedChallenges: updated.challenges.filter((item) => item.completedAt !== null).length,
      totalChallenges: updated.challenges.length,
    });
  });

  app.post("/api/verifications/:sessionId/analyze", async (request) => {
    const sessionId = params(request).sessionId ?? "";
    const analysisTime = now();
    const snapshot = repository.beginAnalysis(sessionId, analysisTime);
    try {
      const result = analyzeVerification({
        session: snapshot.session,
        registration: snapshot.fingerprint,
        captures: snapshot.captures,
        policy: config.scorePolicy,
        now: analysisTime,
      });
      repository.completeAnalysis(sessionId, result, analysisTime.toISOString());
      return result;
    } catch (error) {
      repository.abortAnalysis(sessionId);
      throw error;
    }
  });

  app.post("/api/verifications/:sessionId/attestation", async (request, reply) => {
    const sessionId = params(request).sessionId ?? "";
    const existing = repository.getAttestation(sessionId);
    if (existing !== undefined) return existing;
    const session = requireSession(repository, sessionId, now());
    const result = repository.getResult(sessionId);
    if (result === undefined) throw new ProtocolError(409, "ANALYSIS_REQUIRED", "Analyze this session before attestation");
    const signed = await signer.sign(session, result, now());
    return reply.status(201).send(repository.saveAttestation(sessionId, signed, now().toISOString()));
  });

  if (config.demoMode) {
    app.post("/api/demo/reset", async () => {
      repository.resetDemoState();
      await evidenceStore.reset();
      return { reset: true, timestamp: now().toISOString() };
    });
    app.post("/api/demo/seed", async (request, reply) => {
      const owner = typeof request.body === "object" && request.body !== null && "owner" in request.body
        ? (request.body as { owner: unknown }).owner
        : undefined;
      const input = AssetCreateRequestSchema.parse({
        owner,
        metadata: {
          name: "ALIVE Demo Asset",
          category: "COMPUTER",
          manufacturer: "Demo",
          model: "Capture required",
          description: "Seeded metadata only. Complete real registration captures before verification.",
        },
      });
      const asset = repository.createAsset({
        assetId: randomBytes32(),
        owner: input.owner,
        metadata: input.metadata,
        createdAt: now().toISOString(),
      });
      return reply.status(201).send({ asset, next: "Capture real FRONT, LEFT, RIGHT, BACK, and DETAIL views." });
    });
  }

  app.addHook("onClose", async () => repository.close());
  return app;
}
