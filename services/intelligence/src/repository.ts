import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import {
  MarketSnapshotSchema,
  PortfolioPolicySchema,
  RwaAssetSchema,
  type MarketQuote,
  type MarketSnapshot,
  type PortfolioPolicy,
  type RwaAsset,
  type SignedStrategyProposal,
} from "@alive/shared";
import type { Allocation, PortfolioProposal } from "@alive/optimizer";

import type { CompiledPolicy } from "./compiler.js";
import { chunkDocumentText } from "./ingestion/chunker.js";
import type {
  IngestionSourceType,
  SourceDocument,
} from "./ingestion/ingestion-service.js";

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        schema_json TEXT NOT NULL,
        data_mode TEXT NOT NULL,
        last_updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS asset_sources (
        asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        source_json TEXT NOT NULL,
        retrieved_at TEXT NOT NULL,
        PRIMARY KEY (asset_id, source_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS market_quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id TEXT NOT NULL,
        quote_json TEXT NOT NULL,
        provider TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS market_quotes_asset_time ON market_quotes(asset_id, observed_at DESC);
      CREATE TABLE IF NOT EXISTS market_snapshots (
        hash TEXT PRIMARY KEY,
        snapshot_json TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        data_mode TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS policies (
        id TEXT PRIMARY KEY,
        current_version INTEGER NOT NULL,
        policy_hash TEXT NOT NULL,
        original_mandate TEXT NOT NULL,
        compiler_mode TEXT NOT NULL,
        compiler_provider TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS policy_versions (
        policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        policy_hash TEXT NOT NULL,
        policy_json TEXT NOT NULL,
        explanation_json TEXT NOT NULL,
        warnings_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (policy_id, version)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS portfolio_proposals (
        id TEXT PRIMARY KEY,
        policy_id TEXT REFERENCES policies(id) ON DELETE SET NULL,
        proposal_json TEXT NOT NULL,
        market_snapshot_hash TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS vaults (
        address TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        policy_id TEXT REFERENCES policies(id) ON DELETE RESTRICT,
        policy_hash TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS holdings (
        vault_address TEXT NOT NULL REFERENCES vaults(address) ON DELETE CASCADE,
        asset_id TEXT NOT NULL,
        amount TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (vault_address, asset_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS strategy_proposals (
        nonce TEXT PRIMARY KEY,
        vault_address TEXT NOT NULL,
        strategy_json TEXT NOT NULL,
        status TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        vault_address TEXT NOT NULL,
        strategy_nonce TEXT NOT NULL,
        transaction_hash TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS risk_snapshots (
        id TEXT PRIMARY KEY,
        vault_address TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        within_policy INTEGER NOT NULL,
        captured_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE portfolio_proposals ADD COLUMN policy_hash TEXT;
      ALTER TABLE portfolio_proposals ADD COLUMN current_allocations_json TEXT;
      ALTER TABLE portfolio_proposals ADD COLUMN execution_plan_hash TEXT;
      ALTER TABLE portfolio_proposals ADD COLUMN execution_plan_json TEXT;

      ALTER TABLE strategy_proposals ADD COLUMN proposal_id TEXT REFERENCES portfolio_proposals(id) ON DELETE RESTRICT;
      ALTER TABLE strategy_proposals ADD COLUMN policy_id TEXT REFERENCES policies(id) ON DELETE RESTRICT;
      ALTER TABLE strategy_proposals ADD COLUMN execution_plan_hash TEXT;
      ALTER TABLE strategy_proposals ADD COLUMN plan_json TEXT;
      ALTER TABLE strategy_proposals ADD COLUMN signature TEXT;
      ALTER TABLE strategy_proposals ADD COLUMN digest TEXT;
      ALTER TABLE strategy_proposals ADD COLUMN signer TEXT;
      ALTER TABLE strategy_proposals ADD COLUMN created_at TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS strategy_proposals_proposal_id
        ON strategy_proposals(proposal_id)
        WHERE proposal_id IS NOT NULL;
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS source_documents (
        source_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        title TEXT NOT NULL,
        uri TEXT,
        text TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        chunk_count INTEGER NOT NULL,
        retrieved_at TEXT NOT NULL,
        ingested_at TEXT NOT NULL,
        PRIMARY KEY (asset_id, source_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS source_documents_asset ON source_documents(asset_id);

      CREATE TABLE IF NOT EXISTS extraction_runs (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        model TEXT,
        prompt_version TEXT NOT NULL,
        pipeline_version TEXT NOT NULL,
        source_ids_json TEXT NOT NULL,
        source_hashes_json TEXT NOT NULL,
        status TEXT NOT NULL,
        passport_json TEXT,
        validation_errors_json TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS extraction_runs_asset ON extraction_runs(asset_id, started_at DESC);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS market_observations (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        data_mode TEXT NOT NULL,
        -- Null when the observation failed: a failed read is recorded as an
        -- observation with status DATA_UNAVAILABLE and no value, never as a
        -- silent reuse of the previous value.
        value TEXT,
        source_chain_id INTEGER,
        source_address TEXT,
        source_updated_at TEXT,
        block_number INTEGER,
        observed_at TEXT NOT NULL,
        age_seconds INTEGER,
        status TEXT NOT NULL,
        eligibility_status TEXT,
        reason_codes_json TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS market_observations_asset
        ON market_observations(asset_id, observed_at DESC);
    `,
  },
  {
    version: 5,
    sql: `
      -- The monitor's own record of the last verdict it published for each
      -- asset. Read back on the next cycle to decide whether the status
      -- actually changed, without depending on an RPC read of the registry.
      CREATE TABLE IF NOT EXISTS published_verdicts (
        asset_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        valid_until TEXT NOT NULL,
        published_at TEXT NOT NULL,
        transaction_hash TEXT,
        digest TEXT
      ) STRICT;
    `,
  },
  {
    version: 6,
    sql: `
      -- Counts surfaced by GET /api/assets/:assetId/extraction. Nullable so
      -- rows written before this migration (and non-AI runs, which have no
      -- meaningful "rejected attempt" count) remain valid.
      ALTER TABLE extraction_runs ADD COLUMN facts_extracted_count INTEGER;
      ALTER TABLE extraction_runs ADD COLUMN facts_cited_count INTEGER;
      ALTER TABLE extraction_runs ADD COLUMN unknown_fields_count INTEGER;
      ALTER TABLE extraction_runs ADD COLUMN rejected_attempts_count INTEGER;
    `,
  },
] as const;

export type PolicyRecord = CompiledPolicy & {
  id: string;
  version: number;
  createdAt: string;
};

export type ProposalRecord = {
  id: string;
  policyId?: string;
  policyHash?: `0x${string}`;
  marketSnapshotHash?: `0x${string}`;
  currentAllocations?: Allocation[];
  executionPlanHash?: `0x${string}`;
  executionPlan?: unknown;
  proposal: PortfolioProposal;
  createdAt: string;
};

export type ProposalPersistenceContext = {
  policyId?: string;
  policyHash?: `0x${string}`;
  marketSnapshotHash?: `0x${string}`;
  currentAllocations?: Allocation[];
};

export type SignedStrategyRecord = SignedStrategyProposal & {
  proposalId: string;
  policyId: string;
  executionPlanHash: `0x${string}`;
  plan: unknown;
  createdAt: string;
};

type PolicyRow = {
  id: string;
  current_version: number;
  policy_hash: string;
  original_mandate: string;
  compiler_mode: string;
  compiler_provider: string;
  created_at: string;
  policy_json: string;
  explanation_json: string;
  warnings_json: string;
};

type ProposalRow = {
  id: string;
  policy_id: string | null;
  policy_hash: string | null;
  proposal_json: string;
  market_snapshot_hash: string | null;
  current_allocations_json: string | null;
  execution_plan_hash: string | null;
  execution_plan_json: string | null;
  created_at: string;
};

type SourceDocumentRow = {
  source_id: string;
  asset_id: string;
  source_type: string;
  title: string;
  uri: string | null;
  text: string;
  text_hash: string;
  retrieved_at: string;
};

function rowToSourceDocument(row: SourceDocumentRow): SourceDocument {
  return {
    sourceId: row.source_id,
    assetId: row.asset_id,
    sourceType: row.source_type as IngestionSourceType,
    title: row.title,
    ...(row.uri ? { uri: row.uri } : {}),
    text: row.text,
    textHash: row.text_hash as `0x${string}`,
    chunks: chunkDocumentText(row.text),
    retrievedAt: row.retrieved_at,
  };
}

export type ExtractionRunRecord = {
  id: string;
  assetId: string;
  mode: "AI" | "DETERMINISTIC_FALLBACK" | "DEMO_FIXTURE";
  model?: string;
  promptVersion: string;
  pipelineVersion: string;
  sourceIds: string[];
  sourceHashes: string[];
  status: "SUCCEEDED" | "FAILED";
  passport?: unknown;
  validationErrors?: string[];
  startedAt: string;
  completedAt?: string;
  /** Populated fact fields in the validated result. */
  factsExtractedCount?: number;
  /** Always equal to factsExtractedCount today: every populated field must
   * carry a citation to survive validateExtractedFacts, so there is no
   * "extracted but uncited" state by construction. Tracked as its own
   * column anyway so the API contract doesn't silently assume that. */
  factsCitedCount?: number;
  /** Extractable fact slots that came back UNKNOWN/absent. */
  unknownFieldsCount?: number;
  /** AI attempts (0, 1, or 2) that failed schema/citation validation before
   * this run's final result -- 0 for a first-try success. */
  rejectedAttemptsCount?: number;
};

type ExtractionRunRow = {
  id: string;
  asset_id: string;
  mode: string;
  model: string | null;
  prompt_version: string;
  pipeline_version: string;
  source_ids_json: string;
  source_hashes_json: string;
  status: string;
  passport_json: string | null;
  validation_errors_json: string | null;
  started_at: string;
  completed_at: string | null;
  facts_extracted_count: number | null;
  facts_cited_count: number | null;
  unknown_fields_count: number | null;
  rejected_attempts_count: number | null;
};

function rowToExtractionRun(row: ExtractionRunRow): ExtractionRunRecord {
  return {
    id: row.id,
    assetId: row.asset_id,
    mode: row.mode as ExtractionRunRecord["mode"],
    ...(row.model ? { model: row.model } : {}),
    promptVersion: row.prompt_version,
    pipelineVersion: row.pipeline_version,
    sourceIds: JSON.parse(row.source_ids_json) as string[],
    sourceHashes: JSON.parse(row.source_hashes_json) as string[],
    status: row.status as ExtractionRunRecord["status"],
    ...(row.passport_json
      ? { passport: JSON.parse(row.passport_json) as unknown }
      : {}),
    ...(row.validation_errors_json
      ? { validationErrors: JSON.parse(row.validation_errors_json) as string[] }
      : {}),
    startedAt: row.started_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.facts_extracted_count !== null
      ? { factsExtractedCount: row.facts_extracted_count }
      : {}),
    ...(row.facts_cited_count !== null
      ? { factsCitedCount: row.facts_cited_count }
      : {}),
    ...(row.unknown_fields_count !== null
      ? { unknownFieldsCount: row.unknown_fields_count }
      : {}),
    ...(row.rejected_attempts_count !== null
      ? { rejectedAttemptsCount: row.rejected_attempts_count }
      : {}),
  };
}

export type MarketObservationRecord = {
  id: string;
  assetId: string;
  provider: string;
  dataMode: string;
  /** Absent when the read failed. Never carried over from a previous read. */
  value?: string;
  sourceChainId?: number;
  sourceAddress?: string;
  sourceUpdatedAt?: string;
  blockNumber?: number;
  observedAt: string;
  ageSeconds?: number;
  status: "OK" | "STALE" | "DATA_UNAVAILABLE";
  eligibilityStatus?: string;
  reasonCodes?: string[];
};

type MarketObservationRow = {
  id: string;
  asset_id: string;
  provider: string;
  data_mode: string;
  value: string | null;
  source_chain_id: number | null;
  source_address: string | null;
  source_updated_at: string | null;
  block_number: number | null;
  observed_at: string;
  age_seconds: number | null;
  status: string;
  eligibility_status: string | null;
  reason_codes_json: string | null;
};

function rowToObservation(row: MarketObservationRow): MarketObservationRecord {
  return {
    id: row.id,
    assetId: row.asset_id,
    provider: row.provider,
    dataMode: row.data_mode,
    ...(row.value !== null ? { value: row.value } : {}),
    ...(row.source_chain_id !== null
      ? { sourceChainId: row.source_chain_id }
      : {}),
    ...(row.source_address !== null
      ? { sourceAddress: row.source_address }
      : {}),
    ...(row.source_updated_at !== null
      ? { sourceUpdatedAt: row.source_updated_at }
      : {}),
    ...(row.block_number !== null ? { blockNumber: row.block_number } : {}),
    observedAt: row.observed_at,
    ...(row.age_seconds !== null ? { ageSeconds: row.age_seconds } : {}),
    status: row.status as MarketObservationRecord["status"],
    ...(row.eligibility_status !== null
      ? { eligibilityStatus: row.eligibility_status }
      : {}),
    ...(row.reason_codes_json !== null
      ? { reasonCodes: JSON.parse(row.reason_codes_json) as string[] }
      : {}),
  };
}

export type PublishedVerdictRecord = {
  assetId: string;
  status: string;
  validUntil: string;
  publishedAt: string;
  transactionHash?: string;
  digest?: string;
};

type PublishedVerdictRow = {
  asset_id: string;
  status: string;
  valid_until: string;
  published_at: string;
  transaction_hash: string | null;
  digest: string | null;
};

function rowToPublishedVerdict(row: PublishedVerdictRow): PublishedVerdictRecord {
  return {
    assetId: row.asset_id,
    status: row.status,
    validUntil: row.valid_until,
    publishedAt: row.published_at,
    ...(row.transaction_hash !== null
      ? { transactionHash: row.transaction_hash }
      : {}),
    ...(row.digest !== null ? { digest: row.digest } : {}),
  };
}

function repositoryError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export class IntelligenceRepository {
  readonly #database: Database.Database;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:")
      mkdirSync(path.dirname(databasePath), { recursive: true });
    this.#database = new Database(databasePath);
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("journal_mode = WAL");
    this.#migrate();
  }

  #migrate(): void {
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;",
    );
    const current = this.#database
      .prepare(
        "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
      )
      .get() as { version: number };
    for (const migration of MIGRATIONS) {
      if (migration.version <= current.version) continue;
      this.#database.transaction(() => {
        this.#database.exec(migration.sql);
        this.#database
          .prepare(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
          )
          .run(migration.version, new Date().toISOString());
      })();
    }
  }

  #upsertAssetRow(asset: RwaAsset): void {
    this.#database
      .prepare(
        `
      INSERT INTO assets (id, schema_json, data_mode, last_updated_at)
      VALUES (@id, @schemaJson, @dataMode, @lastUpdatedAt)
      ON CONFLICT(id) DO UPDATE SET
        schema_json = excluded.schema_json,
        data_mode = excluded.data_mode,
        last_updated_at = excluded.last_updated_at
    `,
      )
      .run({
        id: asset.id,
        schemaJson: JSON.stringify(asset),
        dataMode: asset.dataMode,
        lastUpdatedAt: asset.lastUpdatedAt,
      });
    this.#database
      .prepare("DELETE FROM asset_sources WHERE asset_id = ?")
      .run(asset.id);
    const insertSource = this.#database.prepare(`
      INSERT INTO asset_sources (asset_id, source_id, source_json, retrieved_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const source of asset.sources) {
      insertSource.run(asset.id, source.id, JSON.stringify(source), source.retrievedAt);
    }
  }

  /**
   * Full bulk replacement, used once at startup with the entire catalog
   * file: the file is the source of truth for "what's in the catalog
   * today," so any id that used to be here (renamed, deprecated, replaced)
   * is removed rather than surviving forever in a persisted database
   * across restarts. ON DELETE CASCADE on asset_sources handles that
   * table; the remaining per-asset tables (source_documents,
   * extraction_runs, market_observations, published_verdicts)
   * intentionally have no FK to assets(id) and are left as an audit
   * trail, not orphan-cleaned here.
   *
   * Never call this with a partial asset list for a single-asset update --
   * use `upsertAsset` for that, which touches only the one row.
   */
  replaceCatalog(assets: readonly RwaAsset[]): void {
    const existingIds = this.#database
      .prepare("SELECT id FROM assets")
      .all() as { id: string }[];
    const incomingIds = new Set(assets.map((asset) => asset.id));
    const deleteAsset = this.#database.prepare("DELETE FROM assets WHERE id = ?");
    this.#database.transaction(() => {
      for (const { id } of existingIds) {
        if (!incomingIds.has(id)) deleteAsset.run(id);
      }
      for (const candidate of assets) {
        this.#upsertAssetRow(RwaAssetSchema.parse(candidate));
      }
    })();
  }

  /** Persists one asset's update (e.g. after extraction) without touching any other catalog row. Accepts `unknown` since callers may be re-persisting a stored (JSON-round-tripped) passport, not always a freshly-typed RwaAsset. */
  upsertAsset(asset: RwaAsset | unknown): void {
    const parsed = RwaAssetSchema.parse(asset);
    this.#database.transaction(() => {
      this.#upsertAssetRow(parsed);
    })();
  }

  listAssets(): RwaAsset[] {
    const rows = this.#database
      .prepare("SELECT schema_json FROM assets ORDER BY id")
      .all() as { schema_json: string }[];
    return rows.map((row) =>
      RwaAssetSchema.parse(JSON.parse(row.schema_json) as unknown),
    );
  }

  getAsset(assetId: string): RwaAsset | undefined {
    const row = this.#database
      .prepare("SELECT schema_json FROM assets WHERE id = ?")
      .get(assetId) as { schema_json: string } | undefined;
    return row
      ? RwaAssetSchema.parse(JSON.parse(row.schema_json) as unknown)
      : undefined;
  }

  saveQuotes(quotes: readonly MarketQuote[], recordedAt: string): void {
    const statement = this.#database.prepare(`
      INSERT INTO market_quotes (asset_id, quote_json, provider, observed_at, recorded_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.#database.transaction(() => {
      for (const quote of quotes) {
        statement.run(
          quote.assetId,
          JSON.stringify(quote),
          quote.provider,
          quote.timestamp,
          recordedAt,
        );
      }
    })();
  }

  saveMarketSnapshot(hash: `0x${string}`, snapshotInput: MarketSnapshot): void {
    const snapshot = MarketSnapshotSchema.parse(snapshotInput);
    this.#database
      .prepare(
        `
        INSERT INTO market_snapshots (hash, snapshot_json, captured_at, data_mode)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(hash) DO NOTHING
      `,
      )
      .run(
        hash,
        JSON.stringify(snapshot),
        snapshot.capturedAt,
        snapshot.dataMode,
      );
  }

  getMarketSnapshot(hash: `0x${string}`): MarketSnapshot | undefined {
    const row = this.#database
      .prepare("SELECT snapshot_json FROM market_snapshots WHERE hash = ?")
      .get(hash) as { snapshot_json: string } | undefined;
    return row
      ? MarketSnapshotSchema.parse(JSON.parse(row.snapshot_json) as unknown)
      : undefined;
  }

  savePolicy(compilation: CompiledPolicy, createdAt: string): PolicyRecord {
    const id = randomUUID();
    this.#database.transaction(() => {
      this.#database
        .prepare(
          `
          INSERT INTO policies (
            id, current_version, policy_hash, original_mandate, compiler_mode,
            compiler_provider, created_at, updated_at
          ) VALUES (?, 1, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          id,
          compilation.policyHash,
          compilation.originalMandate,
          compilation.compiler.mode,
          compilation.compiler.provider,
          createdAt,
          createdAt,
        );
      this.#database
        .prepare(
          `
          INSERT INTO policy_versions (
            policy_id, version, policy_hash, policy_json, explanation_json, warnings_json, created_at
          ) VALUES (?, 1, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          id,
          compilation.policyHash,
          JSON.stringify(compilation.policy),
          JSON.stringify(compilation.explanation),
          JSON.stringify(compilation.warnings),
          createdAt,
        );
    })();
    return { ...compilation, id, version: 1, createdAt };
  }

  getPolicy(id: string): PolicyRecord | undefined {
    const row = this.#database
      .prepare(
        `
        SELECT p.id, p.current_version, p.policy_hash, p.original_mandate,
          p.compiler_mode, p.compiler_provider, p.created_at,
          v.policy_json, v.explanation_json, v.warnings_json
        FROM policies p
        JOIN policy_versions v ON v.policy_id = p.id AND v.version = p.current_version
        WHERE p.id = ?
      `,
      )
      .get(id) as PolicyRow | undefined;
    if (!row) return undefined;
    const policy = PortfolioPolicySchema.parse(
      JSON.parse(row.policy_json) as unknown,
    );
    return {
      id: row.id,
      version: row.current_version,
      createdAt: row.created_at,
      originalMandate: row.original_mandate,
      policy,
      policyHash: row.policy_hash as `0x${string}`,
      explanation: JSON.parse(row.explanation_json) as string[],
      warnings: JSON.parse(row.warnings_json) as string[],
      compiler: {
        mode: row.compiler_mode as "AI" | "DETERMINISTIC_FALLBACK",
        isAiGenerated: row.compiler_mode === "AI",
        provider: row.compiler_provider,
      },
    };
  }

  saveProposal(
    proposal: PortfolioProposal,
    createdAt: string,
    context: ProposalPersistenceContext = {},
  ): ProposalRecord {
    const id = randomUUID();
    this.#database
      .prepare(
        `
        INSERT INTO portfolio_proposals (
          id, policy_id, policy_hash, proposal_json, market_snapshot_hash,
          current_allocations_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        context.policyId ?? null,
        context.policyHash ?? null,
        JSON.stringify(proposal),
        context.marketSnapshotHash ?? null,
        context.currentAllocations
          ? JSON.stringify(context.currentAllocations)
          : null,
        createdAt,
      );
    return {
      id,
      ...(context.policyId ? { policyId: context.policyId } : {}),
      ...(context.policyHash ? { policyHash: context.policyHash } : {}),
      ...(context.marketSnapshotHash
        ? { marketSnapshotHash: context.marketSnapshotHash }
        : {}),
      ...(context.currentAllocations
        ? { currentAllocations: context.currentAllocations }
        : {}),
      proposal,
      createdAt,
    };
  }

  getProposal(id: string): ProposalRecord | undefined {
    const row = this.#database
      .prepare(
        `
        SELECT id, policy_id, policy_hash, proposal_json, market_snapshot_hash,
          current_allocations_json, execution_plan_hash, execution_plan_json,
          created_at
        FROM portfolio_proposals
        WHERE id = ?
      `,
      )
      .get(id) as ProposalRow | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      ...(row.policy_id ? { policyId: row.policy_id } : {}),
      ...(row.policy_hash
        ? { policyHash: row.policy_hash as `0x${string}` }
        : {}),
      ...(row.market_snapshot_hash
        ? {
            marketSnapshotHash: row.market_snapshot_hash as `0x${string}`,
          }
        : {}),
      ...(row.current_allocations_json
        ? {
            currentAllocations: JSON.parse(
              row.current_allocations_json,
            ) as Allocation[],
          }
        : {}),
      ...(row.execution_plan_hash
        ? { executionPlanHash: row.execution_plan_hash as `0x${string}` }
        : {}),
      ...(row.execution_plan_json
        ? { executionPlan: JSON.parse(row.execution_plan_json) as unknown }
        : {}),
      proposal: JSON.parse(row.proposal_json) as PortfolioProposal,
      createdAt: row.created_at,
    };
  }

  lockExecutionPlan(
    proposalId: string,
    executionPlanHash: `0x${string}`,
    plan: unknown,
  ): void {
    const planJson = JSON.stringify(plan);
    this.#database.transaction(() => {
      const row = this.#database
        .prepare(
          `
          SELECT execution_plan_hash, execution_plan_json
          FROM portfolio_proposals
          WHERE id = ?
        `,
        )
        .get(proposalId) as
        | {
            execution_plan_hash: string | null;
            execution_plan_json: string | null;
          }
        | undefined;
      if (!row) {
        throw repositoryError(
          "PROPOSAL_NOT_FOUND",
          "The stored portfolio proposal was not found.",
        );
      }
      if (
        row.execution_plan_hash !== null &&
        (row.execution_plan_hash !== executionPlanHash ||
          row.execution_plan_json !== planJson)
      ) {
        throw repositoryError(
          "PROPOSAL_PLAN_MISMATCH",
          "The proposal is already bound to a different execution plan.",
        );
      }
      if (row.execution_plan_hash === null) {
        this.#database
          .prepare(
            `
            UPDATE portfolio_proposals
            SET execution_plan_hash = ?, execution_plan_json = ?
            WHERE id = ?
          `,
          )
          .run(executionPlanHash, planJson, proposalId);
      }
    })();
  }

  getSignedStrategyByProposalId(
    proposalId: string,
  ): SignedStrategyRecord | undefined {
    const row = this.#database
      .prepare(
        `
        SELECT proposal_id, policy_id, strategy_json, execution_plan_hash,
          plan_json, signature, digest, signer, created_at
        FROM strategy_proposals
        WHERE proposal_id = ?
      `,
      )
      .get(proposalId) as
      | {
          proposal_id: string;
          policy_id: string;
          strategy_json: string;
          execution_plan_hash: string;
          plan_json: string;
          signature: string;
          digest: string;
          signer: string;
          created_at: string;
        }
      | undefined;
    if (!row) return undefined;
    const signed = JSON.parse(row.strategy_json) as SignedStrategyProposal;
    return {
      ...signed,
      proposalId: row.proposal_id,
      policyId: row.policy_id,
      executionPlanHash: row.execution_plan_hash as `0x${string}`,
      plan: JSON.parse(row.plan_json) as unknown,
      createdAt: row.created_at,
    };
  }

  saveSignedStrategy(record: SignedStrategyRecord): void {
    this.#database.transaction(() => {
      const proposal = this.getProposal(record.proposalId);
      if (!proposal) {
        throw repositoryError(
          "PROPOSAL_NOT_FOUND",
          "The stored portfolio proposal was not found.",
        );
      }
      if (
        proposal.executionPlanHash !== record.executionPlanHash ||
        JSON.stringify(proposal.executionPlan) !== JSON.stringify(record.plan)
      ) {
        throw repositoryError(
          "PROPOSAL_PLAN_MISMATCH",
          "The signed strategy does not match the proposal's locked execution plan.",
        );
      }
      if (this.getSignedStrategyByProposalId(record.proposalId)) {
        throw repositoryError(
          "STRATEGY_ALREADY_SIGNED",
          "The proposal has already produced a single-use signed strategy.",
        );
      }
      this.#database
        .prepare(
          `
          INSERT INTO strategy_proposals (
            nonce, vault_address, strategy_json, status, issued_at, expires_at,
            proposal_id, policy_id, execution_plan_hash, plan_json, signature,
            digest, signer, created_at
          ) VALUES (?, ?, ?, 'ISSUED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          record.proposal.strategyNonce,
          record.proposal.vault,
          JSON.stringify({
            proposal: record.proposal,
            domain: record.domain,
            signature: record.signature,
            digest: record.digest,
            signer: record.signer,
          }),
          new Date(record.proposal.issuedAt * 1_000).toISOString(),
          new Date(record.proposal.expiresAt * 1_000).toISOString(),
          record.proposalId,
          record.policyId,
          record.executionPlanHash,
          JSON.stringify(record.plan),
          record.signature,
          record.digest,
          record.signer,
          record.createdAt,
        );
    })();
  }

  saveSourceDocument(document: SourceDocument, ingestedAt: string): void {
    this.#database
      .prepare(
        `
        INSERT INTO source_documents (
          source_id, asset_id, source_type, title, uri, text, text_hash,
          chunk_count, retrieved_at, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id, source_id) DO UPDATE SET
          source_type = excluded.source_type,
          title = excluded.title,
          uri = excluded.uri,
          text = excluded.text,
          text_hash = excluded.text_hash,
          chunk_count = excluded.chunk_count,
          retrieved_at = excluded.retrieved_at,
          ingested_at = excluded.ingested_at
      `,
      )
      .run(
        document.sourceId,
        document.assetId,
        document.sourceType,
        document.title,
        document.uri ?? null,
        document.text,
        document.textHash,
        document.chunks.length,
        document.retrievedAt,
        ingestedAt,
      );
  }

  getSourceDocument(
    assetId: string,
    sourceId: string,
  ): SourceDocument | undefined {
    const row = this.#database
      .prepare(
        `
        SELECT source_id, asset_id, source_type, title, uri, text, text_hash, retrieved_at
        FROM source_documents
        WHERE asset_id = ? AND source_id = ?
      `,
      )
      .get(assetId, sourceId) as SourceDocumentRow | undefined;
    return row ? rowToSourceDocument(row) : undefined;
  }

  listSourceDocuments(assetId: string): SourceDocument[] {
    const rows = this.#database
      .prepare(
        `
        SELECT source_id, asset_id, source_type, title, uri, text, text_hash, retrieved_at
        FROM source_documents
        WHERE asset_id = ?
        ORDER BY source_id
      `,
      )
      .all(assetId) as SourceDocumentRow[];
    return rows.map(rowToSourceDocument);
  }

  saveExtractionRun(run: ExtractionRunRecord): void {
    this.#database
      .prepare(
        `
        INSERT INTO extraction_runs (
          id, asset_id, mode, model, prompt_version, pipeline_version,
          source_ids_json, source_hashes_json, status, passport_json,
          validation_errors_json, started_at, completed_at,
          facts_extracted_count, facts_cited_count, unknown_fields_count,
          rejected_attempts_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        run.id,
        run.assetId,
        run.mode,
        run.model ?? null,
        run.promptVersion,
        run.pipelineVersion,
        JSON.stringify(run.sourceIds),
        JSON.stringify(run.sourceHashes),
        run.status,
        run.passport ? JSON.stringify(run.passport) : null,
        run.validationErrors ? JSON.stringify(run.validationErrors) : null,
        run.startedAt,
        run.completedAt ?? null,
        run.factsExtractedCount ?? null,
        run.factsCitedCount ?? null,
        run.unknownFieldsCount ?? null,
        run.rejectedAttemptsCount ?? null,
      );
  }

  getLatestExtractionRun(assetId: string): ExtractionRunRecord | undefined {
    const row = this.#database
      .prepare(
        `
        SELECT id, asset_id, mode, model, prompt_version, pipeline_version,
          source_ids_json, source_hashes_json, status, passport_json,
          validation_errors_json, started_at, completed_at,
          facts_extracted_count, facts_cited_count, unknown_fields_count,
          rejected_attempts_count
        FROM extraction_runs
        WHERE asset_id = ?
        ORDER BY started_at DESC
        LIMIT 1
      `,
      )
      .get(assetId) as ExtractionRunRow | undefined;
    return row ? rowToExtractionRun(row) : undefined;
  }

  saveMarketObservation(observation: MarketObservationRecord): void {
    this.#database
      .prepare(
        `
        INSERT INTO market_observations (
          id, asset_id, provider, data_mode, value, source_chain_id,
          source_address, source_updated_at, block_number, observed_at,
          age_seconds, status, eligibility_status, reason_codes_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        observation.id,
        observation.assetId,
        observation.provider,
        observation.dataMode,
        observation.value ?? null,
        observation.sourceChainId ?? null,
        observation.sourceAddress ?? null,
        observation.sourceUpdatedAt ?? null,
        observation.blockNumber ?? null,
        observation.observedAt,
        observation.ageSeconds ?? null,
        observation.status,
        observation.eligibilityStatus ?? null,
        observation.reasonCodes ? JSON.stringify(observation.reasonCodes) : null,
      );
  }

  latestMarketObservation(assetId: string): MarketObservationRecord | undefined {
    const row = this.#database
      .prepare(
        `
        SELECT id, asset_id, provider, data_mode, value, source_chain_id,
          source_address, source_updated_at, block_number, observed_at,
          age_seconds, status, eligibility_status, reason_codes_json
        FROM market_observations
        WHERE asset_id = ?
        -- rowid breaks ties: two observations can share a timestamp when
        -- polling is fast, and "latest" must still mean most recently
        -- written, not an arbitrary pick.
        ORDER BY observed_at DESC, rowid DESC
        LIMIT 1
      `,
      )
      .get(assetId) as MarketObservationRow | undefined;
    return row ? rowToObservation(row) : undefined;
  }

  countMarketObservations(assetId: string): number {
    const row = this.#database
      .prepare(
        "SELECT COUNT(*) AS total FROM market_observations WHERE asset_id = ?",
      )
      .get(assetId) as { total: number };
    return row.total;
  }

  savePublishedVerdict(record: PublishedVerdictRecord): void {
    this.#database
      .prepare(
        `
        INSERT INTO published_verdicts (
          asset_id, status, valid_until, published_at, transaction_hash, digest
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET
          status = excluded.status,
          valid_until = excluded.valid_until,
          published_at = excluded.published_at,
          transaction_hash = excluded.transaction_hash,
          digest = excluded.digest
      `,
      )
      .run(
        record.assetId,
        record.status,
        record.validUntil,
        record.publishedAt,
        record.transactionHash ?? null,
        record.digest ?? null,
      );
  }

  latestPublishedVerdict(assetId: string): PublishedVerdictRecord | undefined {
    const row = this.#database
      .prepare(
        `
        SELECT asset_id, status, valid_until, published_at, transaction_hash, digest
        FROM published_verdicts
        WHERE asset_id = ?
      `,
      )
      .get(assetId) as PublishedVerdictRow | undefined;
    return row ? rowToPublishedVerdict(row) : undefined;
  }

  tableNames(): string[] {
    const rows = this.#database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[];
    return rows.map((row) => row.name);
  }

  close(): void {
    this.#database.close();
  }
}
