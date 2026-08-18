"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BankIcon,
  BlockchainIcon,
  BuildingIcon,
  CancelCircleIcon,
  ChartAverageIcon,
  ChartLineIcon,
  CircleQuestionMarkIcon,
  CoinsIcon,
  CompassIcon,
  File01Icon,
  FlashIcon,
  GlobeIcon,
  LinkSquare01Icon,
  Loading03Icon,
  NewsIcon,
  Shield01Icon,
  ShieldBlockchainIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { AliveIcon, AliveIconTile } from "@/components/ui/alive-icon";
import type { EligibilityPolicy, EligibilityVerdict, RwaAsset } from "@alive/shared";
import {
  extractAssetPassport,
  getAssetEligibility,
  getAssetExtraction,
  getAssetIntelligenceProfile,
  getAssetMonitor,
  getRwaAsset,
  listRwaMarkets,
  type AssetExtractionStatus,
  type AssetMonitorStatus,
  type RwaMarketQuote,
} from "@/lib/rwa-api";
import type { RwaIntelligenceProfile } from "@alive/shared";
import { loadAssetDocumentation } from "@/lib/verify-flow";
import { AssetHeroCard } from "./asset-hero-card";
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
  if (status === "ELIGIBLE") return <AliveIcon icon={Shield01Icon} size="sm" />;
  if (status === "RESTRICTED") return <AliveIcon icon={CancelCircleIcon} size="sm" />;
  return <AliveIcon icon={CircleQuestionMarkIcon} size="sm" />;
}

/**
 * Verification (does this asset have real, cited source documents),
 * analysis (has ALIVE actually run AI extraction against those documents),
 * and eligibility (does it pass ALIVE's policy) are three different
 * questions -- a real catalog asset can have a genuine source and still be
 * "not analyzed" because no one has clicked Analyze yet. Conflating "we
 * know its identity" with "ALIVE verified it" would misrepresent every
 * unanalyzed real asset as already checked.
 */
type AnalysisStatus = "VERIFIED" | "NOT_ANALYZED" | "UNVERIFIED";

