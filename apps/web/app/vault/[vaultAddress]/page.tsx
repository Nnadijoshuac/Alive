import type { Metadata } from "next";
import { VaultWorkspace } from "@/components/rwa/vault-workspace";

export const metadata: Metadata = {
  title: "Vault reader",
  description: "Read public ALIVE policy-vault facts from the configured EVM chain.",
};

export default async function VaultPage({ params }: { params: Promise<{ vaultAddress: string }> }) {
  const { vaultAddress } = await params;
  return <VaultWorkspace vaultAddress={vaultAddress} />;
}

