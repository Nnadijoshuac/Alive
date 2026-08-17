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
import type { EligibilityVerdict, RwaAsset } from "@alive/shared";
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
import { CanonShell } from "@/components/canon/canon-shell";
import styles from "@/components/canon/canon.module.css";

function verdictTone(status: EligibilityVerdict["status"] | undefined) {
  if (status === "ELIGIBLE") return "positive" as const;
  if (status === "RESTRICTED") return "negative" as const;
  return "warning" as const;
}

function verdictIcon(status: EligibilityVerdict["status"] | undefined) {
  if (status === "ELIGIBLE") return <ShieldCheckIcon size={16} weight="fill" />;
  if (status === "RESTRICTED") return <ProhibitIcon size={16} weight="fill" />;
  return <QuestionIcon size={16} weight="fill" />;
}

/** Ethereum mainnet only -- the only chain ALIVE reads Chainlink RWA feeds from today. */
function ethereumExplorerAddressUrl(chainId: number, address: string): string | undefined {
  return chainId === 1 ? `https://etherscan.io/address/${address}` : undefined;
}

export function AssetPassportWorkspace({ assetId }: { assetId: string }) {
  const [asset, setAsset] = useState<RwaAsset>();
  const [quote, setQuote] = useState<RwaMarketQuote>();
  const [disclaimer, setDisclaimer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [verdict, setVerdict] = useState<EligibilityVerdict>();
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
      } catch {
        setVerdict(undefined);
      }
      try {
        setMonitor(await getAssetMonitor(passport.asset.id));
      } catch {
        // Monitor status is supplementary -- its absence should not block
        // the rest of the passport from rendering.
        setMonitor(undefined);
      }
      try {
        setExtraction(await getAssetExtraction(passport.asset.id));
      } catch {
        // No extraction run yet is a normal state, not an error.
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
    return (
      <CanonShell>
        <div className={styles.loadingRoot}>Loading sourced asset passport…</div>
      </CanonShell>
    );
  }

  if (error || !asset) {
    return (
      <CanonShell>
        <div className={styles.emptyRoot}>
          <div className={styles.errorNote}>
            <strong>This asset passport could not be loaded.</strong>
            {error instanceof Error ? error.message : "The asset was not found."}
            <button className={styles.retryButton} type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      </CanonShell>
    );
  }

  const facts: Array<{ label: string; value: string }> = [
    { label: "Asset ID", value: asset.id },
    { label: "Issuer", value: `${asset.issuerName} (${asset.issuer})` },
    { label: "Underlying", value: asset.underlying },
    { label: "Asset class", value: asset.assetClass },
    { label: "Last updated", value: formatTimestamp(asset.lastUpdatedAt) },
  ];
  if (asset.jurisdiction) facts.push({ label: "Jurisdiction", value: asset.jurisdiction });
  if (asset.eligibleInvestors)
    facts.push({ label: "Eligible investors", value: asset.eligibleInvestors });
  if (asset.custody) facts.push({ label: "Custody", value: asset.custody });
  if (asset.network) facts.push({ label: "Network", value: asset.network });
  if (asset.tokenAddress) facts.push({ label: "Token address", value: asset.tokenAddress });
  if (asset.redemption) {
    facts.push({
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
    facts.push({ label: "Management fee", value: formatBps(asset.fees.managementFeeBps) });
  if (asset.yield?.estimatedAprBps !== undefined)
    facts.push({ label: "Estimated APR", value: formatBps(asset.yield.estimatedAprBps) });
  facts.push({ label: "Liquidity score", value: `${asset.liquidity.score}/100` });
  facts.push({ label: "Risk score", value: `${asset.risk.score}/100` });
  if (asset.restrictions?.length)
    facts.push({ label: "Restrictions", value: asset.restrictions.join("; ") });

  const tone = verdictTone(verdict?.status);
  const source = quote?.onchainSource;
  const live = extraction?.mode === "AI";

  return (
    <CanonShell>
      <main className={styles.passportMain}>
        <Link className={styles.backLink} href="/">
          <ArrowLeftIcon size={14} /> Verify another asset
        </Link>

        <header className={styles.passportHero}>
          <div className={styles.passportEyebrow}>
            <span>{asset.dataMode === "LIVE" ? "Live data" : `${asset.dataMode.toLowerCase()} data`}</span>
            <span>·</span>
            <span>{asset.assetClass}</span>
          </div>
          <h1 className={styles.passportTitle}>{asset.symbol}</h1>
          <p className={styles.passportSub}>
            {asset.name}. {asset.underlying}
          </p>
          {verdict ? (
            <span className={styles.statusRow} data-tone={tone}>
              {verdictIcon(verdict.status)}
              ALIVE {verdict.status}
            </span>
          ) : null}
        </header>

        <section className={styles.section} aria-labelledby="status-title">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.sectionKicker}>ALIVE verdict</p>
              <h2 className={styles.sectionTitle} id="status-title">
                What can it do?
              </h2>
            </div>
          </div>
          {verdict ? (
            <>
              <ul className={styles.reasonList}>
                {verdict.reasons.map((reason, index) => (
                  <li key={`${reason.code}-${index}`}>
                    <strong>{reason.code}</strong>
                    {reason.message}
                  </li>
                ))}
              </ul>
              <p className={styles.sectionNote} style={{ marginTop: 14 }}>
                {verdict.eligible
                  ? "Eligible for vault deposit, collateral use, and strategy allocation."
                  : "Not currently eligible for any ALIVE-gated financial action."}{" "}
                Evaluated {formatTimestamp(verdict.evaluatedAt)}, valid until{" "}
                {formatTimestamp(verdict.validUntil)}.
              </p>
            </>
          ) : (
            <p className={styles.sectionNote}>
              ALIVE could not evaluate this asset&apos;s eligibility right now.
            </p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="sources-title">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.sectionKicker}>Provenance</p>
              <h2 className={styles.sectionTitle} id="sources-title">
                Source ledger
              </h2>
            </div>
            <p className={styles.sectionNote}>Every fact below traces back to one of these.</p>
          </div>
          <div className={styles.sourceGrid}>
            {asset.sources.map((sourceRecord) => (
              <article className={styles.sourceCard} key={sourceRecord.id}>
                <span className={styles.sourceType}>
                  {sourceRecord.sourceType.replaceAll("_", " ")}
                </span>
                <h3>{sourceRecord.title}</h3>
                <p>Retrieved {formatTimestamp(sourceRecord.retrievedAt)}</p>
                {sourceRecord.sourceType === "DEMO_FIXTURE" ? (
                  <p>{sourceRecord.disclaimer}</p>
                ) : null}
                {sourceRecord.sourceType !== "DEMO_FIXTURE" ? (
                  <a href={sourceRecord.sourceUrl} target="_blank" rel="noreferrer">
                    Open primary source <ArrowSquareOutIcon size={12} />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="facts-title">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.sectionKicker}>Product facts</p>
              <h2 className={styles.sectionTitle} id="facts-title">
                Known values only
              </h2>
            </div>
            <p className={styles.sectionNote}>
              Fields without a supporting source are omitted, not guessed.
            </p>
          </div>
          <dl className={styles.factGrid}>
            {facts.map((fact) => (
              <div className={styles.factRow} key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.section} aria-label="Extended detail">
          <p className={styles.sectionKicker} style={{ marginBottom: 14 }}>
            Detail
          </p>

          {extraction ? (
            <details className={styles.detailsBlock}>
              <summary>
                Document intelligence — what the AI read
                <span className={styles.detailsBadge}>
                  {live ? "AI · live" : extraction.mode.replaceAll("_", " ")}
                </span>
              </summary>
              <div className={styles.detailsBody}>
                <div className={styles.metricGrid}>
                  <div className={styles.metric}>
                    <span>Provider</span>
                    <strong>{extraction.provider ?? "None"}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Model</span>
                    <strong>{extraction.model ?? "N/A"}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Sources used</span>
                    <strong>{extraction.sourceCount}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Facts extracted</span>
                    <strong>{extraction.factsExtracted}</strong>
                    <small>{extraction.unknownFields} came back UNKNOWN</small>
                  </div>
                  <div className={styles.metric}>
                    <span>Cited facts</span>
                    <strong>
                      {extraction.factsCited} / {extraction.factsExtracted}
                    </strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Unsupported claims rejected</span>
                    <strong>{extraction.unsupportedClaimsRejected}</strong>
                  </div>
                </div>
                <p className={styles.sectionNote}>
                  Document intelligence never touches live financial data — NAV, timestamps,
                  and freshness below come only from Chainlink.
                </p>
              </div>
            </details>
          ) : null}

          {source ? (
            <details className={styles.detailsBlock}>
              <summary>
                Live Chainlink monitoring — where this number comes from
                <span className={styles.detailsBadge}>
                  {quote?.status === "OPEN" ? "fresh" : "stale"}
                </span>
              </summary>
              <div className={styles.detailsBody}>
                <div className={styles.metricGrid}>
                  <div className={styles.metric}>
                    <span>Feed</span>
                    <strong>{source.description ?? "UNKNOWN"}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Value</span>
                    <strong>{quote ? formatPrice(quote.price) : "UNKNOWN"}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Source network</span>
                    <strong>{source.network}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Enforcement network</span>
                    <strong>X Layer</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Chainlink updated</span>
                    <strong>{formatRelativeAgo(source.sourceUpdatedAt)}</strong>
                    <small>{formatTimestamp(source.sourceUpdatedAt)}</small>
                  </div>
                  <div className={styles.metric}>
                    <span>ALIVE last checked</span>
                    <strong>
                      {formatRelativeAgo(monitor?.lastAliveCheckAt ?? source.observedAt)}
                    </strong>
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
                </ul>
                {ethereumExplorerAddressUrl(source.chainId, source.feedAddress) ? (
                  <a
                    className={styles.moreLink}
                    style={{ marginTop: 10, display: "inline-flex" }}
                    href={ethereumExplorerAddressUrl(source.chainId, source.feedAddress)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View feed contract on Etherscan <ArrowSquareOutIcon size={12} />
                  </a>
                ) : null}
              </div>
            </details>
          ) : null}

          <details className={styles.detailsBlock}>
            <summary>
              {asset.dataMode} asset disclosure
              <span className={styles.detailsBadge}>{asset.dataMode}</span>
            </summary>
            <div className={styles.detailsBody}>
              <p className={styles.sectionNote}>{disclaimer}</p>
            </div>
          </details>
        </section>
      </main>
    </CanonShell>
  );
}
