import type { Metadata } from "next";
import { DesignSystemWorkspace } from "@/components/rwa/design-system-workspace";

export const metadata: Metadata = {
  title: "RWA design system",
  description: "Visual QA fixtures for ALIVE policy, market, and onchain interface states.",
};

export default function DesignSystemPage() {
  return <DesignSystemWorkspace />;
}

