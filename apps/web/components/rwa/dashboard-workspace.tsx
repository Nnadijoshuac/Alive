"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightIcon,
  BrainIcon,
  CirclesFourIcon,
  CoinsIcon,
  DatabaseIcon,
  PlusIcon,
  VaultIcon,
} from "@phosphor-icons/react";
import {
  getIntelligenceHealth,
  getRwaPolicy,
  listRwaAssets,
  listRwaMarkets,
  type PolicyRecord,
} from "@/lib/rwa-api";
import { formatTimestamp, truncateIdentifier } from "@/lib/rwa-format";
import { readRwaState, RWA_STATE_EVENT, type RwaPresentationState } from "@/lib/rwa-state";
import { WalletButton } from "@/components/wallet-shell";
import {
  Disclosure,
  EmptyState,
  ErrorState,
  LoadingState,
  ModeBadge,
  Notice,
  OperationStatus,
  PageIntro,
  PolicyRuleGrid,
  styles,
} from "./ui";

type SystemSnapshot = {
  service: string;
  llmMode: string;
  llmProvider: string;
  marketMode: "DEMO" | "SNAPSHOT" | "LIVE";
  marketProvider: string;
  assetCount: number;
  quoteCount: number;
  capturedAt: string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function DashboardWorkspace() {
  const [saved, setSaved] = useState<RwaPresentationState>({});
  const [policy, setPolicy] = useState<PolicyRecord>();
  const [system, setSystem] = useState<SystemSnapshot>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();

  const load = useCallback(async () => {
    const state = readRwaState();
    setSaved(state);
    setLoading(true);
    setError(undefined);
    try {
      const [healthResult, assetsResult, marketResult] = await Promise.all([
        getIntelligenceHealth(),
        listRwaAssets(),
        listRwaMarkets(),
      ]);
      const llm = object(healthResult.llm);
      const marketData = object(healthResult.marketData);
      setSystem({
        service: typeof healthResult.status === "string" ? healthResult.status : "UNKNOWN",
        llmMode: typeof llm.mode === "string" ? llm.mode : "UNKNOWN",
        llmProvider: typeof llm.provider === "string" ? llm.provider : "UNKNOWN",
        marketMode: marketResult.dataMode,
        marketProvider: typeof marketData.provider === "string" ? marketData.provider : "UNKNOWN",
        assetCount: assetsResult.assets.length,
        quoteCount: marketResult.quotes.length,
        capturedAt: marketResult.capturedAt,
      });
      if (state.policyId) setPolicy(await getRwaPolicy(state.policyId));
      else setPolicy(undefined);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const listener = () => void load();
    window.addEventListener(RWA_STATE_EVENT, listener);
    return () => window.removeEventListener(RWA_STATE_EVENT, listener);
  }, [load]);

  return (
    <div className={styles.page}>
      <PageIntro
        eyebrow="Policy console"
        title="One mandate. Every boundary visible."
        description="This dashboard reads safe local presentation IDs, then resolves current records from the intelligence service. It never invents balances, vaults, or onchain confirmations."
        aside={
          <div className={styles.actions}>
            <WalletButton compact />
            <Link className={styles.button} href="/create"><PlusIcon size={16} weight="bold" /> New mandate</Link>
          </div>
        }
      />

      {loading ? <section className={styles.section}><LoadingState label="Loading intelligence and policy state" /></section> : null}
      {error ? <section className={styles.section}><ErrorState error={error} retry={load} /></section> : null}

      {system && !loading ? (
        <section className={styles.section} aria-labelledby="system-title" aria-live="polite">
          <OperationStatus
            title={system.service === "ok" ? "Intelligence service connected" : "Intelligence service needs attention"}
            detail={`${system.marketMode} market response captured ${formatTimestamp(system.capturedAt)}`}
            tone={system.service === "ok" ? "success" : "warning"}
          />
          <div className={styles.sectionHeader}>
            <div><p className={styles.kicker}>Runtime truth</p><h2 id="system-title">Service and data status</h2></div>
          </div>
          <div className={styles.metricGrid}>
            <SystemMetric icon={<BrainIcon size={18} />} label="Policy interpreter" value={system.llmMode} detail={system.llmProvider} />
            <SystemMetric icon={<DatabaseIcon size={18} />} label="Market mode" value={system.marketMode} detail={system.marketProvider} />
            <SystemMetric icon={<CoinsIcon size={18} />} label="Approved assets" value={system.assetCount.toString()} detail={`${system.quoteCount} current quotes`} />
            <SystemMetric icon={<CirclesFourIcon size={18} />} label="Snapshot" value={formatTimestamp(system.capturedAt)} detail="New response on refresh" />
          </div>
        </section>
      ) : null}

      {!loading && !policy && !error ? (
        <section className={styles.section}>
          <EmptyState
            icon={<VaultIcon size={26} />}
            title="No active mandate"
            description="Compile a mandate, review its strict policy, and approve a deterministic portfolio calculation. Only record IDs are kept in this browser."
            href="/create"
            action="Create a mandate"
          />
        </section>
      ) : null}

      {policy ? (
        <>
          <section className={styles.section} aria-labelledby="active-policy-title">
            <div className={styles.sectionHeader}>
              <div><p className={styles.kicker}>Active local context</p><h2 id="active-policy-title">Current policy</h2></div>
              <ModeBadge mode={policy.compiler.mode} />
            </div>
            <div className={styles.panel}>
              <div className={styles.grid2}>
                <div>
                  <p className={styles.label}>Mandate</p>
                  <p className={styles.mandateBox}>{policy.originalMandate}</p>
                </div>
                <dl className={styles.definitionList}>
                  <div className={styles.definitionRow}><dt>Policy ID</dt><dd className={styles.mono}>{policy.id}</dd></div>
                  <div className={styles.definitionRow}><dt>Policy hash</dt><dd className={styles.hash}>{truncateIdentifier(policy.policyHash, 16, 12)}</dd></div>
                  <div className={styles.definitionRow}><dt>Proposal</dt><dd>{saved.proposalId && saved.proposalPolicyId === policy.id ? truncateIdentifier(saved.proposalId) : "NONE CALCULATED FOR THIS POLICY"}</dd></div>
                  <div className={styles.definitionRow}><dt>Onchain registry</dt><dd>NOT CONFIGURED</dd></div>
                </dl>
              </div>
              <div className={styles.actions}>
                <Link className={styles.button} href={`/policy/${policy.id}`}>Open full policy <ArrowRightIcon size={16} /></Link>
                <Link className={styles.buttonSecondary} href="/rebalance">Check holdings</Link>
                <Link className={styles.buttonQuiet} href="/attack-lab">Attack Lab</Link>
              </div>
            </div>
          </section>
          <section className={styles.section}>
            <Disclosure
              title="Canonical policy rules"
              summary="Inspect the limits the optimizer cannot negotiate."
            >
              <PolicyRuleGrid policy={policy.policy} />
            </Disclosure>
          </section>
          <section className={styles.section}>
            <div className={styles.grid2}>
              <article className={styles.panel}>
                <p className={styles.kicker}>Vault state</p>
                <h2>{saved.vaultAddress ? truncateIdentifier(saved.vaultAddress, 12, 10) : "No vault address"}</h2>
                <p className={styles.subtle}>A vault appears only after a real public address is supplied or a deployment flow persists one.</p>
                {saved.vaultAddress ? <Link className={styles.textButton} href={`/vault/${saved.vaultAddress}`}>Inspect vault</Link> : null}
              </article>
              <article className={styles.panel}>
                <p className={styles.kicker}>Onchain execution</p>
                <h2>No transaction recorded</h2>
                <Notice title="Honest empty state" tone="warning">The current web client has no confirmed policy registration, deposit, trade, or rebalance transaction to display.</Notice>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function SystemMetric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className={styles.metric}>
      <span className={styles.inline}>{icon} {label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
