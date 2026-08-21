"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react";
import overviewStyles from "./overview.module.css";
import styles from "./demo-guide.module.css";

const STEPS = [
  {
    phase: "VERIFY",
    title: "Analyze real USTB",
    description:
      "Search or select TTBILL-B on Overview and click Analyze asset.",
    href: "/overview?q=ttbill-b",
    action: "Open Overview",
  },
  {
    phase: "VERIFY",
    title: "Inspect sourced intelligence",
    description:
      "Review any available document extraction, oracle reference, and eligibility result with its source and freshness.",
    href: "/assets/ttbill-b",
    action: "Open Asset Intelligence",
  },
  {
    phase: "VERIFY",
    title: "Read each status independently",
    description:
      "Verification, Eligibility, and Data status are shown as three separate, honest signals.",
    href: "/assets/ttbill-b",
    action: "See status",
  },
  {
    phase: "STRESS TEST",
    title: "Break a controlled asset",
    description:
      "TTBILL-A is a demo asset reserved for this. Live Chainlink data is never touched.",
    href: "/attack-lab",
    action: "Open Attack Lab",
  },
  {
    phase: "STRESS TEST",
    title: "Run the NAV-staleness attack",
    description:
      "One click. ALIVE detects NAV_STALE and marks the asset RESTRICTED.",
    href: "/attack-lab",
    action: "Run attack",
  },
  {
    phase: "RECOVER",
    title: "Restore and re-evaluate",
    description:
      "Restore the fixture state, then re-run eligibility before reviewing any gated action.",
    href: "/attack-lab",
    action: "Restore",
  },
] as const;

export function DemoGuidePage() {
  return (
    <div className={overviewStyles.page}>
      <header className={overviewStyles.pageHeader}>
        <div>
          <p className={overviewStyles.eyebrow}>Guided demo</p>
          <h1 className={overviewStyles.heading}>
            Follow the evidence, then test the boundary.
          </h1>
          <p className={overviewStyles.subheading}>
            Start with a sourced asset, inspect the decision, then use the
            isolated testnet harness to reproduce a rejection and recovery.
          </p>
        </div>
        <div className={overviewStyles.methodLedger}>
          <span>Runbook</span>
          <ol>
            <li>
              <b>Verify</b>
              <small>Real asset evidence</small>
            </li>
            <li>
              <b>Stress</b>
              <small>Controlled demo state</small>
            </li>
            <li>
              <b>Recover</b>
              <small>Fresh state restored</small>
            </li>
          </ol>
        </div>
      </header>

      <div className={styles.scopeNote} role="note">
        <strong>Scope boundary</strong>
        <span>
          TTBILL-B uses sourced intelligence. Only TTBILL-A is modified, inside
          the labelled testnet harness.
        </span>
      </div>

      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li className={styles.step} key={step.title}>
            <span className={styles.stepIndex}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className={styles.stepBody}>
              <span className={styles.phase}>{step.phase}</span>
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
