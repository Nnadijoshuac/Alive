"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Disclosure,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  OperationStatus,
  PageIntro,
  ProposalMetrics,
  WorkflowProgress,
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
  const [failedOperation, setFailedOperation] = useState<"load" | "target" | "check" | "rebalance">();
  const draftGeneration = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setFailedOperation(undefined);
    try {
      const state = readRwaState();
      const catalog = await listRwaAssets();
      setAssets(catalog.assets);
      if (state.policyId) setPolicy(await getRwaPolicy(state.policyId));
      else setPolicy(undefined);
    } catch (requestError) {
      setError(requestError);
      setFailedOperation("load");
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

  function invalidateDerivedState() {
    draftGeneration.current += 1;
    setCheck(undefined);
    setRebalance(undefined);
  }

  function updateRow(index: number, update: Partial<Draft>) {
    setDraft((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...update } : row));
    invalidateDerivedState();
  }

  function addRow() {
    const available = assets.find((asset) => !draft.some((row) => row.assetId === asset.id));
    if (!available) return;
    setDraft((current) => [...current, { assetId: available.id, weightBps: "0" }]);
    invalidateDerivedState();
  }

  function removeRow(index: number) {
    setDraft((current) =>
      current.filter((_, rowIndex) => rowIndex !== index),
    );
    invalidateDerivedState();
  }

  function loadDriftScenario() {
    const concentrated = assets.find((asset) => asset.id === "tnvda") ?? assets.find((asset) => asset.assetClass === "EQUITY") ?? assets[0];
    if (!concentrated) return;
    setDraft([{ assetId: concentrated.id, weightBps: "10000" }]);
    invalidateDerivedState();
  }

  async function loadTarget() {
    if (!policy) return;
    const generation = ++draftGeneration.current;
    setBusy("target");
    setError(undefined);
    setFailedOperation(undefined);
    try {
      const optimized = await optimizeRwaPortfolio(policy.id);
      if (generation !== draftGeneration.current) return;
      setDraft(optimized.proposal.allocations.map((allocation) => ({ assetId: allocation.assetId, weightBps: String(allocation.weightBps) })));
      setCheck(undefined);
      setRebalance(undefined);
    } catch (requestError) {
      setError(requestError);
      setFailedOperation("target");
    } finally {
      setBusy(undefined);
    }
  }

  async function checkPolicy() {
    if (!policy || !canSubmit) return;
    const generation = draftGeneration.current;
    setBusy("check");
    setError(undefined);
    setFailedOperation(undefined);
    setCheck(undefined);
    setRebalance(undefined);
    try {
      const result = await checkRwaPolicy(policy.id, allocations);
      if (generation === draftGeneration.current) setCheck(result);
    } catch (requestError) {
      setError(requestError);
      setFailedOperation("check");
    } finally {
      setBusy(undefined);
    }
  }

  async function calculateRebalance() {
    if (!policy || !canSubmit) return;
    const generation = draftGeneration.current;
    setBusy("rebalance");
    setError(undefined);
    setFailedOperation(undefined);
    setRebalance(undefined);
    try {
      const result = await proposeRwaRebalance(policy.id, allocations);
      if (generation === draftGeneration.current) setRebalance(result);
    } catch (requestError) {
      setError(requestError);
      setFailedOperation("rebalance");
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

      {policy ? (
        <WorkflowProgress
          label="Rebalance workflow"
          steps={[
            {
              label: "Holdings",
              detail: canSubmit ? "Allocation complete" : "Enter 10,000 BPS",
              state: canSubmit ? "complete" : "current",
            },
            {
              label: "Policy check",
              detail: check ? "Evaluated" : canSubmit ? "Ready to check" : "Waiting for holdings",
              state: check ? "complete" : canSubmit ? "current" : "pending",
            },
            {
              label: "Target",
              detail: rebalance ? "Calculated" : check ? "Optional next step" : "Waiting for check",
              state: rebalance ? "complete" : check ? "current" : "pending",
            },
          ]}
        />
      ) : null}

      {loading ? <section className={styles.section}><LoadingState label="Loading policy and approved asset universe" /></section> : null}
      {error ? (
        <section className={styles.section}>
          <ErrorState
            error={error}
            retry={
              failedOperation === "target"
                ? () => void loadTarget()
                : failedOperation === "check"
                  ? () => void checkPolicy()
                  : failedOperation === "rebalance"
                    ? () => void calculateRebalance()
                    : load
            }
          />
        </section>
      ) : null}
      {!loading && !policy && !error ? (
        <section className={styles.section}><EmptyState icon={<VaultIcon size={26} />} title="No policy selected" description="Compile and approve a mandate first. Rebalance calculations require a strict policy ID." href="/create" action="Create a mandate" /></section>
      ) : null}

      {policy ? (
        <>
          <section className={styles.section}>
            <div className={styles.grid2}>
              <article className={styles.panel} aria-busy={busy !== undefined}>
                <div className={styles.panelHeader}>
                  <div><p className={styles.kicker}>Current holdings</p><h2>Allocation editor</h2><p>Policy {truncateIdentifier(policy.id)}. Values must total exactly 10,000 BPS.</p></div>
                  <ArrowsClockwiseIcon size={24} color="currentColor" />
                </div>
                <div className={styles.allocationEditor}>
                  {draft.map((row, index) => (
                    <div className={styles.allocationEditRow} key={`${index}-${row.assetId}`}>
                      <select className={styles.select} value={row.assetId} onChange={(event) => updateRow(index, { assetId: event.target.value })} aria-label={`Asset ${index + 1}`} disabled={busy !== undefined}>
                        {assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.symbol} / {asset.name}</option>)}
                      </select>
                      <input className={styles.input} type="number" min={0} max={10_000} step={1} inputMode="numeric" value={row.weightBps} onChange={(event) => updateRow(index, { weightBps: event.target.value })} aria-label={`Weight for ${row.assetId} in basis points`} disabled={busy !== undefined} />
                      <button className={styles.iconButton} type="button" onClick={() => removeRow(index)} aria-label={`Remove ${row.assetId}`} disabled={busy !== undefined}><TrashIcon size={16} /></button>
                    </div>
                  ))}
                </div>
                <div className={styles.totalRow}><span>Total allocation</span><strong>{total.toLocaleString()} BPS / {formatBps(total)}</strong></div>
                {draft.length > 0 && total !== 10_000 ? (
                  <p className={styles.fieldWarning} role="status">
                    {total < 10_000
                      ? `${(10_000 - total).toLocaleString()} BPS remain to allocate.`
                      : `${(total - 10_000).toLocaleString()} BPS must be removed.`}
                  </p>
                ) : null}
                {duplicateIds ? <p className={styles.errorText}>Each asset can appear only once.</p> : null}
                {!valuesValid ? <p className={styles.errorText}>Weights must be integer values from 0 to 10,000 BPS.</p> : null}
                <div className={styles.actions}>
                  <button className={styles.buttonSecondary} type="button" onClick={addRow} disabled={busy !== undefined || draft.length >= assets.length}><PlusIcon size={16} /> Add asset</button>
                </div>
                <Disclosure title="Input helpers" summary="Use a labelled demo drift or load the current optimizer target.">
                  <div className={styles.actions}>
                    <button className={styles.buttonQuiet} type="button" onClick={loadDriftScenario} disabled={busy !== undefined}>Load labelled demo drift</button>
                    <button className={styles.buttonQuiet} type="button" onClick={loadTarget} disabled={busy !== undefined}>{busy === "target" ? "Calculating target" : "Load optimizer target"}</button>
                  </div>
                </Disclosure>
              </article>
              <aside>
                <Disclosure title="Simulation boundary" summary="See what this screen reads, calculates, and intentionally does not execute.">
                  <div className={styles.flow}>
                    {[["01", "Read", "User-entered weights"], ["02", "Snapshot", "Current sourced quotes"], ["03", "Evaluate", "Deterministic rules"], ["04", "Propose", "Bounded target"], ["05", "Execute", "Not wired here"]].map(([index, label, detail]) => <div className={styles.flowStep} key={index}><span>{index}</span><strong>{label}</strong><small>{detail}</small></div>)}
                  </div>
                  <Notice title="No arbitrary calldata" tone="warning">The intelligence service returns weights and reason codes. It does not let an LLM form or sign a transaction.</Notice>
                </Disclosure>
              </aside>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="button" disabled={!canSubmit || busy !== undefined} onClick={checkPolicy}>{busy === "check" ? "Checking policy" : "Check current holdings"}<ArrowRightIcon size={16} /></button>
            </div>
          </section>

          {busy === "check" || busy === "rebalance" ? <section className={styles.section}><LoadingState label="Evaluating current holdings against policy and market freshness" /></section> : null}

          {check ? (
            <section className={styles.section} aria-live="polite">
              <OperationStatus
                title={check.result.withinPolicy ? "Current holdings are within policy" : "Policy drift detected"}
                detail={`Snapshot ${truncateIdentifier(check.marketSnapshotHash, 14, 10)}`}
                tone={check.result.withinPolicy ? "success" : "warning"}
              />
              <div className={styles.sectionHeader}><div><p className={styles.kicker}>Deterministic simulation</p><h2>Policy check result</h2></div><span className={`${styles.status} ${check.result.withinPolicy ? styles.success : styles.warning}`}>{check.result.withinPolicy ? "Within policy" : "Rejected"}</span></div>
              <div className={styles.panel}>
                {check.result.violations.length ? <ul className={styles.violationList}>{check.result.violations.map((violation, index) => <li key={`${violation.code}-${index}`}><strong>{violation.code}</strong>{violation.message}</li>)}</ul> : <Notice title="No policy drift" tone="success">All current allocations passed the deterministic rules for this market snapshot.</Notice>}
                <Notice title="Not an onchain rejection">Enforcement: {check.enforcement}. Onchain execution attempted: {String(check.onchainExecutionAttempted)}. Snapshot {truncateIdentifier(check.marketSnapshotHash, 14, 10)}.</Notice>
                <div className={styles.actions}>
                  <button className={styles.buttonSecondary} type="button" disabled={busy !== undefined} onClick={calculateRebalance}>{busy === "rebalance" ? "Calculating target" : "Calculate compliant target"}<ArrowRightIcon size={16} /></button>
                </div>
              </div>
            </section>
          ) : null}

          {rebalance ? (
            <section className={styles.section} aria-live="polite">
              <OperationStatus
                title={rebalance.rebalance.feasible ? "Compliant target calculated" : "No feasible target found"}
                detail={`${formatBps(rebalance.rebalance.turnoverBps)} proposed turnover`}
                tone={rebalance.rebalance.feasible ? "success" : "warning"}
              />
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
