"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  FlaskIcon,
  LockKeyIcon,
  PlayIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  checkRwaPolicy,
  compileRwaPolicy,
  optimizeRwaPortfolio,
  proposeRwaRebalance,
  type PolicyRecord,
  type RebalanceResult,
} from "@/lib/rwa-api";
import { rwaContractConfiguration } from "@/lib/rwa-chain";
import { clearRwaState, rememberRwaState } from "@/lib/rwa-state";
import { formatBps, truncateIdentifier } from "@/lib/rwa-format";
import {
  AllocationList,
  ErrorState,
  LoadingState,
  ModeBadge,
  Notice,
  PolicyRuleGrid,
  ProposalMetrics,
  styles,
} from "./ui";

const demoMandate =
  "Protect my capital. Keep at least half in Treasuries. Give me some gold but not more than 20%. Equities can be at most 20%. Never put more than 25% with one issuer. Keep 10% liquid. Never put more than 20% in one asset.";

const beats = ["Mandate", "Policy", "Portfolio", "Attack", "Rebalance", "Enforce"] as const;

type ProposalRecord = Awaited<ReturnType<typeof optimizeRwaPortfolio>>;
type AttackRecord = Awaited<ReturnType<typeof checkRwaPolicy>>;

export function DemoWorkspace() {
  const [beat, setBeat] = useState(0);
  const [mandate, setMandate] = useState(demoMandate);
  const [policy, setPolicy] = useState<PolicyRecord>();
  const [approved, setApproved] = useState(false);
  const [proposal, setProposal] = useState<ProposalRecord>();
  const [attack, setAttack] = useState<AttackRecord>();
  const [rebalance, setRebalance] = useState<RebalanceResult>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<unknown>();

  const concentrated = useMemo(
    () => [{ assetId: "tnvda", weightBps: 10_000 }],
    [],
  );

  function reset() {
    clearRwaState();
    setBeat(0);
    setMandate(demoMandate);
    setPolicy(undefined);
    setApproved(false);
    setProposal(undefined);
    setAttack(undefined);
    setRebalance(undefined);
    setError(undefined);
  }

  async function compile() {
    setBusy("compile"); setError(undefined);
    try {
      const result = await compileRwaPolicy(mandate);
      setPolicy(result.policy);
      rememberRwaState({ policyId: result.policy.id });
      setBeat(1);
    } catch (requestError) { setError(requestError); }
    finally { setBusy(undefined); }
  }

  async function optimize() {
    if (!policy || !approved) return;
    setBusy("optimize"); setError(undefined);
    try {
      const result = await optimizeRwaPortfolio(policy.id);
      setProposal(result);
      rememberRwaState({ policyId: policy.id, proposalId: result.id });
      setBeat(2);
    } catch (requestError) { setError(requestError); }
    finally { setBusy(undefined); }
  }

  async function attackPolicy() {
    if (!policy) return;
    setBusy("attack"); setError(undefined);
    try {
      setAttack(await checkRwaPolicy(policy.id, concentrated));
      setBeat(3);
    } catch (requestError) { setError(requestError); }
    finally { setBusy(undefined); }
  }

  async function calculateRebalance() {
    if (!policy) return;
    setBusy("rebalance"); setError(undefined);
    try {
      setRebalance(await proposeRwaRebalance(policy.id, concentrated));
      setBeat(4);
    } catch (requestError) { setError(requestError); }
    finally { setBusy(undefined); }
  }

  return (
    <div className={styles.demoShell}>
      <header className={styles.demoHeader}>
        <div className={styles.demoBrand}><i className={styles.demoDot} /> ALIVE / GUIDED DEMO</div>
        <div className={styles.actions}>
          <button className={styles.buttonQuiet} type="button" onClick={reset}><TrashIcon size={15} /> Reset demo state</button>
          <Link className={styles.buttonSecondary} href="/dashboard"><ArrowLeftIcon size={15} /> Exit demo</Link>
        </div>
      </header>
      <div className={styles.demoGrid}>
        <nav className={styles.demoNav} aria-label="Demo steps">
          {beats.map((label, index) => (
            <button type="button" key={label} onClick={() => setBeat(index)} aria-current={beat === index ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{label}</button>
          ))}
        </nav>
        <main className={styles.demoMain}>
          {error ? <div className={styles.stack}><ErrorState error={error} /></div> : null}
          {busy ? <LoadingState label={`${busy} demo step`} /> : null}
          {!busy && beat === 0 ? (
            <>
              <p className={styles.eyebrow}>01 / Human mandate</p>
              <h1>Start with what the capital must do.</h1>
              <p>This is a real request to the local intelligence service. The resulting compiler mode and strict policy come from its response.</p>
              <div className={styles.panel}>
                <label className={styles.field}><span className={styles.fieldLabel}>Demo mandate</span><textarea className={styles.textarea} value={mandate} onChange={(event) => setMandate(event.target.value)} maxLength={5_000} /></label>
                <Notice title="Demo input">The mandate is editable. Reset restores the documented example and clears only ALIVE presentation IDs from this browser.</Notice>
                <button className={styles.button} type="button" onClick={compile} disabled={mandate.trim().length < 3}>Compile policy <ArrowRightIcon size={16} /></button>
              </div>
            </>
          ) : null}

          {!busy && beat === 1 ? (
            policy ? <>
              <p className={styles.eyebrow}>02 / Strict validation</p>
              <h1>A candidate becomes hard constraints.</h1>
              <p>The compiler mode is explicit. Review and approve the policy only for deterministic calculation.</p>
              <div className={styles.inline}><ModeBadge mode={policy.compiler.mode} /><span className={styles.hash}>{truncateIdentifier(policy.policyHash, 18, 12)}</span></div>
              <PolicyRuleGrid policy={policy.policy} />
              <div className={`${styles.panel} ${styles.panelAccent} ${styles.section}`}>
                <label className={styles.checkboxRow}><input className={styles.checkbox} type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /> I reviewed this strict policy. Calculate a proposal without sending a transaction.</label>
                <button className={styles.button} type="button" disabled={!approved} onClick={optimize}>Approve calculation <ArrowRightIcon size={16} /></button>
              </div>
            </> : <MissingStep target={0} setBeat={setBeat} />
          ) : null}

          {!busy && beat === 2 ? (
            proposal ? <>
              <p className={styles.eyebrow}>03 / Deterministic portfolio</p>
              <h1>Code calculates the weights.</h1>
              <p>{proposal.disclaimer}</p>
              <ProposalMetrics proposal={proposal.proposal} />
              <div className={styles.panel}><AllocationList proposal={proposal.proposal} /><Notice title="Execution state" tone="warning">Proposal calculated. Onchain execution was not attempted.</Notice></div>
              <button className={styles.button} type="button" onClick={attackPolicy}>Attempt 100% tNVDA <FlaskIcon size={16} /></button>
            </> : <MissingStep target={policy ? 1 : 0} setBeat={setBeat} />
          ) : null}

          {!busy && beat === 3 ? (
            attack ? <>
              <p className={styles.eyebrow}>04 / Wrong allocation</p>
              <h1>The policy says no.</h1>
              <p>This is a deterministic service simulation, not a reverted chain transaction.</p>
              <div className={`${styles.panel} ${attack.result.withinPolicy ? styles.panelAccent : ""}`}>
                <span className={`${styles.status} ${attack.result.withinPolicy ? styles.success : styles.warning}`}>{attack.result.withinPolicy ? "Accepted" : "Rejected"}</span>
                <ul className={styles.violationList}>{attack.result.violations.map((violation, index) => <li key={`${violation.code}-${index}`}><strong>{violation.code}</strong>{violation.message}</li>)}</ul>
                <Notice title="Truth boundary">Onchain execution attempted: {String(attack.onchainExecutionAttempted)}. Snapshot {truncateIdentifier(attack.marketSnapshotHash, 14, 10)}.</Notice>
              </div>
              <button className={styles.button} type="button" onClick={calculateRebalance}>Calculate recovery path <ArrowRightIcon size={16} /></button>
            </> : <MissingStep target={proposal ? 2 : policy ? 1 : 0} setBeat={setBeat} />
          ) : null}

          {!busy && beat === 4 ? (
            rebalance ? <>
              <p className={styles.eyebrow}>05 / Rebalance proposal</p>
              <h1>Return to the mandate.</h1>
              <p>The optimizer calculates a bounded target and the exact BPS turnover from the rejected concentration.</p>
              <div className={styles.panel}>
                <p className={styles.label}>Turnover / {formatBps(rebalance.rebalance.turnoverBps)}</p>
                <AllocationList proposal={rebalance.rebalance.proposal} />
                <ul className={styles.tradeList}>{rebalance.rebalance.trades.map((trade) => <li key={`${trade.side}-${trade.assetId}`}><strong>{trade.side}</strong> {trade.symbol} / {formatBps(trade.weightBps)}</li>)}</ul>
                <Notice title="Still a proposal" tone="warning">No trade has been signed or submitted.</Notice>
              </div>
              <button className={styles.button} type="button" onClick={() => setBeat(5)}>Inspect enforcement state <ArrowRightIcon size={16} /></button>
            </> : <MissingStep target={attack ? 3 : proposal ? 2 : 0} setBeat={setBeat} />
          ) : null}

          {!busy && beat === 5 ? (
            <>
              <p className={styles.eyebrow}>06 / Contract enforcement</p>
              <h1>Do not confuse readiness with execution.</h1>
              <p>The contract suite can enforce policies and single-use strategy capabilities. This demo reports only the configuration visible to the web client.</p>
              <div className={styles.grid2}>
                <article className={styles.panel}><LockKeyIcon size={28} color="currentColor" /><h2>{rwaContractConfiguration.complete ? "Contract addresses configured" : "Contract configuration incomplete"}</h2><p className={styles.subtle}>{rwaContractConfiguration.configuredCount} / {rwaContractConfiguration.requiredCount} required addresses on {rwaContractConfiguration.chainName}.</p></article>
                <article className={styles.panel}><CheckCircleIcon size={28} color="#e4b96f" /><h2>No transaction submitted</h2><p className={styles.subtle}>No policy registration, vault creation, deposit, strategy signature, or execution receipt exists in this guided flow.</p></article>
              </div>
              <Notice title="End of verified local flow" tone="warning">The working demo covers mandate compilation, strict validation, deterministic optimization, wrong-allocation rejection, and rebalance calculation. Onchain submission requires configured deployment addresses and a separate wallet-authorized transaction flow.</Notice>
              <div className={styles.actions}><Link className={styles.button} href="/protocol">Explore contract boundaries <ArrowRightIcon size={16} /></Link><Link className={styles.buttonSecondary} href="/dashboard">Open dashboard</Link></div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function MissingStep({ target, setBeat }: { target: number; setBeat: (value: number) => void }) {
  return <div className={styles.empty}><div className={styles.emptyInner}><span className={styles.emptyIcon}><PlayIcon size={24} /></span><h2>Complete the earlier step</h2><p>This demo does not fabricate intermediate records when you jump ahead.</p><button className={styles.button} type="button" onClick={() => setBeat(target)}>Resume verified flow</button></div></div>;
}

