import type { Metadata } from "next";
import { ProtocolExplorer } from "@/components/protocol-explorer";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = {
  title: "Protocol",
  description:
    "Explore the complete ALIVE physical-state attestation and settlement chain.",
};

export default function ProtocolPage() {
  return (
    <div className="page-width">
      <PageIntro
        eyebrow="Protocol architecture"
        title="Preserve the causal chain."
        description="Follow one observation from physical light to private analysis, signed evidence, contract validation, and payment outcome."
      />
      <ProtocolExplorer />
    </div>
  );
}
