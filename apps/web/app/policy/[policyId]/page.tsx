import type { Metadata } from "next";
import { PolicyWorkspace } from "@/components/rwa/policy-workspace";

export const metadata: Metadata = {
  title: "Policy record",
  description: "Inspect a validated ALIVE capital policy and run a deterministic portfolio calculation.",
};

export default async function PolicyPage({ params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return <PolicyWorkspace policyId={policyId} />;
}

