import type { Metadata } from "next";
import { DemoGuidePage } from "@/components/intelligence/demo-guide-page";

export const metadata: Metadata = {
  title: "Guided demo",
  description: "The ALIVE judge flow: a real verified asset, then a controlled failure ALIVE catches and X Layer enforces.",
};

export default function DemoPage() {
  return <DemoGuidePage />;
}
