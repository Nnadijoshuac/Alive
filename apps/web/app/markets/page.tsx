import type { Metadata } from "next";
import { MarketsWorkspace } from "@/components/rwa/markets-workspace";

export const metadata: Metadata = {
  title: "RWA markets",
  description: "Inspect sourced RWA prices, freshness, provider state, and asset provenance.",
};

export default function MarketsPage() {
  return <MarketsWorkspace />;
}

