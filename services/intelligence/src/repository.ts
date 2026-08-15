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

  replaceCatalog(assets: readonly RwaAsset[]): void {
    const insertAsset = this.#database.prepare(`
      INSERT INTO assets (id, schema_json, data_mode, last_updated_at)
      VALUES (@id, @schemaJson, @dataMode, @lastUpdatedAt)
      ON CONFLICT(id) DO UPDATE SET
        schema_json = excluded.schema_json,
        data_mode = excluded.data_mode,
        last_updated_at = excluded.last_updated_at
    `);
    const deleteSources = this.#database.prepare(
      "DELETE FROM asset_sources WHERE asset_id = ?",
    );
    const insertSource = this.#database.prepare(`
      INSERT INTO asset_sources (asset_id, source_id, source_json, retrieved_at)
      VALUES (?, ?, ?, ?)
    `);
    this.#database.transaction(() => {
      for (const candidate of assets) {
        const asset = RwaAssetSchema.parse(candidate);
        insertAsset.run({
          id: asset.id,
          schemaJson: JSON.stringify(asset),
          dataMode: asset.dataMode,
          lastUpdatedAt: asset.lastUpdatedAt,
        });
        deleteSources.run(asset.id);
        for (const source of asset.sources) {
          insertSource.run(
            asset.id,
            source.id,
            JSON.stringify(source),
            source.retrievedAt,
          );
        }
      }
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
