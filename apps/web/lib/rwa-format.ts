import type { PortfolioPolicy } from "@alive/shared";

export function formatBps(value: number): string {
  if (!Number.isFinite(value)) return "UNKNOWN";
  const percentage = value / 100;
  return `${Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "")}%`;
}

export function formatPrice(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: number < 10 ? 2 : 0,
    maximumFractionDigits: number < 10 ? 4 : 2,
  }).format(number);
}

export function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "UNKNOWN";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(timestamp) + " UTC";
}

export function formatFreshness(ageSeconds: number): string {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return "UNKNOWN";
  if (ageSeconds < 60) return `${Math.floor(ageSeconds)}s old`;
  if (ageSeconds < 3_600) return `${Math.floor(ageSeconds / 60)}m old`;
  if (ageSeconds < 86_400) return `${Math.floor(ageSeconds / 3_600)}h old`;
  return `${Math.floor(ageSeconds / 86_400)}d old`;
}

export function truncateIdentifier(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export type PolicyRule = {
  label: string;
  value: string;
  detail: string;
};

export function policyRules(policy: PortfolioPolicy): PolicyRule[] {
  return [
    {
      label: "Objective",
      value: policy.objective.replaceAll("_", " "),
      detail: "Used only by the deterministic ranking objective.",
    },
    {
      label: "Cash floor",
      value: formatBps(policy.minimumCashBps),
      detail: "Minimum portfolio weight held in approved cash assets.",
    },
    {
      label: "Single asset cap",
      value: formatBps(policy.maximumSingleAssetBps),
      detail: "No approved asset can exceed this allocation.",
    },
    {
      label: "Single issuer cap",
      value: formatBps(policy.maximumSingleIssuerBps),
      detail: "Aggregate exposure is bounded across each issuer.",
    },
    {
      label: "Liquidity floor",
      value: `${policy.minimumLiquidityScore}/100`,
      detail: "Assets below this catalog score are excluded.",
    },
    {
      label: "Portfolio risk cap",
      value: `${policy.maximumPortfolioRiskScore}/100`,
      detail: "Weighted ALIVE risk score cannot exceed this value.",
    },
    {
      label: "Price freshness",
      value: `${policy.maximumPriceAgeSeconds}s`,
      detail: "Older quotes fail deterministic evaluation.",
    },
    {
      label: "Slippage cap",
      value: formatBps(policy.maximumSlippageBps),
      detail: "Maximum authorized execution slippage.",
    },
    {
      label: "User authorization",
      value: policy.userApprovalRequired ? "REQUIRED" : "NOT REQUIRED",
      detail: "A proposal cannot silently authorize a transaction.",
    },
  ];
}

export function allocationTotal(
  allocations: readonly { weightBps: number }[],
): number {
  return allocations.reduce(
    (total, allocation) => total + (Number.isFinite(allocation.weightBps) ? allocation.weightBps : 0),
    0,
  );
}

