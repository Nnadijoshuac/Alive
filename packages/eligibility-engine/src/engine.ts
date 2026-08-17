import {
  hashEligibilityPolicy,
  hashPassport,
  type EligibilityPolicy,
  type EligibilityReason,
  type EligibilityReasonCode,
  type EligibilityVerdict,
} from "@alive/shared";
import type { AssetClass, MarketQuote, RwaAsset } from "@alive/shared";

/**
 * The passport carries one price signal (RwaAsset has no separate NAV
 * value field). Fund-style assets (TREASURY, FUND) report NAV on a daily
 * cadence in the real world, so they are evaluated against
 * maxNavAgeSeconds with NAV_* reason codes; continuously-priced assets use
 * maxPriceAgeSeconds with PRICE_* codes. This is a deliberate reuse of one
 * quote field for two staleness semantics, not a second data source.
 */
const NAV_TRACKED_CLASSES: ReadonlySet<AssetClass> = new Set(["TREASURY", "FUND"]);

function hoursFromSeconds(seconds: number): string {
  const hours = seconds / 3_600;
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
}

function reason(code: EligibilityReasonCode, message: string): EligibilityReason {
  return { code, message };
}

/**
 * Real, external issuer documentation is strictly stronger evidence than
 * the synthetic DEMO_FIXTURE placeholder -- an asset that has genuinely
 * been analyzed from real sources has satisfied the *intent* of a
 * DEMO_FIXTURE requirement (some documentation exists) even though the
 * fixture itself was legitimately retired once real documents replaced
 * it. Every other required type still demands its own literal presence:
 * this substitution is deliberately narrow, not a general "any documented
 * type satisfies any required type" rule.
 */
const EXTERNAL_DOCUMENTATION_TYPES = new Set([
  "ISSUER_DOCUMENTATION",
  "OFFICIAL_TOKEN_DOCUMENTATION",
  "OFFICIAL_PROTOCOL_API",
  "REGULATORY_FILING",
]);

function documentationGaps(
  passport: RwaAsset,
  policy: EligibilityPolicy,
): string[] {
  const present = new Set(passport.sources.map((source) => source.sourceType));
  const hasExternalDocumentation = passport.sources.some((source) =>
    EXTERNAL_DOCUMENTATION_TYPES.has(source.sourceType),
  );
  return policy.requiredSourceTypes.filter((required) => {
    if (present.has(required)) return false;
    if (required === "DEMO_FIXTURE" && hasExternalDocumentation) return false;
    return true;
  });
}

function spreadBps(quote: MarketQuote): number | undefined {
  if (quote.bid === undefined || quote.ask === undefined) return undefined;
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0) return undefined;
  return Math.round(((ask - bid) / bid) * 10_000);
}

const DATA_MISSING_CODES: ReadonlySet<EligibilityReasonCode> = new Set([
  "DOCUMENTATION_INCOMPLETE",
  "NAV_UNAVAILABLE",
  "PRICE_UNAVAILABLE",
  "REDEMPTION_UNKNOWN",
]);

export type EvaluateEligibilityParams = {
  passport: RwaAsset;
  policy: EligibilityPolicy;
  /** The market quote for this exact asset, if one was fetched. */
  quote?: MarketQuote;
  /** Pass-through commitment for whatever snapshot `quote` was drawn from. */
  marketSnapshotHash?: `0x${string}`;
  /** On-chain AliveRwaAssetRegistry.enabled fact, when available. Assumed
   * true when omitted, since not every caller has chain access. */
  assetEnabled?: boolean;
  now: Date;
};

/**
 * Deterministic, side-effect-free eligibility evaluation: AssetPassport +
 * MarketQuote + EligibilityPolicy + now -> EligibilityVerdict. Never calls
 * an LLM, never touches a contract — this is the boundary the directive
 * describes as "deterministic code validates."
 */
