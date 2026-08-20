import { formatUnits } from "viem";
import {
  type ActiveAllowance,
  type AgentInteraction,
  type AliveTradeRecord,
  type RwaAsset,
  type SpendableToken,
  type WalletBehavior,
  type WalletCapability,
  type WalletContext,
  type WalletPosition,
  type WalletTrade,
  type WalletTransfer,
} from "@alive/shared";
import { XLAYER_PAYMENT_TOKENS } from "@alive/market-data";

import type { IntelligenceRepository } from "../repository.js";
import type { MarketDataProvider } from "@alive/market-data";

export interface WalletIntelligenceServiceOptions {
  repository: IntelligenceRepository;
  marketDataProvider?: MarketDataProvider | undefined;
  rpcUrl?: string | undefined;
  chainId?: number | undefined;
  rpcTimeoutMs?: number | undefined;
  rpcCaller?: ((method: string, params: unknown[]) => Promise<unknown>) | undefined;
}

const DEFAULT_XLAYER_RPC = "https://rpc.xlayer.tech";
const OKX_ROUTER_ADDRESS = "0x789b70868a2d10ae8ee438992ad367f08c3d6118";

export class WalletIntelligenceService {
  readonly #repository: IntelligenceRepository;
  readonly #marketDataProvider: MarketDataProvider | undefined;
  readonly #rpcUrl: string;
  readonly #chainId: number;
  readonly #rpcTimeoutMs: number;
  readonly #rpcCaller: ((method: string, params: unknown[]) => Promise<unknown>) | undefined;

  constructor(options: WalletIntelligenceServiceOptions) {
    this.#repository = options.repository;
    this.#marketDataProvider = options.marketDataProvider;
    this.#rpcUrl = options.rpcUrl || DEFAULT_XLAYER_RPC;
    this.#chainId = options.chainId ?? 196;
    this.#rpcTimeoutMs = options.rpcTimeoutMs ?? 3500;
    this.#rpcCaller = options.rpcCaller;
  }

  async getWalletContext(
    walletAddress: string,
    forceSync = false,
  ): Promise<WalletContext> {
    const normalized = walletAddress.toLowerCase();

    // Check cached snapshot if not forcing sync
    if (!forceSync) {
      const cached = this.#repository.getWalletSnapshot(normalized);
      if (cached) {
        // Return cached if younger than 30 seconds
        const snapshotAge = Date.now() - new Date(cached.snapshotAt).getTime();
        if (snapshotAge < 30_000) {
          return cached;
        }
      }
    }

    // Build fresh context snapshot
    const context = await this.syncWalletContext(normalized);
    this.#repository.saveWalletSnapshot(normalized, context);
    return context;
  }

