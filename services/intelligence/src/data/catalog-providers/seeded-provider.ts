import type { RwaAsset } from "@alive/shared";
import type {
  CatalogDiscoveryProvider,
  DiscoveredAssetCandidate,
} from "./types.js";

/**
 * The "manual curated additions" provider (directive §12): wraps ALIVE's
 * own hand-researched catalog entries (each verified against a real
 * issuer/product page and, where applicable, an independently-checked
 * chain deployment) as a `CatalogDiscoveryProvider`. This is today's only
 * concrete provider -- the interface exists so a future aggregator/
 * explorer-indexing provider can be added alongside it without changing
 * anything downstream (the eligibility engine, the frontend, the
 * repository) that already consumes ALIVE's canonical RwaAsset shape.
 *
 * Every candidate this provider returns is already DISCOVERED with real
 * evidence attached (it was researched and cited by a human, not scraped
 * unverified) -- but it still goes through the same resolveDeployments()
 * contract as any other provider would, so promotion to a VERIFIED
 * deployment is never silently assumed.
 */
export class SeededCatalogProvider implements CatalogDiscoveryProvider {
  readonly name = "alive-seeded-catalog";

  constructor(private readonly assets: readonly RwaAsset[]) {}

  async discover(): Promise<DiscoveredAssetCandidate[]> {
    return this.assets
      .filter((asset) => asset.sources.some((source) => source.sourceType !== "DEMO_FIXTURE"))
      .map((asset) => ({
        providerCandidateId: asset.id,
        status: "DISCOVERED" as const,
        symbol: asset.symbol,
        name: asset.name,
        issuerName: asset.issuerName,
        assetClass: asset.assetClass,
        underlying: asset.underlying,
        deployments: (asset.deployments ?? []).map((deployment) => ({
          chainId: deployment.chainId,
          chainName: deployment.chainName,
          contractAddress: deployment.contractAddress,
          tokenStandard: deployment.tokenStandard,
          claimedBy: this.name,
        })),
        sources: asset.sources
          .filter((source) => source.sourceType !== "DEMO_FIXTURE" && source.sourceType !== "ALIVE_METHODOLOGY")
          .map((source) => ({
            title: source.title,
            url: "sourceUrl" in source ? source.sourceUrl : "",
            claimedTier:
              "sourceTier" in source && source.sourceTier ? source.sourceTier : ("DISCOVERY" as const),
          })),
      }));
  }
}
