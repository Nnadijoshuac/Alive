import type { Metadata } from "next";
import { AttackLabPage as AttackLabPageComponent } from "@/components/intelligence/attack-lab-page";

export const metadata: Metadata = {
  title: "Attack Lab",
  description: "Prove ALIVE detects a NAV-staleness failure and X Layer blocks the gated action.",
};

export default function AttackLabPage() {
  return <AttackLabPageComponent />;
}