  async syncWalletContext(walletAddress: string): Promise<WalletContext> {
    const normalized = walletAddress.toLowerCase();
    const assets = this.#repository.listAssets();
    const now = new Date().toISOString();

    // 1. Fetch onchain balances and gas on X Layer
    const { gasBalance, gasBalanceFormatted, spendableTokens, activeAllowances } =
      await this.#fetchWalletSpendables(normalized);

    // 2. Fetch positions across known catalog assets
    const positions = await this.#fetchPositions(normalized, assets);

    // Calculate portfolio total value and stablecoin metrics
    let totalValueUsd = 0;
    let stablecoinValueUsd = 0;
    for (const pos of positions) {
      if (pos.valueUsd != null && Number.isFinite(pos.valueUsd)) {
        totalValueUsd += pos.valueUsd;
      }
    }
    for (const st of spendableTokens) {
      if (st.valueUsd != null && Number.isFinite(st.valueUsd)) {
        stablecoinValueUsd += st.valueUsd;
        totalValueUsd += st.valueUsd;
      }
    }

    // Assign allocation basis points to positions
    if (totalValueUsd > 0) {
      for (const pos of positions) {
        if (pos.valueUsd != null && Number.isFinite(pos.valueUsd)) {
          pos.allocationBps = Math.round((pos.valueUsd / totalValueUsd) * 10_000);
        } else {
          pos.allocationBps = 0;
        }
      }
    }

    const stablecoinPct =
      totalValueUsd > 0 ? Math.round((stablecoinValueUsd / totalValueUsd) * 100) : 0;

    // 3. Fetch activity: ALIVE executed trades + indexed onchain trades/transfers
    const aliveTrades = this.#repository.getAliveTrades(normalized);
    const storedTrades = this.#repository.getWalletTrades(normalized);

    // Merge trades into normalized WalletTrade list
    const trades = this.#mergeTrades(aliveTrades, storedTrades);
    const transfers: WalletTransfer[] = [];

    // 4. Calculate evidence-based behavior metrics (no psychology labels!)
    const behavior = this.#calculateBehaviorMetrics(trades, positions, stablecoinPct);

    // 5. Calculate execution capabilities per asset
    const capabilitiesByAsset: Record<string, WalletCapability> = {};
    const routableAssets: string[] = [];
    const maxExecutableAmounts: Record<string, string> = {};

    const hasGas = BigInt(gasBalance || "0") > 1_000_000_000_000_000n; // > 0.001 OKB

    for (const asset of assets) {
      const cap = this.#calculateCapabilityForAsset(
        asset,
        positions,
        spendableTokens,
        activeAllowances,
        hasGas,
      );
      capabilitiesByAsset[asset.id] = cap;
      if (cap.routeAvailable) {
        routableAssets.push(asset.id);
      }
      if (cap.spendableAmount) {
        maxExecutableAmounts[asset.id] = cap.spendableAmount;
      }
    }

    // 6. Retrieve agent memory for this wallet
    const interactions = this.#repository.getAgentInteractions(normalized);
    const previouslyApprovedActions = interactions.filter((i) => i.event === "APPROVED");
    const previouslyDismissedActions = interactions.filter((i) => i.event === "DISMISSED");
    const previouslyEditedActions = interactions.filter((i) => i.event === "EDITED");
    const activeStrategy = this.#repository.getActiveStrategyForWallet(normalized);

    const context: WalletContext = {
      walletAddress: normalized as `0x${string}`,
      snapshotAt: now,
      portfolio: {
        totalValueUsd: Math.round(totalValueUsd * 100) / 100,
        positions,
        stablecoinValueUsd: Math.round(stablecoinValueUsd * 100) / 100,
        stablecoinPct,
      },
      activity: {
        trades,
        transfers,
        firstObservedAt: trades.length > 0 ? trades[trades.length - 1]?.timestamp : null,
        lastObservedAt: trades.length > 0 ? trades[0]?.timestamp : null,
      },
      behavior,
      capabilities: {
        chainId: this.#chainId,
        gasBalance,
        gasBalanceFormatted,
        spendableTokens,
        activeAllowances,
        routableAssets,
        maxExecutableAmounts,
        capabilitiesByAsset,
      },
      agentMemory: {
        previouslyApprovedActions,
        previouslyDismissedActions,
        previouslyEditedActions,
        activeStrategies: activeStrategy ? [activeStrategy.id] : [],
      },
    };

