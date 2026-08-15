"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  DatabaseIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { RwaAsset } from "@alive/shared";
import {
  getRwaAsset,
  listRwaMarkets,
  type RwaMarketQuote,
} from "@/lib/rwa-api";
import { formatBps, formatFreshness, formatPrice, formatTimestamp } from "@/lib/rwa-format";
import { ErrorState, LoadingState, ModeBadge, Notice, styles } from "./ui";

export function AssetPassportWorkspace({ assetId }: { assetId: string }) {
  const [asset, setAsset] = useState<RwaAsset>();
  const [quote, setQuote] = useState<RwaMarketQuote>();
  const [disclaimer, setDisclaimer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [quoteError, setQuoteError] = useState<unknown>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setQuoteError(undefined);
    try {
      const passport = await getRwaAsset(assetId);
      setAsset(passport.asset);
      setDisclaimer(passport.disclaimer);
      try {
        const market = await listRwaMarkets();
        setQuote(market.quotes.find((candidate) => candidate.assetId === passport.asset.id));
      } catch (marketError) {
        setQuoteError(marketError);
      }
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => void load(), [load]);

  if (loading) {
    return <div className={styles.page}><LoadingState label="Loading sourced asset passport" /></div>;
  }
  if (error || !asset) {
    return <div className={styles.page}><ErrorState error={error ?? new Error("Asset passport was not found.")} retry={load} /></div>;
  }

  const riskRows = [
    ["Overall", asset.risk.score],
    ["Issuer", asset.risk.issuerRisk],
    ["Liquidity", asset.risk.liquidityRisk],
    ["Market", asset.risk.marketRisk],
    ["Oracle", asset.risk.oracleRisk],
    ["Redemption", asset.risk.redemptionRisk],
    ["Complexity", asset.risk.productComplexityRisk],
  ] as const;

  return (
    <div className={styles.page}>
      <Link className={styles.textButton} href="/markets"><ArrowLeftIcon size={15} /> Back to markets</Link>
      <header className={styles.passportHero}>
        <div>
          <div className={styles.passportSymbol}>
            <h1>{asset.symbol}</h1>
            <ModeBadge mode={asset.dataMode} />
          </div>
          <p className={styles.passportSummary}>{asset.name}. {asset.underlying}</p>
          <div className={styles.actions}>
            <span className={styles.badge}>{asset.assetClass}</span>
            <span className={styles.badge}>{asset.issuerName}</span>
          </div>
        </div>
        <div className={styles.passportSide}>
          <p className={styles.label}>Current quote response</p>
          {quote ? (
            <>
              <div className={styles.metric}>
                <span>Reference price</span>
                <strong>{formatPrice(quote.price)}</strong>
                <small>{quote.provider} / {formatFreshness(quote.ageSeconds)}</small>
              </div>
              <span className={`${styles.status} ${quote.status === "OPEN" ? styles.success : styles.warning}`}>{quote.status}</span>
            </>
          ) : quoteError ? (
            <ErrorState error={quoteError} />
          ) : (
            <Notice title="Quote missing" tone="warning">This asset has no quote in the current market response.</Notice>
          )}
        </div>
      </header>

      <section className={styles.section}>
        <Notice title={`${asset.dataMode} asset disclosure`} tone={asset.dataMode === "LIVE" ? "success" : "warning"}>
          {disclaimer}
        </Notice>
      </section>

      <section className={styles.section} aria-labelledby="passport-facts">
        <div className={styles.sectionHeader}>
          <div><p className={styles.kicker}>Product facts</p><h2 id="passport-facts">Known values only.</h2></div>
          <p>Fields without a supporting source are omitted by the catalog schema instead of guessed.</p>
        </div>
        <div className={styles.grid2}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.kicker}>Identity</p><h2>Asset record</h2></div><DatabaseIcon size={24} color="#6de493" /></div>
            <dl className={styles.definitionList}>
              <Fact label="Asset ID" value={asset.id} mono />
              <Fact label="Issuer" value={`${asset.issuerName} (${asset.issuer})`} />
              <Fact label="Underlying" value={asset.underlying} />
              <Fact label="Last updated" value={formatTimestamp(asset.lastUpdatedAt)} />
              <Fact label="Network" value={asset.network ?? "UNKNOWN"} />
              <Fact label="Chain ID" value={asset.chainId?.toString() ?? "UNKNOWN"} />
              <Fact label="Token address" value={asset.tokenAddress ?? "UNKNOWN"} mono />
              <Fact label="Market hours" value={asset.marketHours ? `${asset.marketHours.type}${asset.marketHours.timezone ? ` / ${asset.marketHours.timezone}` : ""}` : "UNKNOWN"} />
            </dl>
          </article>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.kicker}>Risk surface</p><h2>ALIVE risk scores</h2></div><ShieldCheckIcon size={24} color="#6de493" /></div>
            <div className={styles.riskMatrix}>
              {riskRows.map(([label, value]) => (
                <div className={styles.riskRow} key={label}>
                  <span>{label}</span>
                  <progress className={styles.scoreBar} max={100} value={value} aria-label={`${label} risk ${value} out of 100`} />
                  <output>{value}</output>
                </div>
              ))}
            </div>
            <p className={styles.fieldHint}>Methodology: {asset.risk.methodology}. Scores are catalog metadata, not investment advice.</p>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="economics-title">
        <div className={styles.sectionHeader}><div><p className={styles.kicker}>Economics and access</p><h2 id="economics-title">Yield, liquidity, restrictions.</h2></div></div>
        <div className={styles.metricGrid}>
          <Metric label="Estimated APR" value={asset.yield?.estimatedAprBps === undefined ? "UNKNOWN" : formatBps(asset.yield.estimatedAprBps)} detail={asset.yield?.type ?? "No sourced yield field"} />
          <Metric label="Liquidity" value={`${asset.liquidity.score}/100`} detail={asset.liquidity.redemptionWindow ?? "Redemption window UNKNOWN"} />
          <Metric label="Management fee" value={asset.fees?.managementFeeBps === undefined ? "UNKNOWN" : formatBps(asset.fees.managementFeeBps)} detail="Catalog fact" />
          <Metric label="Redemption fee" value={asset.fees?.redemptionFeeBps === undefined ? "UNKNOWN" : formatBps(asset.fees.redemptionFeeBps)} detail="Catalog fact" />
        </div>
        {asset.restrictions?.length ? (
          <div className={`${styles.panel} ${styles.section}`}>
            <p className={styles.label}>Restrictions</p>
            <ul className={styles.plainList}>{asset.restrictions.map((restriction) => <li key={restriction}>{restriction}</li>)}</ul>
          </div>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="sources-title">
        <div className={styles.sectionHeader}>
          <div><p className={styles.kicker}>Provenance</p><h2 id="sources-title">Source ledger</h2></div>
          <p>Each source declares the fields it supports and when ALIVE retrieved it.</p>
        </div>
        <div className={styles.sourceGrid}>
          {asset.sources.map((source) => (
            <article className={styles.sourceCard} key={source.id}>
              <span className={styles.badge}>{source.sourceType.replaceAll("_", " ")}</span>
              <h3>{source.title}</h3>
              <p>Retrieved {formatTimestamp(source.retrievedAt)}</p>
              {source.sourceType === "DEMO_FIXTURE" ? <p>{source.disclaimer}</p> : null}
              <p className={styles.sourceFields}>{source.supportedFields.join(" / ")}</p>
              {source.sourceType !== "DEMO_FIXTURE" ? (
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open primary source <ArrowSquareOutIcon size={14} /></a>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className={styles.definitionRow}><dt>{label}</dt><dd className={mono ? styles.mono : undefined}>{value}</dd></div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
