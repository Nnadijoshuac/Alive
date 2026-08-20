"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  ArrowRightIcon,
  BrainIcon,
  CalculatorIcon,
  CheckCircleIcon,
  DatabaseIcon,
  LockKeyIcon,
  UserCircleCheckIcon,
} from "@phosphor-icons/react";
import { getIntelligenceHealth } from "@/lib/rwa-api";
import { rwaContractAddresses, rwaContractConfiguration } from "@/lib/rwa-chain";
import { truncateIdentifier } from "@/lib/rwa-format";
import { ErrorState, Notice, PageIntro, styles } from "./ui";

const stages = [
  { id: "mandate", index: "01", label: "Mandate", title: "Human intent enters as untrusted language.", body: "A user describes objectives and constraints. The text is not executable and carries no transaction authority.", invariant: "Language cannot cross the policy boundary directly.", icon: UserCircleCheckIcon },
  { id: "candidate", index: "02", label: "Candidate", title: "AI may interpret, never decide arithmetic.", body: "A configured model can return a policy candidate. If no model is configured, a labelled deterministic parser can produce a limited fallback candidate.", invariant: "Provider and mode remain attached to the record.", icon: BrainIcon },
  { id: "policy", index: "03", label: "Policy", title: "Strict schemas turn intent into bounded rules.", body: "Basis-point caps, floors, asset classes, issuer limits, risk, liquidity, freshness, and authorization requirements are validated and canonically hashed.", invariant: "Invalid candidates stop before optimization.", icon: CheckCircleIcon },
  { id: "market", index: "04", label: "Snapshot", title: "Every calculation binds sourced market state.", body: "Quotes include provider, timestamp, market status, fixed-decimal price, and an explicit DEMO, SNAPSHOT, or LIVE mode.", invariant: "Missing or stale quotes fail closed.", icon: DatabaseIcon },
  { id: "optimizer", index: "05", label: "Calculate", title: "Deterministic code proposes the portfolio.", body: "The optimizer ranks approved candidates and constructs integer-BPS allocations while evaluating every policy rule and returning reason codes.", invariant: "The LLM never computes allocation weights.", icon: CalculatorIcon },
  { id: "vault", index: "06", label: "Enforce", title: "Contracts re-check the execution outcome.", body: "The vault validates approved assets, policy hash, single-use strategy capability, freshness, slippage, balances, class limits, issuer limits, and cash floor.", invariant: "A signed proposal cannot bypass vault checks.", icon: LockKeyIcon },
] as const;

export function ProtocolWorkspace() {
  const [active, setActive] = useState<(typeof stages)[number]>(stages[0]);
  const [health, setHealth] = useState<Record<string, unknown>>();
  const [error, setError] = useState<unknown>();

  const load = useCallback(async () => {
    setError(undefined);
    try { setHealth(await getIntelligenceHealth()); }
    catch (requestError) { setError(requestError); }
  }, []);

  useEffect(() => void load(), [load]);
  const Icon = active.icon;

  return (
    <div className={styles.page}>
      <PageIntro
        eyebrow="Protocol architecture"
        title="AI proposes. Boundaries hold."
        description="Follow the causal chain from human language to a constrained execution outcome. Each transition changes who is allowed to decide and what evidence must be present."
        aside={<span className={styles.badge}>X Layer compatible / EVM enforcement</span>}
      />

      <section className={styles.section} aria-labelledby="causal-chain-title">
        <div className={styles.sectionHeader}><div><p className={styles.kicker}>Causal chain</p><h2 id="causal-chain-title">Select a trust boundary.</h2></div></div>
        <div className={styles.protocolMap}>
          {stages.map((stage, index) => (
            <Fragment key={stage.id}>
              <button className={`${styles.protocolNode} ${active.id === stage.id ? styles.protocolNodeActive : ""}`} type="button" onClick={() => setActive(stage)} aria-pressed={active.id === stage.id}><span>{stage.index}</span><strong>{stage.label}</strong></button>
              {index < stages.length - 1 ? <i className={styles.protocolConnector} aria-hidden="true" /> : null}
            </Fragment>
          ))}
        </div>
        <article className={`${styles.panel} ${styles.panelAccent} ${styles.section}`}>
          <div className={styles.panelHeader}><div><p className={styles.kicker}>{active.index} / {active.label}</p><h2>{active.title}</h2><p>{active.body}</p></div><Icon size={30} color="currentColor" /></div>
          <Notice title="Invariant" tone="success">{active.invariant}</Notice>
        </article>
      </section>

      <section className={styles.section} aria-labelledby="runtime-title">
        <div className={styles.sectionHeader}><div><p className={styles.kicker}>Runtime status</p><h2 id="runtime-title">What is configured right now</h2></div><button className={styles.buttonQuiet} type="button" onClick={load}>Refresh service check</button></div>
        {error ? <ErrorState error={error} retry={load} /> : null}
        <div className={styles.grid2}>
          <article className={styles.panel}>
            <p className={styles.kicker}>Intelligence service</p>
            <h2>{health ? String(health.status ?? "UNKNOWN").toUpperCase() : "CHECKING"}</h2>
            <dl className={styles.definitionList}>
              <div className={styles.definitionRow}><dt>Service</dt><dd>{health ? String(health.service ?? "UNKNOWN") : "WAITING"}</dd></div>
              <div className={styles.definitionRow}><dt>Boundary</dt><dd>HTTP API / strict response parsing</dd></div>
            </dl>
          </article>
          <article className={styles.panel}>
            <p className={styles.kicker}>RWA contract suite</p>
            <h2>{rwaContractConfiguration.complete ? "Addresses configured" : "Configuration incomplete"}</h2>
            <p className={styles.subtle}>{rwaContractConfiguration.configuredCount} of {rwaContractConfiguration.requiredCount} required public addresses are valid for {rwaContractConfiguration.chainName}.</p>
            <Notice title="Configuration is not deployment proof" tone="warning">An environment address is only configuration. A route-level RPC read or transaction receipt is required before ALIVE calls it an onchain fact.</Notice>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="contracts-title">
        <div className={styles.sectionHeader}><div><p className={styles.kicker}>Contract topology</p><h2 id="contracts-title">Enforcement components</h2></div><p>Addresses are read only from public environment variables. Missing values stay unconfigured.</p></div>
        <div className={styles.grid3}>
          {Object.entries(rwaContractAddresses).map(([name, address]) => (
            <article className={styles.rule} key={name}><span>{name.replace(/([A-Z])/gu, " $1")}</span><strong>{address ? truncateIdentifier(address, 10, 8) : "NOT CONFIGURED"}</strong><small>{address ? "Environment configuration" : "No public address supplied"}</small></article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.panel} ${styles.panelVoid}`}>
          <div className={styles.panelHeader}><div><p className={styles.kicker}>Failure model</p><h2>Rejection is a feature.</h2><p>Stale quotes, unapproved assets, policy drift, reused signatures, bad slippage, wrong balances, and unauthorized callers each fail at a specific boundary.</p></div></div>
          <div className={styles.actions}><Link className={styles.button} href="/attack-lab">Run policy attacks <ArrowRightIcon size={16} /></Link><Link className={styles.buttonSecondary} href="/create">Compile a mandate</Link></div>
        </div>
      </section>
    </div>
  );
}
