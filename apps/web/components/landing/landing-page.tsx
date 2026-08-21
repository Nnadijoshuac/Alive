"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRightIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import styles from "./landing.module.css";

const evaluationSteps = [
  {
    source: "SOURCE",
    title: "Issuer evidence",
    description: "Facts stay attached to their documents.",
    state: "REQUIRED",
  },
  {
    source: "AI",
    title: "Structured extraction",
    description: "AI proposes cited facts. It does not decide.",
    state: "BOUNDED",
  },
  {
    source: "RULE",
    title: "Eligibility policy",
    description: "Deterministic rules return the verdict.",
    state: "DECIDES",
  },
  {
    source: "CHAIN",
    title: "Contract enforcement",
    description: "The approved boundary is enforced onchain.",
    state: "ENFORCES",
  },
] as const;

const productPath = [
  {
    label: "Verify",
    title: "Start with the asset, not the ticker.",
    description:
      "Read the backing, sources, market freshness, current verdict, and the exact reasons behind it.",
    href: "/overview",
    action: "Verify an asset",
  },
  {
    label: "Mandate",
    title: "Turn intent into hard boundaries.",
    description:
      "Compile plain-language intent into a canonical policy, then review every rule before calculation.",
    href: "/create",
    action: "Build a mandate",
  },
  {
    label: "Observe",
    title: "See when the answer changes.",
    description:
      "Track expiry, policy outcomes, and evidence-backed activity without treating demo state as live state.",
    href: "/activity",
    action: "Open activity",
  },
] as const;

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={styles.page}>
      <span
        hidden
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html:
            "<!-- THESIS: show the verification mechanism before asking for trust. OWN-WORLD: a quiet institutional control room built from near-black planes, ruled evidence rows, and one scanner-green signal. STORY: choose an asset, inspect why it passes, then define what capital may do. FIRST VIEWPORT: statement and action at left, working evaluation rail at right, provenance vocabulary below. FORM: compact evidence terminal rather than a cinematic crypto landing page. -->",
        }}
      />

      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="ALIVE home">
          <span className={styles.brandMark} aria-hidden="true">A</span>
          <span>
            <strong>ALIVE</strong>
            <small>RWA policy intelligence</small>
          </span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Primary navigation">
          <Link href="/overview">Verify</Link>
          <Link href="/explore">Discover</Link>
          <Link href="/create">Mandate</Link>
          <Link href="/protocol">Protocol</Link>
        </nav>

        <Link href="/overview" className={styles.headerAction}>
          Open workspace
          <ArrowRightIcon size={14} weight="bold" aria-hidden="true" />
        </Link>

        <button
          type="button"
          className={styles.menuButton}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <XIcon size={19} /> : <span aria-hidden="true">Menu</span>}
        </button>
      </header>

      {menuOpen ? (
        <nav className={styles.mobileNav} aria-label="Mobile navigation">
          <Link href="/overview" onClick={() => setMenuOpen(false)}>Verify</Link>
          <Link href="/explore" onClick={() => setMenuOpen(false)}>Discover</Link>
          <Link href="/create" onClick={() => setMenuOpen(false)}>Mandate</Link>
          <Link href="/protocol" onClick={() => setMenuOpen(false)}>Protocol</Link>
        </nav>
      ) : null}

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.liveLabel}>
              <i aria-hidden="true" />
              Continuous verification · source-bound
            </p>
            <h1>Know what passes before capital moves.</h1>
            <p className={styles.lede}>
              ALIVE reads the evidence behind a tokenized asset, applies deterministic
              eligibility rules, and exposes what a contract can enforce.
            </p>
            <div className={styles.actions}>
              <Link href="/overview" className={styles.primaryAction}>
                <MagnifyingGlassIcon size={16} weight="bold" aria-hidden="true" />
                Verify an asset
              </Link>
              <Link href="/create" className={styles.secondaryAction}>
                Build a mandate
                <ArrowRightIcon size={14} aria-hidden="true" />
              </Link>
            </div>
            <p className={styles.disclosure}>
              Demo and snapshot data are labelled. Unsupported facts remain UNKNOWN.
            </p>
          </div>

          <section className={styles.terminal} aria-labelledby="terminal-title">
            <div className={styles.terminalHeader}>
              <div>
                <span>ELIGIBILITY CHECK</span>
                <strong id="terminal-title">How an answer is produced</strong>
              </div>
              <span className={styles.workflowBadge}>WORKFLOW</span>
            </div>

            <div className={styles.pipeline}>
              <div className={styles.scanSignal} aria-hidden="true" />
              {evaluationSteps.map((step, index) => (
                <article className={styles.pipelineRow} key={step.source}>
                  <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <div className={styles.stepCopy}>
                    <span>{step.source}</span>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                  <span className={styles.stepState}>{step.state}</span>
                </article>
              ))}
            </div>

            <Link href="/overview" className={styles.terminalAction}>
              <span>
                <small>READY</small>
                Select an asset to run the check
              </span>
              <ArrowRightIcon size={16} aria-hidden="true" />
            </Link>
          </section>
        </section>

        <div className={styles.truthStrip} aria-label="ALIVE evidence categories">
          <span><b>SOURCE</b> cited facts</span>
          <span><b>RULE</b> deterministic verdict</span>
          <span><b>MARKET</b> timestamped snapshot</span>
          <span><b>CHAIN</b> enforcement outcome</span>
        </div>

        <section className={styles.pathSection} aria-labelledby="path-title">
          <div className={styles.pathIntro}>
            <p>ONE OPERATING LOOP</p>
            <h2 id="path-title">Answer first. Reasons next. Proof when you need it.</h2>
          </div>
          <div className={styles.pathRows}>
            {productPath.map((item, index) => (
              <article className={styles.pathRow} key={item.label}>
                <span className={styles.pathIndex}>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <span className={styles.pathLabel}>{item.label}</span>
                  <h3>{item.title}</h3>
                </div>
                <p>{item.description}</p>
                <Link href={item.href}>
                  {item.action}
                  <ArrowRightIcon size={14} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.closeSection}>
          <div>
            <p>AI interprets. Code calculates. Contracts enforce.</p>
            <h2>Move from ticker-level confidence to evidence-backed decisions.</h2>
          </div>
          <Link href="/overview" className={styles.primaryAction}>
            Enter the workspace
            <ArrowRightIcon size={15} weight="bold" aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>ALIVE · RWA policy intelligence</span>
        <span>Unaudited demo-stage software · Not investment advice</span>
      </footer>
    </div>
  );
}
