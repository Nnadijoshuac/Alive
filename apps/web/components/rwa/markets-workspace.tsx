"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import type { RwaAsset } from "@alive/shared";
import {
  listRwaAssets,
  listRwaMarkets,
  type RwaMarketQuote,
} from "@/lib/rwa-api";
import { formatFreshness, formatPrice, formatTimestamp } from "@/lib/rwa-format";
import {
  Disclosure,
  EmptyState,
  ErrorState,
  LoadingState,
  ModeBadge,
  Notice,
  OperationStatus,
  PageIntro,
  styles,
} from "./ui";

type MarketState = Awaited<ReturnType<typeof listRwaMarkets>>;

export function MarketsWorkspace() {
  const [market, setMarket] = useState<MarketState>();
  const [assets, setAssets] = useState<RwaAsset[]>([]);
  const [query, setQuery] = useState("");
  const [assetClass, setAssetClass] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();

  const load = useCallback(async () => {
    setLoading(true);
    setMarket(undefined);
    setAssets([]);
    setError(undefined);
    try {
      const [marketResult, catalogResult] = await Promise.all([
        listRwaMarkets(),
        listRwaAssets(),
      ]);
      setMarket(marketResult);
      setAssets(catalogResult.assets);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const rows = useMemo(() => {
    if (!market) return [];
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const normalizedQuery = query.trim().toLowerCase();
    return market.quotes
      .map((quote) => {
        const asset = byId.get(quote.assetId);
        return asset ? { quote, asset } : { quote };
      })
      .filter(({ quote, asset }) => {
        if (assetClass !== "ALL" && asset?.assetClass !== assetClass) return false;
        if (!normalizedQuery) return true;
        return [quote.assetId, asset?.symbol, asset?.name, asset?.issuerName]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedQuery));
      });
  }, [assetClass, assets, market, query]);

  const availableClasses = useMemo(
    () => [...new Set(assets.map((asset) => asset.assetClass))].sort(),
    [assets],
  );

  return (
    <div className={styles.page}>
      <PageIntro
        eyebrow="Sourced market layer"
        title="Market facts with a clock attached."
        description="Inspect the exact quote provider, market status, data mode, and freshness that deterministic policy checks receive. No unlabeled price becomes a portfolio input."
        aside={
          <button className={styles.buttonSecondary} type="button" onClick={load} disabled={loading}>
            <ArrowClockwiseIcon size={17} weight="bold" />
            Refresh snapshot
          </button>
        }
      />

      {loading ? (
        <section className={styles.section}>
          <LoadingState label="Loading market snapshot and approved assets" />
        </section>
      ) : null}
      {error ? (
        <section className={styles.section}>
          <ErrorState error={error} retry={load} />
        </section>
      ) : null}

      {market && !loading ? (
        <>
          <section className={styles.section}>
            <div className={styles.snapshotBar}>
              <OperationStatus
                title="Market snapshot ready"
                detail={`Captured ${formatTimestamp(market.capturedAt)}`}
                tone={market.dataMode === "LIVE" ? "success" : "warning"}
              />
              <div className={styles.snapshotMeta}>
                <div>
                  <p className={styles.kicker}>Current response</p>
                  <strong>Market snapshot</strong>
                </div>
                <ModeBadge mode={market.dataMode} />
              </div>
              <Disclosure title={`${market.dataMode} data disclosure`} summary="Provider mode and limitations">
                <Notice title="Snapshot provenance" tone={market.dataMode === "LIVE" ? "success" : "warning"}>
                  {market.disclaimer}
                </Notice>
              </Disclosure>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="market-table-title">
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Approved universe</p>
                <h2 id="market-table-title">{rows.length} quote{rows.length === 1 ? "" : "s"}</h2>
              </div>
              <div className={styles.filterRow}>
                <label className={styles.field}>
                  <span className={styles.srOnly}>Search markets</span>
                  <input
                    className={styles.input}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search symbol or issuer"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.srOnly}>Filter by asset class</span>
                  <select className={styles.select} value={assetClass} onChange={(event) => setAssetClass(event.target.value)}>
                    <option value="ALL">All classes</option>
                    {availableClasses.map((item) => <option value={item} key={item}>{item}</option>)}
                  </select>
                </label>
                {query || assetClass !== "ALL" ? (
                  <button
                    className={styles.buttonQuiet}
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setAssetClass("ALL");
                    }}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={<MagnifyingGlassIcon size={25} />}
                title="No matching markets"
                description="Change the search or asset-class filter. The source response is intact."
              />
            ) : (
              <div className={styles.panel}>
                {rows.map(({ quote, asset }) =>
                  asset ? (
                    <MarketRow key={quote.assetId} quote={quote} asset={asset} />
                  ) : (
                    <MarketRow key={quote.assetId} quote={quote} />
                  ),
                )}
              </div>
            )}
          </section>

          <section className={styles.section} aria-labelledby="asset-catalog-title">
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Asset passports</p>
                <h2 id="asset-catalog-title">Know what sits behind a symbol.</h2>
              </div>
              <p>Risk, liquidity, restrictions, and source provenance are catalog facts, not fields invented by the interface.</p>
            </div>
            <div className={styles.assetCatalog}>
              {assets.map((asset) => (
                <Link className={styles.assetCatalogRow} href={`/assets/${asset.id}`} key={asset.id}>
                  <div className={styles.assetCatalogIdentity}>
                    <strong>{asset.symbol}</strong>
                    <span>{asset.name} / {asset.issuerName}</span>
                  </div>
                  <span className={styles.badge}>{asset.assetClass}</span>
                  <ModeBadge mode={asset.dataMode} />
                  <div className={styles.assetRisk}>
                    <span>Risk</span>
                    <strong>{asset.risk ? `${asset.risk.score}/100` : "Not analyzed"}</strong>
                  </div>
                  <ArrowRightIcon size={18} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MarketRow({ quote, asset }: { quote: RwaMarketQuote; asset?: RwaAsset }) {
  const statusTone = quote.status === "OPEN" ? styles.success : quote.status === "HALTED" ? styles.warning : "";
  return (
    <article className={styles.marketRow}>
      <div className={styles.marketIdentity}>
        <strong>{asset?.symbol ?? quote.assetId}</strong>
        <span>{asset?.name ?? "Catalog metadata unavailable"} / {quote.provider}</span>
      </div>
      <div className={styles.marketValue}>
        <span>Price</span>
        {formatPrice(quote.price)}
      </div>
      <div className={styles.marketValue}>
        <span>Freshness</span>
        {formatFreshness(quote.ageSeconds)}
      </div>
      <div className={styles.inline}>
        <span className={`${styles.status} ${statusTone}`}>{quote.status}</span>
        {asset ? (
          <Link className={styles.textButton} href={`/assets/${asset.id}`} aria-label={`Open ${asset.symbol} passport`}>
            <TrendUpIcon size={15} />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
