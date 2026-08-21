"use client";

import Link from "next/link";
import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  ArrowRightIcon,
  CaretDownIcon,
  CheckCircleIcon,
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
  const tone = mode === "LIVE" ? styles.success : mode === "DEMO" ? styles.warning : "";
  return <span className={`${styles.mode} ${tone}`}>{label}</span>;
}

export type WorkflowStep = {
  label: string;
  detail: string;
  state: "complete" | "current" | "pending";
};

export function WorkflowProgress({
  label,
  steps,
}: {
  label: string;
  steps: WorkflowStep[];
}) {
  return (
    <nav className={styles.workflow} aria-label={label}>
      <ol>
        {steps.map((step, index) => (
          <li
            className={styles.workflowStep}
            data-state={step.state}
            aria-current={step.state === "current" ? "step" : undefined}
            key={step.label}
          >
            <span className={styles.workflowIndex} aria-hidden="true">
              {step.state === "complete" ? <CheckCircleIcon size={14} weight="fill" /> : index + 1}
            </span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Disclosure({
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className={styles.disclosure} open={defaultOpen || undefined}>
      <summary>
        <span>
          <strong>{title}</strong>
          {summary ? <small>{summary}</small> : null}
        </span>
        <CaretDownIcon className={styles.disclosureCaret} size={16} aria-hidden="true" />
      </summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}

export function OperationStatus({
  title,
  detail,
  tone = "working",
}: {
  title: string;
  detail?: ReactNode;
  tone?: "working" | "success" | "warning" | "error";
}) {
  const isWorking = tone === "working";
  const Icon = isWorking ? CircleNotchIcon : tone === "success" ? CheckCircleIcon : WarningCircleIcon;
  return (
    <div
      className={styles.operationStatus}
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <Icon className={isWorking ? styles.spin : undefined} size={17} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
}

export function ConsequenceReview({
  title,
  description,
  facts,
  confirmLabel,
  busyLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  facts: { label: string; value: string }[];
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    titleRef.current?.focus();

    return () => {
      returnFocusRef.current?.focus();
    };
  }, []);

  return (
    <section className={styles.consequenceReview} aria-labelledby={titleId}>
      <header className={styles.consequenceHeader}>
        <div>
          <p className={styles.kicker}>Wallet consequence review</p>
          <h3 id={titleId} ref={titleRef} tabIndex={-1}>{title}</h3>
          <p>{description}</p>
        </div>
        <span className={styles.badge}>Transaction</span>
      </header>
      <dl className={styles.reviewFacts}>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.actions}>
        <button className={styles.buttonQuiet} type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className={styles.button} type="button" onClick={onConfirm} disabled={busy}>
          {busy ? busyLabel ?? "Waiting for wallet" : confirmLabel}
        </button>
      </div>
    </section>
  );
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
    <div className={styles.loading} role="status" aria-live="polite">
      <CircleNotchIcon className={styles.spin} size={18} aria-hidden="true" />
      <span>
        <strong>Working</strong>
        <small>{label}</small>
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
