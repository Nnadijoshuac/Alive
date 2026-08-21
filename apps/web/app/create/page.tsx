import type { Metadata } from "next";
import { CreateWorkspace } from "@/components/rwa/create-workspace";

export const metadata: Metadata = {
  title: "Create a capital policy",
  description: "Compile a natural-language RWA mandate into a strict, deterministic ALIVE policy.",
};

export default function CreatePage() {
  return <CreateWorkspace />;
}

