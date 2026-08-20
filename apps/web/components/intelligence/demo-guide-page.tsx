"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react";
import overviewStyles from "./overview.module.css";
import styles from "./demo-guide.module.css";

const STEPS = [
  {
    title: "Analyze real USTB",
    description: "Search or select TTBILL-B on Overview and click Analyze asset.",
    href: "/?q=ttbill-b",
    action: "Open Overview",
  },
  {
    title: "Inspect live intelligence",
    description: "Real Groq document facts, live Chainlink NAV, and ALIVE's eligibility read.",
    href: "/assets/ttbill-b",
    action: "Open Asset Intelligence",
  },
  {
    title: "Confirm Verified and Eligible",
    description: "Verification, Eligibility, and Data status are shown as three separate, honest signals.",
    href: "/assets/ttbill-b",
    action: "See status",
  },
  {
    title: "Break a controlled asset",
    description: "TTBILL-A is a demo asset reserved for this. Live Chainlink data is never touched.",
    href: "/attack-lab",
    action: "Open Attack Lab",
  },
  {
    title: "Run the NAV-staleness attack",
    description: "One click. ALIVE detects NAV_STALE and marks the asset RESTRICTED.",
    href: "/attack-lab",
    action: "Run attack",
  },
  {
    title: "Restore and confirm recovery",
    description: "One click. Fresh NAV, ELIGIBLE again, X Layer allows the gated action.",
    href: "/attack-lab",
    action: "Restore",
  },
] as const;

export function DemoGuidePage() {
  return (
    <div className={overviewStyles.page}>
      <div>
        <p className={overviewStyles.eyebrow}>Guided demo</p>
        <h1 className={overviewStyles.heading}>The ALIVE judge flow.</h1>
        <p className={overviewStyles.subheading}>
          Six steps: a real verified asset, then a controlled failure ALIVE catches
          and X Layer enforces. Each step opens the real page -- nothing here is a
          second copy of the product.
        </p>
      </div>

      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li className={styles.step} key={step.title}>
            <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
            <div className={styles.stepBody}>
              <h2>{step.title}</h2>
              <p>{step.description}</p>
            </div>
            <Link className={styles.stepLink} href={step.href}>
              {step.action} <ArrowRightIcon size={13} weight="bold" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
