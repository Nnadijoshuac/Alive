"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "@wagmi/core";
import { useState, type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { activeChain } from "@/lib/chain";

const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [activeChain.id]: http(activeChain.rpcUrls.default.http[0]),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
