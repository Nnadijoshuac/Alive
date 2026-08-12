import type { Metadata } from "next";
import { VerificationWorkflow } from "@/components/verification-workflow";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Verify physical asset", description: "Run a fresh, randomized physical-state verification." };

export default async function VerifyAssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return (
    <div className="page-width">
      <PageIntro eyebrow="Active verification" title="Prove the asset is present now." description="Respond to fresh visual challenges. The configured verifier determines the result from real observations." />
      <VerificationWorkflow assetId={assetId} />
    </div>
  );
}