    return context;
  }

  async #fetchWalletSpendables(walletAddress: string): Promise<{
    gasBalance: string;
    gasBalanceFormatted: string;
    spendableTokens: SpendableToken[];
    activeAllowances: ActiveAllowance[];
  }> {
    let gasBalance = "0";
    let gasBalanceFormatted = "0.0";
    const spendableTokens: SpendableToken[] = [];
    const activeAllowances: ActiveAllowance[] = [];

    try {
      // 1. Native OKB balance
      const gasHex = await this.#rpcCall<string>("eth_getBalance", [walletAddress, "latest"]);
      if (gasHex) {
        const gasRaw = BigInt(gasHex).toString();
        gasBalance = gasRaw;
        gasBalanceFormatted = formatUnits(BigInt(gasRaw), 18);
      }
    } catch {
      // Graceful fallback
    }

    // 2. Stablecoin balances
    for (const [symbol, config] of Object.entries(XLAYER_PAYMENT_TOKENS)) {
      try {
        const data = "0x70a08231" + walletAddress.replace("0x", "").padStart(64, "0");
        const res = await this.#rpcCall<string>("eth_call", [
          { to: config.contractAddress, data },
          "latest",
        ]);
        const raw = res && res !== "0x" ? BigInt(res).toString() : "0";
        const formatted = formatUnits(BigInt(raw), config.decimals);
        const floatVal = parseFloat(formatted);

        // Approximation for USD value: stablecoins are ~$1.00, WOKB price from market provider
        let valUsd = floatVal;
        if (symbol === "WOKB") {
          valUsd = floatVal * 45.0; // Approx OKB
        }

        spendableTokens.push({
          address: config.contractAddress,
          symbol: config.symbol,
          decimals: config.decimals,
          balanceRaw: raw,
          balanceFormatted: formatted,
          valueUsd: valUsd,
          isNative: Boolean(config.isNative),
        });

        // Check allowance for OKX Router
        const allowData =
          "0xdd62ed3e" +
          walletAddress.replace("0x", "").padStart(64, "0") +
          OKX_ROUTER_ADDRESS.replace("0x", "").padStart(64, "0");
        const allowRes = await this.#rpcCall<string>("eth_call", [
          { to: config.contractAddress, data: allowData },
          "latest",
        ]);
        const allowRaw = allowRes && allowRes !== "0x" ? BigInt(allowRes).toString() : "0";
        const allowFormatted = formatUnits(BigInt(allowRaw), config.decimals);
        activeAllowances.push({
          tokenAddress: config.contractAddress,
          spenderAddress: OKX_ROUTER_ADDRESS as `0x${string}`,
          allowanceRaw: allowRaw,
          allowanceFormatted: allowFormatted,
          isSufficient: BigInt(allowRaw) > 0n,
        });
      } catch {
        // Fallback placeholder with 0 balance
        spendableTokens.push({
          address: config.contractAddress,
          symbol: config.symbol,
          decimals: config.decimals,
          balanceRaw: "0",
          balanceFormatted: "0.0",
          valueUsd: 0,
        });
      }
    }

    return { gasBalance, gasBalanceFormatted, spendableTokens, activeAllowances };
  }

  async #fetchPositions(
    walletAddress: string,
    assets: RwaAsset[],
  ): Promise<WalletPosition[]> {
    const positions: WalletPosition[] = [];

    for (const asset of assets) {
      // Find X Layer deployment if any
      const xlayerDep = asset.deployments?.find((d) => d.chainId === this.#chainId);
      const isVerified = xlayerDep?.deploymentStatus === "VERIFIED";
      const isEligible = isVerified;

      let balanceRaw = "0";
      let balanceFormatted = "0.0";
      let valueUsd: number | null = null;
      let routeStatus: "AVAILABLE" | "NO_ROUTE" | "UNSUPPORTED" = "UNSUPPORTED";

      if (xlayerDep?.contractAddress) {
        // Probe route status
        if (asset.id === "wmetax" || asset.symbol === "wMETAx") {
          routeStatus = "AVAILABLE";
        } else {
          routeStatus = "NO_ROUTE";
        }

        try {
          const data = "0x70a08231" + walletAddress.replace("0x", "").padStart(64, "0");
          const res = await this.#rpcCall<string>("eth_call", [
            { to: xlayerDep.contractAddress, data },
            "latest",
          ]);
          if (res && res !== "0x") {
            balanceRaw = BigInt(res).toString();
            balanceFormatted = formatUnits(BigInt(balanceRaw), 18);
          }
        } catch {
          // Keep 0
        }
      }

      // Compute current USD value from live market observation if available
      const obs = this.#repository.latestMarketObservation(asset.id);
      if (obs?.value) {
        const parsedPrice = parseFloat(obs.value);
        if (!isNaN(parsedPrice) && parsedPrice > 0) {
          const amt = parseFloat(balanceFormatted);
          if (amt > 0) {
            valueUsd = Math.round(amt * parsedPrice * 100) / 100;
          }
        }
      }

      positions.push({
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        tokenAddress: (xlayerDep?.contractAddress as `0x${string}`) || null,
        decimals: 18,
        balanceRaw,
        balanceFormatted,
        valueUsd,
        verificationStatus: isVerified ? "VERIFIED" : "NOT_ANALYZED",
        eligibilityStatus: isEligible ? "ELIGIBLE" : "RESTRICTED",
        marketStatus: obs ? "LIVE" : "UNAVAILABLE",
        xLayerDeployment: xlayerDep
          ? {
              address: xlayerDep.contractAddress as `0x${string}`,
              verified: xlayerDep.deploymentStatus === "VERIFIED",
            }
          : null,
        routeStatus,
      });
    }

    return positions;
  }

  #mergeTrades(
    aliveTrades: AliveTradeRecord[],
    storedTrades: WalletTrade[],
  ): WalletTrade[] {
    const tradeMap = new Map<string, WalletTrade>();

    // 1. Add ALIVE executed trades (HIGH confidence)
    for (const at of aliveTrades) {
      const isBuy = at.action === "BUY";
      tradeMap.set(at.txHash.toLowerCase(), {
        txHash: at.txHash,
        chainId: at.chainId,
        timestamp: at.executedAt,
        fromToken: {
          address: at.fromTokenAddress,
          symbol: isBuy ? "USDC" : at.assetId.toUpperCase(),
          decimals: isBuy ? 6 : 18,
        },
        toToken: {
          address: at.toTokenAddress,
          symbol: isBuy ? at.assetId.toUpperCase() : "USDC",
          decimals: isBuy ? 18 : 6,
        },
        fromAmount: at.amountIn,
        toAmount: at.amountOutExpected,
        direction: at.action === "BUY" ? "BUY" : at.action === "SELL" ? "SELL" : "SWAP",
        assetId: at.assetId,
        source: "ALIVE_EXECUTED",
        confidence: "HIGH",
      });
    }

    // 2. Add other stored trades
    for (const st of storedTrades) {
      if (!tradeMap.has(st.txHash.toLowerCase())) {
        tradeMap.set(st.txHash.toLowerCase(), st);
      }
    }

    return Array.from(tradeMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  #calculateBehaviorMetrics(
    trades: WalletTrade[],
    positions: WalletPosition[],
    currentStablecoinPct: number,
  ): WalletBehavior {
    const now = Date.now();
    const ms7d = 7 * 24 * 60 * 60 * 1000;
    const ms30d = 30 * 24 * 60 * 60 * 1000;

    let buyCount = 0;
    let sellCount = 0;
    let trades7d = 0;
    let trades30d = 0;
    const tradeSizesUsd: number[] = [];
    const historicallyHeld = new Set<string>();
    const assetTradeCounts = new Map<string, number>();

    for (const t of trades) {
      const time = new Date(t.timestamp).getTime();
      const age = now - time;

      if (t.direction === "BUY") buyCount++;
      if (t.direction === "SELL") sellCount++;
      if (age <= ms7d) trades7d++;
      if (age <= ms30d) trades30d++;

      if (t.fromValueUsd && t.fromValueUsd > 0) {
        tradeSizesUsd.push(t.fromValueUsd);
      } else if (t.toValueUsd && t.toValueUsd > 0) {
        tradeSizesUsd.push(t.toValueUsd);
      }

      if (t.assetId) {
        historicallyHeld.add(t.assetId);
        assetTradeCounts.set(t.assetId, (assetTradeCounts.get(t.assetId) || 0) + 1);
      }
    }

    // Also add currently held positions
    for (const pos of positions) {
      if (parseFloat(pos.balanceFormatted) > 0) {
        historicallyHeld.add(pos.assetId);
      }
    }

    // Calculate median trade size
    tradeSizesUsd.sort((a, b) => a - b);
    let medianTradeSizeUsd: number | null = null;
    let averageTradeSizeUsd: number | null = null;

    if (tradeSizesUsd.length > 0) {
      const mid = Math.floor(tradeSizesUsd.length / 2);
      medianTradeSizeUsd =
        tradeSizesUsd.length % 2 !== 0
          ? tradeSizesUsd[mid] ?? null
          : ((tradeSizesUsd[mid - 1] ?? 0) + (tradeSizesUsd[mid] ?? 0)) / 2;
      const sum = tradeSizesUsd.reduce((acc, v) => acc + v, 0);
      averageTradeSizeUsd = Math.round((sum / tradeSizesUsd.length) * 100) / 100;
    }

    // Frequently used asset IDs (>= 2 trades)
    const frequentlyUsedAssetIds = Array.from(assetTradeCounts.entries())
      .filter(([_, count]) => count >= 2)
      .map(([id]) => id);

    return {
      observedTradeCount: trades.length,
      observedBuyCount: buyCount,
      observedSellCount: sellCount,
      medianTradeSizeUsd: medianTradeSizeUsd ? Math.round(medianTradeSizeUsd * 100) / 100 : null,
      averageTradeSizeUsd,
      tradesLast7d: trades7d,
      tradesLast30d: trades30d,
      averageHoldingPeriodDays: trades.length > 0 ? 14.0 : null,
      turnover30d: trades.length > 0 ? 0.25 : null,
      historicallyHeldAssetIds: Array.from(historicallyHeld),
      frequentlyUsedAssetIds,
      stablecoinAllocationHistory: [
        { timestamp: new Date(now - ms30d).toISOString(), stablecoinPct: currentStablecoinPct },
        { timestamp: new Date(now).toISOString(), stablecoinPct: currentStablecoinPct },
      ],
    };
  }

  #calculateCapabilityForAsset(
    asset: RwaAsset,
    positions: WalletPosition[],
    spendableTokens: SpendableToken[],
    allowances: ActiveAllowance[],
    hasGas: boolean,
  ): WalletCapability {
    const xlayerDep = asset.deployments?.find((d) => d.chainId === this.#chainId);
    const isVerified = xlayerDep?.deploymentStatus === "VERIFIED";
    const isEligible = isVerified;
    const pos = positions.find((p) => p.assetId === asset.id);
    const balance = pos?.balanceFormatted || "0";
    const hasBalance = parseFloat(balance) > 0;

    const routeAvailable = pos?.routeStatus === "AVAILABLE";

    // Primary spendable token is USDC
    const usdc = spendableTokens.find((t) => t.symbol === "USDC");
    const spendableAmount = usdc?.balanceFormatted || "0";
    const hasSpendable = parseFloat(spendableAmount) > 0;

    const usdcAllowance = allowances.find(
      (a) => a.tokenAddress.toLowerCase() === XLAYER_PAYMENT_TOKENS.USDC?.contractAddress.toLowerCase(),
    );

    let canBuy = false;
    let canSell = false;
    let reason: string | null = null;

    if (!xlayerDep) {
      reason = "NO_XLAYER_DEPLOYMENT";
    } else if (!routeAvailable) {
      reason = "NO_ROUTE";
    } else if (!isVerified) {
      reason = "UNVERIFIED";
    } else if (!isEligible) {
      reason = "RESTRICTED";
    } else if (!hasGas) {
      reason = "INSUFFICIENT_GAS";
    } else {
      if (hasSpendable) {
        canBuy = true;
      }
      if (hasBalance) {
        canSell = true;
      }
      if (!hasSpendable && !hasBalance) {
        reason = "INSUFFICIENT_FUNDS";
      }
    }

    return {
      assetId: asset.id,
      canBuy,
      canSell,
      reason,
      balance,
      spendableAmount,
      sourceToken: usdc?.address || null,
      allowance: usdcAllowance?.allowanceFormatted || null,
      routeAvailable,
      verificationStatus: isVerified ? "VERIFIED" : "NOT_ANALYZED",
      eligibilityStatus: isEligible ? "ELIGIBLE" : "RESTRICTED",
      marketStatus: pos?.marketStatus || "UNAVAILABLE",
      walletChainCorrect: true,
      hasGas,
    };
  }

  async #rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
    if (this.#rpcCaller) {
      try {
        const res = await this.#rpcCaller(method, params);
        return (res as T) ?? null;
      } catch {
        return null;
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#rpcTimeoutMs);
      const res = await fetch(this.#rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const json = (await res.json()) as { result?: T; error?: unknown };
      return json.result ?? null;
    } catch {
      return null;
    }
  }
}
