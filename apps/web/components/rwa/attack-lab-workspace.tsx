"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightIcon,
  CrosshairIcon,
  FlaskIcon,
  ProhibitIcon,
  ShieldCheckIcon,
  VaultIcon,
} from "@phosphor-icons/react";
import type { RwaAsset } from "@alive/shared";
import {
  checkRwaPolicy,
  getRwaPolicy,
  listRwaAssets,
  optimizeRwaPortfolio,
  type Allocation,
  type PolicyRecord,
} from "@/lib/rwa-api";
import { formatBps, truncateIdentifier } from "@/lib/rwa-format";
import { readRwaState } from "@/lib/rwa-state";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  PageIntro,
  styles,
} from "./ui";

type AttackResult = Awaited<ReturnType<typeof checkRwaPolicy>>;

type AttackScenario = {
  id: "CONCENTRATION" | "UNAPPROVED" | "OPTIMIZER";
  name: string;
  description: string;
  expected: string;
};

const scenarios: AttackScenario[] = [
  {
    id: "CONCENTRATION",
    name: "Single-asset concentration",
    description: "Place the entire portfolio into one approved equity reference.",
    expected: "Expect asset, issuer, cash, class, and risk constraints to reject it.",
  },
  {
    id: "UNAPPROVED",
    name: "Unknown asset injection",
    description: "Submit an allocation for an ID outside the approved catalog.",
    expected: "Expect approved-asset validation and allocation rules to reject it.",
  },
  {
    id: "OPTIMIZER",
    name: "Calculated control case",
    description: "Ask the deterministic optimizer for a fresh target, then evaluate those exact weights.",
    expected: "Expect acceptance only if the optimizer reports a feasible portfolio.",
  },
];

