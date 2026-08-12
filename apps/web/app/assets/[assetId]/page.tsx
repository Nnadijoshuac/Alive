import type { Metadata } from "next";
import { AssetPassport } from "@/components/asset-passport";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = {
  title: "Asset passport",
  description: "Registration and physical-state history for an ALIVE asset.",
};

export default async function AssetPassportPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return (
    <div className="page-width">
      <PageIntro
        eyebrow="Asset passport"
        title="A continuous record of observable state."
        description="Registration anchors identity. Fresh inspections add time-bound evidence without publishing raw media."
      />
      <AssetPassport assetId={assetId} />
    </div>
  );
}
