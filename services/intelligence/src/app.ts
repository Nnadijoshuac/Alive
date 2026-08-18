import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";

import { randomUUID } from "node:crypto";

import {
  IsoDateSchema,
  MarketSnapshotSchema,
  PortfolioPolicySchema,
  hashMarketSnapshot,
  type PortfolioPolicy,
  type RwaCatalog,
  type RwaExtractionMetadata,
} from "@alive/shared";
import {
  CompositeMarketDataProvider,
  ControllableDemoMarketDataProvider,
  MarketDataError,
  feedForAsset,
  type MarketDataProvider,
} from "@alive/market-data";
import {
  detectPolicyDrift,
  optimizePortfolio,
  proposeRebalance,
  type Allocation,
  type OptimizationInput,
} from "@alive/optimizer";

import { compileMandate } from "./compiler.js";
import type { IntelligenceConfig } from "./config.js";
import { officialSourcesForAsset } from "./data/official-sources.js";
import { getIntelligenceProfile } from "./data/intelligence-profiles.js";
import {
  createDemoEligibilityPolicy,
  evaluateEligibility,
} from "@alive/eligibility-engine";

import {
  EligibilitySignerError,
  type EligibilitySigner,
} from "./attestations/eligibility-signer.js";
import { extractPassportFacts } from "./extraction/passport-extractor.js";
import { PASSPORT_EXTRACTION_PROMPT_VERSION } from "./extraction/passport-prompt.js";
import { summarizeExtractedFacts } from "./extraction/extraction-validator.js";
import {
  mergeExtractedFactsIntoPassport,
  promoteAssetIfGenuinelyLive,
} from "./extraction/extraction-normalizer.js";
import type { DocumentInput } from "./ingestion/document-loader.js";
import {
  INGESTION_SOURCE_TYPES,
  ingestDocument,
} from "./ingestion/ingestion-service.js";
import type { LlmJsonProvider } from "./llm.js";
import type { MonitorService } from "./monitoring/service.js";
import {
  GatewayClient,
  assetIdHashFor,
  resolveGatewayClientConfig,
} from "./onchain/gateway-client.js";
import { IntelligenceRepository } from "./repository.js";

const CompileBodySchema = z
  .object({ mandate: z.string().trim().min(3).max(5_000) })
  .strict();
const AllocationSchema = z
  .object({
    assetId: z.string().trim().min(1).max(128),
    weightBps: z.number().int().min(0).max(10_000),
  })
  .strict();
const PolicyReferenceSchema = z
  .object({
    policyId: z.string().uuid().optional(),
    policy: PortfolioPolicySchema.optional(),
    asOf: IsoDateSchema.optional(),
  })
  .strict()
  .refine(
    (value) => (value.policyId === undefined) !== (value.policy === undefined),
    {
      message: "Provide exactly one of policyId or policy",
    },
  );
const OptimizeBodySchema = PolicyReferenceSchema;
const DemoNavAgeBodySchema = z
  .object({
    // 0 clears the override and restores fresh demo data.
    ageSeconds: z.number().int().min(0).max(365 * 24 * 3_600),
  })
  .strict();
const IngestBodySchema = z
  .object({
    sourceId: z.string().trim().min(1).max(128),
    sourceType: z.enum(INGESTION_SOURCE_TYPES),
    input: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("fixture"),
          fixtureId: z.string().trim().min(1).max(128),
          title: z.string().trim().min(1).max(240),
        })
        .strict(),
      z
        .object({
          kind: z.literal("text"),
          text: z.string().trim().min(1).max(60_000),
          title: z.string().trim().min(1).max(240),
          uri: z.string().url().max(2_048).optional(),
        })
        .strict(),
    ]),
  })
  .strict();
const CheckBodySchema = z
  .object({
    policyId: z.string().uuid().optional(),
    policy: PortfolioPolicySchema.optional(),
    asOf: IsoDateSchema.optional(),
    allocations: z.array(AllocationSchema).min(1),
  })
  .strict()
  .refine(
    (value) => (value.policyId === undefined) !== (value.policy === undefined),
    {
      message: "Provide exactly one of policyId or policy",
    },
  );

export type IntelligenceAppDependencies = {
  repository: IntelligenceRepository;
  catalog: RwaCatalog;
  llm: LlmJsonProvider;
  marketData: MarketDataProvider;
  eligibilitySigner: EligibilitySigner;
  /** Absent when MARKET_MONITOR_ENABLED is not set -- the routes then report a disabled monitor rather than 404ing. */
  monitorService?: MonitorService;
  now?: () => Date;
};

function errorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "INTERNAL_ERROR";
}

function resolvePolicy(
  repository: IntelligenceRepository,
  input: {
    policyId?: string | undefined;
    policy?: PortfolioPolicy | undefined;
  },
): { policy: PortfolioPolicy; policyId?: string } {
  if (input.policy) return { policy: input.policy };
  const record = input.policyId
    ? repository.getPolicy(input.policyId)
    : undefined;
  if (!record) {
    const error = new Error("Policy record was not found.") as Error & {
      code: string;
    };
    error.code = "POLICY_NOT_FOUND";
    throw error;
  }
  return { policy: record.policy, policyId: record.id };
}

async function optimizationInput(
  repository: IntelligenceRepository,
  marketData: MarketDataProvider,
  catalog: RwaCatalog,
  policy: PortfolioPolicy,
  asOf: string,
  currentAllocations?: Allocation[],
): Promise<{ input: OptimizationInput; marketSnapshotHash: `0x${string}` }> {
  const quotes = await marketData.getQuotes(
    catalog.assets.map((asset) => asset.id),
  );
  repository.saveQuotes(quotes, asOf);
  // The snapshot's dataMode must match every quote's own dataMode (schema
  // invariant), which is a property of the market-data provider that
  // fetched them -- not of the catalog. A mixed catalog (ttbill-b LIVE,
  // the rest DEMO) means catalog.dataMode ("SNAPSHOT") is no longer a
  // reliable stand-in for what the quotes actually are.
  const quotesDataMode = quotes[0]?.dataMode ?? catalog.dataMode;
  const snapshot = MarketSnapshotSchema.parse({
    version: 1,
    dataMode: quotesDataMode,
    capturedAt: asOf,
    quotes,
  });
  const marketSnapshotHash = hashMarketSnapshot(snapshot);
  repository.saveMarketSnapshot(marketSnapshotHash, snapshot);
  return {
    input: {
      policy,
      assets: catalog.assets,
      quotes,
      asOf,
      ...(currentAllocations ? { currentAllocations } : {}),
    },
    marketSnapshotHash,
  };
}

