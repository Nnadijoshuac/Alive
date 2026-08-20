import type { AssetClass, RwaAsset } from "@alive/shared";

/**
 * A discovery-provider architecture (catalog-expansion directive §12), so
 * the catalog can eventually grow from one curated JSON file to hundreds
 * or thousands of sourced entries without coupling ALIVE's frontend or
 * eligibility engine to any single commercial provider. Every provider
 * normalizes into the SAME canonical shape -- ALIVE's own RwaAsset model,
 * never a provider-specific format leaking further into the app.
 *
 * `discover()` returns CANDIDATES, not catalog entries. A candidate is
 * only promoted into the public catalog once minimum identity
 * requirements are established (directive §2): a real product identity,
 * an issuer/manager, and at least one real source -- and any claimed
 * chain deployment is only marked VERIFIED once its contract address has
 * been independently checked, never inferred from the candidate alone.
 * That promotion step is deliberately NOT part of this interface -- it is
 * a separate, conservative identity-resolution pass (see
 * `resolveIdentity` below), so a noisy or wrong provider can never write
 * directly into the public catalog.
 */
export type DiscoveryCandidateStatus = "DISCOVERED" | "PENDING_IDENTITY";

export type DiscoveredDeploymentCandidate = {
  chainId?: number;
  chainName?: string;
  contractAddress?: string;
  tokenStandard?: string;
  /** The provider's own claim -- never trusted as VERIFIED until resolveDeployments() checks it. */
  claimedBy: string;
};

export type DiscoveredSourceCandidate = {
  title: string;
  url: string;
  publisher?: string;
  /** The provider's own guess at trust tier; resolveSources() may downgrade it, never upgrade it unilaterally. */
  claimedTier: "PRIMARY" | "CHAIN_EXPLORER" | "DISCOVERY";
};

export type DiscoveredAssetCandidate = {
  /** Provider-local identifier, not an ALIVE AssetId -- resolveIdentity() decides the canonical id, including whether this candidate is the same product as an existing catalog entry. */
  providerCandidateId: string;
  status: DiscoveryCandidateStatus;
  symbol?: string;
  name?: string;
  issuerName?: string;
  assetClass?: AssetClass;
  underlying?: string;
  deployments: DiscoveredDeploymentCandidate[];
  sources: DiscoveredSourceCandidate[];
};

/**
 * One external discovery/enrichment source. `discover()` finds candidates;
 * `resolveIdentity()`/`resolveDeployments()`/`resolveSources()` are the
 * conservative, evidence-checking steps that turn a candidate into
 * something worth showing (directive §13-14: prefer staying separate over
 * incorrectly merging or incorrectly promoting). A provider implements
 * only the steps it can genuinely perform; steps it cannot support should
 * return the candidate unchanged rather than fabricate a result.
 */
export interface CatalogDiscoveryProvider {
  readonly name: string;
  discover(): Promise<DiscoveredAssetCandidate[]>;
  resolveIdentity?(
    candidate: DiscoveredAssetCandidate,
    existingCatalog: readonly RwaAsset[],
  ): Promise<{ matchesExistingAssetId?: string; candidate: DiscoveredAssetCandidate }>;
  resolveDeployments?(
    candidate: DiscoveredAssetCandidate,
  ): Promise<DiscoveredAssetCandidate>;
  resolveSources?(candidate: DiscoveredAssetCandidate): Promise<DiscoveredAssetCandidate>;
}