export function AttackLabWorkspace() {
  const [policy, setPolicy] = useState<PolicyRecord>();
  const [assets, setAssets] = useState<RwaAsset[]>([]);
  const [selected, setSelected] = useState<AttackScenario>(scenarios[0]!);
  const [submitted, setSubmitted] = useState<Allocation[]>([]);
  const [result, setResult] = useState<AttackResult>();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const state = readRwaState();
      const catalog = await listRwaAssets();
      setAssets(catalog.assets);
      if (state.policyId) setPolicy(await getRwaPolicy(state.policyId));
      else setPolicy(undefined);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function runScenario() {
    if (!policy) return;
    setRunning(true);
    setError(undefined);
    setResult(undefined);
    try {
      let allocations: Allocation[];
      if (selected.id === "UNAPPROVED") {
        allocations = [{ assetId: "unapproved-rwa", weightBps: 10_000 }];
      } else if (selected.id === "CONCENTRATION") {
        const equity = assets.find((asset) => asset.id === "tnvda") ?? assets.find((asset) => asset.assetClass === "EQUITY") ?? assets[0];
        if (!equity) throw new Error("The approved catalog is empty.");
        allocations = [{ assetId: equity.id, weightBps: 10_000 }];
      } else {
        const proposal = await optimizeRwaPortfolio(policy.id);
        if (!proposal.proposal.feasible) throw new Error("The optimizer did not produce a feasible control allocation.");
        allocations = proposal.proposal.allocations.map(({ assetId, weightBps }) => ({ assetId, weightBps }));
      }
      setSubmitted(allocations);
      setResult(await checkRwaPolicy(policy.id, allocations));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageIntro
        eyebrow="Adversarial policy testing"
        title="Try to push capital outside the rules."
        description="Attack Lab sends real allocation inputs through the intelligence service's deterministic policy evaluator. It reports reason codes and keeps local simulation separate from contract rejection."
        aside={<span className={styles.badge}>No transaction is broadcast</span>}
      />
      {loading ? <section className={styles.section}><LoadingState label="Loading policy attack surface" /></section> : null}
      {error ? <section className={styles.section}><ErrorState error={error} retry={load} /></section> : null}
      {!loading && !policy && !error ? <section className={styles.section}><EmptyState icon={<VaultIcon size={26} />} title="No policy to attack" description="Create a strict policy before testing concentration and catalog-boundary failures." href="/create" action="Create a mandate" /></section> : null}

      {policy ? (
        <>
          <section className={styles.section}>
            <div className={styles.grid2}>
              <div className={styles.stack}>
                {scenarios.map((scenario) => (
                  <button
                    className={`${styles.panel} ${selected.id === scenario.id ? styles.panelAccent : ""}`}
                    type="button"
                    key={scenario.id}
                    onClick={() => { setSelected(scenario); setResult(undefined); setSubmitted([]); }}
                    aria-pressed={selected.id === scenario.id}
                  >
                    <div className={styles.panelHeader}>
                      <div><p className={styles.kicker}>{scenario.id}</p><h2>{scenario.name}</h2><p>{scenario.description}</p></div>
                      {scenario.id === "OPTIMIZER" ? <ShieldCheckIcon size={22} color="currentColor" /> : <CrosshairIcon size={22} color="currentColor" />}
                    </div>
                    <p className={styles.fieldHint}>{scenario.expected}</p>
                  </button>
                ))}
              </div>
              <div>
                <div className={styles.attackStage}>
                  <div className={styles.attackBoundary}>
                    <div className={styles.attackBoundaryContent}>
                      {result ? (result.result.withinPolicy ? <ShieldCheckIcon size={34} /> : <ProhibitIcon size={34} />) : <FlaskIcon size={34} />}
                      <strong>{result ? (result.result.withinPolicy ? "Accepted" : "Rejected") : "Policy boundary"}</strong>
                      <span>{result ? "Deterministic simulation completed" : selected.name}</span>
                    </div>
                  </div>
                </div>
                <button className={styles.button} type="button" onClick={runScenario} disabled={running}>
                  {running ? "Running deterministic check" : "Run selected attack"} <ArrowRightIcon size={16} weight="bold" />
                </button>
              </div>
            </div>
          </section>

          {running ? <section className={styles.section}><LoadingState label="Checking adversarial allocation" /></section> : null}

          {result ? (
            <section className={styles.section} aria-labelledby="attack-result-title">
              <div className={styles.sectionHeader}>
                <div><p className={styles.kicker}>Result / {selected.id}</p><h2 id="attack-result-title">{result.result.withinPolicy ? "The allocation stayed inside policy." : "The allocation failed policy."}</h2></div>
                <span className={`${styles.status} ${result.result.withinPolicy ? styles.success : styles.warning}`}>{result.result.withinPolicy ? "Accepted" : "Rejected"}</span>
              </div>
              <div className={styles.grid2}>
                <article className={styles.panel}>
                  <p className={styles.label}>Submitted allocation</p>
                  <ul className={styles.plainList}>
                    {submitted.map((allocation) => <li key={allocation.assetId}><strong>{allocation.assetId}</strong> / {formatBps(allocation.weightBps)}</li>)}
                  </ul>
                </article>
                <article className={styles.panel}>
                  <p className={styles.label}>Reason codes</p>
                  {result.result.violations.length ? (
                    <ul className={styles.violationList}>{result.result.violations.map((violation, index) => <li key={`${violation.code}-${index}`}><strong>{violation.code}</strong>{violation.message}</li>)}</ul>
                  ) : (
                    <Notice title="No violations" tone="success">The allocation passed every deterministic policy rule in this snapshot.</Notice>
                  )}
                </article>
              </div>
              <div className={styles.stack}>
                <Notice title="Simulation result, not onchain fact" tone="warning">
                  Enforcement mode: {result.enforcement}. Onchain execution attempted: {String(result.onchainExecutionAttempted)}. There is no receipt or transaction hash.
                </Notice>
                <Notice title="Snapshot binding">
                  Policy {truncateIdentifier(policy.id)} was checked against market snapshot {truncateIdentifier(result.marketSnapshotHash, 14, 10)}.
                </Notice>
              </div>
              <div className={styles.actions}>
                <Link className={styles.buttonSecondary} href={`/policy/${policy.id}`}>Inspect policy</Link>
                <Link className={styles.buttonQuiet} href="/protocol">See contract enforcement</Link>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
