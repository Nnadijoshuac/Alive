import type { Metadata } from "next";
import { DemoWorkspace } from "@/components/rwa/demo-workspace";

export const metadata: Metadata = {
  title: "Guided RWA demo",
  description: "Run the verified local ALIVE mandate, policy, optimizer, rejection, and rebalance flow.",
};

export default function DemoPage() {
  return <DemoWorkspace />;
}

