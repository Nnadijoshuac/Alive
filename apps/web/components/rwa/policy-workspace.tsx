"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckSquareOffsetIcon,
  FunctionIcon,
} from "@phosphor-icons/react";
import {
  getRwaPolicy,
  optimizeRwaPortfolio,
  type PolicyRecord,
} from "@/lib/rwa-api";
import { formatBps, formatTimestamp, truncateIdentifier } from "@/lib/rwa-format";
import { rememberRwaState } from "@/lib/rwa-state";
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

type Optimized = Awaited<ReturnType<typeof optimizeRwaPortfolio>>;

export function PolicyWorkspace({ policyId }: { policyId: string }) {
  const [policy, setPolicy] = useState<PolicyRecord>();
  const [proposal, setProposal] = useState<Optimized>();
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<unknown>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const record = await getRwaPolicy(policyId);
      setPolicy(record);
      rememberRwaState({ policyId: record.id });
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, [policyId]);

  useEffect(() => void load(), [load]);

  async function optimize() {
    if (!policy) return;
    setOptimizing(true);
    setError(undefined);
    try {
      const result = await optimizeRwaPortfolio(policy.id);
      setProposal(result);
      rememberRwaState({ policyId: policy.id, proposalId: result.id });
    } catch (requestError) {
      setError(requestError);
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <div className={styles.page}>
      <Link className={styles.textButton} href="/dashboard"><ArrowLeftIcon size={15} /> Dashboard</Link>
      {loading ? <div className={styles.section}><LoadingState label="Loading canonical policy record" /></div> : null}
      {error ? <div className={styles.section}><ErrorState error={error} retry={load} /></div> : null}
      {policy && !loading ? (
        <>
          <header className={styles.passportHero}>
            <div>
              <p className={styles.eyebrow}>Policy record / version {policy.version}</p>
              <h1 className={styles.heroTitle}>Capital with boundaries.</h1>
              <p className={styles.passportSummary}>{policy.originalMandate}</p>
            </div>
            <div className={styles.passportSide}>
              <ModeBadge mode={policy.compiler.mode} />
              <dl className={styles.definitionList}>
                <div className={styles.definitionRow}><dt>Created</dt><dd>{formatTimestamp(policy.createdAt)}</dd></div>
                <div className={styles.definitionRow}><dt>Policy ID</dt><dd className={styles.mono}>{policy.id}</dd></div>
                <div className={styles.definitionRow}><dt>Policy hash</dt><dd className={styles.hash}>{policy.policyHash}</dd></div>
              </dl>
            </div>
          </header>

          <section className={styles.section}>
            <div className={styles.grid2}>
              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div><p className={styles.kicker}>Interpretation</p><h2>How the candidate was produced</h2></div>
                  <FunctionIcon size={24} color="#6de493" />
                </div>
                <dl className={styles.definitionList}>
                  <div className={styles.definitionRow}><dt>Mode</dt><dd>{policy.compiler.isAiGenerated ? "AI candidate" : "NON-AI DETERMINISTIC FALLBACK"}</dd></div>
                  <div className={styles.definitionRow}><dt>Provider</dt><dd>{policy.compiler.provider}</dd></div>
                  <div className={styles.definitionRow}><dt>Model</dt><dd>{policy.compiler.model ?? "NOT APPLICABLE"}</dd></div>
                  <div className={styles.definitionRow}><dt>Arithmetic</dt><dd>DETERMINISTIC OPTIMIZER ONLY</dd></div>
                </dl>
              </article>
              <article className={`${styles.panel} ${styles.panelVoid}`}>
                <div className={styles.panelHeader}>
                  <div><p className={styles.kicker}>Onchain fact</p><h2>Not registered by this interface</h2></div>
                  <CheckSquareOffsetIcon size={24} color="#e4b96f" />
                </div>
                <Notice title="Contract state unavailable" tone="warning">
                  The policy record exists in the intelligence service. No configured Policy Registry address or confirmed transaction is attached, so ALIVE does not claim onchain registration.
                </Notice>
              </article>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="rules-title">
            <div className={styles.sectionHeader}>
              <div><p className={styles.kicker}>Canonical constraints</p><h2 id="rules-title">Rules the optimizer cannot negotiate.</h2></div>
              <p>All percentage rules are represented as integer basis points before they reach deterministic or onchain boundaries.</p>
            </div>
            <PolicyRuleGrid policy={policy.policy} />
          </section>

          <section className={styles.section}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><p className={styles.kicker}>Asset-class envelope</p><h2>Minimum and maximum exposure</h2></div>
              </div>
              <div className={styles.policyGrid}>
                {policy.policy.assetClassLimits.map((limit) => (
                  <article className={styles.rule} key={limit.assetClass}>
                    <span>{limit.assetClass}</span>
                    <strong>{formatBps(limit.minimumBps)} - {formatBps(limit.maximumBps)}</strong>
                    <small>Hard allocation range</small>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {policy.explanation.length || policy.warnings.length ? (
            <section className={styles.section}>
              <div className={styles.grid2}>
                <article className={styles.panel}>
                  <p className={styles.kicker}>Compiler explanation</p>
                  <ul className={styles.plainList}>{policy.explanation.map((item) => <li key={item}>{item}</li>)}</ul>
                </article>
                <article className={styles.panel}>
                  <p className={styles.kicker}>Warnings</p>
                  {policy.warnings.length ? <ul className={styles.plainList}>{policy.warnings.map((item) => <li key={item}>{item}</li>)}</ul> : <p className={styles.subtle}>No warnings returned.</p>}
                </article>
              </div>
            </section>
          ) : null}

          <section className={styles.section}>
            <div className={`${styles.panel} ${styles.panelAccent}`}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.kicker}>Fresh calculation</p>
                  <h2>Run the deterministic optimizer</h2>
                  <p>ALIVE will fetch a new market snapshot. Re-running can change results when sourced data changes.</p>
                </div>
                <span className={styles.hash}>{truncateIdentifier(policy.policyHash, 16, 12)}</span>
              </div>
              <button className={styles.button} type="button" onClick={optimize} disabled={optimizing}>
                {optimizing ? "Calculating" : "Calculate proposal"} <ArrowRightIcon size={16} weight="bold" />
              </button>
            </div>
          </section>

          {optimizing ? <section className={styles.section}><LoadingState label="Running deterministic portfolio calculation" /></section> : null}
          {proposal ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div><p className={styles.kicker}>Proposal {truncateIdentifier(proposal.id)}</p><h2>Calculated allocation</h2></div>
                <span className={`${styles.status} ${proposal.proposal.feasible ? styles.success : styles.warning}`}>{proposal.proposal.feasible ? "Within policy" : "Infeasible"}</span>
              </div>
              <div className={styles.panel}>
                <ProposalMetrics proposal={proposal.proposal} />
                <div className={styles.section}><AllocationList proposal={proposal.proposal} /></div>
                <Notice title="Calculation only" tone="warning">{proposal.disclaimer} No onchain execution was attempted.</Notice>
                <div className={styles.actions}>
                  <Link className={styles.button} href="/rebalance">Compare holdings <ArrowRightIcon size={16} /></Link>
                  <Link className={styles.buttonSecondary} href="/attack-lab">Attack this policy</Link>
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

