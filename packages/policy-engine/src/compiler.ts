import {
  PortfolioPolicySchema,
  hashPortfolioPolicy,
  type AssetClass,
  type PolicyAssetClassLimit,
  type PolicyObjective,
  type PortfolioPolicy,
} from "@alive/shared";

export const DETERMINISTIC_COMPILER_MODE = "DETERMINISTIC_FALLBACK" as const;
export const DETERMINISTIC_COMPILER_NOTICE =
  "Non-AI deterministic parser for simple development mandates";

type MutableLimit = {
  minimumBps: number;
  maximumBps: number;
  touched: boolean;
};

export type DeterministicPolicyCompilation = {
  readonly mode: typeof DETERMINISTIC_COMPILER_MODE;
  readonly isAiGenerated: false;
  readonly notice: typeof DETERMINISTIC_COMPILER_NOTICE;
  readonly originalMandate: string;
  readonly policy: PortfolioPolicy;
  readonly policyHash: `0x${string}`;
  readonly explanation: readonly string[];
  readonly warnings: readonly string[];
};

export type FailedPolicyCompilation = {
  readonly success: false;
  readonly mode: typeof DETERMINISTIC_COMPILER_MODE;
  readonly isAiGenerated: false;
  readonly issues: readonly string[];
};

export type SuccessfulPolicyCompilation = {
  readonly success: true;
  readonly compilation: DeterministicPolicyCompilation;
};

type PercentageMention = {
  readonly start: number;
  readonly end: number;
  readonly bps: number;
};

type AssetClassMention = {
  readonly start: number;
  readonly end: number;
  readonly assetClass: AssetClass;
  readonly token: string;
};

const percentPattern =
  /\bhalf\b|\b(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)\s*(?:%|percent\b)/giu;
const assetClassPattern =
  /\btreasur(?:y|ies)\b|\bt-?bills?\b|\bgold\b|\bequit(?:y|ies)\b|\bstocks?\b|\bcash\b|\bliquid(?:ity)?\b|\bavailable\b|\betfs?\b|\bcommodit(?:y|ies)\b|\bcredit\b|\bfunds?\b/giu;

function percentageToBps(value: string): number {
  const normalized = value.trim().toLowerCase();
  if (normalized === "half") return 5_000;
  const numeric = normalized.replace(/\s*(?:%|percent)$/u, "");
  const [whole = "0", fraction = ""] = numeric.split(".");
  const bps =
    Number.parseInt(whole, 10) * 100 +
    Number.parseInt(fraction.padEnd(2, "0") || "0", 10);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError(
      `Percentage ${value} is outside 0 through 100 percent`,
    );
  }
  return bps;
}

function assetClassForToken(token: string): AssetClass {
  if (/treasur|t-?bill/u.test(token)) return "TREASURY";
  if (/gold/u.test(token)) return "GOLD";
  if (/equit|stock/u.test(token)) return "EQUITY";
  if (/cash|liquid|available/u.test(token)) return "CASH";
  if (/etf/u.test(token)) return "ETF";
  if (/commodit/u.test(token)) return "COMMODITY";
  if (/credit/u.test(token)) return "CREDIT";
  return "FUND";
}

function collectPercentages(text: string): PercentageMention[] {
  return [...text.matchAll(percentPattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    bps: percentageToBps(match[0]),
  }));
}

function collectAssetClasses(text: string): AssetClassMention[] {
  return [...text.matchAll(assetClassPattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    assetClass: assetClassForToken(match[0]),
    token: match[0].toLowerCase(),
  }));
}

