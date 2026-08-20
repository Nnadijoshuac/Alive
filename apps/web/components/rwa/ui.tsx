"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  CircleNotchIcon,
  InfoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { PortfolioPolicy } from "@alive/shared";
import type { PortfolioProposal } from "@/lib/rwa-api";
import { formatBps, policyRules } from "@/lib/rwa-format";
import styles from "./rwa.module.css";

export { styles };

export function PageIntro({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <header className={styles.intro}>
      <div className={styles.introCopy}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.introDescription}>{description}</p>
      </div>
      {aside ? <div className={styles.introAside}>{aside}</div> : null}
    </header>
  );
}

export function ModeBadge({
  mode,
}: {
  mode: "AI" | "DETERMINISTIC_FALLBACK" | "DEMO" | "SNAPSHOT" | "LIVE";
}) {
  const label =
    mode === "DETERMINISTIC_FALLBACK"
      ? "Non-AI fallback"
      : mode === "AI"
        ? "AI candidate"
        : `${mode} data`;
  const tone = mode === "LIVE" || mode === "AI" ? styles.success : mode === "DEMO" ? styles.warning : "";
  return <span className={`${styles.mode} ${tone}`}>{label}</span>;
}

export function Notice({
  title,
  tone = "info",
  children,
}: {
  title: string;
  tone?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? styles.noticeSuccess
      : tone === "warning"
        ? styles.noticeWarning
        : tone === "danger"
          ? styles.noticeDanger
          : "";
  return (
    <div className={`${styles.notice} ${toneClass}`} role={tone === "danger" ? "alert" : "status"}>
      {tone === "danger" || tone === "warning" ? (
        <WarningCircleIcon size={18} aria-hidden="true" />
      ) : (
        <InfoIcon size={18} aria-hidden="true" />
      )}
      <div>
        <strong>{title}</strong>
        {children}
      </div>
    </div>
  );
}

export function LoadingState({ label = "Loading sourced data" }: { label?: string }) {
  return (
    <div className={styles.loading} role="status" aria-label={label}>
      <div className={styles.loadingLines}>
        <i />
        <i />
        <i />
      </div>
      <span className={styles.srOnly}>
        <CircleNotchIcon /> {label}
      </span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  href,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyInner}>
        <span className={styles.emptyIcon}>{icon}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        {href && action ? (
          <Link className={styles.button} href={href}>
            {action} <ArrowRightIcon size={16} weight="bold" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function PolicyRuleGrid({ policy }: { policy: PortfolioPolicy }) {
  return (
    <div className={styles.policyGrid}>
      {policyRules(policy).map((rule) => (
        <article className={styles.rule} key={rule.label}>
          <span>{rule.label}</span>
          <strong>{rule.value}</strong>
          <small>{rule.detail}</small>
        </article>
      ))}
    </div>
  );
}

export function AllocationList({ proposal }: { proposal: PortfolioProposal }) {
  return (
    <ul className={styles.allocationList}>
      {proposal.allocations.map((allocation) => (
        <li className={styles.allocationRow} key={allocation.assetId}>
          <div className={styles.allocationIdentity}>
            <strong>{allocation.symbol}</strong>
            <span>{allocation.assetClass} / {allocation.name}</span>
          </div>
          <progress
            className={styles.allocationBar}
            max={10_000}
            value={allocation.weightBps}
            aria-label={`${allocation.symbol} allocation`}
          />
          <span className={styles.allocationValue}>{formatBps(allocation.weightBps)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProposalMetrics({ proposal }: { proposal: PortfolioProposal }) {
  return (
    <div className={styles.metricGrid}>
      <article className={styles.metric}>
        <span>Expected APR</span>
        <strong>{formatBps(proposal.metrics.expectedAprBps)}</strong>
        <small>Catalog estimate, not a guarantee</small>
      </article>
      <article className={styles.metric}>
        <span>Risk score</span>
        <strong>{proposal.metrics.riskScore}/100</strong>
        <small>ALIVE deterministic methodology</small>
      </article>
      <article className={styles.metric}>
        <span>Liquidity</span>
        <strong>{proposal.metrics.liquidityScore}/100</strong>
        <small>Weighted catalog score</small>
      </article>
      <article className={styles.metric}>
        <span>Cash</span>
        <strong>{formatBps(proposal.metrics.cashBps)}</strong>
        <small>Approved cash exposure</small>
      </article>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "The request could not be completed.";
  return (
    <Notice title="Intelligence request failed" tone="danger">
      <p className={styles.errorText}>{message}</p>
      {retry ? (
        <button className={styles.textButton} type="button" onClick={retry}>
          Try again
        </button>
      ) : null}
    </Notice>
  );
}
