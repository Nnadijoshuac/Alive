import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { DashboardView } from "@/components/dashboard-view";
import { buttonClass, PageIntro } from "@/components/ui";
import { WalletButton } from "@/components/wallet-shell";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Physical asset passports and verifier activity.",
};

export default function DashboardPage() {
  return (
    <div className="page-width">
      <PageIntro
        eyebrow="Protocol console"
        title="Physical state, made legible."
        description="Inspect registered baselines, verification outcomes, and settlement readiness."
        actions={
          <>
            <WalletButton compact />
            <Link
              className={`${buttonClass} button-primary`}
              href="/assets/register"
            >
              <PlusIcon size={17} />
              Register asset
            </Link>
          </>
        }
      />
      <DashboardView />
    </div>
  );
}
