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
      "demo-treasury-issuer-b",
      "demo-treasury-issuer-c",
      "demo-gold-issuer",
      "demo-equity-issuer",
    ],
    requiredSourceTypes: ["DEMO_FIXTURE"],
    maxNavAgeSeconds: 86_400,
    maxPriceAgeSeconds: 3_600,
    requireRedemptionActive: true,
    maxPriceDeviationBps: 500,
    verdictValiditySeconds: 900,
  });
}
