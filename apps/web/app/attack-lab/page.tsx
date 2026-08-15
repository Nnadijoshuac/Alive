import type { Metadata } from "next";
import { AttackLabWorkspace } from "@/components/rwa/attack-lab-workspace";

export const metadata: Metadata = {
  title: "Policy Attack Lab",
  description: "Run adversarial allocations through ALIVE's deterministic policy evaluator.",
};

export default function AttackLabPage() {
  return <AttackLabWorkspace />;
}

