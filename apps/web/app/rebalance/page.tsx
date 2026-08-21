import type { Metadata } from "next";
import { RebalanceWorkspace } from "@/components/rwa/rebalance-workspace";

export const metadata: Metadata = {
  title: "Policy rebalance",
  description: "Check current RWA holdings for policy drift and calculate a deterministic rebalance proposal.",
};

export default function RebalancePage() {
  return <RebalanceWorkspace />;
}

