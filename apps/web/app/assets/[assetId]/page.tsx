import type { Metadata, Viewport } from "next";
import { AssetIntelligencePage } from "@/components/intelligence/asset-intelligence-page";

export const metadata: Metadata = {
  title: "ALIVE Asset Intelligence",
  description: "What this tokenized asset is, how it's doing, and what ALIVE currently thinks -- with every fact traced to its source.",
};

export const viewport: Viewport = {
  themeColor: "#f7f4ee",
  colorScheme: "light",
};

export default async function AssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return <AssetIntelligencePage assetId={assetId} />;
}
