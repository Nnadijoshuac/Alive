"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  PlusIcon,
  TrashIcon,
  VaultIcon,
} from "@phosphor-icons/react";
import type { RwaAsset } from "@alive/shared";
import {
  checkRwaPolicy,
  getRwaPolicy,
  listRwaAssets,
  optimizeRwaPortfolio,
  proposeRwaRebalance,
  type Allocation,
  type PolicyRecord,
  type RebalanceResult,
} from "@/lib/rwa-api";
import { allocationTotal, formatBps, truncateIdentifier } from "@/lib/rwa-format";
import { readRwaState } from "@/lib/rwa-state";
import {
  AllocationList,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  PageIntro,
  ProposalMetrics,
  styles,
} from "./ui";

type Draft = { assetId: string; weightBps: string };
type CheckResult = Awaited<ReturnType<typeof checkRwaPolicy>>;

function parseDraft(draft: Draft[]): Allocation[] {
  return draft.map((row) => ({
    assetId: row.assetId,
    weightBps: Number(row.weightBps),
  }));
}

export function RebalanceWorkspace() {
  const [policy, setPolicy] = useState<PolicyRecord>();
  const [assets, setAssets] = useState<RwaAsset[]>([]);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [check, setCheck] = useState<CheckResult>();
  const [rebalance, setRebalance] = useState<RebalanceResult>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"target" | "check" | "rebalance">();
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

  const allocations = useMemo(() => parseDraft(draft), [draft]);
  const total = allocationTotal(allocations);
  const duplicateIds = new Set(draft.map((row) => row.assetId)).size !== draft.length;
  const valuesValid = allocations.every((row) => Number.isInteger(row.weightBps) && row.weightBps >= 0 && row.weightBps <= 10_000);
  const canSubmit = Boolean(policy) && draft.length > 0 && total === 10_000 && !duplicateIds && valuesValid;

  function updateRow(index: number, update: Partial<Draft>) {
    setDraft((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...update } : row));
    setCheck(undefined);
    setRebalance(undefined);
  }

  function addRow() {
    const available = assets.find((asset) => !draft.some((row) => row.assetId === asset.id));
    if (!available) return;
    setDraft((current) => [...current, { assetId: available.id, weightBps: "0" }]);
  }

  function loadDriftScenario() {
    const concentrated = assets.find((asset) => asset.id === "tnvda") ?? assets.find((asset) => asset.assetClass === "EQUITY") ?? assets[0];
    if (!concentrated) return;
    setDraft([{ assetId: concentrated.id, weightBps: "10000" }]);
    setCheck(undefined);
    setRebalance(undefined);
  }

  async function loadTarget() {
    if (!policy) return;
    setBusy("target");
    setError(undefined);
    try {
      const optimized = await optimizeRwaPortfolio(policy.id);
      setDraft(optimized.proposal.allocations.map((allocation) => ({ assetId: allocation.assetId, weightBps: String(allocation.weightBps) })));
      setCheck(undefined);
      setRebalance(undefined);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(undefined);
    }
  }

  async function checkPolicy() {
    if (!policy || !canSubmit) return;
    setBusy("check");
    setError(undefined);
    try {
      setCheck(await checkRwaPolicy(policy.id, allocations));
      setRebalance(undefined);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(undefined);
    }
  }

  async function calculateRebalance() {
    if (!policy || !canSubmit) return;
    setBusy("rebalance");
    setError(undefined);
    try {
      setRebalance(await proposeRwaRebalance(policy.id, allocations));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className={styles.page}>
      <PageIntro
        eyebrow="Drift and rebalance"
        title="Bring holdings back inside the mandate."
        description="Enter current weights, run the real deterministic policy check, then calculate the smallest policy-compliant target the optimizer can produce. Nothing is traded from this screen."
        aside={<span className={styles.badge}>Weights use integer BPS</span>}
      />

      {loading ? <section className={styles.section}><LoadingState label="Loading policy and approved asset universe" /></section> : null}
      {error ? <section className={styles.section}><ErrorState error={error} retry={load} /></section> : null}
      {!loading && !policy && !error ? (
        <section className={styles.section}><EmptyState icon={<VaultIcon size={26} />} title="No policy selected" description="Compile and approve a mandate first. Rebalance calculations require a strict policy ID." href="/create" action="Create a mandate" /></section>
      ) : null}

      {policy ? (
        <>
          <section className={styles.section}>
            <div className={styles.grid2}>
              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div><p className={styles.kicker}>Current holdings</p><h2>Allocation editor</h2><p>Policy {truncateIdentifier(policy.id)}. Values must total exactly 10,000 BPS.</p></div>
                  <ArrowsClockwiseIcon size={24} color="#6de493" />
                </div>
                <div className={styles.allocationEditor}>
                  {draft.map((row, index) => (
                    <div className={styles.allocationEditRow} key={`${index}-${row.assetId}`}>
                      <select className={styles.select} value={row.assetId} onChange={(event) => updateRow(index, { assetId: event.target.value })} aria-label={`Asset ${index + 1}`}>
                        {assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.symbol} / {asset.name}</option>)}
                      </select>
                      <input className={styles.input} type="number" min={0} max={10_000} step={1} inputMode="numeric" value={row.weightBps} onChange={(event) => updateRow(index, { weightBps: event.target.value })} aria-label={`Weight for ${row.assetId} in basis points`} />
                      <button className={styles.iconButton} type="button" onClick={() => setDraft((current) => current.filter((_, rowIndex) => rowIndex !== index))} aria-label={`Remove ${row.assetId}`}><TrashIcon size={16} /></button>
                    </div>
                  ))}
                </div>
                <div className={styles.totalRow}><span>Total allocation</span><strong>{total.toLocaleString()} BPS / {formatBps(total)}</strong></div>
                {duplicateIds ? <p className={styles.errorText}>Each asset can appear only once.</p> : null}
                {!valuesValid ? <p className={styles.errorText}>Weights must be integer values from 0 to 10,000 BPS.</p> : null}
                <div className={styles.actions}>
                  <button className={styles.buttonSecondary} type="button" onClick={addRow} disabled={draft.length >= assets.length}><PlusIcon size={16} /> Add asset</button>
                  <button className={styles.buttonQuiet} type="button" onClick={loadDriftScenario}>Load labelled demo drift</button>
                  <button className={styles.buttonQuiet} type="button" onClick={loadTarget} disabled={busy !== undefined}>{busy === "target" ? "Calculating target" : "Load optimizer target"}</button>
                </div>
              </article>
              <article className={`${styles.panel} ${styles.panelVoid}`}>
                <div className={styles.panelHeader}><div><p className={styles.kicker}>Enforcement boundary</p><h2>Simulation before execution</h2></div></div>
                <div className={styles.flow}>
                  {[["01", "Read", "User-entered weights"], ["02", "Snapshot", "Current sourced quotes"], ["03", "Evaluate", "Deterministic rules"], ["04", "Propose", "Bounded target"], ["05", "Execute", "Not wired here"]].map(([index, label, detail]) => <div className={styles.flowStep} key={index}><span>{index}</span><strong>{label}</strong><small>{detail}</small></div>)}
                </div>
                <Notice title="No arbitrary calldata" tone="warning">The intelligence service returns weights and reason codes. It does not let an LLM form or sign a transaction.</Notice>
              </article>
            </div>
            <div className={styles.actions}>
              <button className={styles.buttonSecondary} type="button" disabled={!canSubmit || busy !== undefined} onClick={checkPolicy}>{busy === "check" ? "Checking policy" : "Check current holdings"}</button>
              <button className={styles.button} type="button" disabled={!canSubmit || busy !== undefined} onClick={calculateRebalance}>{busy === "rebalance" ? "Calculating rebalance" : "Calculate rebalance"}<ArrowRightIcon size={16} /></button>
            </div>
          </section>

          {busy === "check" || busy === "rebalance" ? <section className={styles.section}><LoadingState label="Evaluating current holdings against policy and market freshness" /></section> : null}

          {check ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader}><div><p className={styles.kicker}>Deterministic simulation</p><h2>Policy check result</h2></div><span className={`${styles.status} ${check.result.withinPolicy ? styles.success : styles.warning}`}>{check.result.withinPolicy ? "Within policy" : "Rejected"}</span></div>
              <div className={styles.panel}>
                {check.result.violations.length ? <ul className={styles.violationList}>{check.result.violations.map((violation, index) => <li key={`${violation.code}-${index}`}><strong>{violation.code}</strong>{violation.message}</li>)}</ul> : <Notice title="No policy drift" tone="success">All current allocations passed the deterministic rules for this market snapshot.</Notice>}
                <Notice title="Not an onchain rejection">Enforcement: {check.enforcement}. Onchain execution attempted: {String(check.onchainExecutionAttempted)}. Snapshot {truncateIdentifier(check.marketSnapshotHash, 14, 10)}.</Notice>
              </div>
            </section>
          ) : null}

          {rebalance ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader}><div><p className={styles.kicker}>Rebalance proposal</p><h2>Target and required trades</h2></div><span className={`${styles.status} ${rebalance.rebalance.feasible ? styles.success : styles.warning}`}>{rebalance.rebalance.feasible ? "Feasible" : "Infeasible"}</span></div>
              <div className={styles.panel}>
                <ProposalMetrics proposal={rebalance.rebalance.proposal} />
                <div className={styles.section}><AllocationList proposal={rebalance.rebalance.proposal} /></div>
                <p className={styles.label}>Proposed turnover / {formatBps(rebalance.rebalance.turnoverBps)}</p>
                {rebalance.rebalance.trades.length ? <ul className={styles.tradeList}>{rebalance.rebalance.trades.map((trade) => <li key={`${trade.side}-${trade.assetId}`}><strong>{trade.side}</strong> {trade.symbol} by {formatBps(trade.weightBps)}</li>)}</ul> : <Notice title="No trades required" tone="success">Current holdings already match the calculated target.</Notice>}
                <div className={styles.stack}>
                  <Notice title={`${rebalance.dataMode} calculation disclosure`} tone={rebalance.dataMode === "LIVE" ? "success" : "warning"}>{rebalance.disclaimer}</Notice>
                  <Notice title="Execution not submitted" tone="warning">This result is a proposal. There is no transaction hash, receipt, or onchain fact to report.</Notice>
                </div>
                <Link className={styles.buttonSecondary} href="/protocol">See the enforcement boundary</Link>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
