"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ProhibitIcon,
  QuestionIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { EligibilityPolicy, EligibilityVerdict, RwaAsset } from "@alive/shared";
import {
  getAssetEligibility,
  getAssetExtraction,
  getAssetMonitor,
  getRwaAsset,
  listRwaMarkets,
  type AssetExtractionStatus,
  type AssetMonitorStatus,
  type RwaMarketQuote,
} from "@/lib/rwa-api";
import {
  formatBps,
  formatFreshness,
  formatPrice,
  formatRelativeAgo,
  formatTimestamp,
} from "@/lib/rwa-format";
import styles from "./asset-intelligence.module.css";

function verdictTone(status: EligibilityVerdict["status"] | undefined) {
  if (status === "ELIGIBLE") return "positive" as const;
  if (status === "RESTRICTED") return "negative" as const;
  return "warning" as const;
}

function verdictIcon(status: EligibilityVerdict["status"] | undefined) {
  if (status === "ELIGIBLE") return <ShieldCheckIcon size={13} weight="fill" />;
  if (status === "RESTRICTED") return <ProhibitIcon size={13} weight="fill" />;
  return <QuestionIcon size={13} weight="fill" />;
}

/**
 * Verification (does this asset have real, cited source documents) and
 * eligibility (does it pass ALIVE's policy) are different questions -- an
 * asset can be verified and still restricted. Kept separate in the UI
 * rather than one conflated status pill.
 */
function isVerified(asset: RwaAsset): boolean {
  return asset.sources.some((source) => source.sourceType !== "DEMO_FIXTURE");
}

/** Ethereum mainnet only -- the only chain ALIVE reads Chainlink RWA feeds from today. */
function ethereumExplorerAddressUrl(chainId: number, address: string): string | undefined {
  return chainId === 1 ? `https://etherscan.io/address/${address}` : undefined;
}

