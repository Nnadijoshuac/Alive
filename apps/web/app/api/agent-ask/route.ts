/**
 * POST /api/agent-ask
 *
 * Server-side API route for LLM-powered agent Q&A.
 * Keeps the Groq API key server-side (never exposed to the browser).
 *
 * Per AGENTS.md: The AI may interpret, research, compare, explain, and propose.
 * It may not bypass deterministic policy validation or contract enforcement.
 */

import { NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || "llama-3.3-70b-versatile";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

const SYSTEM_PROMPT = `You are the ALIVE Agent, an autonomous portfolio intelligence agent for tokenized real-world assets (RWAs) deployed on X Layer (chain ID 196).

Your capabilities:
- Analyze portfolio positions, allocations, and USD valuations
- Explain strategy rules and why actions are proposed
- Answer questions about asset verification status, eligibility, and market data
- Provide context about RWA markets, tokenized treasuries, equities, and stablecoins

Your constraints (STRICT):
- You may INTERPRET, RESEARCH, COMPARE, EXPLAIN, and PROPOSE
- You may NOT bypass deterministic policy validation or allocation constraints
- You may NOT fabricate transaction hashes, contract addresses, or market prices
- You may NOT present speculative data as verified fact
- All USD values and allocations you reference must come from the portfolio data provided
- Label any uncertain information clearly
- Never provide financial advice — describe what the portfolio shows, not what the user should do

When answering:
- Be concise and data-driven
- Reference specific portfolio positions and values
- Cite the data source (onchain, strategy engine, market feed)
- If you don't have enough data, say so honestly`;

type RequestBody = {
  question: string;
  walletAddress: string;
  portfolioSummary: {
    totalValueUsd: number;
    stablecoinPct: number;
    positionCount: number;
    heldPositions: Array<{
      symbol: string;
      balance: string;
      valueUsd: number | null;
      allocationBps: number | undefined;
    }>;
  };
  activeStrategy: {
    name: string;
    id: string;
    rules: Array<{
      name: string;
      conditionVariable: string;
      operator: string;
      thresholdValue: number;
      action: string;
    }>;
  } | null;
  proposedActions: Array<{
    actionType: string;
    targetTokenSymbol: string;
    amountFormatted: string;
    explanation: string;
    policyCheckPassed: boolean;
    policyViolationReason: string | null;
  }>;
};

export async function POST(req: Request) {
  if (!GROQ_API_KEY) {
    return NextResponse.json(
      {
        answer:
          "ALIVE Agent is operating in deterministic-only mode. LLM reasoning is not configured.",
        confidence: "LOW" as const,
        citations: ["alive_deterministic_engine"],
        llmGenerated: false,
      },
      { status: 200 },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { question, walletAddress, portfolioSummary, activeStrategy, proposedActions } = body;

  if (!question || typeof question !== "string") {
    return NextResponse.json(
      { error: "Missing question" },
      { status: 400 },
    );
  }

  // Build the context prompt
  const contextParts: string[] = [
    `Connected wallet: ${walletAddress}`,
    `Total portfolio value: $${portfolioSummary.totalValueUsd.toFixed(2)}`,
    `Stablecoin allocation: ${portfolioSummary.stablecoinPct}%`,
    `Active positions: ${portfolioSummary.positionCount}`,
  ];

  if (portfolioSummary.heldPositions.length > 0) {
    contextParts.push("\nHeld positions:");
    for (const pos of portfolioSummary.heldPositions) {
      const allocPct = pos.allocationBps ? (pos.allocationBps / 100).toFixed(1) : "?";
      contextParts.push(
        `  - ${pos.symbol}: ${pos.balance} tokens ($${pos.valueUsd?.toFixed(2) ?? "unknown"}, ${allocPct}% allocation)`,
      );
    }
  }

  if (activeStrategy) {
    contextParts.push(`\nActive strategy: "${activeStrategy.name}" (${activeStrategy.id})`);
    contextParts.push("Strategy rules:");
    for (const rule of activeStrategy.rules) {
      contextParts.push(
        `  - ${rule.name}: IF ${rule.conditionVariable} ${rule.operator} ${rule.thresholdValue} THEN ${rule.action}`,
      );
    }
  }

  if (proposedActions.length > 0) {
    contextParts.push(`\n${proposedActions.length} proposed action(s):`);
    for (const action of proposedActions) {
      const status = action.policyCheckPassed
        ? "READY (awaiting user approval)"
        : `BLOCKED: ${action.policyViolationReason}`;
      contextParts.push(
        `  - ${action.actionType} ${action.targetTokenSymbol} ($${action.amountFormatted}): ${action.explanation} [${status}]`,
      );
    }
  }

  const userMessage = `Portfolio context:\n${contextParts.join("\n")}\n\nUser question: ${question}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    const llmRes = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!llmRes.ok) {
      const errorText = await llmRes.text().catch(() => "unknown");
      console.error(`Groq API error (${llmRes.status}): ${errorText}`);
      return NextResponse.json({
        answer:
          "ALIVE Agent's reasoning engine encountered an error. Falling back to deterministic analysis.",
        confidence: "LOW" as const,
        citations: ["alive_deterministic_engine"],
        llmGenerated: false,
      });
    }

    const llmData = (await llmRes.json()) as {
      choices?: Array<{
        message?: { content?: string };
      }>;
    };

    const answer = llmData.choices?.[0]?.message?.content;
    if (!answer) {
      return NextResponse.json({
        answer: "ALIVE Agent could not generate a response. Please try rephrasing your question.",
        confidence: "LOW" as const,
        citations: ["alive_deterministic_engine"],
        llmGenerated: false,
      });
    }

    // Determine confidence based on whether we have good context
    const hasPositions = portfolioSummary.heldPositions.length > 0;
    const hasStrategy = activeStrategy !== null;
    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      hasPositions && hasStrategy ? "HIGH" : hasPositions ? "MEDIUM" : "LOW";

    // Extract citations from the context
    const citations: string[] = ["alive_wallet_snapshot"];
    if (hasStrategy) citations.push("alive_strategy_engine");
    if (proposedActions.length > 0) citations.push("alive_policy_engine");
    if (answer.toLowerCase().includes("chain") || answer.toLowerCase().includes("onchain")) {
      citations.push("onchain_xlayer_rpc");
    }

    return NextResponse.json({
      answer,
      confidence,
      citations,
      llmGenerated: true,
    });
  } catch (error) {
    console.error("Agent LLM error:", error);
    return NextResponse.json({
      answer:
        "ALIVE Agent's reasoning engine timed out. Your portfolio data is still accurate — the AI analysis will be available shortly.",
      confidence: "LOW" as const,
      citations: ["alive_deterministic_engine"],
      llmGenerated: false,
    });
  }
}
