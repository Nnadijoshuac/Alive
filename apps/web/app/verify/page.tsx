import type { Metadata } from "next";
import { VerifyWorkspace } from "@/components/rwa/verify-workspace";

export const metadata: Metadata = {
  title: "Verify an RWA",
  description: "Run ALIVE's real ingest, extract, and eligibility pipeline against a demo asset.",
};

export default function VerifyPage() {
  return <VerifyWorkspace />;
}
