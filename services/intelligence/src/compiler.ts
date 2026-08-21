import {
  PortfolioPolicySchema,
  hashPortfolioPolicy,
  type PolicyAssetClassLimit,
  type PortfolioPolicy,
} from "@alive/shared";
import {
  compilePolicyMandateDeterministically,
  type DeterministicPolicyCompilation,
} from "@alive/policy-engine";

import { LlmProviderError, type LlmJsonProvider } from "./llm.js";

export const POLICY_COMPILER_SYSTEM_PROMPT = `You compile a user's investment mandate into one strict JSON PortfolioPolicy object.
Return JSON only. Never return prose, markdown, calldata, transactions, asset recommendations, or invented asset identifiers.
All percentages must be integer basis points from 0 through 10000.
The exact keys are: version, objective, minimumCashBps, assetClassLimits, maximumSingleAssetBps, maximumSingleIssuerBps, minimumLiquidityScore, maximumPortfolioRiskScore, maximumPriceAgeSeconds, maximumSlippageBps, allowedAssetIds, blockedAssetIds, allowedIssuers, blockedIssuers, userApprovalRequired.
version must be 1. objective must be CAPITAL_PRESERVATION, INCOME, BALANCED, GROWTH, or CUSTOM.
Each assetClassLimits item has exactly assetClass, minimumBps, maximumBps. Asset classes are CASH, TREASURY, EQUITY, ETF, GOLD, COMMODITY, CREDIT, FUND.
Use empty arrays when the mandate does not name specific assets or issuers. userApprovalRequired must be true.
Do not weaken an explicit maximum. Do not add facts the user did not state. Use conservative defaults only for liquidity, risk, price age, and slippage. The deterministic validator will reject contradictions.`;

export type CompiledPolicy = {
  originalMandate: string;
  policy: PortfolioPolicy;
  policyHash: `0x${string}`;
  explanation: string[];
  warnings: string[];
  compiler: {
    mode: "AI" | "DETERMINISTIC_FALLBACK";
    isAiGenerated: boolean;
    provider: string;
    model?: string;
  };
};

function describeLimit(limit: PolicyAssetClassLimit): string {
  if (limit.minimumBps === limit.maximumBps) {
    return `${limit.assetClass}: exactly ${limit.minimumBps} BPS`;
  }
  if (limit.minimumBps === 0)
    return `${limit.assetClass}: maximum ${limit.maximumBps} BPS`;
  if (limit.maximumBps === 10_000)
    return `${limit.assetClass}: minimum ${limit.minimumBps} BPS`;
  return `${limit.assetClass}: ${limit.minimumBps} to ${limit.maximumBps} BPS`;
}

export function explainPolicy(policy: PortfolioPolicy): string[] {
  return [
    `Objective: ${policy.objective}`,
    ...policy.assetClassLimits.map(describeLimit),
    `Cash minimum: ${policy.minimumCashBps} BPS`,
    `Single asset maximum: ${policy.maximumSingleAssetBps} BPS`,
    `Single issuer maximum: ${policy.maximumSingleIssuerBps} BPS`,
    `Minimum liquidity: ${policy.minimumLiquidityScore}/100`,
    `Maximum ALIVE Risk Score: ${policy.maximumPortfolioRiskScore}/100`,
    `Maximum quote age: ${policy.maximumPriceAgeSeconds} seconds`,
    `Maximum slippage: ${policy.maximumSlippageBps} BPS`,
    "User approval is required before policy registration or vault execution.",
  ];
}

function fromFallback(
  compilation: DeterministicPolicyCompilation,
  warning?: string,
): CompiledPolicy {
  return {
    originalMandate: compilation.originalMandate,
    policy: compilation.policy,
    policyHash: compilation.policyHash,
    explanation: [...compilation.explanation],
    warnings: [...(warning ? [warning] : []), ...compilation.warnings],
    compiler: {
      mode: "DETERMINISTIC_FALLBACK",
      isAiGenerated: false,
      provider: "disabled",
    },
  };
}

export async function compileMandate(
  mandateInput: string,
  llm: LlmJsonProvider,
): Promise<CompiledPolicy> {
  const mandate = mandateInput.trim();
  if (mandate.length < 3 || mandate.length > 5_000) {
    throw new TypeError("Mandate must contain between 3 and 5000 characters");
  }
  if (llm.name === "disabled") {
    return fromFallback(compilePolicyMandateDeterministically(mandate));
  }

  try {
    const candidate = await llm.generatePolicyJson({
      mandate,
      systemPrompt: POLICY_COMPILER_SYSTEM_PROMPT,
    });
    const policy = PortfolioPolicySchema.parse(candidate);
    return {
      originalMandate: mandate,
      policy,
      policyHash: hashPortfolioPolicy(policy),
      explanation: explainPolicy(policy),
      warnings: [],
      compiler: {
        mode: "AI",
        isAiGenerated: true,
        provider: llm.name,
        ...(llm.model ? { model: llm.model } : {}),
      },
    };
  } catch (error) {
    if (!(error instanceof LlmProviderError)) throw error;
    return fromFallback(
      compilePolicyMandateDeterministically(mandate),
      `AI compiler unavailable (${error.code}); used the clearly labelled non-AI fallback.`,
    );
  }
}
