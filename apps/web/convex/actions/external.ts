"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";

/**
 * Convex Background Actions for External Provider Integrations
 *
 * All third-party secrets (GROQ_API_KEY, OKX_API_KEY, etc.) live strictly
 * in Convex environment variables and are never exposed to the frontend.
 * Self-custodial security is preserved: Convex never holds signing keys.
 */

export const getOKXQuote = action({
  args: {
    fromTokenAddress: v.string(),
    toTokenAddress: v.string(),
    amount: v.string(),
    userWalletAddress: v.string(),
    slippageBps: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.OKX_API_KEY;
    const secretKey = process.env.OKX_SECRET_KEY;
    const passphrase = process.env.OKX_API_PASSPHRASE;
    const projectId = process.env.OKX_PROJECT_ID;

    // If OKX live credentials are not set, return deterministic simulated route
    if (!apiKey || !secretKey || !passphrase) {
      return {
        provider: "SIMULATED_OKX_FALLBACK",
        fromTokenAddress: args.fromTokenAddress,
        toTokenAddress: args.toTokenAddress,
        amountIn: args.amount,
        amountOutEstimated: (parseFloat(args.amount) * 0.998).toFixed(6),
        priceImpactBps: 15,
        estimatedGasOkb: "0.00042",
        minReceived: (parseFloat(args.amount) * 0.993).toFixed(6),
        txCalldata: {
          to: "0x0000000000000000000000000000000000000000",
          data: "0x",
          value: "0",
        },
      };
    }

    try {
      const url = `https://www.okx.com/api/v5/dex/aggregator/quote?chainId=196&amount=${args.amount}&fromTokenAddress=${args.fromTokenAddress}&toTokenAddress=${args.toTokenAddress}&slippage=${(args.slippageBps ?? 50) / 10000}`;
      const res = await fetch(url, {
        headers: {
          "OK-ACCESS-KEY": apiKey,
          "OK-ACCESS-PASSPHRASE": passphrase,
          "OK-ACCESS-PROJECT": projectId ?? "",
        },
      });

      if (!res.ok) {
        throw new Error(`OKX API responded with HTTP ${res.status}`);
      }

      const data = await res.json();
      return {
        provider: "OKX_DEX_AGGREGATOR",
        raw: data,
      };
    } catch (err) {
      return {
        provider: "OKX_ERROR_FALLBACK",
        error: err instanceof Error ? err.message : "Failed to fetch OKX quote",
      };
    }
  },
});

export const runGroqExtraction = action({
  args: {
    assetId: v.string(),
    documentText: v.string(),
    promptVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return {
        success: false,
        error: "GROQ_API_KEY not configured in Convex environment",
      };
    }

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "You are the ALIVE RWA Intelligence Extractor. Extract verified issuer, jurisdiction, backing, and compliance facts from source documents.",
            },
            {
              role: "user",
              content: `Extract verified facts for asset ${args.assetId}:\n\n${args.documentText.slice(0, 8000)}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      });

      if (!res.ok) {
        throw new Error(`Groq API responded with HTTP ${res.status}`);
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data?.choices?.[0]?.message?.content;
      return {
        success: true,
        extractedJson: content,
        model: "llama-3.3-70b-versatile",
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Groq extraction failed",
      };
    }
  },
});
