import type Database from "better-sqlite3";

const migrationV1 = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS assets (
    asset_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS registration_captures (
    capture_id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    view TEXT NOT NULL,
    evidence_path TEXT NOT NULL,
    evidence_hash TEXT NOT NULL,
    fingerprint_json TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(asset_id, view)
  );

  CREATE TABLE IF NOT EXISTS fingerprints (
    asset_id TEXT PRIMARY KEY REFERENCES assets(asset_id) ON DELETE CASCADE,
    fingerprint_json TEXT NOT NULL,
    fingerprint_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification_sessions (
    session_id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    wallet TEXT NOT NULL,
    nonce TEXT NOT NULL UNIQUE,
    context TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    result_json TEXT,
    analyzed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS verification_challenges (
    challenge_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES verification_sessions(session_id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE(session_id, sequence)
  );

  CREATE TABLE IF NOT EXISTS verification_captures (
    capture_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES verification_sessions(session_id) ON DELETE CASCADE,
    challenge_id TEXT NOT NULL UNIQUE REFERENCES verification_challenges(challenge_id) ON DELETE CASCADE,
    evidence_path TEXT NOT NULL,
    evidence_hash TEXT NOT NULL,
    fingerprint_json TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    received_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attestations (
    session_id TEXT PRIMARY KEY REFERENCES verification_sessions(session_id) ON DELETE CASCADE,
    digest TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL,
    signature TEXT NOT NULL,
    signer TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_registration_captures_asset ON registration_captures(asset_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_asset ON verification_sessions(asset_id);
  CREATE INDEX IF NOT EXISTS idx_challenges_session ON verification_challenges(session_id, sequence);
  CREATE INDEX IF NOT EXISTS idx_verification_captures_session ON verification_captures(session_id);
`;

export function runMigrations(database: Database.Database): void {
  database.pragma("foreign_keys = ON");
  const current = database.pragma("user_version", { simple: true }) as number;
  if (current < 1) {
    database.transaction(() => {
      database.exec(migrationV1);
      database.pragma("user_version = 1");
    })();
  }
}