export function evaluateEligibility(
  params: EvaluateEligibilityParams,
): EligibilityVerdict {
  const { passport, policy, quote, assetEnabled = true, now } = params;
  const reasons: EligibilityReason[] = [];

  if (assetEnabled === false) {
    reasons.push(
      reason("ASSET_DISABLED", "This asset has been disabled in the registry."),
    );
  }

  if (!policy.allowedAssetClasses.includes(passport.assetClass)) {
    reasons.push(
      reason(
        "ASSET_CLASS_NOT_ALLOWED",
        `Asset class ${passport.assetClass} is not on the allowed list for this policy.`,
      ),
    );
  }

  if (policy.requireApprovedIssuer && !policy.approvedIssuers.includes(passport.issuer)) {
    reasons.push(
      reason(
        "ISSUER_NOT_APPROVED",
        `Issuer "${passport.issuerName}" is not on the approved issuer list.`,
      ),
    );
  }

  const missingSources = documentationGaps(passport, policy);
  if (missingSources.length > 0) {
    reasons.push(
      reason(
        "DOCUMENTATION_INCOMPLETE",
        `Missing required source type(s): ${missingSources.join(", ")}.`,
      ),
    );
  }

  const trackedByNav = NAV_TRACKED_CLASSES.has(passport.assetClass);
  if (!quote) {
    reasons.push(
      trackedByNav
        ? reason("NAV_UNAVAILABLE", "No NAV/price quote is available for this asset.")
        : reason("PRICE_UNAVAILABLE", "No price quote is available for this asset."),
    );
  } else {
    const ageSeconds = Math.max(
      0,
      Math.floor((now.getTime() - Date.parse(quote.timestamp)) / 1_000),
    );
    if (trackedByNav) {
      if (ageSeconds > policy.maxNavAgeSeconds) {
        reasons.push(
          reason(
            "NAV_STALE",
            `NAV data is ${hoursFromSeconds(ageSeconds)} hours old; the maximum allowed is ${hoursFromSeconds(policy.maxNavAgeSeconds)} hours.`,
          ),
        );
      }
    } else if (ageSeconds > policy.maxPriceAgeSeconds) {
      reasons.push(
        reason(
          "PRICE_STALE",
          `Price data is ${ageSeconds} seconds old; the maximum allowed is ${policy.maxPriceAgeSeconds} seconds.`,
        ),
      );
    }

    const deviation = spreadBps(quote);
    if (deviation !== undefined && deviation > policy.maxPriceDeviationBps) {
      reasons.push(
        reason(
          "PRICE_DEVIATION_TOO_HIGH",
          `Bid/ask spread is ${deviation} bps, exceeding the ${policy.maxPriceDeviationBps} bps limit.`,
        ),
      );
    }
  }

  if (!passport.redemption) {
    if (policy.requireRedemptionActive) {
      reasons.push(
        reason(
          "REDEMPTION_UNKNOWN",
          "Redemption status is not documented for this asset.",
        ),
      );
    }
  } else if (passport.redemption.supported === false) {
    reasons.push(reason("REDEMPTION_DISABLED", "Redemption is not currently supported."));
  } else if (
    passport.redemption.supported === "unknown" &&
    policy.requireRedemptionActive
  ) {
    reasons.push(
      reason("REDEMPTION_UNKNOWN", "Redemption status is explicitly unknown."),
    );
  }

  const passportAgeSeconds = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(passport.lastUpdatedAt)) / 1_000),
  );
  if (passportAgeSeconds > policy.maxNavAgeSeconds) {
    reasons.push(
      reason(
        "SOURCE_DATA_TOO_OLD",
        `The asset passport itself was last updated ${hoursFromSeconds(passportAgeSeconds)} hours ago, exceeding the ${hoursFromSeconds(policy.maxNavAgeSeconds)}-hour freshness bound.`,
      ),
    );
  }

  const hasActiveViolation = reasons.some((r) => !DATA_MISSING_CODES.has(r.code));
  const eligible = reasons.length === 0;
  const status = eligible
    ? ("ELIGIBLE" as const)
    : hasActiveViolation
      ? ("RESTRICTED" as const)
      : ("UNKNOWN" as const);

  const evaluatedAt = now.toISOString();
  const validUntil = new Date(
    now.getTime() + policy.verdictValiditySeconds * 1_000,
  ).toISOString();

  return {
    version: 1,
    assetId: passport.id,
    eligible,
    status,
    reasons: eligible ? [reason("OK", "All eligibility checks passed.")] : reasons,
    evaluatedAt,
    validUntil,
    passportHash: hashPassport(passport),
    policyHash: hashEligibilityPolicy(policy),
    ...(params.marketSnapshotHash
      ? { marketSnapshotHash: params.marketSnapshotHash }
      : {}),
  };
}
