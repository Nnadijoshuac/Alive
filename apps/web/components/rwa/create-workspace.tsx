"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CirclesThreePlusIcon,
  FunctionIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import {
  compileRwaPolicy,
  optimizeRwaPortfolio,
  type PolicyRecord,
  type PortfolioProposal,
} from "@/lib/rwa-api";
import { rememberRwaState } from "@/lib/rwa-state";
import { formatBps, truncateIdentifier } from "@/lib/rwa-format";
import {
  AllocationList,
  ErrorState,
  LoadingState,
  ModeBadge,
  Notice,
  PageIntro,
  PolicyRuleGrid,
  ProposalMetrics,
  styles,
} from "./ui";

const exampleMandate =
  "Protect my capital. Keep at least half in Treasuries. Give me some gold but not more than 20%. Equities can be at most 20%. Never put more than 25% with one issuer. Keep 10% liquid. Never put more than 20% in one asset.";

type ProposalRecord = {
  id: string;
  marketSnapshotHash: `0x${string}`;
  dataMode: string;
  disclaimer: string;
  proposal: PortfolioProposal;
};

export function CreateWorkspace() {
  const [mandate, setMandate] = useState(exampleMandate);
  const [policy, setPolicy] = useState<PolicyRecord>();
  const [proposal, setProposal] = useState<ProposalRecord>();
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState<"compile" | "optimize">();
  const [error, setError] = useState<unknown>();

  async function submitMandate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = mandate.trim();
    if (normalized.length < 3) {
      setError(new Error("Describe the mandate in at least three characters."));
      return;
    }
    setBusy("compile");
    setError(undefined);
    setPolicy(undefined);
    setProposal(undefined);
    setApproved(false);
    try {
      const result = await compileRwaPolicy(normalized);
      setPolicy(result.policy);
      rememberRwaState({ policyId: result.policy.id });
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(undefined);
    }
  }

  async function calculatePortfolio() {
    if (!policy || !approved) return;
    setBusy("optimize");
    setError(undefined);
    try {
      const result = await optimizeRwaPortfolio(policy.id);
      setProposal(result);
      rememberRwaState({ policyId: policy.id, proposalId: result.id });
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className={styles.page}>
      <PageIntro
        eyebrow="Mandate compiler"
        title="Tell ALIVE what your money should do."
        description="Write the intent in plain language. ALIVE produces a candidate interpretation, validates it into strict basis-point rules, then passes the approved policy to deterministic portfolio code."
        aside={
          <>
            <span className={styles.badge}>No transaction is sent here</span>
            <span>AI interprets. Code calculates. Contracts enforce.</span>
          </>
        }
      />

      <section className={styles.section} aria-labelledby="mandate-title">
        <div className={styles.grid2}>
          <form className={styles.panel} onSubmit={submitMandate}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>01 / Interpret</p>
                <h2 id="mandate-title">Natural-language mandate</h2>
                <p>Be specific about floors, caps, liquidity, risk, and excluded exposures.</p>
              </div>
              <SparkleIcon size={24} color="currentColor" aria-hidden="true" />
            </div>
            <div className={styles.field}>
              <label htmlFor="mandate">What should this capital do?</label>
              <textarea
                id="mandate"
                className={styles.textarea}
                value={mandate}
                minLength={3}
                maxLength={5_000}
                onChange={(event) => setMandate(event.target.value)}
                aria-describedby="mandate-hint"
              />
              <span id="mandate-hint" className={styles.fieldHint}>
                {mandate.length.toLocaleString()} / 5,000 characters. This text is sent only to the configured local intelligence service.
              </span>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={busy !== undefined}>
                {busy === "compile" ? "Compiling mandate" : "Compile strict policy"}
                <ArrowRightIcon size={16} weight="bold" />
              </button>
              <button
                className={styles.buttonQuiet}
                type="button"
                disabled={busy !== undefined}
                onClick={() => setMandate(exampleMandate)}
              >
                Restore example
              </button>
            </div>
          </form>

          <aside className={`${styles.panel} ${styles.panelVoid}`}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Trust boundary</p>
                <h2>Interpretation is not execution</h2>
              </div>
              <FunctionIcon size={24} color="currentColor" aria-hidden="true" />
            </div>
            <div className={styles.flow}>
              {[
                ["01", "Candidate", "AI or labelled fallback"],
                ["02", "Validate", "Strict shared schema"],
                ["03", "Approve", "Explicit user decision"],
                ["04", "Calculate", "Deterministic optimizer"],
                ["05", "Enforce", "Separate onchain action"],
              ].map(([index, label, detail]) => (
                <div className={styles.flowStep} key={index}>
                  <span>{index}</span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
            <Notice title="Current execution state" tone="warning">
              This screen does not register a policy or fund a vault onchain. A missing contract configuration stays visible instead of becoming a fabricated transaction.
            </Notice>
          </aside>
        </div>
      </section>

      {busy === "compile" ? (
        <section className={styles.section}>
          <LoadingState label="Validating the candidate policy" />
        </section>
      ) : null}

      {error ? (
        <section className={styles.section}>
          <ErrorState error={error} />
        </section>
      ) : null}

      {policy ? (
        <section className={styles.section} aria-labelledby="policy-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.kicker}>02 / Validate</p>
              <h2 id="policy-title">Strict policy candidate</h2>
            </div>
            <ModeBadge mode={policy.compiler.mode} />
          </div>
          <div className={styles.panel}>
            <div className={styles.grid2}>
              <div>
                <p className={styles.label}>Original mandate</p>
                <p className={styles.mandateBox}>{policy.originalMandate}</p>
              </div>
              <div>
                <p className={styles.label}>Canonical record</p>
                <dl className={styles.definitionList}>
                  <div className={styles.definitionRow}>
                    <dt>Policy ID</dt>
                    <dd className={styles.mono}>{policy.id}</dd>
                  </div>
                  <div className={styles.definitionRow}>
                    <dt>Policy hash</dt>
                    <dd className={styles.hash}>{truncateIdentifier(policy.policyHash, 18, 14)}</dd>
                  </div>
                  <div className={styles.definitionRow}>
                    <dt>Compiler</dt>
                    <dd>{policy.compiler.provider}{policy.compiler.model ? ` / ${policy.compiler.model}` : ""}</dd>
                  </div>
                  <div className={styles.definitionRow}>
                    <dt>Onchain fact</dt>
                    <dd>NOT REGISTERED</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className={styles.trustLine}>
              <div className={styles.trustItem}>
                <span>Candidate source</span>
                <p>{policy.compiler.isAiGenerated ? "AI-generated interpretation" : "Deterministic non-AI parser"}</p>
              </div>
              <div className={styles.trustItem}>
                <span>Schema</span>
                <p>Strict validation completed by the service</p>
              </div>
              <div className={styles.trustItem}>
                <span>Arithmetic</span>
                <p>Not performed by the language model</p>
              </div>
              <div className={styles.trustItem}>
                <span>Authorization</span>
                <p>Still waiting for explicit approval</p>
              </div>
            </div>
            {policy.warnings.length > 0 ? (
              <div className={styles.stack}>
                {policy.warnings.map((warning) => (
                  <Notice key={warning} title="Compiler disclosure" tone="warning">{warning}</Notice>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.section}>
            <PolicyRuleGrid policy={policy.policy} />
          </div>

          <div className={`${styles.panel} ${styles.panelAccent} ${styles.section}`}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>03 / Authorize calculation</p>
                <h2>Review before optimization</h2>
                <p>This approval permits a deterministic proposal calculation. It is not a wallet signature, policy registration, deposit, trade, or vault execution.</p>
              </div>
              <CheckCircleIcon size={26} color="currentColor" aria-hidden="true" />
            </div>
            <label className={styles.checkboxRow}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={approved}
                onChange={(event) => setApproved(event.target.checked)}
              />
              I reviewed the strict policy above and approve using it as the deterministic optimizer input.
            </label>
            <div className={styles.actions}>
              <button
                className={styles.button}
                type="button"
                disabled={!approved || busy !== undefined}
                onClick={calculatePortfolio}
              >
                {busy === "optimize" ? "Calculating portfolio" : "Approve and calculate"}
                <CirclesThreePlusIcon size={18} weight="bold" />
              </button>
              <Link className={styles.buttonQuiet} href={`/policy/${policy.id}`}>
                Open policy record
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {busy === "optimize" ? (
        <section className={styles.section}>
          <LoadingState label="Running the deterministic optimizer" />
        </section>
      ) : null}

      {proposal ? (
        <section className={styles.section} aria-labelledby="proposal-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.kicker}>04 / Calculate</p>
              <h2 id="proposal-title">Deterministic portfolio proposal</h2>
            </div>
            <span className={`${styles.status} ${proposal.proposal.feasible ? styles.success : styles.warning}`}>
              {proposal.proposal.feasible ? "Within policy" : "No feasible allocation"}
            </span>
          </div>
          <div className={styles.panel}>
            <ProposalMetrics proposal={proposal.proposal} />
            <div className={styles.section}>
              <AllocationList proposal={proposal.proposal} />
            </div>
            {proposal.proposal.violations.length > 0 ? (
              <ul className={styles.violationList}>
                {proposal.proposal.violations.map((violation, index) => (
                  <li key={`${violation.code}-${index}`}>
                    <strong>{violation.code}</strong>
                    {violation.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={styles.stack}>
              <Notice title={`${proposal.dataMode} market snapshot`} tone={proposal.dataMode === "LIVE" ? "success" : "warning"}>
                {proposal.disclaimer}
              </Notice>
              <Notice title="Onchain execution not attempted">
                Proposal {truncateIdentifier(proposal.id)} used snapshot {truncateIdentifier(proposal.marketSnapshotHash, 14, 10)}. No contract call or transaction hash exists for this calculation.
              </Notice>
            </div>
            <div className={styles.actions}>
              <Link className={styles.button} href="/rebalance">
                Test current holdings <ArrowRightIcon size={16} weight="bold" />
              </Link>
              <Link className={styles.buttonSecondary} href="/attack-lab">
                Run policy attacks
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
