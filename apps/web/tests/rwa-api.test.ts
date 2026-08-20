import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RwaApiError,
  checkRwaPolicy,
  compileRwaPolicy,
  listRwaMarkets,
} from "@/lib/rwa-api";
import { clearRwaState, readRwaState, rememberRwaState } from "@/lib/rwa-state";

const policy = {
  version: 1,
  objective: "CAPITAL_PRESERVATION",
  minimumCashBps: 1_000,
  assetClassLimits: [
    { assetClass: "CASH", minimumBps: 1_000, maximumBps: 3_000 },
    { assetClass: "TREASURY", minimumBps: 5_000, maximumBps: 9_000 },
  ],
  maximumSingleAssetBps: 2_000,
  maximumSingleIssuerBps: 2_500,
  minimumLiquidityScore: 70,
  maximumPortfolioRiskScore: 40,
  maximumPriceAgeSeconds: 120,
  maximumSlippageBps: 50,
  allowedAssetIds: [],
  blockedAssetIds: [],
  allowedIssuers: [],
  blockedIssuers: [],
  userApprovalRequired: true,
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("RWA intelligence client", () => {
  it("submits a real mandate and preserves the compiler trust boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          policy: {
            id: "f14d4f44-a0f1-44d6-8ef6-92390874d8da",
            version: 1,
            createdAt: "2026-08-15T00:00:00.000Z",
            originalMandate: "Protect capital",
            policy,
            policyHash: `0x${"11".repeat(32)}`,
            explanation: ["Treasuries: minimum 5000 BPS"],
            warnings: ["AI compiler offline"],
            compiler: {
              mode: "DETERMINISTIC_FALLBACK",
              isAiGenerated: false,
              provider: "disabled",
            },
          },
          trust: {
            aiOutputValidated: true,
            deterministicPolicyHash: true,
            userApprovalRequired: true,
            onchainRegistered: false,
          },
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await compileRwaPolicy("Protect capital");
    expect(result.policy.compiler).toEqual({
      mode: "DETERMINISTIC_FALLBACK",
      isAiGenerated: false,
      provider: "disabled",
    });
    expect(result.trust.onchainRegistered).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4200/api/policies/compile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mandate: "Protect capital" }),
        headers: expect.objectContaining({
          "content-type": "application/json",
        }),
      }),
    );
  });

  it("normalizes market freshness without relabeling demo data as live", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          dataMode: "DEMO",
          capturedAt: "2026-08-15T00:00:01.000Z",
          disclaimer: "DEMO DATA. NOT LIVE MARKET DATA.",
          quotes: [
            {
              assetId: "tusdc",
              price: "1",
              timestamp: "2026-08-15T00:00:00.000Z",
              provider: "ALIVE_DEMO_MARKET",
              status: "OPEN",
              dataMode: "DEMO",
              ageSeconds: 1,
            },
          ],
        }),
      ),
    );

    await expect(listRwaMarkets()).resolves.toMatchObject({
      dataMode: "DEMO",
      quotes: [{ assetId: "tusdc", ageSeconds: 1, dataMode: "DEMO" }],
    });
  });

  it("keeps deterministic policy rejection distinct from onchain execution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          result: {
            withinPolicy: false,
            violations: [
              {
                code: "ASSET_LIMIT_EXCEEDED",
                message: "Single asset cap exceeded",
              },
            ],
            currentMetrics: {},
          },
          marketSnapshotHash: `0x${"22".repeat(32)}`,
          enforcement: "DETERMINISTIC_SIMULATION",
          onchainExecutionAttempted: false,
        }),
      ),
    );

    await expect(
      checkRwaPolicy("f14d4f44-a0f1-44d6-8ef6-92390874d8da", [
        { assetId: "tnvda", weightBps: 10_000 },
      ]),
    ).resolves.toMatchObject({
      result: { withinPolicy: false },
      enforcement: "DETERMINISTIC_SIMULATION",
      onchainExecutionAttempted: false,
    });
  });

  it("surfaces structured intelligence errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            {
              error: {
                code: "POLICY_NOT_FOUND",
                message: "Policy record was not found.",
              },
            },
            404,
          ),
        ),
    );

    await expect(checkRwaPolicy("missing", [])).rejects.toEqual(
      expect.objectContaining<RwaApiError>({
        name: "RwaApiError",
        code: "POLICY_NOT_FOUND",
        message: "Policy record was not found.",
        status: 404,
      }),
    );
  });

  it("fetches and validates normalized CoinMarketCap token market context", async () => {
    const mockContext = {
      provider: "coinmarketcap",
      providerMode: "KEYLESS_PUBLIC",
      assetId: "meta-xstock",
      chainId: 196,
      contractAddress: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
      priceUsd: 549.10,
      marketCapUsd: 112148.01,
      volume24hUsd: 22892.52,
      priceChange24hPct: -0.018,
      liquidityUsd: 192264.02,
      dex: {
        exchangeName: "Uniswap v3 (X Layer)",
        pair: "USDG/WMETAX",
      },
      sourceUpdatedAt: "2026-08-19T14:47:47.000Z",
      observedAt: "2026-08-19T14:50:00.000Z",
      dataMode: "LIVE",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          assetId: "meta-xstock",
          market: mockContext,
        }),
      ),
    );

    const { getAssetMarketContext } = await import("@/lib/rwa-api");
    const result = await getAssetMarketContext("meta-xstock");

    expect(result.provider).toBe("coinmarketcap");
    expect(result.dataMode).toBe("LIVE");
    expect(result.priceUsd).toBe(549.10);
    expect(result.dex?.exchangeName).toBe("Uniswap v3 (X Layer)");
  });
});


describe("RWA presentation persistence", () => {
  it("stores only safe IDs and a validated public vault address", () => {
    const values = new Map<string, string>();
    vi.stubGlobal(
      "CustomEvent",
      class {
        constructor(
          public type: string,
          public init: unknown,
        ) {}
      },
    );
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      dispatchEvent: vi.fn(),
    });

    rememberRwaState({
      policyId: "policy-1",
      proposalId: "proposal-1",
      vaultAddress: `0x${"ab".repeat(20)}`,
    });
    expect(readRwaState()).toEqual({
      policyId: "policy-1",
      proposalId: "proposal-1",
      vaultAddress: `0x${"ab".repeat(20)}`,
    });
    expect(values.get("alive:rwa:presentation:v1")).not.toMatch(
      /secret|private|nonce/iu,
    );

    clearRwaState();
    expect(readRwaState()).toEqual({});
  });
});