export function AssetIntelligencePage({ assetId }: { assetId: string }) {
  const [asset, setAsset] = useState<RwaAsset>();
  const [quote, setQuote] = useState<RwaMarketQuote>();
  const [disclaimer, setDisclaimer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [verdict, setVerdict] = useState<EligibilityVerdict>();
  const [policy, setPolicy] = useState<EligibilityPolicy>();
  const [monitor, setMonitor] = useState<AssetMonitorStatus>();
  const [extraction, setExtraction] = useState<AssetExtractionStatus>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const passport = await getRwaAsset(assetId);
      setAsset(passport.asset);
      setDisclaimer(passport.disclaimer);
      try {
        const market = await listRwaMarkets();
        setQuote(market.quotes.find((candidate) => candidate.assetId === passport.asset.id));
      } catch {
        setQuote(undefined);
      }
      try {
        const eligibility = await getAssetEligibility(passport.asset.id);
        setVerdict(eligibility.verdict);
        setPolicy(eligibility.policy);
      } catch {
        setVerdict(undefined);
        setPolicy(undefined);
      }
      try {
        setMonitor(await getAssetMonitor(passport.asset.id));
      } catch {
        setMonitor(undefined);
      }
      try {
        setExtraction(await getAssetExtraction(passport.asset.id));
      } catch {
        setExtraction(undefined);
      }
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => void load(), [load]);

  if (loading) {
    return <div className={styles.page}>Loading asset intelligence…</div>;
  }

  if (error || !asset) {
    return (
      <div className={styles.page}>
        <div className={styles.errorNote}>
          <strong>This asset could not be loaded.</strong>
          <span>{error instanceof Error ? error.message : "The asset was not found."}</span>
          <button className={styles.retryButton} type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const source = quote?.onchainSource;
  const positiveSignals = verdict?.reasons.filter((r) => r.code === "OK") ?? [];
  const riskSignals = verdict?.reasons.filter((r) => r.code !== "OK") ?? [];

  const financialFacts: Array<{ label: string; value: string }> = [];
  if (asset.redemption) {
    financialFacts.push({
      label: "Redemption",
      value:
        asset.redemption.supported === "unknown"
          ? "UNKNOWN"
          : asset.redemption.supported
            ? ["Active", asset.redemption.frequency, asset.redemption.settlementPeriod]
                .filter(Boolean)
                .join(" / ")
            : "Not supported",
    });
  }
  if (asset.fees?.managementFeeBps !== undefined)
    financialFacts.push({ label: "Management fee", value: formatBps(asset.fees.managementFeeBps) });
  if (asset.fees?.redemptionFeeBps !== undefined)
    financialFacts.push({ label: "Redemption fee", value: formatBps(asset.fees.redemptionFeeBps) });
  if (asset.yield?.estimatedAprBps !== undefined)
    financialFacts.push({ label: "Estimated yield", value: formatBps(asset.yield.estimatedAprBps) });
  financialFacts.push({ label: "Liquidity score", value: `${asset.liquidity.score}/100` });
  if (asset.liquidity.redemptionWindow)
    financialFacts.push({ label: "Redemption window", value: asset.liquidity.redemptionWindow });
  if (asset.custody) financialFacts.push({ label: "Custody", value: asset.custody });
  if (asset.jurisdiction) financialFacts.push({ label: "Jurisdiction", value: asset.jurisdiction });
  if (asset.eligibleInvestors)
    financialFacts.push({ label: "Eligible investors", value: asset.eligibleInvestors });

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} href="/">
        <ArrowLeftIcon size={13} /> Back to Overview
      </Link>

      {/* 1. Header */}
      <header className={styles.header}>
        <div className={styles.headerIdentity}>
          <div className={styles.eyebrowRow}>
            <span>{asset.assetClass}</span>
            <span>·</span>
            <span>{asset.issuerName}</span>
          </div>
          <h1 className={styles.symbol}>{asset.symbol}</h1>
          <p className={styles.assetName}>{asset.name}</p>
          {verdict ? (
            <span className={styles.statusPill} data-tone={verdictTone(verdict.status)}>
              {verdictIcon(verdict.status)} {verdict.status}
            </span>
          ) : null}
        </div>
        <div className={styles.headerMetric}>
          <span className={styles.metricLabel}>
            {source ? "NAV per share" : "Reference price"}
          </span>
          <span className={styles.metricValue}>
            {quote ? formatPrice(quote.price) : "—"}
          </span>
          {source ? (
            <span className={styles.metricMeta}>
              Chainlink · {source.network} · updated {formatRelativeAgo(source.sourceUpdatedAt)}
            </span>
          ) : quote ? (
            <span className={styles.metricMeta}>
              {quote.provider} · {formatFreshness(quote.ageSeconds)}
            </span>
          ) : null}
          {monitor?.lastAliveCheckAt ? (
            <span className={styles.metricMeta}>
              ALIVE checked {formatRelativeAgo(monitor.lastAliveCheckAt)}
            </span>
          ) : null}
        </div>
      </header>

      {/* 2. Intelligence summary strip -- only Verification and Eligibility are real today */}
      <div className={styles.summaryStrip}>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Verification</span>
          <span className={styles.summaryValue}>
            {isVerified(asset) ? "Verified" : "Unverified"}
          </span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Eligibility</span>
          <span className={styles.summaryValue}>{verdict ? verdict.status : "Not evaluated"}</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Financial health</span>
          <span className={styles.summaryValueMuted}>Not evaluated</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Market conditions</span>
          <span className={styles.summaryValueMuted}>Not evaluated</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Event risk</span>
          <span className={styles.summaryValueMuted}>Not evaluated</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Outlook</span>
          <span className={styles.summaryValueMuted}>Not evaluated</span>
        </div>
      </div>

      {/* 3. What ALIVE sees */}
      <section className={styles.section} aria-labelledby="signals-title">
        <h2 className={styles.sectionHeading} id="signals-title">
          What ALIVE sees
        </h2>
        <div className={styles.signalsGrid}>
          <div className={styles.signalColumn}>
            <p className={styles.signalColumnHeading}>Positive signals</p>
            {positiveSignals.length > 0 ? (
              <ul className={styles.signalList}>
                {positiveSignals.map((reason, index) => (
                  <li className={styles.signalItem} key={`${reason.code}-${index}`}>
                    {reason.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.signalEmpty}>No confirmed positive signals yet.</p>
            )}
          </div>
          <div className={styles.signalColumn}>
            <p className={styles.signalColumnHeading}>Risks / watch</p>
            {riskSignals.length > 0 ? (
              <ul className={styles.signalList}>
                {riskSignals.map((reason, index) => (
                  <li className={styles.signalItem} key={`${reason.code}-${index}`}>
                    <strong>{reason.code}</strong>
                    {reason.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.signalEmpty}>No risks currently flagged.</p>
            )}
          </div>
        </div>
        {policy ? (
          <p className={styles.policyNote}>
            Evaluated against policy <strong>{policy.policyId}</strong>. A RESTRICTED
            result means this asset failed ALIVE&apos;s configured rules -- not that
            ALIVE doubts the asset is real.
          </p>
        ) : null}
      </section>

      {/* 4. Financials */}
      <section className={styles.section} aria-labelledby="financials-title">
        <h2 className={styles.sectionHeading} id="financials-title">
          Financials
        </h2>
        {financialFacts.length > 0 ? (
          <div className={styles.card}>
            <dl className={styles.factGrid}>
              {financialFacts.map((fact) => (
                <div className={styles.factRow} key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className={styles.emptyState}>No financial facts sourced for this asset yet.</p>
        )}
      </section>

      {/* 5. Market -- live Chainlink card */}
      {source ? (
        <section className={styles.section} aria-labelledby="market-title">
          <h2 className={styles.sectionHeading} id="market-title">
            Market
          </h2>
          <div className={styles.card}>
            <div className={styles.metricGrid}>
              <div className={styles.metric}>
                <span>Feed</span>
                <strong>{source.description ?? "UNKNOWN"}</strong>
              </div>
              <div className={styles.metric}>
                <span>Data source network</span>
                <strong>{source.network}</strong>
              </div>
              <div className={styles.metric}>
                <span>Enforcement network</span>
                <strong>X Layer</strong>
              </div>
              <div className={styles.metric}>
                <span>Monitoring</span>
                <strong>{monitor?.monitoring ? "Active" : "Not monitored"}</strong>
              </div>
              <div className={styles.metric}>
                <span>Data status</span>
                <strong>{quote?.status === "OPEN" ? "Fresh" : "Stale"}</strong>
                <small>{quote ? formatFreshness(quote.ageSeconds) : ""}</small>
              </div>
            </div>
          </div>
          <details className={styles.detailsBlock}>
            <summary>
              Source provenance detail
              <span className={styles.detailsBadge}>
                {quote?.status === "OPEN" ? "fresh" : "stale"}
              </span>
            </summary>
            <div className={styles.detailsBody}>
              <ul className={styles.bindingList}>
                <li>
                  <strong>Contract</strong> {source.feedAddress}
                </li>
                <li>
                  <strong>Chain ID</strong> {source.chainId}
                </li>
                <li>
                  <strong>Round</strong> {source.roundId}
                </li>
                <li>
                  <strong>Source block</strong> {source.blockNumber}
                </li>
                <li>
                  <strong>Source updated</strong> {formatTimestamp(source.sourceUpdatedAt)}
                </li>
                <li>
                  <strong>ALIVE retrieved</strong> {formatTimestamp(source.observedAt)}
                </li>
              </ul>
              {ethereumExplorerAddressUrl(source.chainId, source.feedAddress) ? (
                <a
                  className={styles.sourceCard}
                  style={{ marginTop: 10, display: "inline-flex", flexDirection: "row", gap: 6 }}
                  href={ethereumExplorerAddressUrl(source.chainId, source.feedAddress)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View feed contract on Etherscan <ArrowSquareOutIcon size={12} />
                </a>
              ) : null}
            </div>
          </details>
        </section>
      ) : (
        <section className={styles.section} aria-labelledby="market-title">
          <h2 className={styles.sectionHeading} id="market-title">
            Market
          </h2>
          <p className={styles.emptyState}>
            {quote
              ? `${quote.provider} reference price only -- no live oracle feed connected for this asset yet.`
              : "No market data connected for this asset yet."}
          </p>
        </section>
      )}

      {/* 6. Macro / Events -- honest empty states, no backend source exists yet */}
      <section className={styles.section} aria-labelledby="macro-title">
        <h2 className={styles.sectionHeading} id="macro-title">
          Economy
        </h2>
        <p className={styles.emptyState}>
          No macroeconomic signals connected for this asset yet.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="events-title">
        <h2 className={styles.sectionHeading} id="events-title">
          Events &amp; news
        </h2>
        <p className={styles.emptyState}>
          No relevant events or news connected for this asset yet.
        </p>
      </section>

      {/* 7. Documents -- real Groq AI extraction */}
      <section className={styles.section} aria-labelledby="documents-title">
        <h2 className={styles.sectionHeading} id="documents-title">
          Documents
        </h2>
        {extraction ? (
          <div className={styles.card}>
            <div className={styles.metricGrid}>
              <div className={styles.metric}>
                <span>Status</span>
                <strong>{extraction.live ? "AI · LIVE" : extraction.mode.replaceAll("_", " ")}</strong>
              </div>
              <div className={styles.metric}>
                <span>Provider</span>
                <strong>{extraction.provider ?? "None"}</strong>
              </div>
              <div className={styles.metric}>
                <span>Model</span>
                <strong>{extraction.model ?? "N/A"}</strong>
              </div>
              <div className={styles.metric}>
                <span>Facts extracted</span>
                <strong>{extraction.factsExtracted}</strong>
                <small>{extraction.unknownFields} UNKNOWN</small>
              </div>
              <div className={styles.metric}>
                <span>Cited</span>
                <strong>
                  {extraction.factsCited} / {extraction.factsExtracted}
                </strong>
              </div>
              <div className={styles.metric}>
                <span>Schema validation</span>
                <strong>{extraction.schemaValidation}</strong>
              </div>
              <div className={styles.metric}>
                <span>Source validation</span>
                <strong>{extraction.sourceValidation}</strong>
              </div>
              <div className={styles.metric}>
                <span>Unsupported claims rejected</span>
                <strong>{extraction.unsupportedClaimsRejected}</strong>
              </div>
            </div>
          </div>
        ) : (
          <p className={styles.emptyState}>No document extraction run for this asset yet.</p>
        )}
      </section>

      {/* 8. Sources */}
      <section className={styles.section} aria-labelledby="sources-title">
        <h2 className={styles.sectionHeading} id="sources-title">
          Sources
        </h2>
        <p className={styles.sectionSub}>Every fact above traces back to one of these.</p>
        <div className={styles.sourceGrid}>
          {asset.sources.map((sourceRecord) => (
            <article className={styles.sourceCard} key={sourceRecord.id}>
              <span className={styles.sourceType}>
                {sourceRecord.sourceType.replaceAll("_", " ")}
              </span>
              <h3>{sourceRecord.title}</h3>
              <p>Retrieved {formatTimestamp(sourceRecord.retrievedAt)}</p>
              {sourceRecord.sourceType === "DEMO_FIXTURE" ||
              sourceRecord.sourceType === "ALIVE_METHODOLOGY" ? (
                <p>{sourceRecord.disclaimer}</p>
              ) : (
                <a href={sourceRecord.sourceUrl} target="_blank" rel="noreferrer">
                  Open primary source <ArrowSquareOutIcon size={12} />
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* 9. Onchain -- collapsed by default */}
      <section className={styles.section} aria-labelledby="onchain-title">
        <h2 className={styles.sectionHeading} id="onchain-title">
          Onchain
        </h2>
        <details className={styles.detailsBlock}>
          <summary>
            X Layer enforcement
            <span className={styles.detailsBadge}>{verdict?.status ?? "UNKNOWN"}</span>
          </summary>
          <div className={styles.detailsBody}>
            <div className={styles.metricGrid}>
              <div className={styles.metric}>
                <span>Verdict network</span>
                <strong>X Layer</strong>
              </div>
              <div className={styles.metric}>
                <span>Eligibility</span>
                <strong>{verdict?.eligible ? "Eligible" : "Not eligible"}</strong>
              </div>
              {verdict ? (
                <>
                  <div className={styles.metric}>
                    <span>Evaluated</span>
                    <strong>{formatTimestamp(verdict.evaluatedAt)}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Valid until</span>
                    <strong>{formatTimestamp(verdict.validUntil)}</strong>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </details>
      </section>

      <details className={styles.detailsBlock}>
        <summary>
          {asset.dataMode} asset disclosure
          <span className={styles.detailsBadge}>{asset.dataMode}</span>
        </summary>
        <div className={styles.detailsBody}>
          <p className={styles.sectionSub} style={{ margin: 0 }}>
            {disclaimer}
          </p>
        </div>
      </details>
    </div>
  );
}
