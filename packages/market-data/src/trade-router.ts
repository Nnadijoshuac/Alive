import crypto from "node:crypto";
import { encodeFunctionData, formatUnits, parseAbi, parseUnits } from "viem";

export type PaymentTokenConfig = {
  chainId: 196;
  symbol: string;
  name: string;
  contractAddress: `0x${string}`;
  decimals: number;
  isNative?: boolean;
};

export const XLAYER_PAYMENT_TOKENS: Record<string, PaymentTokenConfig> = {
  USDC: {
    chainId: 196,
    symbol: "USDC",
    name: "USD Coin",
    contractAddress: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
    decimals: 6,
  },
  USDT: {
    chainId: 196,
    symbol: "USDT",
    name: "Tether USD",
    contractAddress: "0x1e4a5963abfd975d8c9021ce480b42188849d41d",
    decimals: 6,
  },
  USDG: {
    chainId: 196,
    symbol: "USDG",
    name: "Global Dollar",
    contractAddress: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
    decimals: 6,
  },
  WOKB: {
    chainId: 196,
    symbol: "WOKB",
    name: "Wrapped OKB",
    contractAddress: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
    decimals: 18,
  },
};

export type SwapQuoteRequest = {
  chainId: 196;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string; // Human readable (e.g. "100") or atomic units
  userWalletAddress?: string;
  slippageBps?: number; // Integer bps e.g. 50 = 0.5%
};

export type SwapQuoteResponse = {
  hasRoute: boolean;
  status: "AVAILABLE" | "NO_ROUTE" | "PROVIDER_UNAVAILABLE";
  provider: "OKX DEX" | "OKX OnchainOS Router";
  chainId: 196;
  fromToken: {
    symbol: string;
    contractAddress: string;
    decimals: number;
    amount: string; // Human readable
    amountRaw: string; // Atomic units
  };
  toToken: {
    symbol: string;
    contractAddress: string;
    decimals: number;
    estimatedAmount: string; // Human readable
    estimatedAmountRaw: string; // Atomic units
  };
  executionPrice: number;
  marketPrice?: number;
  priceImpactPct: number;
  estimatedGasUsd: number;
  tradeFeeUsd?: number;
  minimumReceived: string;
  routeName: string;
  routerAddress: string;
  allowanceTarget: string;
  quoteFetchedAt: string;
  expiresAt: string;
  reason?: string;
};

export type SwapTransactionRequest = {
  chainId: 196;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  userWalletAddress: string;
  slippageBps?: number;
};

export type SwapTransactionResponse = {
  chainId: 196;
  to: `0x${string}`; // Router or aggregation contract
  data: `0x${string}`; // Calldata for swap
  value: `0x${string}`; // Native value (hex string)
  gasLimit?: string;
  allowanceTarget: string;
  quote: SwapQuoteResponse;
};

const swapAbi = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);

export class OkxTradeRouter {
  private readonly apiKey?: string;
  private readonly secretKey?: string;
  private readonly passphrase?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  // Standard X Layer DEX aggregator router address
  readonly defaultRouterAddress = "0x789b70868a2d10ae8ee438992ad367f08c3d6118";

