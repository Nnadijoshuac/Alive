import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  AssetFingerprintSchema,
  AssetMetadataSchema,
  SignedAttestationSchema,
  VerificationResultSchema,
  VerificationSessionSchema,
  ViewFingerprintSchema,
  WalletAuthorizationSchema,
  type AssetFingerprint,
  type AssetMetadata,
  type AssetRecord,
  type SignedAttestation,
  type VerificationResult,
  type VerificationSession,
  type ViewFingerprint,
  type WalletAuthorization,
} from "@alive/shared";
import { ProtocolError } from "../errors.js";
import { randomBytes32 } from "../random.js";
import { runMigrations } from "./migrations.js";

interface AssetRow {
  asset_id: string;
  owner: string;
  metadata_json: string;
  created_at: string;
  fingerprint_hash: string | null;
  registration_view_count: number;
}

interface SessionRow {
  session_id: string;
  asset_id: string;
  wallet: string;
  nonce: string;
  context: string;
  status: VerificationSession["status"];
  created_at: string;
  expires_at: string;
  result_json: string | null;
}

interface ChallengeRow {
  challenge_id: string;
  sequence: number;
  type: VerificationSession["challenges"][number]["type"];
  prompt: string;
  completed_at: string | null;
}

interface RegistrationCaptureRow {
  capture_id: string;
  evidence_path: string;
  fingerprint_json: string;
}

interface VerificationCaptureRow {
  capture_id: string;
  challenge_id: string;
  evidence_path: string;
  fingerprint_json: string;
  captured_at: string;
  received_at: string;
}

interface AuthorizationRow {
  nonce: string;
  audience: string;
  action: WalletAuthorization["action"];
  wallet: string;
  resource: string;
  context: string;
  payload_hash: string;
  issued_at: number;
  expires_at: number;
  consumed_at: number | null;
}

interface CapabilityRow {
  capability_hash: string | null;
  capability_expires_at: number | null;
}

export interface StoredRegistrationCapture {
  captureId: string;
  evidencePath: string;
  fingerprint: ViewFingerprint;
}

export interface StoredVerificationCapture extends StoredRegistrationCapture {
  challengeId: string;
  capturedAt: string;
  receivedAt: string;
}

export interface AnalysisSnapshot {
  session: VerificationSession;
  fingerprint: AssetFingerprint;
  captures: StoredVerificationCapture[];
}

