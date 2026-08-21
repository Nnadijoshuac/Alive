import type { Metadata } from "next";
import { ProtocolWorkspace } from "@/components/rwa/protocol-workspace";

export const metadata: Metadata = {
  title: "RWA policy protocol",
  description: "Explore ALIVE's mandate, validation, market, optimization, authorization, and vault enforcement boundaries.",
};

export default function ProtocolPage() {
  return <ProtocolWorkspace />;
}

