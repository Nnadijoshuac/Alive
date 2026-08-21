import type { LogoSource, RwaAssetVisual } from "@alive/shared";

/**
 * Resolves a token's REAL logo by network + canonical contract address --
 * never by symbol alone, since symbols collide and are not a trustworthy
 * identity. A logo is only ever reported RESOLVED once the source's own
 * returned contract address has been checked against the one requested;
 * any mismatch, timeout, or missing image falls through to UNAVAILABLE.
 * The caller (a generated badge, a neutral placeholder) decides what
 * UNAVAILABLE looks like in the UI -- this module only ever returns a
 * verified identity or nothing.
 */

const COINGECKO_PLATFORM_BY_NETWORK: Record<string, string> = {
  Ethereum: "ethereum",
  Polygon: "polygon-pos",
  Arbitrum: "arbitrum-one",
  Avalanche: "avalanche",
  Base: "base",
  Solana: "solana",
  BNBChain: "binance-smart-chain",
  Optimism: "optimistic-ethereum",
};

const TRUST_WALLET_CHAIN_BY_NETWORK: Record<string, string> = {
  Ethereum: "ethereum",
  Polygon: "polygon",
  Arbitrum: "arbitrum",
  Avalanche: "avalanchec",
  Base: "base",
  BNBChain: "smartchain",
  Optimism: "optimism",
};

type CoinGeckoContractResponse = {
  id?: string;
  symbol?: string;
  name?: string;
  contract_address?: string;
  image?: { large?: string; small?: string; thumb?: string };
  image_large?: string;
};

export type LogoResolutionInput = {
  network?: string;
  tokenAddress?: string;
};

export type LogoLookup = (
  network: string,
  contractAddress: string,
) => Promise<RwaAssetVisual>;

function unavailable(): RwaAssetVisual {
  return { logoStatus: "UNAVAILABLE" };
}

function addressesMatch(requested: string, returned: string | undefined): boolean {
  if (!returned) return false;
  return requested.toLowerCase() === returned.toLowerCase();
}

/**
 * Primary resolver: CoinGecko's token-info-by-contract-address endpoint.
 * The identity check is not optional -- a symbol-only match (or trusting
 * whatever the API happened to return without verifying it) is exactly
 * the failure mode this exists to prevent.
 */
export async function resolveFromCoinGecko(
  network: string,
  contractAddress: string,
  now: () => Date = () => new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<RwaAssetVisual> {
  const platform = COINGECKO_PLATFORM_BY_NETWORK[network];
  if (!platform) return unavailable();

  const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${contractAddress}`;
  let response: Response | undefined;
  // CoinGecko's free public API rate-limits aggressively; a couple of
  // backed-off retries on 429 turns a transient throttle into a resolved
  // logo instead of a false "unavailable."
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetchImpl(url, { headers: { accept: "application/json" } });
    } catch {
      return unavailable();
    }
    if (response.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, 5_000 * (attempt + 1)));
  }
  if (!response || !response.ok) return unavailable();

  let data: CoinGeckoContractResponse;
  try {
    data = (await response.json()) as CoinGeckoContractResponse;
  } catch {
    return unavailable();
  }

  if (!addressesMatch(contractAddress, data.contract_address)) return unavailable();

  const imageUrl = data.image?.large ?? data.image_large ?? data.image?.small ?? data.image?.thumb;
  if (!imageUrl) return unavailable();

  return {
    logoStatus: "RESOLVED",
    logoUrl: imageUrl,
    logoSource: "COINGECKO" satisfies LogoSource,
    ...(data.id ? { logoSourceId: data.id } : {}),
    logoContractAddress: contractAddress as `0x${string}`,
    logoNetwork: network,
    logoVerifiedAt: now().toISOString(),
  };
}

/**
 * Secondary resolver: the Trust Wallet community asset repository, keyed
 * by chain folder + contract address (never by symbol). A HEAD request
 * confirms the asset actually exists at that address before it is ever
 * reported RESOLVED -- Trust Wallet has no verification API, so existence
 * at the address-keyed path is the strongest identity signal available.
 */
export async function resolveFromTrustWallet(
  network: string,
  contractAddress: string,
  now: () => Date = () => new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<RwaAssetVisual> {
  const chainFolder = TRUST_WALLET_CHAIN_BY_NETWORK[network];
  if (!chainFolder) return unavailable();

  const url = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chainFolder}/assets/${contractAddress}/logo.png`;
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "HEAD" });
  } catch {
    return unavailable();
  }
  if (!response.ok) return unavailable();

  return {
    logoStatus: "RESOLVED",
    logoUrl: url,
    logoSource: "TRUST_WALLET" satisfies LogoSource,
    logoContractAddress: contractAddress as `0x${string}`,
    logoNetwork: network,
    logoVerifiedAt: now().toISOString(),
  };
}

/** CoinGecko first, Trust Wallet second, otherwise UNAVAILABLE. Never invents an image. */
export async function resolveTokenLogo(
  asset: LogoResolutionInput,
  now: () => Date = () => new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<RwaAssetVisual> {
  if (!asset.network || !asset.tokenAddress) return unavailable();

  const coingecko = await resolveFromCoinGecko(asset.network, asset.tokenAddress, now, fetchImpl);
  if (coingecko.logoStatus === "RESOLVED") return coingecko;

  const trustWallet = await resolveFromTrustWallet(asset.network, asset.tokenAddress, now, fetchImpl);
  if (trustWallet.logoStatus === "RESOLVED") return trustWallet;

  return unavailable();
}