export class AliveRepository {
  readonly database: Database.Database;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    if (databasePath !== ":memory:") this.database.pragma("journal_mode = WAL");
    runMigrations(this.database);
  }

  close(): void {
    this.database.close();
  }

  createAuthorization(authorization: WalletAuthorization): WalletAuthorization {
    const parsed = WalletAuthorizationSchema.parse(authorization);
    try {
      this.database
        .prepare(
          `INSERT INTO wallet_authorizations
           (nonce, audience, action, wallet, resource, context, payload_hash, issued_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          parsed.nonce,
          parsed.audience,
          parsed.action,
          parsed.wallet,
          parsed.resource,
          parsed.context,
          parsed.payloadHash,
          parsed.issuedAt,
          parsed.expiresAt,
        );
    } catch (error) {
      throw new ProtocolError(409, "AUTHORIZATION_ALREADY_EXISTS", "Wallet authorization nonce already exists", error);
    }
    return parsed;
  }

  getAuthorization(nonce: string): WalletAuthorization | undefined {
    const row = this.database
      .prepare("SELECT * FROM wallet_authorizations WHERE nonce = ?")
      .get(nonce) as AuthorizationRow | undefined;
    if (row === undefined) return undefined;
    return WalletAuthorizationSchema.parse({
      nonce: row.nonce,
      audience: row.audience,
      action: row.action,
      wallet: row.wallet,
      resource: row.resource,
      context: row.context,
      payloadHash: row.payload_hash,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
    });
  }

  authorizationConsumedAt(nonce: string): number | null | undefined {
    const row = this.database
      .prepare("SELECT consumed_at FROM wallet_authorizations WHERE nonce = ?")
      .get(nonce) as { consumed_at: number | null } | undefined;
    return row?.consumed_at;
  }

  pruneAuthorizations(nowSeconds: number): void {
    this.database
      .prepare("DELETE FROM wallet_authorizations WHERE expires_at < ?")
      .run(nowSeconds - 300);
  }

  private consumeAuthorization(authorization: WalletAuthorization, consumedAtSeconds: number): void {
    const parsed = WalletAuthorizationSchema.parse(authorization);
    const update = this.database
      .prepare(
        `UPDATE wallet_authorizations SET consumed_at = ?
         WHERE nonce = ? AND consumed_at IS NULL AND expires_at > ?
           AND audience = ? AND action = ? AND lower(wallet) = lower(?)
           AND lower(resource) = lower(?) AND lower(context) = lower(?)
           AND lower(payload_hash) = lower(?) AND issued_at = ? AND expires_at = ?`,
      )
      .run(
        consumedAtSeconds,
        parsed.nonce,
        consumedAtSeconds,
        parsed.audience,
        parsed.action,
        parsed.wallet,
        parsed.resource,
        parsed.context,
        parsed.payloadHash,
        parsed.issuedAt,
        parsed.expiresAt,
      );
    if (update.changes === 1) return;

    const row = this.database
      .prepare("SELECT consumed_at, expires_at FROM wallet_authorizations WHERE nonce = ?")
      .get(parsed.nonce) as { consumed_at: number | null; expires_at: number } | undefined;
    if (row === undefined) {
      throw new ProtocolError(401, "AUTHORIZATION_REQUIRED", "Wallet authorization was not issued by this verifier");
    }
    if (row.consumed_at !== null) {
      throw new ProtocolError(409, "AUTHORIZATION_ALREADY_USED", "Wallet authorization has already been consumed");
    }
    if (row.expires_at <= consumedAtSeconds) {
      throw new ProtocolError(410, "AUTHORIZATION_EXPIRED", "Wallet authorization has expired");
    }
    throw new ProtocolError(403, "AUTHORIZATION_MISMATCH", "Wallet authorization does not match this exact request");
  }

  createAuthorizedAsset(input: {
    authorization: WalletAuthorization;
    assetId: string;
    owner: string;
    metadata: AssetMetadata;
    createdAt: string;
    consumedAtSeconds: number;
    capabilityHash: string;
    capabilityExpiresAt: number;
  }): AssetRecord {
    const metadata = AssetMetadataSchema.parse(input.metadata);
    try {
      this.database.transaction(() => {
        this.consumeAuthorization(input.authorization, input.consumedAtSeconds);
        this.database
          .prepare(
            `INSERT INTO assets
             (asset_id, owner, metadata_json, created_at, registration_capability_hash,
              registration_capability_expires_at, owner_authorized)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
          )
          .run(
            input.assetId,
            input.owner,
            JSON.stringify(metadata),
            input.createdAt,
            input.capabilityHash,
            input.capabilityExpiresAt,
          );
      })();
    } catch (error) {
      if (error instanceof ProtocolError) throw error;
      throw new ProtocolError(409, "ASSET_ALREADY_EXISTS", "Asset already exists", error);
    }
    return this.getAsset(input.assetId) as AssetRecord;
  }

  createAsset(input: {
    assetId: string;
    owner: string;
    metadata: AssetMetadata;
    createdAt: string;
    ownerAuthorized?: boolean;
  }): AssetRecord {
    const metadata = AssetMetadataSchema.parse(input.metadata);
    try {
      this.database
        .prepare(
          `INSERT INTO assets (asset_id, owner, metadata_json, created_at, owner_authorized)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(input.assetId, input.owner, JSON.stringify(metadata), input.createdAt, input.ownerAuthorized ? 1 : 0);
    } catch (error) {
      throw new ProtocolError(409, "ASSET_ALREADY_EXISTS", "Asset already exists", error);
    }
    return this.getAsset(input.assetId) as AssetRecord;
  }

  getAsset(assetId: string): AssetRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT a.asset_id, a.owner, a.metadata_json, a.created_at,
                f.fingerprint_hash,
                COUNT(rc.capture_id) AS registration_view_count
         FROM assets a
         LEFT JOIN fingerprints f ON f.asset_id = a.asset_id
         LEFT JOIN registration_captures rc ON rc.asset_id = a.asset_id
         WHERE a.asset_id = ?
         GROUP BY a.asset_id, f.fingerprint_hash`,
      )
      .get(assetId) as AssetRow | undefined;
    if (row === undefined) return undefined;
    return {
      assetId: row.asset_id,
      owner: row.owner,
      metadata: AssetMetadataSchema.parse(JSON.parse(row.metadata_json) as unknown),
      createdAt: row.created_at,
      fingerprintHash: row.fingerprint_hash,
      registrationViewCount: row.registration_view_count,
    } as AssetRecord;
  }

  isAssetOwnerAuthorized(assetId: string): boolean {
    const row = this.database
      .prepare("SELECT owner_authorized FROM assets WHERE asset_id = ?")
      .get(assetId) as { owner_authorized: number } | undefined;
    return row?.owner_authorized === 1;
  }

  listAssets(owner?: string): AssetRecord[] {
    const ownerClause = owner === undefined ? "" : "WHERE lower(a.owner) = lower(?)";
    const statement = this.database.prepare(
      `SELECT a.asset_id, a.owner, a.metadata_json, a.created_at,
              f.fingerprint_hash,
              COUNT(rc.capture_id) AS registration_view_count
       FROM assets a
       LEFT JOIN fingerprints f ON f.asset_id = a.asset_id
       LEFT JOIN registration_captures rc ON rc.asset_id = a.asset_id
       ${ownerClause}
       GROUP BY a.asset_id, f.fingerprint_hash
       ORDER BY a.created_at DESC
       LIMIT 200`,
    );
    const rows = (owner === undefined ? statement.all() : statement.all(owner)) as AssetRow[];
    return rows.map((row) => ({
      assetId: row.asset_id,
      owner: row.owner,
      metadata: AssetMetadataSchema.parse(JSON.parse(row.metadata_json) as unknown),
      createdAt: row.created_at,
      fingerprintHash: row.fingerprint_hash,
      registrationViewCount: row.registration_view_count,
    }) as AssetRecord);
  }

  assertAssetCapability(assetId: string, capabilityHash: string, nowSeconds: number): void {
    const row = this.database
      .prepare(
        `SELECT registration_capability_hash AS capability_hash,
                registration_capability_expires_at AS capability_expires_at
         FROM assets WHERE asset_id = ?`,
      )
      .get(assetId) as CapabilityRow | undefined;
    if (row === undefined) throw new ProtocolError(404, "ASSET_NOT_FOUND", "Asset not found");
    if (row.capability_hash === null || row.capability_hash.toLowerCase() !== capabilityHash.toLowerCase()) {
      throw new ProtocolError(403, "CAPABILITY_INVALID", "Asset registration capability is invalid");
    }
    if (row.capability_expires_at === null || row.capability_expires_at <= nowSeconds) {
      throw new ProtocolError(410, "CAPABILITY_EXPIRED", "Asset registration capability has expired");
    }
  }

  saveRegistrationCapture(assetId: string, evidencePath: string, fingerprint: ViewFingerprint, createdAt: string): string {
    if (this.getAsset(assetId) === undefined) throw new ProtocolError(404, "ASSET_NOT_FOUND", "Asset not found");
    const parsed = ViewFingerprintSchema.parse(fingerprint);
    const captureId = randomBytes32();
    try {
      this.database
        .prepare(
          `INSERT INTO registration_captures
            (capture_id, asset_id, view, evidence_path, evidence_hash, fingerprint_json, captured_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          captureId,
          assetId,
          parsed.view,
          evidencePath,
          parsed.evidenceHash,
          JSON.stringify(parsed),
          parsed.capturedAt,
          createdAt,
        );
    } catch (error) {
      throw new ProtocolError(409, "REGISTRATION_VIEW_EXISTS", `${parsed.view} was already captured`, error);
    }
    return captureId;
  }

  saveAuthorizedRegistrationCapture(input: {
    assetId: string;
    capabilityHash: string;
    evidencePath: string;
    fingerprint: ViewFingerprint;
    createdAt: string;
    nowSeconds: number;
  }): string {
    return this.database.transaction(() => {
      this.assertAssetCapability(input.assetId, input.capabilityHash, input.nowSeconds);
      return this.saveRegistrationCapture(input.assetId, input.evidencePath, input.fingerprint, input.createdAt);
    })();
  }

  listRegistrationCaptures(assetId: string): StoredRegistrationCapture[] {
    const rows = this.database
      .prepare(
        `SELECT capture_id, evidence_path, fingerprint_json
         FROM registration_captures WHERE asset_id = ? ORDER BY created_at, view`,
      )
      .all(assetId) as RegistrationCaptureRow[];
    return rows.map((row) => ({
      captureId: row.capture_id,
      evidencePath: row.evidence_path,
      fingerprint: ViewFingerprintSchema.parse(JSON.parse(row.fingerprint_json) as unknown),
    }));
  }

  saveFingerprint(fingerprint: AssetFingerprint, fingerprintHash: string): void {
    const parsed = AssetFingerprintSchema.parse(fingerprint);
    try {
      this.database
        .prepare(
          `INSERT INTO fingerprints (asset_id, fingerprint_json, fingerprint_hash, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(parsed.assetId, JSON.stringify(parsed), fingerprintHash, parsed.createdAt);
    } catch (error) {
      throw new ProtocolError(409, "FINGERPRINT_EXISTS", "Fingerprint has already been finalized", error);
    }
  }

  saveAuthorizedFingerprint(input: {
    fingerprint: AssetFingerprint;
    fingerprintHash: string;
    capabilityHash: string;
    nowSeconds: number;
  }): void {
    const parsed = AssetFingerprintSchema.parse(input.fingerprint);
    this.database.transaction(() => {
      this.assertAssetCapability(parsed.assetId, input.capabilityHash, input.nowSeconds);
      this.saveFingerprint(parsed, input.fingerprintHash);
      const revoked = this.database
        .prepare(
          `UPDATE assets
           SET registration_capability_hash = NULL, registration_capability_expires_at = NULL
           WHERE asset_id = ? AND lower(registration_capability_hash) = lower(?)`,
        )
        .run(parsed.assetId, input.capabilityHash);
      if (revoked.changes !== 1) {
        throw new ProtocolError(409, "CAPABILITY_INVALID", "Asset registration capability changed concurrently");
      }
    })();
  }

  getFingerprint(assetId: string): AssetFingerprint | undefined {
    const row = this.database
      .prepare("SELECT fingerprint_json FROM fingerprints WHERE asset_id = ?")
      .get(assetId) as { fingerprint_json: string } | undefined;
    return row === undefined
      ? undefined
      : AssetFingerprintSchema.parse(JSON.parse(row.fingerprint_json) as unknown);
  }

  createSession(session: VerificationSession): VerificationSession {
    const parsed = VerificationSessionSchema.parse(session);
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO verification_sessions
           (session_id, asset_id, wallet, nonce, context, status, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          parsed.sessionId,
          parsed.assetId,
          parsed.wallet,
          parsed.nonce,
          parsed.context,
          parsed.status,
          parsed.createdAt,
          parsed.expiresAt,
        );
      const insert = this.database.prepare(
        `INSERT INTO verification_challenges
         (challenge_id, session_id, sequence, type, prompt, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const challenge of parsed.challenges) {
        insert.run(
          challenge.id,
          parsed.sessionId,
          challenge.sequence,
          challenge.type,
          challenge.prompt,
          challenge.completedAt,
        );
      }
    })();
    return parsed;
  }

  createAuthorizedSession(input: {
    authorization: WalletAuthorization;
    session: VerificationSession;
    consumedAtSeconds: number;
    capabilityHash: string;
  }): VerificationSession {
    const parsed = VerificationSessionSchema.parse(input.session);
    try {
      this.database.transaction(() => {
        this.consumeAuthorization(input.authorization, input.consumedAtSeconds);
        this.database
          .prepare(
            `INSERT INTO verification_sessions
             (session_id, asset_id, wallet, nonce, context, status, created_at, expires_at, capability_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            parsed.sessionId,
            parsed.assetId,
            parsed.wallet,
            parsed.nonce,
            parsed.context,
            parsed.status,
            parsed.createdAt,
            parsed.expiresAt,
            input.capabilityHash,
          );
        const insert = this.database.prepare(
          `INSERT INTO verification_challenges
           (challenge_id, session_id, sequence, type, prompt, completed_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        );
        for (const challenge of parsed.challenges) {
          insert.run(
            challenge.id,
            parsed.sessionId,
            challenge.sequence,
            challenge.type,
            challenge.prompt,
            challenge.completedAt,
          );
        }
      })();
    } catch (error) {
      if (error instanceof ProtocolError) throw error;
      throw new ProtocolError(409, "SESSION_ALREADY_EXISTS", "Verification session already exists", error);
    }
    return parsed;
  }

  assertSessionCapability(sessionId: string, capabilityHash: string, nowSeconds: number): void {
    const row = this.database
      .prepare(
        `SELECT capability_hash, CAST(strftime('%s', expires_at) AS INTEGER) AS capability_expires_at
         FROM verification_sessions WHERE session_id = ?`,
      )
      .get(sessionId) as CapabilityRow | undefined;
    if (row === undefined) throw new ProtocolError(404, "SESSION_INVALID", "Verification session not found");
    if (row.capability_hash === null || row.capability_hash.toLowerCase() !== capabilityHash.toLowerCase()) {
      throw new ProtocolError(403, "CAPABILITY_INVALID", "Verification session capability is invalid");
    }
    if (row.capability_expires_at === null || row.capability_expires_at <= nowSeconds) {
      throw new ProtocolError(410, "CAPABILITY_EXPIRED", "Verification session capability has expired");
    }
  }

  getSession(sessionId: string, now = new Date()): VerificationSession | undefined {
    const row = this.database
      .prepare("SELECT * FROM verification_sessions WHERE session_id = ?")
      .get(sessionId) as SessionRow | undefined;
    if (row === undefined) return undefined;
    let status = row.status;
    if ((status === "PENDING" || status === "ANALYZING") && Date.parse(row.expires_at) <= now.getTime()) {
      this.database
        .prepare("UPDATE verification_sessions SET status = 'EXPIRED' WHERE session_id = ? AND status IN ('PENDING', 'ANALYZING')")
        .run(sessionId);
      status = "EXPIRED";
    }
    const challenges = this.database
      .prepare(
        `SELECT challenge_id, sequence, type, prompt, completed_at
         FROM verification_challenges WHERE session_id = ? ORDER BY sequence`,
      )
      .all(sessionId) as ChallengeRow[];
    return VerificationSessionSchema.parse({
      sessionId: row.session_id,
      assetId: row.asset_id,
      wallet: row.wallet,
      nonce: row.nonce,
      context: row.context,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      status,
      challenges: challenges.map((challenge) => ({
        id: challenge.challenge_id,
        sequence: challenge.sequence,
        type: challenge.type,
        prompt: challenge.prompt,
        completedAt: challenge.completed_at,
      })),
    });
  }

  assertCaptureAllowed(sessionId: string, challengeId: string, now: Date): void {
    const session = this.getSession(sessionId, now);
    if (session === undefined) throw new ProtocolError(404, "SESSION_INVALID", "Verification session not found");
    if (session.status === "EXPIRED") throw new ProtocolError(410, "SESSION_EXPIRED", "Verification session expired");
    if (session.status !== "PENDING") {
      throw new ProtocolError(409, "SESSION_ALREADY_USED", "Verification session is no longer accepting captures");
    }
    const expected = session.challenges.find((challenge) => challenge.completedAt === null);
    if (expected === undefined) throw new ProtocolError(409, "CHALLENGE_INCOMPLETE", "All challenge captures are complete");
    if (expected.id.toLowerCase() !== challengeId.toLowerCase()) {
      throw new ProtocolError(409, "CHALLENGE_OUT_OF_ORDER", "Capture does not match the next challenge", {
        expectedChallengeId: expected.id,
      });
    }
  }

  addVerificationCapture(input: {
    sessionId: string;
    challengeId: string;
    evidencePath: string;
    fingerprint: ViewFingerprint;
    capturedAt: string;
    receivedAt: string;
  }): string {
    const parsed = ViewFingerprintSchema.parse(input.fingerprint);
    const captureId = randomBytes32();
    this.database.transaction(() => {
      this.assertCaptureAllowed(input.sessionId, input.challengeId, new Date(input.receivedAt));
      this.database
        .prepare(
          `INSERT INTO verification_captures
           (capture_id, session_id, challenge_id, evidence_path, evidence_hash, fingerprint_json, captured_at, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          captureId,
          input.sessionId,
          input.challengeId,
          input.evidencePath,
          parsed.evidenceHash,
          JSON.stringify(parsed),
          input.capturedAt,
          input.receivedAt,
        );
      this.database
        .prepare("UPDATE verification_challenges SET completed_at = ? WHERE challenge_id = ? AND completed_at IS NULL")
        .run(input.receivedAt, input.challengeId);
    })();
    return captureId;
  }

  addAuthorizedVerificationCapture(input: {
    sessionId: string;
    challengeId: string;
    capabilityHash: string;
    evidencePath: string;
    fingerprint: ViewFingerprint;
    capturedAt: string;
    receivedAt: string;
  }): string {
    return this.database.transaction(() => {
      this.assertSessionCapability(
        input.sessionId,
        input.capabilityHash,
        Math.floor(Date.parse(input.receivedAt) / 1_000),
      );
      return this.addVerificationCapture(input);
    })();
  }

  private listVerificationCaptures(sessionId: string): StoredVerificationCapture[] {
    const rows = this.database
      .prepare(
        `SELECT vc.capture_id, vc.challenge_id, vc.evidence_path, vc.fingerprint_json,
                vc.captured_at, vc.received_at
         FROM verification_captures vc
         JOIN verification_challenges ch ON ch.challenge_id = vc.challenge_id
         WHERE vc.session_id = ? ORDER BY ch.sequence`,
      )
      .all(sessionId) as VerificationCaptureRow[];
    return rows.map((row) => ({
      captureId: row.capture_id,
      challengeId: row.challenge_id,
      evidencePath: row.evidence_path,
      fingerprint: ViewFingerprintSchema.parse(JSON.parse(row.fingerprint_json) as unknown),
      capturedAt: row.captured_at,
      receivedAt: row.received_at,
    }));
  }

  beginAnalysis(sessionId: string, now: Date): AnalysisSnapshot {
    return this.database.transaction(() => {
      const session = this.getSession(sessionId, now);
      if (session === undefined) throw new ProtocolError(404, "SESSION_INVALID", "Verification session not found");
      if (session.status === "EXPIRED") throw new ProtocolError(410, "SESSION_EXPIRED", "Verification session expired");
      if (session.status !== "PENDING") {
        throw new ProtocolError(409, "SESSION_ALREADY_USED", "Verification session has already been analyzed");
      }
      if (session.challenges.some((challenge) => challenge.completedAt === null)) {
        throw new ProtocolError(409, "CHALLENGE_INCOMPLETE", "Complete every ordered challenge before analysis");
      }
      const fingerprint = this.getFingerprint(session.assetId);
      if (fingerprint === undefined) throw new ProtocolError(409, "FINGERPRINT_REQUIRED", "Asset has no fingerprint");
      const update = this.database
        .prepare("UPDATE verification_sessions SET status = 'ANALYZING' WHERE session_id = ? AND status = 'PENDING'")
        .run(sessionId);
      if (update.changes !== 1) throw new ProtocolError(409, "SESSION_ALREADY_USED", "Session was claimed concurrently");
      return {
        session: { ...session, status: "ANALYZING" as const },
        fingerprint,
        captures: this.listVerificationCaptures(sessionId),
      };
    })();
  }

  beginAuthorizedAnalysis(
    sessionId: string,
    capabilityHash: string,
    now: Date,
  ): AnalysisSnapshot {
    return this.database.transaction(() => {
      this.assertSessionCapability(sessionId, capabilityHash, Math.floor(now.getTime() / 1_000));
      return this.beginAnalysis(sessionId, now);
    })();
  }

  abortAnalysis(sessionId: string): void {
    this.database
      .prepare("UPDATE verification_sessions SET status = 'PENDING' WHERE session_id = ? AND status = 'ANALYZING'")
      .run(sessionId);
  }

  completeAnalysis(sessionId: string, result: VerificationResult, analyzedAt: string): void {
    const parsed = VerificationResultSchema.parse(result);
    const row = this.database
      .prepare("SELECT expires_at FROM verification_sessions WHERE session_id = ? AND status = 'ANALYZING'")
      .get(sessionId) as { expires_at: string } | undefined;
    if (row === undefined) throw new ProtocolError(409, "SESSION_ALREADY_USED", "Analysis state changed concurrently");
    if (Date.parse(analyzedAt) >= Date.parse(row.expires_at)) {
      this.database
        .prepare("UPDATE verification_sessions SET status = 'EXPIRED' WHERE session_id = ? AND status = 'ANALYZING'")
        .run(sessionId);
      throw new ProtocolError(410, "SESSION_EXPIRED", "Verification session expired during analysis");
    }
    const update = this.database
      .prepare(
        `UPDATE verification_sessions SET status = 'ANALYZED', result_json = ?, analyzed_at = ?
         WHERE session_id = ? AND status = 'ANALYZING'`,
      )
      .run(JSON.stringify(parsed), analyzedAt, sessionId);
    if (update.changes !== 1) throw new ProtocolError(409, "SESSION_ALREADY_USED", "Analysis state changed concurrently");
  }

  getResult(sessionId: string): VerificationResult | undefined {
    const row = this.database
      .prepare("SELECT result_json FROM verification_sessions WHERE session_id = ?")
      .get(sessionId) as { result_json: string | null } | undefined;
    if (row?.result_json == null) return undefined;
    return VerificationResultSchema.parse(JSON.parse(row.result_json) as unknown);
  }

  saveAttestation(sessionId: string, signed: SignedAttestation, createdAt: string): SignedAttestation {
    const parsed = SignedAttestationSchema.parse(signed);
    this.database.transaction(() => {
      const row = this.database
        .prepare("SELECT status, expires_at FROM verification_sessions WHERE session_id = ?")
        .get(sessionId) as { status: string; expires_at: string } | undefined;
      if (row === undefined) throw new ProtocolError(404, "SESSION_INVALID", "Verification session not found");
      if (Date.parse(createdAt) >= Date.parse(row.expires_at)) {
        throw new ProtocolError(410, "SESSION_EXPIRED", "Verification session expired before attestation issuance");
      }
      if (row.status !== "ANALYZED") {
        throw new ProtocolError(409, "SESSION_ALREADY_USED", "Attestation was already issued or analysis is incomplete");
      }
      this.database
        .prepare(
          `INSERT INTO attestations (session_id, digest, payload_json, signature, signer, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(sessionId, parsed.digest, JSON.stringify(parsed), parsed.signature, parsed.signer, createdAt);
      this.database
        .prepare("UPDATE verification_sessions SET status = 'ATTESTED' WHERE session_id = ? AND status = 'ANALYZED'")
        .run(sessionId);
    })();
    return parsed;
  }

  saveAuthorizedAttestation(
    sessionId: string,
    capabilityHash: string,
    signed: SignedAttestation,
    createdAt: string,
  ): SignedAttestation {
    return this.database.transaction(() => {
      this.assertSessionCapability(
        sessionId,
        capabilityHash,
        Math.floor(Date.parse(createdAt) / 1_000),
      );
      return this.saveAttestation(sessionId, signed, createdAt);
    })();
  }

  getAttestation(sessionId: string): SignedAttestation | undefined {
    const row = this.database
      .prepare("SELECT payload_json FROM attestations WHERE session_id = ?")
      .get(sessionId) as { payload_json: string } | undefined;
    return row === undefined
      ? undefined
      : SignedAttestationSchema.parse(JSON.parse(row.payload_json) as unknown);
  }

  resetDemoState(): void {
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM attestations").run();
      this.database.prepare("DELETE FROM verification_captures").run();
      this.database.prepare("DELETE FROM verification_challenges").run();
      this.database.prepare("DELETE FROM verification_sessions").run();
      this.database.prepare("DELETE FROM fingerprints").run();
      this.database.prepare("DELETE FROM registration_captures").run();
      this.database.prepare("DELETE FROM assets").run();
      this.database.prepare("DELETE FROM wallet_authorizations").run();
    })();
  }
}
