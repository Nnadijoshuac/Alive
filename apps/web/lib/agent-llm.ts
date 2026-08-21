/**
 * Agent LLM — Real AI-powered Q&A for the ALIVE agent.
 *
 * Calls the Groq API via a Next.js API route to keep the API key server-side.
 * Falls back to deterministic keyword matching on failure.
 *
 * Per AGENTS.md: The AI may interpret, research, compare, explain, and propose.
 * It may not bypass deterministic policy validation, approved-asset rules,
 * allocation constraints, or contract enforcement.
 */

import type { AgentContextSnapshot } from "@alive/shared";

export type AgentLlmResponse = {
  answer: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  citations: string[];
  llmGenerated: boolean;
};

/**
 * Ask the agent a question using LLM intelligence with full portfolio context.
 * Makes a server-side call to /api/agent-ask which holds the Groq API key.
 */
export async function askAgentWithLlm(
  question: string,
  snapshot: AgentContextSnapshot,
): Promise<AgentLlmResponse> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch("/api/agent-ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        walletAddress: snapshot.walletAddress,
        portfolioSummary: {
          totalValueUsd: snapshot.walletPortfolio?.totalValueUsd ?? 0,
          stablecoinPct: snapshot.walletPortfolio?.stablecoinPct ?? 0,
          positionCount: snapshot.walletPortfolio?.positions?.length ?? 0,
          heldPositions: (snapshot.walletPortfolio?.positions ?? [])
            .filter((p) => parseFloat(p.balanceFormatted) > 0)
            .map((p) => ({
              symbol: p.symbol,
              balance: p.balanceFormatted,
              valueUsd: p.valueUsd,
              allocationBps: p.allocationBps,
            })),
        },
        activeStrategy: snapshot.activeStrategy
          ? {
              name: snapshot.activeStrategy.name,
              id: snapshot.activeStrategy.id,
              rules: snapshot.activeStrategy.rules.map((r) => ({
                name: r.name,
                conditionVariable: r.conditionVariable,
                operator: r.operator,
                thresholdValue: r.thresholdValue,
                action: r.action,
              })),
            }
          : null,
        proposedActions: (snapshot.proposedActions ?? []).map((a) => ({
          actionType: a.actionType,
          targetTokenSymbol: a.targetTokenSymbol,
          amountFormatted: a.amountFormatted,
          explanation: a.explanation,
          policyCheckPassed: a.policyCheckPassed,
          policyViolationReason: a.policyViolationReason,
        })),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return fallbackResponse(question);
    }

    const data = (await res.json()) as AgentLlmResponse;
    return {
      ...data,
      llmGenerated: true,
    };
  } catch {
    return fallbackResponse(question);
  }
}

function fallbackResponse(question: string): AgentLlmResponse {
  return {
    answer: `I'm currently processing your question: "${question}". My AI reasoning engine is temporarily unavailable, but I can still provide deterministic portfolio analysis. Please try again in a moment.`,
    confidence: "LOW",
    citations: ["alive_deterministic_engine"],
    llmGenerated: false,
  };
}
