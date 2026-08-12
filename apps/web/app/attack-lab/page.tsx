import type { Metadata } from "next";
import { AttackLabWorkspace } from "@/components/attack-lab-workspace";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = {
  title: "Attack Lab",
  description:
    "Run adversarial physical verification attempts against the real verifier.",
};

export default function AttackLabPage() {
  return (
    <div className="page-width">
      <PageIntro
        eyebrow="Adversarial verification"
        title="Try to fool ALIVE."
        description="Replay, substitute, expire, or present the genuine object. The verifier decides from captured evidence."
      />
      <AttackLabWorkspace />
    </div>
  );
}
