import type { ReactNode } from "react";
import { WalletRouteProviders } from "@/components/wallet-route-providers";

export default function VerifyLayout({ children }: { children: ReactNode }) {
  return <WalletRouteProviders>{children}</WalletRouteProviders>;
}
