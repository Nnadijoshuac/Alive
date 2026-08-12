import { defineChain, type Chain } from "viem";

export type AliveChainEnvironment = "local" | "xlayer-testnet" | "xlayer-mainnet";

export const localChain = defineChain({
  id: 31_337,
  name: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export const xLayerTestnet = defineChain({
  id: 1_952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://testrpc.xlayer.tech/terigon"] } },
  blockExplorers: {
    default: { name: "OKX Explorer", url: "https://www.okx.com/web3/explorer/xlayer-test" },
  },
  testnet: true,
});

export const xLayerMainnet = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
  blockExplorers: {
    default: { name: "OKX Explorer", url: "https://www.okx.com/web3/explorer/xlayer" },
  },
});

export const ALIVE_CHAINS: Readonly<Record<AliveChainEnvironment, Chain>> = {
  local: localChain,
  "xlayer-testnet": xLayerTestnet,
  "xlayer-mainnet": xLayerMainnet,
};

export interface ChainOverrides {
  rpcUrl?: string;
  explorerUrl?: string;
}

export function getAliveChain(environment: AliveChainEnvironment, overrides: ChainOverrides = {}): Chain {
  const base = ALIVE_CHAINS[environment];
  return defineChain({
    ...base,
    rpcUrls: overrides.rpcUrl ? { default: { http: [overrides.rpcUrl] } } : base.rpcUrls,
    blockExplorers: overrides.explorerUrl
      ? { default: { name: base.blockExplorers?.default.name ?? "Explorer", url: overrides.explorerUrl } }
      : base.blockExplorers,
  });
}

export function getAliveChainById(chainId: number): Chain | undefined {
  return Object.values(ALIVE_CHAINS).find((chain) => chain.id === chainId);
}
