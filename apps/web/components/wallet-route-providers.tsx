"use client";

import type { ReactNode } from "react";
import { Providers } from "./providers";

export function WalletRouteProviders({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
