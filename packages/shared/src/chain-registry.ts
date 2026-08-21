/**
 * The catalog-discovery chain registry (X Layer mandate §1) -- distinct
 * from `chains.ts`'s viem `Chain` definitions used for actually talking
 * to a network (RPC calls, signing). This registry exists purely to
 * answer "which chains can a user filter Explore by," and its scope is
 * therefore much broader (chains ALIVE has never connected to, like
 * Solana or Base, still belong here as filter options) while carrying
 * far less per-chain detail.
 *
 * X Layer must always exist here: its presence in the Explore filter is
 * NOT derived from whether any asset currently has a verified deployment
 * on it -- a chain filter with zero matching assets is an honest,
 * intentional empty state, not a reason to hide the filter.
 *
 * Mainnet vs Testnet is never conflated: `networkType` marks X Layer
 * Testnet (1952, the Attack Lab's chain) as TESTNET so it can be excluded
 * from any public "which real RWAs exist" surface by construction.
 */
export type ChainRegistryEntry = {
  chainId: number;
  chainName: string;
  chainSlug: string;
  networkType: "MAINNET" | "TESTNET";
  nativeToken: string;
};

export const X_LAYER_MAINNET_CHAIN_ID = 196;
export const X_LAYER_TESTNET_CHAIN_ID = 1_952;

export const CHAIN_REGISTRY: readonly ChainRegistryEntry[] = [
  {
    chainId: X_LAYER_MAINNET_CHAIN_ID,
    chainName: "X Layer",
    chainSlug: "x-layer",
    networkType: "MAINNET",
    nativeToken: "OKB",
  },
  {
    chainId: X_LAYER_TESTNET_CHAIN_ID,
    chainName: "X Layer Testnet",
    chainSlug: "x-layer-testnet",
    networkType: "TESTNET",
    nativeToken: "OKB",
  },
  { chainId: 1, chainName: "Ethereum", chainSlug: "ethereum", networkType: "MAINNET", nativeToken: "ETH" },
  { chainId: 8_453, chainName: "Base", chainSlug: "base", networkType: "MAINNET", nativeToken: "ETH" },
  { chainId: 42_161, chainName: "Arbitrum", chainSlug: "arbitrum", networkType: "MAINNET", nativeToken: "ETH" },
  { chainId: 137, chainName: "Polygon", chainSlug: "polygon", networkType: "MAINNET", nativeToken: "POL" },
  { chainId: 10, chainName: "Optimism", chainSlug: "optimism", networkType: "MAINNET", nativeToken: "ETH" },
  { chainId: 56, chainName: "BNB Chain", chainSlug: "bnb-chain", networkType: "MAINNET", nativeToken: "BNB" },
  { chainId: 43_114, chainName: "Avalanche", chainSlug: "avalanche", networkType: "MAINNET", nativeToken: "AVAX" },
];

/** Public RWA discovery/Explore chain options: Mainnets only -- a Testnet harness chain must never be offered as a place to find real assets. */
export function publiclySelectableChains(): ChainRegistryEntry[] {
  return CHAIN_REGISTRY.filter((chain) => chain.networkType === "MAINNET");
}

export function chainById(chainId: number): ChainRegistryEntry | undefined {
  return CHAIN_REGISTRY.find((chain) => chain.chainId === chainId);
}
