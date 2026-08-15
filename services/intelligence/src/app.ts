import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";

import {
  IsoDateSchema,
  MarketSnapshotSchema,
  PortfolioPolicySchema,
  hashMarketSnapshot,
  type PortfolioPolicy,
  type RwaCatalog,
} from "@alive/shared";
import type { MarketDataProvider } from "@alive/market-data";
import {
  detectPolicyDrift,
  optimizePortfolio,
  proposeRebalance,
  type Allocation,
  type OptimizationInput,
} from "@alive/optimizer";

import { compileMandate } from "./compiler.js";
import type { IntelligenceConfig } from "./config.js";
import type { LlmJsonProvider } from "./llm.js";
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
  const snapshot = MarketSnapshotSchema.parse({
    version: 1,
    dataMode: catalog.dataMode,
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

  app.get("/api/assets", async () => ({
    catalog: {
      id: dependencies.catalog.catalogId,
      label: dependencies.catalog.label,
      dataMode: dependencies.catalog.dataMode,
      asOf: dependencies.catalog.asOf,
      disclaimer: dependencies.catalog.disclaimer,
    },
    assets: dependencies.repository.listAssets(),
  }));

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
    const record = dependencies.repository.saveProposal(
      proposal,
      asOf,
      resolved.policyId,
    );
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
      resolved.policyId,
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

  app.addHook("onClose", async () => {
    dependencies.repository.close();
  });

  return app;
}
