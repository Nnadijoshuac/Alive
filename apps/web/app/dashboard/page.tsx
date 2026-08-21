import type { Metadata } from "next";
import { DashboardWorkspace } from "@/components/rwa/dashboard-workspace";

export const metadata: Metadata = {
  title: "RWA policy dashboard",
  description: "Inspect ALIVE mandates, policy state, sourced markets, and honest onchain readiness.",
};

export default function DashboardPage() {
  return <DashboardWorkspace />;
}

