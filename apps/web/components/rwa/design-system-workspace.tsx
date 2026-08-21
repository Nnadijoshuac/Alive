"use client";

import { useState } from "react";
import { CheckCircleIcon, DatabaseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import {
  ConsequenceReview,
  Disclosure,
  ModeBadge,
  Notice,
  OperationStatus,
  PageIntro,
  WorkflowProgress,
  styles,
} from "./ui";

export function DesignSystemWorkspace() {
  const [sample, setSample] = useState("Preserve capital and keep at least 10% in cash.");
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  return (
    <div className={styles.page}>
      <PageIntro eyebrow="Development surface" title="RWA interface primitives." description="A visual QA route for the product's real states: sourced data modes, candidate interpretation, deterministic results, onchain facts, and honest failure boundaries." aside={<span className={styles.badge}>Visual fixtures only</span>} />
      <WorkflowProgress
        label="Visual workflow fixture"
        steps={[
          { label: "Input", detail: "Complete", state: "complete" },
          { label: "Review", detail: "Current step", state: "current" },
          { label: "Receipt", detail: "Waiting", state: "pending" },
        ]}
      />
      <section className={styles.section}>
        <div className={styles.designGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.kicker}>Controls</p><h2>Action hierarchy</h2></div></div>
            <div className={styles.actions}><button className={styles.button} type="button" onClick={() => { setReviewVisible(true); setReviewed(false); }}>Review transaction</button><button className={styles.buttonSecondary} type="button">Secondary action</button><button className={styles.buttonQuiet} type="button">Quiet action</button><button className={styles.button} type="button" disabled>Disabled</button></div>
            <label className={styles.field}><span className={styles.fieldLabel}>Mandate fixture</span><textarea className={styles.textarea} value={sample} onChange={(event) => setSample(event.target.value)} /></label>
          </article>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.kicker}>Data modes</p><h2>Never blur provenance</h2></div><DatabaseIcon size={24} color="currentColor" /></div>
            <div className={styles.stack}><ModeBadge mode="DEMO" /><ModeBadge mode="SNAPSHOT" /><ModeBadge mode="LIVE" /><ModeBadge mode="AI" /><ModeBadge mode="DETERMINISTIC_FALLBACK" /></div>
          </article>
        </div>
      </section>
      {reviewVisible || reviewed ? (
        <section className={styles.section}>
          {reviewVisible ? (
          <ConsequenceReview
            title="Confirm the visual transaction fixture"
            description="This development-only fixture demonstrates hierarchy and does not call a wallet or contract."
            facts={[
              { label: "Mode", value: "VISUAL FIXTURE" },
              { label: "Network", value: "NOT CONNECTED" },
              { label: "Effect", value: "NO TRANSACTION" },
              { label: "Authorization", value: "NOT REQUESTED" },
            ]}
            confirmLabel="Acknowledge fixture"
            onCancel={() => setReviewVisible(false)}
            onConfirm={() => { setReviewVisible(false); setReviewed(true); }}
          />
          ) : (
          <OperationStatus title="Fixture review acknowledged" detail="No wallet request or transaction was created." tone="success" />
          )}
        </section>
      ) : null}
      <section className={styles.section}>
        <div className={styles.grid3}>
          <Notice title="Information fixture">Market snapshot hash is visible beside every calculated result.</Notice>
          <Notice title="Accepted fixture" tone="success"><CheckCircleIcon size={14} /> All deterministic rules passed.</Notice>
          <Notice title="Rejected fixture" tone="danger"><WarningCircleIcon size={14} /> CASH_MINIMUM_MISSED remains visible.</Notice>
        </div>
      </section>
      <section className={styles.section}>
        <Disclosure title="Progressive evidence fixture" summary="Critical state stays visible; implementation detail opens on request.">
          <p className={styles.subtle}>Raw identifiers, provider metadata, and contract evidence belong at this disclosure level.</p>
        </Disclosure>
      </section>
      <section className={styles.section}>
        <div className={styles.metricGrid}>
          {[['Expected APR', '4.65%', 'Dated catalog estimate'], ['Risk score', '18/100', 'Deterministic methodology'], ['Cash floor', '10%', '1,000 integer BPS'], ['Onchain state', 'UNKNOWN', 'No RPC receipt fixture']].map(([label, value, detail]) => <article className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}
        </div>
      </section>
    </div>
  );
}
