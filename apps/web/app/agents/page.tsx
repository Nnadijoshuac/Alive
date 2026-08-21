import type { Metadata, Viewport } from "next";
import { AgentWorkspace } from "@/components/intelligence/agent-workspace";

export const metadata: Metadata = {
  title: "ALIVE Agents | Context-Aware RWA Intelligence",
  description:
    "Autonomous portfolio agent reading live onchain positions, behavioral evidence, and deterministic policy on X Layer.",
};

export const viewport: Viewport = {
  themeColor: "#050806",
  colorScheme: "dark",
};

export default function AgentsRoute() {
  return <AgentWorkspace />;
}