export async function buildIntelligenceApp(
  config: IntelligenceConfig,
  dependencies: IntelligenceAppDependencies,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 1_000_000 });
  const now = dependencies.now ?? (() => new Date());

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed"), false);
    },
    methods: ["GET", "POST"],
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request data failed strict validation.",
          issues: error.issues,
        },
      });
      return;
    }
    const code = errorCode(error);
    const status =
      code === "POLICY_NOT_FOUND" ? 404 : code === "INTERNAL_ERROR" ? 500 : 422;
    reply.status(status).send({
      error: {
        code,
        message:
          status === 500
            ? "The intelligence service could not complete the request."
            : error instanceof Error
              ? error.message
              : "The intelligence service rejected the request.",
      },
    });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "ALIVE_RWA_INTELLIGENCE",
    checkedAt: now().toISOString(),
    llm: dependencies.llm.health(),
    marketData: await dependencies.marketData.health(),
    catalog: {
      id: dependencies.catalog.catalogId,
      dataMode: dependencies.catalog.dataMode,
      assetCount: dependencies.catalog.assets.length,
      disclaimer: dependencies.catalog.disclaimer,
    },
  }));

  // Optional query-string filters over the catalog (directive: prepare the
  // API contract for chain/class/issuer/verification/search filtering and
  // pagination even while the catalog is small enough that filtering in
  // React over one static payload would also "work" today). Every filter
  // is optional and additive -- an unfiltered request behaves exactly as
  // before, so existing callers (optimizer, policy compiler, tests) are
  // unaffected.
  const CatalogQuerySchema = z.object({
    q: z.string().trim().min(1).max(200).optional(),
    chainId: z.coerce.number().int().positive().optional(),
    assetClass: z.string().trim().min(1).max(40).optional(),
    issuer: z.string().trim().min(1).max(200).optional(),
    verification: z.enum(["VERIFIED", "NOT_ANALYZED", "UNVERIFIED"]).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  });

  app.get("/api/assets", async (request) => {
    const query = CatalogQuerySchema.parse(request.query);
    let assets = dependencies.repository.listAssets();

    const hasRealSource = (asset: (typeof assets)[number]) =>
      asset.sources.some((source) => source.sourceType !== "DEMO_FIXTURE");
    const verificationOf = (asset: (typeof assets)[number]) => {
      if (!hasRealSource(asset)) return "UNVERIFIED" as const;
      return asset.extraction !== undefined ? "VERIFIED" as const : "NOT_ANALYZED" as const;
    };

    if (query.q) {
      const needle = query.q.toLowerCase();
      assets = assets.filter(
        (asset) =>
          asset.symbol.toLowerCase().includes(needle) ||
          asset.name.toLowerCase().includes(needle) ||
          asset.issuerName.toLowerCase().includes(needle) ||
          asset.assetClass.toLowerCase().includes(needle) ||
          (asset.deployments ?? []).some((d) =>
            d.contractAddress.toLowerCase().includes(needle),
          ),
      );
    }
    if (query.chainId !== undefined) {
      assets = assets.filter((asset) =>
        (asset.deployments ?? []).some(
          (d) => d.chainId === query.chainId && d.deploymentStatus === "VERIFIED",
        ),
      );
    }
    if (query.assetClass) {
      assets = assets.filter((asset) => asset.assetClass === query.assetClass);
    }
    if (query.issuer) {
      const needle = query.issuer.toLowerCase();
      assets = assets.filter(
        (asset) =>
          asset.issuer.toLowerCase() === needle ||
          asset.issuerName.toLowerCase().includes(needle),
      );
    }
    if (query.verification) {
      assets = assets.filter((asset) => verificationOf(asset) === query.verification);
    }

    const totalCount = assets.length;
    const limit = query.limit ?? totalCount;
    const page = query.page ?? 1;
    const paged = query.page || query.limit ? assets.slice((page - 1) * limit, page * limit) : assets;

    return {
      catalog: {
        id: dependencies.catalog.catalogId,
        label: dependencies.catalog.label,
        dataMode: dependencies.catalog.dataMode,
        asOf: dependencies.catalog.asOf,
        disclaimer: dependencies.catalog.disclaimer,
      },
      assets: paged,
      pagination: { totalCount, page, limit },
    };
  });

  app.get<{ Params: { assetId: string } }>(
    "/api/assets/:assetId",
    async (request, reply) => {
      const asset = dependencies.repository.getAsset(request.params.assetId);
      if (!asset) {
        reply.status(404);
        return {
          error: {
            code: "ASSET_NOT_FOUND",
            message: "Asset passport was not found.",
          },
        };
      }
      return { asset, disclaimer: dependencies.catalog.disclaimer };
    },
  );

  // Deep, editorial intelligence (news/macro/ownership/company-or-fund
  // profile/risk drivers/outlook) is a separate domain object from the
  // asset passport (see @alive/shared's RwaIntelligenceProfile doc
  // comment) -- it can be entirely absent for an asset without that
  // meaning anything is wrong with the asset itself.
  app.get<{ Params: { assetId: string } }>(
    "/api/assets/:assetId/intelligence-profile",
    async (request, reply) => {
      const asset = dependencies.repository.getAsset(request.params.assetId);
      if (!asset) {
        reply.status(404);
        return {
          error: {
            code: "ASSET_NOT_FOUND",
            message: "Asset passport was not found.",
          },
        };
      }
      const profile = getIntelligenceProfile(request.params.assetId);
      if (!profile) {
        return {
          assetId: request.params.assetId,
          available: false,
          reason: "ALIVE has not yet researched deep intelligence for this asset.",
        };
      }
      return { assetId: request.params.assetId, available: true, profile };
    },
  );

  app.post<{ Params: { assetId: string } }>(
    "/api/assets/:assetId/ingest",
    async (request, reply) => {
      const body = IngestBodySchema.parse(request.body);
      const input: DocumentInput =
        body.input.kind === "fixture"
          ? {
              kind: "fixture",
              fixtureId: body.input.fixtureId,
              title: body.input.title,
            }
          : {
              kind: "text",
              text: body.input.text,
              title: body.input.title,
              ...(body.input.uri ? { uri: body.input.uri } : {}),
            };
      const document = ingestDocument(
        {
          assetId: request.params.assetId,
          sourceId: body.sourceId,
          sourceType: body.sourceType,
          input,
          retrievedAt: now().toISOString(),
        },
        config.sourceDocumentsPath,
      );
      dependencies.repository.saveSourceDocument(document, now().toISOString());
      reply.status(201);
      return {
        sourceId: document.sourceId,
        assetId: document.assetId,
        sourceType: document.sourceType,
        title: document.title,
        textHash: document.textHash,
        chunkCount: document.chunks.length,
        retrievedAt: document.retrievedAt,
      };
    },
  );

  app.post<{ Params: { assetId: string } }>(
    "/api/assets/:assetId/ingest-official-sources",
    async (request, reply) => {
      const seeds = officialSourcesForAsset(request.params.assetId);
      if (!seeds) {
        reply.status(404);
        return {
          error: {
            code: "ASSET_HAS_NO_OFFICIAL_SOURCES",
            message:
              "ALIVE has no known-good official documentation registered for this asset. Ingest a demo fixture or pasted text instead.",
          },
        };
      }
      const retrievedAt = now().toISOString();
      const sources = seeds.map((seed) => {
        const document = ingestDocument(
          {
            assetId: request.params.assetId,
            sourceId: seed.sourceId,
            sourceType: seed.sourceType,
            input: { kind: "text", text: seed.text, title: seed.title, uri: seed.uri },
            retrievedAt,
          },
          config.sourceDocumentsPath,
        );
        dependencies.repository.saveSourceDocument(document, retrievedAt);
        return {
          sourceId: document.sourceId,
          sourceType: document.sourceType,
          title: document.title,
          textHash: document.textHash,
          chunkCount: document.chunks.length,
          retrievedAt: document.retrievedAt,
        };
      });
      reply.status(201);
      return { sources };
    },
  );

  app.get<{ Params: { assetId: string } }>(
    "/api/assets/:assetId/sources",
    async (request) => ({
      sources: dependencies.repository
        .listSourceDocuments(request.params.assetId)
        .map((document) => ({
          sourceId: document.sourceId,
          sourceType: document.sourceType,
          title: document.title,
          ...(document.uri ? { uri: document.uri } : {}),
          textHash: document.textHash,
          chunkCount: document.chunks.length,
          retrievedAt: document.retrievedAt,
        })),
    }),
  );

  app.post<{ Params: { assetId: string } }>(
    "/api/assets/:assetId/extract",
    async (request, reply) => {
      const assetId = request.params.assetId;
      const existing = dependencies.repository.getAsset(assetId);
      if (!existing) {
        reply.status(404);
        return {
          error: {
            code: "ASSET_NOT_FOUND",
            message: "Asset passport was not found.",
          },
        };
      }
      const sourceDocuments = dependencies.repository.listSourceDocuments(assetId);
      if (sourceDocuments.length === 0) {
        reply.status(422);
        return {
          error: {
            code: "NO_SOURCES_INGESTED",
            message:
              "Ingest at least one source document for this asset before extracting.",
          },
        };
      }

      // Avoid burning rate-limited AI calls re-extracting content ALIVE has
      // already validated: if the most recent successful AI run cited
      // exactly the source hashes on file now, AND used the extraction
      // logic version still running today, its stored passport is reused
      // verbatim rather than calling the model again. Either the source
      // content or the extraction logic changing invalidates the cache --
      // a prompt/schema/normalization fix must not keep serving a result
      // produced under the old, possibly-buggy logic just because the
      // underlying document didn't change.
      const previousRun = dependencies.repository.getLatestExtractionRun(assetId);
      const currentHashes = new Set<string>(
        sourceDocuments.map((document) => document.textHash),
      );
      const cacheHit =
        previousRun?.status === "SUCCEEDED" &&
        previousRun.mode === "AI" &&
        previousRun.passport !== undefined &&
        previousRun.sourceHashes.length === currentHashes.size &&
        previousRun.sourceHashes.every((hash) => currentHashes.has(hash)) &&
        previousRun.promptVersion === PASSPORT_EXTRACTION_PROMPT_VERSION &&
        previousRun.pipelineVersion === PASSPORT_EXTRACTION_PROMPT_VERSION;
      if (cacheHit && previousRun) {
        reply.status(200);
        return {
          passport: previousRun.passport,
          extraction: {
            mode: previousRun.mode,
            ...(previousRun.model ? { model: previousRun.model } : {}),
            pipelineVersion: previousRun.pipelineVersion,
            promptVersion: previousRun.promptVersion,
            extractedAt: previousRun.completedAt ?? previousRun.startedAt,
          },
          warnings: [
            "Reused a prior AI extraction: source document hashes are unchanged.",
          ],
          disclaimer: dependencies.catalog.disclaimer,
        };
      }

      const startedAt = now().toISOString();
      const { facts, meta, warnings, rejectedAttempts } = await extractPassportFacts({
        sourceDocuments,
        llm: dependencies.llm,
      });
      const extraction: RwaExtractionMetadata = {
        ...meta,
        extractedAt: now().toISOString(),
      };
      const merged = mergeExtractedFactsIntoPassport({
        existing,
        facts,
        sourceDocuments,
        extraction,
        lastUpdatedAt: now().toISOString(),
      });
      const passport = promoteAssetIfGenuinelyLive(merged, extraction);
      const summary = summarizeExtractedFacts(facts);
      dependencies.repository.replaceCatalog([passport]);
      dependencies.repository.saveExtractionRun({
        id: randomUUID(),
        assetId,
        mode: extraction.mode,
        ...(extraction.model ? { model: extraction.model } : {}),
        promptVersion: extraction.promptVersion ?? extraction.pipelineVersion,
        pipelineVersion: extraction.pipelineVersion,
        sourceIds: sourceDocuments.map((document) => document.sourceId),
        sourceHashes: sourceDocuments.map((document) => document.textHash),
        status: "SUCCEEDED",
        passport,
        startedAt,
        completedAt: now().toISOString(),
        factsExtractedCount: summary.extracted,
        factsCitedCount: summary.cited,
        unknownFieldsCount: summary.unknown,
        rejectedAttemptsCount: rejectedAttempts,
      });

      reply.status(201);
      return { passport, extraction, warnings, disclaimer: dependencies.catalog.disclaimer };
    },
  );

  app.get<{ Params: { assetId: string } }>(
    "/api/assets/:assetId/extraction",
    async (request, reply) => {
      const assetId = request.params.assetId;
      const asset = dependencies.repository.getAsset(assetId);
      if (!asset) {
        reply.status(404);
        return {
          error: { code: "ASSET_NOT_FOUND", message: "Asset was not found." },
        };
      }
      const run = dependencies.repository.getLatestExtractionRun(assetId);
      if (!run) {
        reply.status(404);
        return {
          error: {
            code: "NO_EXTRACTION_RUN",
            message: "This asset has no extraction run yet.",
          },
        };
      }
      return {
        extraction: {
          assetId,
          mode: run.mode,
          live: run.mode === "AI",
          ...(run.model ? { provider: dependencies.llm.name, model: run.model } : {}),
          sourceCount: run.sourceIds.length,
          factsExtracted: run.factsExtractedCount ?? 0,
          factsCited: run.factsCitedCount ?? 0,
          unknownFields: run.unknownFieldsCount ?? 0,
          unsupportedClaimsRejected: run.rejectedAttemptsCount ?? 0,
          schemaValidation: run.status === "SUCCEEDED" ? "PASSED" : "FAILED",
          sourceValidation: run.status === "SUCCEEDED" ? "PASSED" : "FAILED",
          completedAt: run.completedAt ?? run.startedAt,
        },
      };
    },
  );

  app.get<{ Params: { assetId: string } }>(
    "/api/assets/:assetId/passport",
    async (request, reply) => {
      const asset = dependencies.repository.getAsset(request.params.assetId);
      if (!asset) {
        reply.status(404);
        return {
          error: {
            code: "ASSET_NOT_FOUND",
            message: "Asset passport was not found.",
          },
        };
      }
      const latestRun = dependencies.repository.getLatestExtractionRun(
        request.params.assetId,
      );
      return {
        passport: asset,
        extraction: latestRun
          ? {
              mode: latestRun.mode,
              ...(latestRun.model ? { model: latestRun.model } : {}),
              sourceIds: latestRun.sourceIds,
              completedAt: latestRun.completedAt,
            }
          : undefined,
        disclaimer: dependencies.catalog.disclaimer,
      };
    },
  );

  app.get("/api/monitor/status", async () => ({
    monitor: dependencies.monitorService
      ? dependencies.monitorService.status()
      : {
          enabled: false,
          running: false,
          health: "DISABLED" as const,
          intervalSeconds: config.marketMonitorIntervalSeconds,
          monitoredAssets: [],
          successfulReads: 0,
          failedReads: 0,
        },
  }));

  app.get<{ Params: { assetId: string } }>(
    "/api/assets/:assetId/monitor",
    async (request, reply) => {
      const asset = dependencies.repository.getAsset(request.params.assetId);
      if (!asset) {
        reply.status(404);
        return {
          error: {
            code: "ASSET_NOT_FOUND",
            message: "Asset was not found.",
          },
        };
      }
      return {
        monitor: dependencies.monitorService
          ? dependencies.monitorService.assetStatus(request.params.assetId)
          : { assetId: request.params.assetId, monitoring: false },
      };
    },
  );

  async function computeEligibilityVerdict(assetId: string) {
    const passport = dependencies.repository.getAsset(assetId);
    if (!passport) return undefined;

    let quote;
    try {
      quote = await dependencies.marketData.getQuote(assetId);
    } catch (error) {
      if (!(error instanceof MarketDataError)) throw error;
      quote = undefined;
    }
    // A snapshot cannot predate the quote it contains. The provider samples
    // its own clock, so ordering alone is not enough -- any skew between it
    // and this service would produce an invalid snapshot. Take the later of
    // the two instants explicitly.
    const sampledAt = now().getTime();
    const quotedAt = quote ? Date.parse(quote.timestamp) : sampledAt;
    const capturedAt = new Date(Math.max(sampledAt, quotedAt)).toISOString();

    let marketSnapshotHash: `0x${string}` | undefined;
    if (quote) {
      dependencies.repository.saveQuotes([quote], capturedAt);
      const snapshot = MarketSnapshotSchema.parse({
        version: 1,
        dataMode: quote.dataMode,
        capturedAt,
        quotes: [quote],
      });
      marketSnapshotHash = hashMarketSnapshot(snapshot);
      dependencies.repository.saveMarketSnapshot(marketSnapshotHash, snapshot);
    }

    const policy = createDemoEligibilityPolicy();
    const verdict = evaluateEligibility({
      passport,
      policy,
      ...(quote ? { quote } : {}),
      ...(marketSnapshotHash ? { marketSnapshotHash } : {}),
      now: now(),
    });
    return { passport, verdict, policy };
  }

  app.get<{ Params: { assetId: string } }>(
    "/api/assets/:assetId/eligibility",
    async (request, reply) => {
      const result = await computeEligibilityVerdict(request.params.assetId);
      if (!result) {
        reply.status(404);
        return {
          error: {
            code: "ASSET_NOT_FOUND",
            message: "Asset passport was not found.",
          },
        };
      }
      return {
        verdict: result.verdict,
        policy: result.policy,
        disclaimer: dependencies.catalog.disclaimer,
      };
    },
  );

  app.post<{ Params: { assetId: string } }>(
    "/api/assets/:assetId/publish-verdict",
    async (request, reply) => {
      const assetId = request.params.assetId;
      const result = await computeEligibilityVerdict(assetId);
      if (!result) {
        reply.status(404);
        return {
          error: {
            code: "ASSET_NOT_FOUND",
            message: "Asset passport was not found.",
          },
        };
      }
      try {
        const signed = await dependencies.eligibilitySigner.sign(
          assetId,
          result.verdict,
          now(),
        );
        reply.status(201);
        return { signed, verdict: result.verdict };
      } catch (error) {
        if (!(error instanceof EligibilitySignerError)) throw error;
        reply.status(503);
        return { error: { code: error.code, message: error.message } };
      }
    },
  );

  app.get("/api/markets", async () => {
    const capturedAt = now().toISOString();
    const quotes = await dependencies.marketData.getQuotes(
      dependencies.catalog.assets.map((asset) => asset.id),
    );
    dependencies.repository.saveQuotes(quotes, capturedAt);
    return {
      dataMode: dependencies.catalog.dataMode,
      capturedAt,
      disclaimer: dependencies.catalog.disclaimer,
      quotes: quotes.map((quote) => ({
        ...quote,
        ageSeconds: Math.max(
          0,
          Math.floor(
            (Date.parse(capturedAt) - Date.parse(quote.timestamp)) / 1_000,
          ),
        ),
      })),
    };
  });

  app.post("/api/policies/compile", async (request, reply) => {
    const body = CompileBodySchema.parse(request.body);
    const compilation = await compileMandate(body.mandate, dependencies.llm);
    const record = dependencies.repository.savePolicy(
      compilation,
      now().toISOString(),
    );
    reply.status(201);
    return {
      policy: record,
      trust: {
        aiOutputValidated: true,
        deterministicPolicyHash: true,
        userApprovalRequired: record.policy.userApprovalRequired,
        onchainRegistered: false,
      },
    };
  });

  app.get<{ Params: { policyId: string } }>(
    "/api/policies/:policyId",
    async (request, reply) => {
      const record = dependencies.repository.getPolicy(request.params.policyId);
      if (!record) {
        reply.status(404);
        return {
          error: {
            code: "POLICY_NOT_FOUND",
            message: "Policy record was not found.",
          },
        };
      }
      return { policy: record };
    },
  );

  app.post("/api/portfolios/optimize", async (request, reply) => {
    const body = OptimizeBodySchema.parse(request.body);
    const resolved = resolvePolicy(dependencies.repository, body);
    const asOf = body.asOf ?? now().toISOString();
    const { input, marketSnapshotHash } = await optimizationInput(
      dependencies.repository,
      dependencies.marketData,
      dependencies.catalog,
      resolved.policy,
      asOf,
    );
    const proposal = optimizePortfolio(input);
    const record = dependencies.repository.saveProposal(proposal, asOf, {
      ...(resolved.policyId ? { policyId: resolved.policyId } : {}),
    });
    reply.status(201);
    return {
      ...record,
      marketSnapshotHash,
      dataMode: dependencies.catalog.dataMode,
      disclaimer: dependencies.catalog.disclaimer,
    };
  });

  app.post("/api/policies/check", async (request) => {
    const body = CheckBodySchema.parse(request.body);
    const resolved = resolvePolicy(dependencies.repository, body);
    const asOf = body.asOf ?? now().toISOString();
    const { input, marketSnapshotHash } = await optimizationInput(
      dependencies.repository,
      dependencies.marketData,
      dependencies.catalog,
      resolved.policy,
      asOf,
    );
    return {
      result: detectPolicyDrift(input, body.allocations),
      marketSnapshotHash,
      enforcement: "DETERMINISTIC_SIMULATION",
      onchainExecutionAttempted: false,
    };
  });

  app.post("/api/rebalance", async (request, reply) => {
    const body = CheckBodySchema.parse(request.body);
    const resolved = resolvePolicy(dependencies.repository, body);
    const asOf = body.asOf ?? now().toISOString();
    const { input, marketSnapshotHash } = await optimizationInput(
      dependencies.repository,
      dependencies.marketData,
      dependencies.catalog,
      resolved.policy,
      asOf,
      body.allocations,
    );
    const rebalance = proposeRebalance(input, body.allocations);
    const record = dependencies.repository.saveProposal(
      rebalance.proposal,
      asOf,
      { ...(resolved.policyId ? { policyId: resolved.policyId } : {}) },
    );
    reply.status(201);
    return {
      id: record.id,
      createdAt: record.createdAt,
      rebalance,
      marketSnapshotHash,
      dataMode: dependencies.catalog.dataMode,
      disclaimer: dependencies.catalog.disclaimer,
    };
  });

  // Demo-only controls. These deliberately degrade DEMO market data so the
  // gateway demo and Attack Lab can show ALIVE reacting to a real rule
  // violation. They are registered only when DEMO_MODE=true, and they can
  // only ever make demo data worse -- there is no path here that fabricates
  // or improves a quote, and nothing here touches a live provider.
  //
  // Two provider shapes need to work here: the bare ControllableDemoMarketDataProvider
  // (MARKET_DATA_PROVIDER=demo) and CompositeMarketDataProvider
  // (MARKET_DATA_PROVIDER=chainlink, the config that also serves ttbill-b's
  // real Chainlink feed). Only the former was ever recognized before, which
  // meant these controls -- and therefore the Attack Lab -- silently
  // returned 409 in the exact configuration that also runs the real ttbill-b
  // showcase. CompositeMarketDataProvider.degrade() already refuses to touch
  // a live-feed asset (MarketDataError), which both shapes now surface the
  // same way.
  type DegradeHandle = {
    setNavAge: (assetId: string, ageSeconds: number) => void;
    reset: () => void;
    list: () => Record<string, { ageSeconds?: number }>;
  };

  function degradeHandle(marketData: MarketDataProvider): DegradeHandle | undefined {
    if (marketData instanceof CompositeMarketDataProvider) {
      return {
        setNavAge: (assetId, ageSeconds) => marketData.degrade(assetId, ageSeconds),
        reset: () => marketData.clearDegradations(),
        list: () => marketData.listDegradations(),
      };
    }
    if (marketData instanceof ControllableDemoMarketDataProvider) {
      return {
        setNavAge: (assetId, ageSeconds) => {
          if (ageSeconds === 0) marketData.clearOverride(assetId);
          else marketData.setOverride(assetId, { ageSeconds });
        },
        reset: () => marketData.clearAllOverrides(),
        list: () => marketData.listOverrides(),
      };
    }
    return undefined;
  }

  if (config.demoMode) {
    const handle = degradeHandle(dependencies.marketData);

    function requireHandle(reply: {
      status: (code: number) => unknown;
    }): DegradeHandle | undefined {
      if (handle) return handle;
      reply.status(409);
      return undefined;
    }

    app.post<{ Params: { assetId: string } }>(
      "/api/demo/assets/:assetId/nav-age",
      async (request, reply) => {
        const provider = requireHandle(reply);
        if (!provider) {
          return {
            error: {
              code: "DEMO_CONTROLS_UNAVAILABLE",
              message:
                "The active market-data provider does not support demo degradation.",
            },
          };
        }
        const body = DemoNavAgeBodySchema.parse(request.body);
        try {
          provider.setNavAge(request.params.assetId, body.ageSeconds);
        } catch (error) {
          if (!(error instanceof MarketDataError)) throw error;
          reply.status(409);
          return { error: { code: error.code, message: error.message } };
        }
        return {
          assetId: request.params.assetId,
          ageSeconds: body.ageSeconds,
          dataMode: "DEMO",
          overrides: provider.list(),
        };
      },
    );

    app.post("/api/demo/reset", async (_request, reply) => {
      const provider = requireHandle(reply);
      if (!provider) {
        return {
          error: {
            code: "DEMO_CONTROLS_UNAVAILABLE",
            message:
              "The active market-data provider does not support demo degradation.",
          },
        };
      }
      provider.reset();
      return { reset: true, overrides: provider.list() };
    });

    app.get("/api/demo/state", async (_request, reply) => {
      const provider = requireHandle(reply);
      if (!provider) {
        return {
          error: {
            code: "DEMO_CONTROLS_UNAVAILABLE",
            message:
              "The active market-data provider does not support demo degradation.",
          },
        };
      }
      return { demoMode: true, overrides: provider.list() };
    });

    // Real X Layer Testnet enforcement proof for the Attack Lab: signs the
    // asset's current deterministic verdict, publishes it to
    // AliveEligibilityRegistry, waits for the receipt, then attempts
    // depositEligibleAsset against the freshly-published state on
    // AliveVault. Reuses the exact eligibility computation and signer
    // already used by /publish-verdict -- this route only adds the
    // broadcasting step, not a second verdict pipeline. Never touches a
    // live Chainlink-backed asset: feedForAsset() gates that before any
    // signing or broadcasting happens, same protection the market-data
    // degrade routes already enforce.
    app.post<{ Params: { assetId: string } }>(
      "/api/demo/assets/:assetId/gateway-proof",
      async (request, reply) => {
        const assetId = request.params.assetId;
        if (feedForAsset(assetId)) {
          reply.status(409);
          return {
            error: {
              code: "PROVIDER_DISABLED",
              message: `${assetId} is backed by a live Chainlink feed. ALIVE does not publish or enforce simulated verdicts against a real asset.`,
            },
          };
        }

        const result = await computeEligibilityVerdict(assetId);
        if (!result) {
          reply.status(404);
          return { error: { code: "ASSET_NOT_FOUND", message: "Asset passport was not found." } };
        }

        let signed;
        try {
          signed = await dependencies.eligibilitySigner.sign(assetId, result.verdict, now());
        } catch (error) {
          if (!(error instanceof EligibilitySignerError)) throw error;
          reply.status(503);
          return { error: { code: error.code, message: error.message } };
        }

        const clientConfig = resolveGatewayClientConfig(assetId);
        if (!clientConfig.configured) {
          reply.status(503);
          return {
            error: {
              code: "GATEWAY_CLIENT_UNAVAILABLE",
              message: `Onchain broadcasting is not configured. Missing: ${clientConfig.missing.join(", ")}.`,
            },
          };
        }

        const client = new GatewayClient(clientConfig.config, assetIdHashFor(assetId));
        const decimals = await client.tokenDecimals();
        const amount = 10n ** BigInt(decimals) * 100n; // 100 demo tokens

        try {
          const publish = await client.publishVerdict(signed);
          await client.ensureFunded(amount);
          const deposit = await client.attemptDeposit(amount);
          reply.status(200);
          return {
            assetId,
            verdict: result.verdict,
            broadcaster: client.broadcasterAddress,
            publish: {
              txHash: publish.txHash,
              blockNumber: publish.blockNumber,
              onchainEligible: publish.onchainEligible,
            },
            deposit,
          };
        } catch (error) {
          reply.status(502);
          return {
            error: {
              code: "GATEWAY_BROADCAST_FAILED",
              message: error instanceof Error ? error.message : "Broadcast failed.",
            },
          };
        }
      },
    );
  }

  app.addHook("onClose", async () => {
    dependencies.repository.close();
  });

  return app;
}
