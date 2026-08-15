"use client";

import { useState } from "react";
import { CheckCircleIcon, DatabaseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { ModeBadge, Notice, PageIntro, styles } from "./ui";

export function DesignSystemWorkspace() {
  const [sample, setSample] = useState("Preserve capital and keep at least 10% in cash.");
  return (
    <div className={styles.page}>
      <PageIntro eyebrow="Development surface" title="RWA interface primitives." description="A visual QA route for the product's real states: sourced data modes, candidate interpretation, deterministic results, onchain facts, and honest failure boundaries." aside={<span className={styles.badge}>Visual fixtures only</span>} />
      <section className={styles.section}>
        <div className={styles.designGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.kicker}>Controls</p><h2>Action hierarchy</h2></div></div>
            <div className={styles.actions}><button className={styles.button} type="button">Primary action</button><button className={styles.buttonSecondary} type="button">Secondary action</button><button className={styles.buttonQuiet} type="button">Quiet action</button><button className={styles.button} type="button" disabled>Disabled</button></div>
            <label className={styles.field}><span className={styles.fieldLabel}>Mandate fixture</span><textarea className={styles.textarea} value={sample} onChange={(event) => setSample(event.target.value)} /></label>
          </article>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.kicker}>Data modes</p><h2>Never blur provenance</h2></div><DatabaseIcon size={24} color="#6de493" /></div>
            <div className={styles.stack}><ModeBadge mode="DEMO" /><ModeBadge mode="SNAPSHOT" /><ModeBadge mode="LIVE" /><ModeBadge mode="AI" /><ModeBadge mode="DETERMINISTIC_FALLBACK" /></div>
          </article>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.grid3}>
          <Notice title="Information fixture">Market snapshot hash is visible beside every calculated result.</Notice>
          <Notice title="Accepted fixture" tone="success"><CheckCircleIcon size={14} /> All deterministic rules passed.</Notice>
          <Notice title="Rejected fixture" tone="danger"><WarningCircleIcon size={14} /> CASH_MINIMUM_MISSED remains visible.</Notice>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.metricGrid}>
          {[['Expected APR', '4.65%', 'Dated catalog estimate'], ['Risk score', '18/100', 'Deterministic methodology'], ['Cash floor', '10%', '1,000 integer BPS'], ['Onchain state', 'UNKNOWN', 'No RPC receipt fixture']].map(([label, value, detail]) => <article className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}
        </div>
      </section>
    </div>
  );
}
