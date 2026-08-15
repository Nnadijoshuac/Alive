import type { Metadata } from "next";
import { AssetPassportWorkspace } from "@/components/rwa/asset-passport-workspace";

export const metadata: Metadata = {
  title: "RWA asset passport",
  description: "Inspect known product facts, risk, liquidity, restrictions, quote freshness, and source provenance.",
};

export default async function AssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return <AssetPassportWorkspace assetId={assetId} />;
}

