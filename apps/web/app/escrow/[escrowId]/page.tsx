import type { Metadata } from "next";
import { EscrowWorkspace } from "@/components/escrow-workspace";
import { PageIntro } from "@/components/ui";
import { WalletButton } from "@/components/wallet-shell";

export const metadata: Metadata = {
  title: "Escrow",
  description: "Onchain escrow state and physical verification settlement.",
};

export default async function EscrowPage({
  params,
}: {
  params: Promise<{ escrowId: string }>;
}) {
  const { escrowId } = await params;
  return (
    <div className="page-width">
      <PageIntro
        eyebrow="X Layer escrow"
        title="Payment waits for physical proof."
        description="Read contract state, fund the escrow, verify the physical asset, and consume its signed attestation."
        actions={<WalletButton compact />}
      />
      <EscrowWorkspace escrowId={escrowId} />
    </div>
  );
}
