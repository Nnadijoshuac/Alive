import { getAliveChain, type AliveChainEnvironment } from "@alive/shared";
import { isAddress, type Address } from "viem";

function chainEnvironment(): AliveChainEnvironment {
  const value = process.env.NEXT_PUBLIC_CHAIN_ENV;
  if (
    value === "xlayer-mainnet" ||
    value === "xlayer-testnet" ||
    value === "local"
  )
    return value;
  return "local";
}

export const activeChain = getAliveChain(chainEnvironment(), {
  ...(process.env.NEXT_PUBLIC_RPC_URL
    ? { rpcUrl: process.env.NEXT_PUBLIC_RPC_URL }
    : {}),
});

function configuredAddress(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? value : undefined;
}

export const contractAddresses = {
  assetRegistry: configuredAddress(
    process.env.NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS,
  ),
  attestationRegistry: configuredAddress(
    process.env.NEXT_PUBLIC_ATTESTATION_REGISTRY_ADDRESS,
  ),
  escrow: configuredAddress(process.env.NEXT_PUBLIC_ESCROW_ADDRESS),
  testToken: configuredAddress(process.env.NEXT_PUBLIC_TEST_TOKEN_ADDRESS),
} as const;

export const contractsConfigured = Boolean(
  contractAddresses.assetRegistry &&
  contractAddresses.attestationRegistry &&
  contractAddresses.escrow,
);

export function explorerTransactionUrl(hash: string): string | undefined {
  const base = activeChain.blockExplorers?.default.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : undefined;
}

export function explorerAddressUrl(address: string): string | undefined {
  const base = activeChain.blockExplorers?.default.url;
  return base ? `${base.replace(/\/$/, "")}/address/${address}` : undefined;
}
