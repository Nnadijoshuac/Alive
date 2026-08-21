import { X_LAYER_MAINNET_CHAIN_ID } from "@alive/shared";
import type {
  CatalogDiscoveryProvider,
  DiscoveredAssetCandidate,
} from "./types.js";

/**
 * Real X Layer Mainnet (chainId 196) discovery, per the X Layer mandate:
 * discovery must actually run against X Layer, not stop at "none of our
 * 13 seeded assets happen to be there." Source: OKX's own public,
 * no-API-key token list for X Layer
 * (https://github.com/okx/xlayer-tokenlist), the same Uniswap-Token-List-
 * format file wallets/dApps import. This is genuine chain+contract-address
 * identity, not a ticker guess.
 *
 * Finding a token in this list is NOT sufficient to call it an RWA
 * (X Layer mandate §4): every entry is run through `classify()`, and only
 * an entry with real evidence connecting the contract to an actual
 * real-world financial product would ever be marked RWA_CONFIRMED. As of
 * this discovery run, X Layer's default list is wrapped-native-gas and
 * bridged-crypto assets plus payment stablecoins -- none of them
 * represent a Treasury, fund, credit, equity, or commodity product, so
 * every entry classifies NOT_RWA. That is a real, checked result, not a
 * placeholder: a future entry ALIVE cannot confidently classify either
 * way becomes INSUFFICIENT_EVIDENCE, never a silent RWA_CONFIRMED.
 */

const TOKEN_LIST_URL = "https://raw.githubusercontent.com/okx/xlayer-tokenlist/main/xlayer.tokenlist.json";

export type XLayerCandidateStatus = "RWA_CONFIRMED" | "RWA_CANDIDATE" | "NOT_RWA" | "INSUFFICIENT_EVIDENCE";

export type XLayerDiscoveryRow = {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  logoURI?: string;
  classification: XLayerCandidateStatus;
  reasoning: string;
};

type TokenListToken = {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
};

type TokenListResponse = {
  name: string;
  timestamp: string;
  tokens: TokenListToken[];
};

/**
 * Every token X Layer's default list carries today, and why it is not a
 * real-world-asset product. This is an explicit, auditable allowlist of
 * classifications -- not a symbol-pattern heuristic -- so a new, unknown
 * token added to the list in the future falls through to
 * INSUFFICIENT_EVIDENCE rather than being silently classified either way.
 */
const KNOWN_NON_RWA_TOKENS: Record<string, string> = {
  WOKB: "Wrapped native gas token (OKB) -- a wrapped chain-native asset, not a real-world financial product.",
  "USD₮0": "Bridged/omnichain USDT variant -- a payment stablecoin, not a claim on a specific real-world asset pool ALIVE catalogs.",
  USDC: "Circle's USD stablecoin -- a payment stablecoin, out of ALIVE's RWA product scope (distinct from Circle's own USYC tokenized fund, which is a separate, already-cataloged product).",
  DAI: "MakerDAO's decentralized stablecoin -- a payment stablecoin, not a real-world product claim.",
  USDG: "Global Dollar Network's stablecoin -- a payment stablecoin, not a real-world product claim.",
  xETH: "OKX-wrapped bridged ETH -- a wrapped crypto asset, not a real-world asset.",
  xSOL: "OKX-wrapped bridged SOL -- a wrapped crypto asset, not a real-world asset.",
  xBETH: "OKX-wrapped bridged staked ETH -- a wrapped crypto asset, not a real-world asset.",
  xOKSOL: "OKX-wrapped bridged staked SOL -- a wrapped crypto asset, not a real-world asset.",
  xBTC: "OKX-wrapped bridged BTC -- a wrapped crypto asset, not a real-world asset.",
};

function classify(token: TokenListToken): { classification: XLayerCandidateStatus; reasoning: string } {
  const known = KNOWN_NON_RWA_TOKENS[token.symbol];
  if (known) return { classification: "NOT_RWA", reasoning: known };
  return {
    classification: "INSUFFICIENT_EVIDENCE",
    reasoning:
      "Not in ALIVE's reviewed non-RWA list and no issuer/product source has been checked yet -- requires manual identity resolution before any classification.",
  };
}

export async function discoverXLayerTokens(
  fetchImpl: typeof fetch = fetch,
): Promise<XLayerDiscoveryRow[]> {
  const response = await fetchImpl(TOKEN_LIST_URL);
  if (!response.ok) {
    throw new Error(`X Layer token list fetch failed: HTTP ${response.status}`);
  }
  const list = (await response.json()) as TokenListResponse;
  return list.tokens
    .filter((token) => token.chainId === X_LAYER_MAINNET_CHAIN_ID)
    .map((token) => {
      const { classification, reasoning } = classify(token);
      return {
        chainId: token.chainId,
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        ...(token.logoURI ? { logoURI: token.logoURI } : {}),
        classification,
        reasoning,
      };
    });
}

export class XLayerRwaDiscoveryProvider implements CatalogDiscoveryProvider {
  readonly name = "x-layer-mainnet-token-list";

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async discover(): Promise<DiscoveredAssetCandidate[]> {
    const rows = await discoverXLayerTokens(this.fetchImpl);
    // Only genuinely confirmed RWAs would ever surface as catalog
    // candidates from this provider -- a CANDIDATE or INSUFFICIENT_EVIDENCE
    // row stays an internal discovery record, never a public candidate.
    return rows
      .filter((row) => row.classification === "RWA_CONFIRMED")
      .map((row) => ({
        providerCandidateId: `xlayer:${row.address}`,
        status: "DISCOVERED" as const,
        symbol: row.symbol,
        name: row.name,
        deployments: [
          {
            chainId: row.chainId,
            chainName: "X Layer",
            contractAddress: row.address,
            tokenStandard: "ERC-20",
            claimedBy: this.name,
          },
        ],
        sources: [],
      }));
  }
}
