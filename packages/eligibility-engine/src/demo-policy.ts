import { EligibilityPolicySchema, type EligibilityPolicy } from "@alive/shared";

/**
 * The default hackathon-demo eligibility policy (directive section 16),
 * expressed in this package's actual field names. Issuer/asset-class values
 * match data/rwa-catalog/catalog.demo.json's demo issuers exactly.
 */
export function createDemoEligibilityPolicy(): EligibilityPolicy {
  return EligibilityPolicySchema.parse({
    version: 1,
    policyId: "alive-demo-eligibility-v1",
    allowedAssetClasses: ["CASH", "TREASURY", "GOLD", "EQUITY", "FUND"],
    requireApprovedIssuer: true,
    approvedIssuers: [
      "demo-cash-issuer",
      "demo-treasury-issuer-a",
      // ttbill-b's real issuer, per its actual Superstate/Invesco source
      // documentation -- not a demo placeholder. See
      // data/rwa-catalog/catalog.demo.json.
      "invesco-advisers",
      "demo-treasury-issuer-c",
      "demo-gold-issuer",
      "demo-equity-issuer",
    ],
    requiredSourceTypes: ["DEMO_FIXTURE"],
    maxNavAgeSeconds: 86_400,
    // Not a generic "continuous market price" bound: several catalog assets
    // are backed by real Chainlink Proof-of-Reserve/AUM feeds (Kinesis KAU,
    // Cap cUSD) with a documented ~24h publish heartbeat (see
    // packages/market-data/src/chainlink-feeds.ts). A 1-hour bound marked
    // every one of those genuinely healthy, live feeds PRICE_STALE on every
    // request -- a policy-tuning mismatch, not a real freshness risk. 30
    // hours matches the individual feeds' own documented tolerance.
    maxPriceAgeSeconds: 30 * 3_600,
    requireRedemptionActive: true,
    maxPriceDeviationBps: 500,
    verdictValiditySeconds: 900,
  });
}