function nearestAssetClass(
  text: string,
  percentage: PercentageMention,
  mentions: readonly AssetClassMention[],
): AssetClassMention | undefined {
  let nearest: AssetClassMention | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const mention of mentions) {
    const interveningText =
      percentage.end < mention.start
        ? text.slice(percentage.end, mention.start)
        : mention.end < percentage.start
          ? text.slice(mention.end, percentage.start)
          : "";
    if (/[.!?;]/u.test(interveningText)) continue;
    const distance =
      percentage.end < mention.start
        ? mention.start - percentage.end
        : mention.end < percentage.start
          ? percentage.start - mention.end
          : 0;
    if (distance < nearestDistance && distance <= 90) {
      nearest = mention;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function inferObjective(text: string): PolicyObjective {
  if (
    /protect (?:my )?capital|capital preservation|hate risk|risk[- ]averse/u.test(
      text,
    )
  )
    return "CAPITAL_PRESERVATION";
  if (/\bbalanced\b/u.test(text)) return "BALANCED";
  if (/\bgrowth\b|aggressive/u.test(text)) return "GROWTH";
  if (/\bincome\b|earn yield|yield first/u.test(text)) return "INCOME";
  return "CUSTOM";
}

function objectiveDefaults(objective: PolicyObjective) {
  switch (objective) {
    case "CAPITAL_PRESERVATION":
      return { minimumLiquidityScore: 70, maximumPortfolioRiskScore: 40 };
    case "INCOME":
      return { minimumLiquidityScore: 45, maximumPortfolioRiskScore: 65 };
    case "BALANCED":
      return { minimumLiquidityScore: 50, maximumPortfolioRiskScore: 60 };
    case "GROWTH":
      return { minimumLiquidityScore: 25, maximumPortfolioRiskScore: 85 };
    case "CUSTOM":
      return { minimumLiquidityScore: 0, maximumPortfolioRiskScore: 100 };
  }
}

function getLimit(
  limits: Map<AssetClass, MutableLimit>,
  assetClass: AssetClass,
): MutableLimit {
  const existing = limits.get(assetClass);
  if (existing !== undefined) return existing;
  const created = { minimumBps: 0, maximumBps: 10_000, touched: false };
  limits.set(assetClass, created);
  return created;
}

function classifyConstraint(
  text: string,
  percentage: PercentageMention,
  assetClass: AssetClassMention,
): "MINIMUM" | "MAXIMUM" | "EXACT" {
  const prefix = text.slice(
    Math.max(0, percentage.start - 55),
    percentage.start,
  );
  const context = text.slice(
    Math.max(0, Math.min(percentage.start, assetClass.start) - 55),
    Math.min(text.length, Math.max(percentage.end, assetClass.end) + 20),
  );
  if (
    /at most|no more than|not more than|under|below|maximum|max\b|\bcap(?:ped)?\b/u.test(
      prefix,
    )
  ) {
    return "MAXIMUM";
  }
  if (/at least|no less than|minimum|min\b|more than/u.test(prefix)) {
    return "MINIMUM";
  }
  if (/\bkeep\b/u.test(context) && assetClass.assetClass !== "GOLD") {
    return "MINIMUM";
  }
  if (
    assetClass.assetClass === "CASH" &&
    /liquid|available/u.test(assetClass.token)
  ) {
    return "MINIMUM";
  }
  return "EXACT";
}

function percentageNearPhrase(
  text: string,
  percentages: readonly PercentageMention[],
  phrase: RegExp,
): PercentageMention | undefined {
  const match = phrase.exec(text);
  if (match?.index === undefined) return undefined;
  const start = match.index;
  const end = start + match[0].length;
  return percentages
    .map((percentage) => ({
      percentage,
      distance:
        percentage.end < start
          ? start - percentage.end
          : end < percentage.start
            ? percentage.start - end
            : 0,
    }))
    .filter(({ distance }) => distance <= 65)
    .sort((left, right) => left.distance - right.distance)[0]?.percentage;
}

function describeLimit(limit: PolicyAssetClassLimit): string {
  if (limit.minimumBps === limit.maximumBps)
    return `${limit.assetClass}: exactly ${limit.minimumBps} BPS`;
  if (limit.minimumBps === 0)
    return `${limit.assetClass}: at most ${limit.maximumBps} BPS`;
  if (limit.maximumBps === 10_000)
    return `${limit.assetClass}: at least ${limit.minimumBps} BPS`;
  return `${limit.assetClass}: ${limit.minimumBps}-${limit.maximumBps} BPS`;
}

export function compilePolicyMandateDeterministically(
  mandateInput: string,
): DeterministicPolicyCompilation {
  const originalMandate = mandateInput.trim();
  if (originalMandate.length < 3 || originalMandate.length > 5_000) {
    throw new TypeError("Mandate must contain between 3 and 5000 characters");
  }
  const text = originalMandate
    .toLowerCase()
    .replace(/[–—]/gu, "-")
    .replace(/\s+/gu, " ");
  const objective = inferObjective(text);
  const defaults = objectiveDefaults(objective);
  const percentages = collectPercentages(text);
  const classMentions = collectAssetClasses(text);
  const limits = new Map<AssetClass, MutableLimit>();
  const warnings: string[] = [
    "AI compiler offline: used the deterministic non-AI fallback parser.",
  ];

  const singleAssetPercentage = percentageNearPhrase(
    text,
    percentages,
    /single asset|one (?:asset|stock|position)|in one stock/u,
  );
  const issuerPercentage = percentageNearPhrase(
    text,
    percentages,
    /single issuer|one issuer|issuer exposure|with one issuer/u,
  );

  const reservedPercentages = new Set(
    [singleAssetPercentage, issuerPercentage]
      .filter((value): value is PercentageMention => value !== undefined)
      .map((value) => value.start),
  );

  percentages.forEach((percentage) => {
    if (reservedPercentages.has(percentage.start)) return;
    const assetClass = nearestAssetClass(text, percentage, classMentions);
    if (assetClass === undefined) return;
    const limit = getLimit(limits, assetClass.assetClass);
    const constraint = classifyConstraint(text, percentage, assetClass);
    if (constraint === "MINIMUM") {
      limit.minimumBps = Math.max(limit.minimumBps, percentage.bps);
    } else if (constraint === "MAXIMUM") {
      limit.maximumBps = Math.min(limit.maximumBps, percentage.bps);
    } else {
      limit.minimumBps = Math.max(limit.minimumBps, percentage.bps);
      limit.maximumBps = Math.min(limit.maximumBps, percentage.bps);
    }
    limit.touched = true;
  });

  if (/\bsome gold\b|\bgive me gold\b|\bgold exposure\b/u.test(text)) {
    const gold = getLimit(limits, "GOLD");
    if (gold.minimumBps === 0) gold.minimumBps = 500;
    if (!gold.touched) gold.maximumBps = 2_000;
    gold.touched = true;
    warnings.push(
      "Interpreted unquantified 'some gold' as the documented demo range 500-2000 BPS.",
    );
  }

  const assetClassLimits: PolicyAssetClassLimit[] = [...limits.entries()]
    .filter(([, limit]) => limit.touched)
    .map(([assetClass, limit]) => ({
      assetClass,
      minimumBps: limit.minimumBps,
      maximumBps: limit.maximumBps,
    }));
  const cashLimit = limits.get("CASH");
  const policy = PortfolioPolicySchema.parse({
    version: 1,
    objective,
    minimumCashBps: cashLimit?.minimumBps ?? 0,
    assetClassLimits,
    maximumSingleAssetBps: singleAssetPercentage?.bps ?? 10_000,
    maximumSingleIssuerBps: issuerPercentage?.bps ?? 10_000,
    minimumLiquidityScore: defaults.minimumLiquidityScore,
    maximumPortfolioRiskScore: defaults.maximumPortfolioRiskScore,
    maximumPriceAgeSeconds: 120,
    maximumSlippageBps: 100,
    userApprovalRequired: true,
  });

  const explanation = [
    `Objective: ${policy.objective}`,
    ...policy.assetClassLimits.map(describeLimit),
    `Single asset maximum: ${policy.maximumSingleAssetBps} BPS`,
    `Single issuer maximum: ${policy.maximumSingleIssuerBps} BPS`,
    `Minimum liquidity: ${policy.minimumLiquidityScore}/100`,
    `Maximum ALIVE Risk Score: ${policy.maximumPortfolioRiskScore}/100`,
    "User approval is required before execution.",
  ];

  return {
    mode: DETERMINISTIC_COMPILER_MODE,
    isAiGenerated: false,
    notice: DETERMINISTIC_COMPILER_NOTICE,
    originalMandate,
    policy,
    policyHash: hashPortfolioPolicy(policy),
    explanation,
    warnings,
  };
}

export function safeCompilePolicyMandateDeterministically(
  mandate: string,
): FailedPolicyCompilation | SuccessfulPolicyCompilation {
  try {
    return {
      success: true,
      compilation: compilePolicyMandateDeterministically(mandate),
    };
  } catch (error) {
    if (error !== null && typeof error === "object" && "issues" in error) {
      const issues = (error as { issues?: readonly { message?: string }[] })
        .issues;
      if (issues !== undefined) {
        return {
          success: false,
          mode: DETERMINISTIC_COMPILER_MODE,
          isAiGenerated: false,
          issues: issues.map((issue) => issue.message ?? "Invalid policy"),
        };
      }
    }
    return {
      success: false,
      mode: DETERMINISTIC_COMPILER_MODE,
      isAiGenerated: false,
      issues: [error instanceof Error ? error.message : "Invalid policy"],
    };
  }
}
