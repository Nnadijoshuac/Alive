import {
  EligibilityPolicySchema,
  type EligibilityPolicy,
  type RwaAsset,
} from "@alive/shared";

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

/**
 * Institutional Treasury Fund eligibility policy: strictly verifies
 * Treasury asset classes, approved institutional fund issuers, valid
 * documentation, same-day/active redemption terms, and fresh daily NAV data.
 */
export function createTreasuryEligibilityPolicy(): EligibilityPolicy {
  return EligibilityPolicySchema.parse({
    version: 1,
    policyId: "treasury-eligibility-v1",
    allowedAssetClasses: ["TREASURY", "CASH"],
    requireApprovedIssuer: true,
    approvedIssuers: [
      "invesco-advisers",
      "ondo-finance",
      "superstate",
      "demo-treasury-issuer-a",
      "demo-treasury-issuer-c",
      "demo-cash-issuer",
    ],
    requiredSourceTypes: ["DEMO_FIXTURE"],
    maxNavAgeSeconds: 86_400,
    maxPriceAgeSeconds: 30 * 3_600,
    requireRedemptionActive: true,
    maxPriceDeviationBps: 500,
    verdictValiditySeconds: 900,
    requireMarketQuote: true,
    requireVerifiedDeployment: true,
    requireBackingEvidence: true,
  });
}

/**
 * Tokenized stock / ETF (xStock) eligibility policy: verifies tokenized equity
 * and ETF exposures deployed on approved networks (e.g. X Layer), requires an
 * approved collateral SPV/issuer (Backed Assets), 1:1 segregated custody
 * backing evidence, and official product/legal documentation. Does not
 * mandate retail physical share delivery or Treasury-only NAV logic.
 */
export function createXStockEligibilityPolicy(): EligibilityPolicy {
  return EligibilityPolicySchema.parse({
    version: 1,
    policyId: "xstock-eligibility-v1",
    allowedAssetClasses: ["EQUITY", "ETF"],
    requireApprovedIssuer: true,
    approvedIssuers: [
      "backed-assets-je",
      "backed-finance-ag",
      "demo-equity-issuer",
    ],
    requiredSourceTypes: ["ISSUER_DOCUMENTATION"],
    maxNavAgeSeconds: 7 * 86_400,
    maxPriceAgeSeconds: 7 * 86_400,
    requireRedemptionActive: false,
    maxPriceDeviationBps: 1000,
    verdictValiditySeconds: 900,
    requireMarketQuote: false,
    requireVerifiedDeployment: true,
    requireBackingEvidence: true,
  });
}

/**
 * Tokenized institutional fund and private credit eligibility policy:
 * verifies tokenized fund structures (e.g. BlackRock BUIDL, Apollo ACRED),
 * approved institutional asset managers, segregated custodial backing,
 * and primary issuer documentation.
 */
export function createFundEligibilityPolicy(): EligibilityPolicy {
  return EligibilityPolicySchema.parse({
    version: 1,
    policyId: "fund-eligibility-v1",
    allowedAssetClasses: ["FUND", "CREDIT", "TREASURY"],
    requireApprovedIssuer: true,
    approvedIssuers: [
      "blackrock",
      "securitize",
      "apollo-global-management",
      "franklin-templeton",
      "wisdomtree",
      "invesco-advisers",
    ],
    requiredSourceTypes: ["ISSUER_DOCUMENTATION"],
    maxNavAgeSeconds: 86_400,
    maxPriceAgeSeconds: 30 * 3_600,
    requireRedemptionActive: false,
    maxPriceDeviationBps: 500,
    verdictValiditySeconds: 900,
    requireMarketQuote: false,
    requireVerifiedDeployment: true,
    requireBackingEvidence: true,
  });
}

/**
 * Dynamically selects the appropriate deterministic eligibility policy based
 * on asset class and product structure, ensuring Treasury rules are not
 * blindly applied to equities, ETFs, or private credit.
 */
export function selectEligibilityPolicy(
  asset: Pick<RwaAsset, "id" | "assetClass" | "issuer">,
): EligibilityPolicy {
  // Demo and test harness assets specifically created for local/testnet simulation
  if (
    asset.id === "ttbill-a" ||
    asset.id === "ttbill-c" ||
    asset.id === "tusdc" ||
    asset.id === "tgold" ||
    asset.id === "tsp500" ||
    asset.id === "tnvda" ||
    asset.id === "taapl"
  ) {
    return createDemoEligibilityPolicy();
  }
  if (
    asset.id.endsWith("-xstock") ||
    asset.issuer === "backed-assets-je" ||
    asset.issuer === "backed-finance-ag"
  ) {
    return createXStockEligibilityPolicy();
  }
  if (
    asset.assetClass === "FUND" ||
    asset.assetClass === "CREDIT" ||
    asset.issuer === "blackrock" ||
    asset.issuer === "apollo-global-management"
  ) {
    return createFundEligibilityPolicy();
  }
  if (
    asset.assetClass === "TREASURY" ||
    asset.assetClass === "CASH" ||
    asset.issuer === "invesco-advisers" ||
    asset.issuer === "ondo-finance"
  ) {
    return createTreasuryEligibilityPolicy();
  }
  return createDemoEligibilityPolicy();
}

