import type { Metadata } from "next";
import { RegistrationWizard } from "@/components/registration-wizard";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Register an asset", description: "Create a private visual fingerprint for a physical asset." };

export default function RegisterAssetPage() {
  return (
    <div className="page-width">
      <PageIntro eyebrow="Asset registration" title="Create a physical-state baseline." description="Capture six live views, build a private fingerprint, then choose whether to commit it onchain." />
      <RegistrationWizard />
    </div>
  );
}
