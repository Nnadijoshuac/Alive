import type { Metadata } from "next";
import { Suspense } from "react";
import { EscrowCreateForm } from "@/components/escrow-create-form";
import { PageIntro, Skeleton } from "@/components/ui";
import { WalletButton } from "@/components/wallet-shell";

export const metadata: Metadata = {
  title: "Create escrow",
  description: "Create an X Layer escrow gated by physical-state verification.",
};

export default function CreateEscrowPage() {
  return (
    <div className="page-width">
      <PageIntro
        eyebrow="Verification-gated escrow"
        title="Make physical identity a release condition."
        description="Define asset, counterparty, value, expiry, and the minimum accepted basis-point scores."
        actions={<WalletButton compact />}
      />
      <Suspense fallback={<Skeleton className="skeleton-wide" />}>
        <EscrowCreateForm />
      </Suspense>
    </div>
  );
}