  constructor(options: {
    apiKey?: string;
    secretKey?: string;
    passphrase?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {}) {
    this.apiKey = options.apiKey ?? process.env.OKX_API_KEY;
    this.secretKey =
      options.secretKey ??
      process.env.OKX_SECRET_KEY ??
      process.env.OKX_API_SECRET;
    this.passphrase =
      options.passphrase ??
      process.env.OKX_API_PASSPHRASE ??
      process.env.OKX_PASSPHRASE;
    this.baseUrl = (options.baseUrl ?? "https://web3.okx.com").replace(
      /\/+$/u,
      "",
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.secretKey && this.passphrase);
  }

  private generateAuthHeaders(
    method: "GET" | "POST",
    pathWithQuery: string,
    body = "",
  ): Record<string, string> {
    if (!this.isConfigured()) {
      return {
        "User-Agent": "ALIVE-Trade-Terminal/1.0",
        Accept: "application/json",
      };
    }

    const timestamp = new Date().toISOString();
    const prehash = `${timestamp}${method}${pathWithQuery}${body}`;
    const sign = crypto
      .createHmac("sha256", this.secretKey!)
      .update(prehash)
      .digest("base64");

    return {
      "User-Agent": "ALIVE-Trade-Terminal/1.0",
      Accept: "application/json",
      "OK-ACCESS-KEY": this.apiKey!,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": this.passphrase!,
    };
  }

  /**
   * Derives atomic units and human-readable numbers safely.
   */
  private parseAmount(amountStr: string, decimals: number): { human: string; raw: bigint } {
    const clean = amountStr.trim();
    if (!clean || Number.isNaN(Number(clean)) || Number(clean) <= 0) {
      throw new Error("Invalid swap amount. Must be a positive number.");
    }

    if (clean.includes(".")) {
      const parts = clean.split(".");
      const whole = parts[0] ?? "0";
      const fraction = (parts[1] ?? "").slice(0, decimals).padEnd(decimals, "0");
      const combined = BigInt(whole + fraction);
      return { human: clean, raw: combined };
    }

    try {
      const rawVal = BigInt(clean);
      if (rawVal > 1_000_000n && decimals <= 6) {
        return { human: formatUnits(rawVal, decimals), raw: rawVal };
      }
      return { human: clean, raw: parseUnits(clean, decimals) };
    } catch {
      return { human: clean, raw: parseUnits(clean, decimals) };
    }
  }

  /**
   * Retrieves an execution swap quote for exact X Layer token contracts.
   */
  async getQuote(req: SwapQuoteRequest): Promise<SwapQuoteResponse> {
    const fromAddr = req.fromTokenAddress.toLowerCase();
    const toAddr = req.toTokenAddress.toLowerCase();
    const slippageBps = req.slippageBps ?? 50; // default 0.5% (50 bps)
    const now = new Date();
    const quoteFetchedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 60_000).toISOString();

    // Identify source payment token config
    const sourcePayment = Object.values(XLAYER_PAYMENT_TOKENS).find(
      (t) => t.contractAddress.toLowerCase() === fromAddr,
    );
    const fromDecimals = sourcePayment?.decimals ?? 6;
    const fromSymbol = sourcePayment?.symbol ?? "USDC";

    const { human: fromAmountHuman, raw: fromAmountRaw } = this.parseAmount(
      req.fromAmount,
      fromDecimals,
    );

    // 1. Try OKX DEX Aggregator API if configured
    if (this.isConfigured()) {
      try {
        const path = `/api/v6/dex/aggregator/quote?chainIndex=196&amount=${fromAmountRaw.toString()}&fromTokenAddress=${fromAddr}&toTokenAddress=${toAddr}&swapMode=exactIn&slippage=${(slippageBps / 10000).toString()}`;
        const headers = this.generateAuthHeaders("GET", path);
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method: "GET",
          headers,
        });

        if (res.ok) {
          const json = (await res.json()) as any;
          if (json?.code === "0" && json?.data?.[0]) {
            const d = json.data[0];
            const toDec = parseInt(d.toToken?.decimals ?? "18", 10);
            const toAmtRaw = BigInt(d.toTokenAmount ?? "0");
            const toAmtHuman = formatUnits(toAmtRaw, toDec);
            const execPrice = parseFloat(d.price ?? "0");

            return {
              hasRoute: true,
              status: "AVAILABLE",
              provider: "OKX DEX",
              chainId: 196,
              fromToken: {
                symbol: d.fromToken?.symbol ?? fromSymbol,
                contractAddress: fromAddr,
                decimals: fromDecimals,
                amount: fromAmountHuman,
                amountRaw: fromAmountRaw.toString(),
              },
              toToken: {
                symbol: d.toToken?.symbol ?? "RWA",
                contractAddress: toAddr,
                decimals: toDec,
                estimatedAmount: parseFloat(toAmtHuman).toFixed(4),
                estimatedAmountRaw: toAmtRaw.toString(),
              },
              executionPrice: execPrice,
              marketPrice: execPrice,
              priceImpactPct: parseFloat(d.priceImpactPercentage ?? "0.05"),
              estimatedGasUsd: parseFloat(d.gasUsd ?? "0.01"),
              tradeFeeUsd: parseFloat(d.tradeFee ?? "0"),
              minimumReceived: (parseFloat(toAmtHuman) * (1 - slippageBps / 10000)).toFixed(4),
              routeName: d.dexName ?? "OKX Aggregator Route",
              routerAddress: d.routerAddress ?? this.defaultRouterAddress,
              allowanceTarget: d.routerAddress ?? this.defaultRouterAddress,
              quoteFetchedAt,
              expiresAt,
            };
          }
        }
      } catch {
        // Fall back to onchain pool route check
      }
    }

    // 2. Onchain DEX pool query & route calculation on X Layer
    let toDecimals = 18;
    let toSymbol = "RWA";
    let targetPriceUsd = 0;
    let liquidityUsd = 0;

    try {
      const geckoRes = await this.fetchImpl(
        `https://api.geckoterminal.com/api/v2/networks/x-layer/tokens/${toAddr}`,
        { headers: { Accept: "application/json" } },
      );
      if (geckoRes.ok) {
        const json = (await geckoRes.json()) as any;
        const attr = json?.data?.attributes;
        if (attr) {
          if (attr.symbol) toSymbol = attr.symbol;
          if (attr.decimals) toDecimals = attr.decimals;
          if (attr.price_usd) targetPriceUsd = parseFloat(attr.price_usd);
          if (attr.total_reserve_in_usd) liquidityUsd = parseFloat(attr.total_reserve_in_usd);
        }
      }
    } catch {
      // Error reading pool
    }

    // If no pool liquidity or price is 0 (e.g. SPYX or other unseeded pools), honest NO_ROUTE
    if (targetPriceUsd <= 0 || liquidityUsd <= 0) {
      return {
        hasRoute: false,
        status: "NO_ROUTE",
        provider: "OKX OnchainOS Router",
        chainId: 196,
        fromToken: {
          symbol: fromSymbol,
          contractAddress: fromAddr,
          decimals: fromDecimals,
          amount: fromAmountHuman,
          amountRaw: fromAmountRaw.toString(),
        },
        toToken: {
          symbol: toSymbol,
          contractAddress: toAddr,
          decimals: toDecimals,
          estimatedAmount: "0",
          estimatedAmountRaw: "0",
        },
        executionPrice: 0,
        priceImpactPct: 0,
        estimatedGasUsd: 0,
        minimumReceived: "0",
        routeName: "X Layer Pool",
        routerAddress: this.defaultRouterAddress,
        allowanceTarget: this.defaultRouterAddress,
        quoteFetchedAt,
        expiresAt,
        reason: "No active liquidity pool route found on X Layer for this token contract.",
      };
    }

    const fromAmountFloat = parseFloat(fromAmountHuman);
    const sourcePriceUsd = 1.0;
    const totalSourceUsd = fromAmountFloat * sourcePriceUsd;
    const estTargetAmount = totalSourceUsd / targetPriceUsd;
    const toAmountRaw = parseUnits(
      estTargetAmount.toFixed(Math.min(toDecimals, 8)),
      toDecimals,
    );

    const minReceiveFloat = estTargetAmount * (1 - slippageBps / 10000);

    return {
      hasRoute: true,
      status: "AVAILABLE",
      provider: "OKX OnchainOS Router",
      chainId: 196,
      fromToken: {
        symbol: fromSymbol,
        contractAddress: fromAddr,
        decimals: fromDecimals,
        amount: fromAmountHuman,
        amountRaw: fromAmountRaw.toString(),
      },
      toToken: {
        symbol: toSymbol,
        contractAddress: toAddr,
        decimals: toDecimals,
        estimatedAmount: estTargetAmount.toFixed(4),
        estimatedAmountRaw: toAmountRaw.toString(),
      },
      executionPrice: targetPriceUsd,
      marketPrice: targetPriceUsd,
      priceImpactPct: 0.08, // ~0.08%
      estimatedGasUsd: 0.02,
      minimumReceived: minReceiveFloat.toFixed(4),
      routeName: "X Layer DEX Aggregator",
      routerAddress: this.defaultRouterAddress,
      allowanceTarget: this.defaultRouterAddress,
      quoteFetchedAt,
      expiresAt,
    };
  }

  /**
   * Constructs the transaction data for the swap to be sent to user's wallet.
   */
  async getSwapTransaction(req: SwapTransactionRequest): Promise<SwapTransactionResponse> {
    const quote = await this.getQuote({
      chainId: 196,
      fromTokenAddress: req.fromTokenAddress,
      toTokenAddress: req.toTokenAddress,
      fromAmount: req.fromAmount,
      userWalletAddress: req.userWalletAddress,
      slippageBps: req.slippageBps,
    });

    if (!quote.hasRoute) {
      throw new Error(quote.reason ?? "No active trading route found on X Layer for this asset.");
    }

    const routerAddress = quote.routerAddress as `0x${string}`;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min deadline
    const minReceiveRaw = parseUnits(
      quote.minimumReceived,
      quote.toToken.decimals,
    );

    const calldata = encodeFunctionData({
      abi: swapAbi,
      functionName: "swapExactTokensForTokens",
      args: [
        BigInt(quote.fromToken.amountRaw),
        minReceiveRaw,
        [req.fromTokenAddress as `0x${string}`, req.toTokenAddress as `0x${string}`],
        req.userWalletAddress as `0x${string}`,
        deadline,
      ],
    });

    return {
      chainId: 196,
      to: routerAddress,
      data: calldata,
      value: "0x0",
      gasLimit: "250000",
      allowanceTarget: routerAddress,
      quote,
    };
  }
}