function analysisStatus(asset: RwaAsset): AnalysisStatus {
  const hasRealSource = asset.sources.some(
    (source) => source.sourceType !== "DEMO_FIXTURE",
  );
  if (!hasRealSource) return "UNVERIFIED";
  return asset.extraction !== undefined ? "VERIFIED" : "NOT_ANALYZED";
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
  const [profile, setProfile] = useState<RwaIntelligenceProfile>();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<unknown>();

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
      try {
        const result = await getAssetIntelligenceProfile(passport.asset.id);
        setProfile(result.available ? result.profile : undefined);
      } catch {
        setProfile(undefined);
      }
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => void load(), [load]);

  async function runAnalyze() {
    if (!asset) return;
    setAnalyzing(true);
    setAnalyzeError(undefined);
    try {
      await loadAssetDocumentation(asset.id, asset.symbol);
      await extractAssetPassport(asset.id);
      await load();
    } catch (requestError) {
      setAnalyzeError(requestError);
    } finally {
      setAnalyzing(false);
    }
  }

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
  const status = analysisStatus(asset);
  // The deterministic engine still computes a real verdict for an
  // unanalyzed asset (e.g. an unapproved-issuer check), but surfacing that
  // as a headline RESTRICTED/ELIGIBLE pill would misrepresent "ALIVE
  // hasn't looked at this yet" as "ALIVE checked and it failed." Only a
  // genuinely analyzed asset gets to show its verdict as a status.
  const displayVerdict = status === "VERIFIED" ? verdict : undefined;
  const positiveSignals = displayVerdict?.reasons.filter((r) => r.code === "OK") ?? [];
  const riskSignals = displayVerdict?.reasons.filter((r) => r.code !== "OK") ?? [];

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
  if (asset.liquidity) {
    financialFacts.push({ label: "Liquidity score", value: `${asset.liquidity.score}/100` });
    if (asset.liquidity.redemptionWindow)
      financialFacts.push({ label: "Redemption window", value: asset.liquidity.redemptionWindow });
  }
  if (asset.custody) financialFacts.push({ label: "Custody", value: asset.custody });
  if (asset.jurisdiction) financialFacts.push({ label: "Jurisdiction", value: asset.jurisdiction });
  if (asset.eligibleInvestors)
    financialFacts.push({ label: "Eligible investors", value: asset.eligibleInvestors });

  const backing = asset.backing;
  const riskDrivers = profile?.riskDrivers?.status === "AVAILABLE" ? profile.riskDrivers.data : undefined;
  const news = profile?.news?.status === "AVAILABLE" ? profile.news.data : undefined;
  const outlook = profile?.outlook?.status === "AVAILABLE" ? profile.outlook.data : undefined;
  const fundProfile =
    profile?.fundProfile?.status === "AVAILABLE" ? profile.fundProfile.data : undefined;
  const companyProfile =
    profile?.companyProfile?.status === "AVAILABLE" ? profile.companyProfile.data : undefined;
  const ownership = profile?.ownership?.status === "AVAILABLE" ? profile.ownership.data : undefined;
  const macro = profile?.macro?.status === "AVAILABLE" ? profile.macro.data : undefined;
  const benchmark =
    profile?.benchmark?.status === "AVAILABLE" ? profile.benchmark.data : undefined;

  const fundFacts: Array<{ label: string; value: string }> = [];
  if (fundProfile?.aum) fundFacts.push({ label: "AUM", value: fundProfile.aum });
  if (fundProfile?.nav) fundFacts.push({ label: "NAV", value: fundProfile.nav });
  if (fundProfile?.yield) fundFacts.push({ label: "Yield", value: fundProfile.yield });
  if (fundProfile?.managementFeeBps !== undefined)
    fundFacts.push({ label: "Management fee", value: formatBps(fundProfile.managementFeeBps) });
  if (fundProfile?.manager) fundFacts.push({ label: "Manager", value: fundProfile.manager });
  if (fundProfile?.custodian) fundFacts.push({ label: "Custodian", value: fundProfile.custodian });
  if (fundProfile?.administrator)
    fundFacts.push({ label: "Administrator", value: fundProfile.administrator });
  if (fundProfile?.redemption) fundFacts.push({ label: "Redemption", value: fundProfile.redemption });
  if (fundProfile?.subscription)
    fundFacts.push({ label: "Subscription", value: fundProfile.subscription });
  if (fundProfile?.eligibleInvestors)
    fundFacts.push({ label: "Eligible investors", value: fundProfile.eligibleInvestors });
  if (fundProfile?.holdingsSummary)
    fundFacts.push({ label: "Holdings", value: fundProfile.holdingsSummary });
  if (fundProfile?.durationDays !== undefined)
    fundFacts.push({ label: "Duration", value: `${fundProfile.durationDays} days` });

  const companyFacts: Array<{ label: string; value: string }> = [];
  if (companyProfile?.revenue) companyFacts.push({ label: "Revenue", value: companyProfile.revenue });
  if (companyProfile?.revenueGrowth)
    companyFacts.push({ label: "Revenue growth", value: companyProfile.revenueGrowth });
  if (companyProfile?.earnings) companyFacts.push({ label: "Earnings", value: companyProfile.earnings });
  if (companyProfile?.margins) companyFacts.push({ label: "Margins", value: companyProfile.margins });
  if (companyProfile?.cash) companyFacts.push({ label: "Cash", value: companyProfile.cash });
  if (companyProfile?.debt) companyFacts.push({ label: "Debt", value: companyProfile.debt });
  if (companyProfile?.marketCap)
    companyFacts.push({ label: "Market cap", value: companyProfile.marketCap });
  if (companyProfile?.leadership)
    companyFacts.push({ label: "Leadership", value: companyProfile.leadership });
  if (companyProfile?.headcount)
    companyFacts.push({ label: "Headcount", value: companyProfile.headcount });
  if (companyProfile?.headcountTrend)
    companyFacts.push({ label: "Headcount trend", value: companyProfile.headcountTrend });
  if (companyProfile?.creditRating)
    companyFacts.push({ label: "Credit rating", value: companyProfile.creditRating });

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} href="/">
        <AliveIcon icon={ArrowLeft01Icon} size="sm" /> Back to Overview
      </Link>

      {/* 1. Header */}
      <header className={styles.header}>
        <div className={styles.headerIdentity}>
          <AssetHeroCard asset={asset} />
          {displayVerdict ? (
            <span className={styles.statusPill} data-tone={verdictTone(displayVerdict.status)}>
              {verdictIcon(displayVerdict.status)} {displayVerdict.status}
            </span>
          ) : null}
          {status === "NOT_ANALYZED" ? (
            <div className={styles.analyzeRow}>
              {asset.analysisCapability === "UNSUPPORTED" ? (
                <span className={styles.sectionSub}>
                  ALIVE&apos;s Analyze pipeline does not yet support this asset&apos;s source
                  type.
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.retryButton}
                    disabled={analyzing}
                    onClick={() => void runAnalyze()}
                  >
                    {analyzing ? (
                      <>
                        <AliveIcon icon={Loading03Icon} size="sm" className="spin" /> Analyzing…
                      </>
                    ) : (
                      <>
                        Analyze asset <AliveIcon icon={ArrowRight01Icon} size="sm" />
                      </>
                    )}
                  </button>
                  {asset.analysisCapability === "SOURCE_DISCOVERY_REQUIRED" && !analyzeError ? (
                    <span className={styles.sectionSub}>
                      ALIVE has not yet registered official documents for this asset -- Analyze
                      may report that honestly rather than extracting facts.
                    </span>
                  ) : null}
                </>
              )}
              {analyzeError ? (
                <span className={styles.sectionSub}>
                  {analyzeError instanceof Error
                    ? analyzeError.message
                    : "The request could not be completed."}
                </span>
              ) : null}
            </div>
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
            {status === "VERIFIED"
              ? "Verified"
              : status === "NOT_ANALYZED"
                ? "Not analyzed"
                : "Unverified"}
          </span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Eligibility</span>
          <span className={styles.summaryValue}>
            {displayVerdict ? displayVerdict.status : "Not evaluated"}
          </span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Backing</span>
          {backing ? (
            <span className={styles.summaryValue}>{backing.backingType.replaceAll("_", " ")}</span>
          ) : (
            <span className={styles.summaryValueMuted}>Not classified</span>
          )}
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Event risk</span>
          {riskDrivers && riskDrivers.length > 0 ? (
            <span className={styles.summaryValue}>{riskDrivers.length} tracked</span>
          ) : (
            <span className={styles.summaryValueMuted}>Not evaluated</span>
          )}
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Outlook</span>
          {outlook ? (
            <span className={styles.summaryValue}>{outlook.sentiment.replaceAll("_", " ")}</span>
          ) : (
            <span className={styles.summaryValueMuted}>Not evaluated</span>
          )}
        </div>
      </div>

      {/* 2b. Backing */}
      <section className={styles.section} aria-labelledby="backing-title">
        <h2 className={styles.sectionHeading} id="backing-title">
          <AliveIcon icon={Shield01Icon} size="lg" className={styles.sectionHeadingIcon} />
          Backing
        </h2>
        {backing ? (
          <div className={styles.card}>
            <dl className={styles.factGrid}>
              <div className={styles.factRow}>
                <dt>Backing type</dt>
                <dd>{backing.backingType.replaceAll("_", " ")}</dd>
              </div>
              {backing.directLegalClaim !== undefined ? (
                <div className={styles.factRow}>
                  <dt>Direct legal claim</dt>
                  <dd>{backing.directLegalClaim ? "Yes" : "No"}</dd>
                </div>
              ) : null}
              {backing.redemptionIntoUnderlying !== undefined ? (
                <div className={styles.factRow}>
                  <dt>Redeemable into underlying</dt>
                  <dd>
                    {backing.redemptionIntoUnderlying === "unknown"
                      ? "UNKNOWN"
                      : backing.redemptionIntoUnderlying
                        ? "Yes"
                        : "No"}
                  </dd>
                </div>
              ) : null}
              {backing.custodian ? (
                <div className={styles.factRow}>
                  <dt>Custodian</dt>
                  <dd>{backing.custodian}</dd>
                </div>
              ) : null}
              {backing.reserveManager ? (
                <div className={styles.factRow}>
                  <dt>Reserve manager</dt>
                  <dd>{backing.reserveManager}</dd>
                </div>
              ) : null}
              {backing.collateralDescription ? (
                <div className={styles.factRow}>
                  <dt>Collateral</dt>
                  <dd>{backing.collateralDescription}</dd>
                </div>
              ) : null}
              {backing.collateralizationRatio !== undefined ? (
                <div className={styles.factRow}>
                  <dt>Collateralization ratio</dt>
                  <dd>{backing.collateralizationRatio}x</dd>
                </div>
              ) : null}
              {backing.proofOfReserveAvailable !== undefined ? (
                <div className={styles.factRow}>
                  <dt>Proof of reserve</dt>
                  <dd>{backing.proofOfReserveAvailable ? "Available" : "Not available"}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : (
          <div className={styles.emptyStateBlock}>
            <AliveIconTile icon={Shield01Icon} tone="muted" />
            <p className={styles.emptyState}>
              ALIVE has not classified how this asset is backed yet.
            </p>
          </div>
        )}
      </section>

      {/* 2c. What could move this asset */}
      <section className={styles.section} aria-labelledby="risk-drivers-title">
        <h2 className={styles.sectionHeading} id="risk-drivers-title">
          <AliveIcon icon={FlashIcon} size="lg" className={styles.sectionHeadingIcon} />
          What could move this asset
        </h2>
        {riskDrivers && riskDrivers.length > 0 ? (
          <div className={styles.signalsGrid}>
            {riskDrivers.map((driver) => (
              <div className={styles.card} key={driver.name}>
                <p className={styles.signalColumnHeading}>
                  {driver.name}{" "}
                  <span className={styles.detailsBadge}>{driver.direction}</span>
                </p>
                <p className={styles.sectionSub}>{driver.currentState}</p>
                <p className={styles.sectionSub}>{driver.explanation}</p>
                <ul className={styles.signalList}>
                  {driver.evidence.map((item, index) => (
                    <li className={styles.signalItem} key={index}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>
            ALIVE has not identified specific risk drivers for this asset yet.
          </p>
        )}
      </section>

      {/* 2d. Latest intelligence (news) */}
      <section className={styles.section} aria-labelledby="news-title">
        <h2 className={styles.sectionHeading} id="news-title">
          <AliveIcon icon={NewsIcon} size="lg" className={styles.sectionHeadingIcon} />
          Latest intelligence
        </h2>
        {news && news.length > 0 ? (
          <div className={styles.sourceGrid}>
            {news.map((item) => (
              <article className={styles.sourceCard} key={item.url}>
                <span className={styles.sourceType}>
                  {item.impactDirection} · {item.publisher}
                </span>
                <h3>{item.headline}</h3>
                <p>{item.summary}</p>
                <p className={styles.sectionSub}>{item.reasoning}</p>
                <a href={item.url} target="_blank" rel="noreferrer">
                  Read source <AliveIcon icon={LinkSquare01Icon} size="sm" />
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyStateBlock}>
            <AliveIconTile icon={NewsIcon} tone="muted" />
            <p className={styles.emptyState}>No relevant news connected for this asset yet.</p>
          </div>
        )}
      </section>

      {/* 3. What ALIVE sees */}
      <section className={styles.section} aria-labelledby="signals-title">
        <h2 className={styles.sectionHeading} id="signals-title">
          <AliveIcon icon={Shield01Icon} size="lg" className={styles.sectionHeadingIcon} />
          What ALIVE sees
        </h2>
        {status === "VERIFIED" ? (
          <>
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
          </>
        ) : (
          <div className={styles.emptyStateBlock}>
            <AliveIconTile icon={CircleQuestionMarkIcon} tone="muted" />
            <p className={styles.emptyState}>
              {status === "NOT_ANALYZED"
                ? "ALIVE has not analyzed this asset yet -- run Analyze to extract and evaluate it against real documents."
                : "This asset has no real, cited source and has not been evaluated."}
            </p>
          </div>
        )}
      </section>

      {/* 4. Financials */}
      <section className={styles.section} aria-labelledby="financials-title">
        <h2 className={styles.sectionHeading} id="financials-title">
          <AliveIcon icon={ChartLineIcon} size="lg" className={styles.sectionHeadingIcon} />
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
            <AliveIcon icon={CoinsIcon} size="lg" className={styles.sectionHeadingIcon} />
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
                  View feed contract on Etherscan <AliveIcon icon={LinkSquare01Icon} size="sm" />
                </a>
              ) : null}
            </div>
          </details>
        </section>
      ) : (
        <section className={styles.section} aria-labelledby="market-title">
          <h2 className={styles.sectionHeading} id="market-title">
            <AliveIcon icon={CoinsIcon} size="lg" className={styles.sectionHeadingIcon} />
            Market
          </h2>
          <p className={styles.emptyState}>
            {quote
              ? `${quote.provider} reference price only -- no live oracle feed connected for this asset yet.`
              : "No market data connected for this asset yet."}
          </p>
        </section>
      )}

      {/* 6. Macro & benchmark */}
      <section className={styles.section} aria-labelledby="macro-title">
        <h2 className={styles.sectionHeading} id="macro-title">
          <AliveIcon icon={GlobeIcon} size="lg" className={styles.sectionHeadingIcon} />
          Macro
        </h2>
        {macro && macro.length > 0 ? (
          <div className={styles.card}>
            <dl className={styles.factGrid}>
              {macro.map((signal) => (
                <div className={styles.factRow} key={signal.name}>
                  <dt>{signal.name}</dt>
                  <dd>
                    {signal.value}
                    <br />
                    <span className={styles.sectionSub}>{signal.relevance}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className={styles.emptyState}>
            No macroeconomic signals connected for this asset yet.
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="benchmark-title">
        <h2 className={styles.sectionHeading} id="benchmark-title">
          <AliveIcon icon={ChartAverageIcon} size="lg" className={styles.sectionHeadingIcon} />
          Benchmark
        </h2>
        {benchmark ? (
          <div className={styles.card}>
            <dl className={styles.factGrid}>
              <div className={styles.factRow}>
                <dt>{benchmark.name}</dt>
                <dd>{benchmark.value ?? benchmark.benchmarkType}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className={styles.emptyState}>No asset-class-appropriate benchmark connected yet.</p>
        )}
      </section>

      {/* 6b. Fund / Company profile -- kept distinct, never forced onto each other */}
      {fundFacts.length > 0 ? (
        <section className={styles.section} aria-labelledby="fund-title">
          <h2 className={styles.sectionHeading} id="fund-title">
            <AliveIcon icon={BankIcon} size="lg" className={styles.sectionHeadingIcon} />
            Fund profile
          </h2>
          <div className={styles.card}>
            <dl className={styles.factGrid}>
              {fundFacts.map((fact) => (
                <div className={styles.factRow} key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      {companyFacts.length > 0 ? (
        <section className={styles.section} aria-labelledby="company-title">
          <h2 className={styles.sectionHeading} id="company-title">
            <AliveIcon icon={BuildingIcon} size="lg" className={styles.sectionHeadingIcon} />
            Company profile
          </h2>
          <div className={styles.card}>
            <dl className={styles.factGrid}>
              {companyFacts.map((fact) => (
                <div className={styles.factRow} key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      {ownership && ownership.length > 0 ? (
        <section className={styles.section} aria-labelledby="ownership-title">
          <h2 className={styles.sectionHeading} id="ownership-title">
            <AliveIcon icon={UserGroupIcon} size="lg" className={styles.sectionHeadingIcon} />
            Ownership
          </h2>
          <p className={styles.sectionSub}>
            Issuer/company shareholders and backers -- distinct from onchain token holders.
          </p>
          <div className={styles.sourceGrid}>
            {ownership.map((entry) => (
              <article className={styles.sourceCard} key={entry.name}>
                <span className={styles.sourceType}>{entry.relationship.replaceAll("_", " ")}</span>
                <h3>{entry.name}</h3>
                {entry.detail ? <p>{entry.detail}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* 6c. Outlook -- sentiment/evidence only, never BUY/SELL/price target, always separate from eligibility */}
      <section className={styles.section} aria-labelledby="outlook-title">
        <h2 className={styles.sectionHeading} id="outlook-title">
          <AliveIcon icon={CompassIcon} size="lg" className={styles.sectionHeadingIcon} />
          Outlook
        </h2>
        {outlook ? (
          <div className={styles.card}>
            <p className={styles.signalColumnHeading}>
              {outlook.sentiment.replaceAll("_", " ")}{" "}
              <span className={styles.detailsBadge}>{outlook.horizon}</span>
            </p>
            <p className={styles.sectionSub}>{outlook.summary}</p>
            <div className={styles.signalsGrid}>
              <div className={styles.signalColumn}>
                <p className={styles.signalColumnHeading}>Positive drivers</p>
                <ul className={styles.signalList}>
                  {outlook.positiveDrivers.map((item, index) => (
                    <li className={styles.signalItem} key={index}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.signalColumn}>
                <p className={styles.signalColumnHeading}>Negative drivers</p>
                <ul className={styles.signalList}>
                  {outlook.negativeDrivers.map((item, index) => (
                    <li className={styles.signalItem} key={index}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className={styles.policyNote}>
              This is ALIVE&apos;s research outlook, not investment advice -- never a buy/sell
              signal or price target, and entirely separate from the eligibility verdict above.
            </p>
          </div>
        ) : (
          <p className={styles.emptyState}>
            ALIVE has not formed an outlook for this asset yet.
          </p>
        )}
      </section>

      {/* 7. Documents -- real Groq AI extraction */}
      <section className={styles.section} aria-labelledby="documents-title">
        <h2 className={styles.sectionHeading} id="documents-title">
          <AliveIcon icon={File01Icon} size="lg" className={styles.sectionHeadingIcon} />
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
          <AliveIcon icon={File01Icon} size="lg" className={styles.sectionHeadingIcon} />
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
                  Open primary source <AliveIcon icon={LinkSquare01Icon} size="sm" />
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* 8b. Networks / Deployments -- only VERIFIED deployments are shown (directive §27) */}
      <section className={styles.section} aria-labelledby="networks-title">
        <h2 className={styles.sectionHeading} id="networks-title">
          <AliveIcon icon={BlockchainIcon} size="lg" className={styles.sectionHeadingIcon} />
          Networks
        </h2>
        {asset.deployments && asset.deployments.length > 0 ? (
          <div className={styles.sourceGrid}>
            {asset.deployments
              .filter((deployment) => deployment.deploymentStatus === "VERIFIED")
              .map((deployment) => (
                <article
                  className={styles.sourceCard}
                  key={`${deployment.chainId}:${deployment.contractAddress}`}
                >
                  <span className={styles.sourceType}>{deployment.tokenStandard}</span>
                  <h3>{deployment.chainName}</h3>
                  <p className={styles.mono}>{deployment.contractAddress}</p>
                  <p>Verified deployment</p>
                  {deployment.explorerUrl ? (
                    <a href={deployment.explorerUrl} target="_blank" rel="noreferrer">
                      View on explorer <AliveIcon icon={LinkSquare01Icon} size="sm" />
                    </a>
                  ) : null}
                </article>
              ))}
          </div>
        ) : (
          <p className={styles.emptyState}>
            No verified token deployment confirmed for this asset yet.
          </p>
        )}
      </section>

      {/* 9. Onchain -- collapsed by default */}
      <section className={styles.section} aria-labelledby="onchain-title">
        <h2 className={styles.sectionHeading} id="onchain-title">
          <AliveIcon icon={ShieldBlockchainIcon} size="lg" className={styles.sectionHeadingIcon} />
          Onchain
        </h2>
        <details className={styles.detailsBlock}>
          <summary>
            X Layer enforcement
            <span className={styles.detailsBadge}>{displayVerdict?.status ?? "NOT EVALUATED"}</span>
          </summary>
          <div className={styles.detailsBody}>
            <div className={styles.metricGrid}>
              <div className={styles.metric}>
                <span>Verdict network</span>
                <strong>X Layer</strong>
              </div>
              <div className={styles.metric}>
                <span>Eligibility</span>
                <strong>{displayVerdict?.eligible ? "Eligible" : "Not evaluated"}</strong>
              </div>
              {displayVerdict ? (
                <>
                  <div className={styles.metric}>
                    <span>Evaluated</span>
                    <strong>{formatTimestamp(displayVerdict.evaluatedAt)}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Valid until</span>
                    <strong>{formatTimestamp(displayVerdict.validUntil)}</strong>
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
