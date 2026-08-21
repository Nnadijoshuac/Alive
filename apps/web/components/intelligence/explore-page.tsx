"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSearchIcon, Search01Icon } from "@hugeicons/core-free-icons";
import {
  publiclySelectableChains,
  type AssetClass,
  type BackingType,
} from "@alive/shared";
import { AliveIcon, AliveIconTile } from "@/components/ui/alive-icon";
import {
  dataStatus,
  listAssetSummaries,
  verificationStatus,
  verifiedChains,
  type AssetSummary,
  type VerificationStatus,
} from "@/lib/asset-intelligence-summary";
import { getWatchlist, toggleWatch } from "@/lib/watchlist-state";
import {
  EXPLORE_PAGE_SIZE,
  getPaginationItems,
} from "@/lib/explore-pagination";
import { AssetTable } from "./asset-table";
import styles from "./explore.module.css";

const VERIFICATION_FILTERS = [
  "ALL",
  "VERIFIED",
  "NOT_ANALYZED",
  "UNVERIFIED",
] as const;
const VERIFICATION_LABELS: Record<
  (typeof VERIFICATION_FILTERS)[number],
  string
> = {
  ALL: "All verification states",
  VERIFIED: "Verified",
  NOT_ANALYZED: "Not analyzed",
  UNVERIFIED: "Unverified",
};

const MARKET_DATA_FILTERS = [
  "ALL",
  "LIVE",
  "AVAILABLE",
  "UNAVAILABLE",
] as const;
const MARKET_DATA_LABELS: Record<(typeof MARKET_DATA_FILTERS)[number], string> =
  {
    ALL: "All market data",
    LIVE: "Live",
    AVAILABLE: "Available",
    UNAVAILABLE: "Unavailable",
  };

const BACKING_FILTERS = ["ALL", "UNCLASSIFIED"] as const;
const BACKING_TYPES: BackingType[] = [
  "DIRECT_CLAIM",
  "RESERVE_BACKED",
  "COLLATERAL_BACKED",
  "FUND_SHARE",
  "DEBT_CLAIM",
  "SYNTHETIC_EXPOSURE",
  "HYBRID",
  "UNKNOWN",
];

/** LIVE/AVAILABLE/UNAVAILABLE mapped onto the existing DataStatus enum -- "DEMO" is the generic "some real, non-live-monitored source" bucket, never actually reachable for today's real catalog, kept as an option so the architecture doesn't need to change again once one exists. */
function marketDataBucket(
  summary: AssetSummary,
): (typeof MARKET_DATA_FILTERS)[number] {
  const status = dataStatus(summary);
  if (status === "LIVE") return "LIVE";
  if (status === "DEMO") return "AVAILABLE";
  return "UNAVAILABLE";
}

// X Layer mandate §1: the chain filter is always seeded from ALIVE's own
// canonical chain registry, never derived solely from which chains the
// catalog currently happens to have deployments on -- X Layer must never
// disappear from the product merely because a given catalog snapshot has
// zero (or, as of this pass, seven) verified deployments there.
const REGISTRY_CHAIN_NAMES = publiclySelectableChains().map((c) => c.chainName);

export function ExplorePage() {
  const [summaries, setSummaries] = useState<AssetSummary[]>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("ALL");
  const [assetClassFilter, setAssetClassFilter] = useState<AssetClass | "ALL">(
    "ALL",
  );
  const [issuerFilter, setIssuerFilter] = useState<string>("ALL");
  const [verificationFilter, setVerificationFilter] =
    useState<(typeof VERIFICATION_FILTERS)[number]>("ALL");
  const [marketDataFilter, setMarketDataFilter] =
    useState<(typeof MARKET_DATA_FILTERS)[number]>("ALL");
  const [backingFilter, setBackingFilter] = useState<string>("ALL");
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const loadSummaries = useCallback(() => {
    setSummaries(undefined);
    setLoadError(null);
    listAssetSummaries()
      .then((result) => {
        setSummaries(result);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        setSummaries([]);
        setLoadError(
          error instanceof Error
            ? error.message
            : "The asset catalog could not be loaded.",
        );
      });
  }, []);

  useEffect(() => {
    setWatchedIds(new Set(getWatchlist()));
    loadSummaries();
    function onChange() {
      setWatchedIds(new Set(getWatchlist()));
    }
    window.addEventListener("alive:watchlist-changed", onChange);
    return () =>
      window.removeEventListener("alive:watchlist-changed", onChange);
  }, [loadSummaries]);

  // Chains: the full registry (X Layer always included), plus any
  // additional chain a real deployment turns up that isn't registered yet
  // -- never fewer than the registry, only ever more.
  const chains = useMemo(() => {
    const set = new Set<string>(REGISTRY_CHAIN_NAMES);
    for (const summary of summaries ?? []) {
      for (const chain of verifiedChains(summary.asset)) set.add(chain);
    }
    return Array.from(set).sort();
  }, [summaries]);

  const assetClasses = useMemo(() => {
    const set = new Set<AssetClass>();
    for (const summary of summaries ?? []) set.add(summary.asset.assetClass);
    return Array.from(set).sort();
  }, [summaries]);

  const issuers = useMemo(() => {
    const set = new Set<string>();
    for (const summary of summaries ?? []) set.add(summary.asset.issuerName);
    return Array.from(set).sort();
  }, [summaries]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (summaries ?? []).filter((summary) => {
      const { asset } = summary;
      if (chainFilter !== "ALL" && !verifiedChains(asset).includes(chainFilter))
        return false;
      if (assetClassFilter !== "ALL" && asset.assetClass !== assetClassFilter)
        return false;
      if (issuerFilter !== "ALL" && asset.issuerName !== issuerFilter)
        return false;
      if (
        verificationFilter !== "ALL" &&
        verificationStatus(summary) !==
          (verificationFilter as VerificationStatus)
      ) {
        return false;
      }
      if (
        marketDataFilter !== "ALL" &&
        marketDataBucket(summary) !== marketDataFilter
      ) {
        return false;
      }
      if (backingFilter === "UNCLASSIFIED" && asset.backing) return false;
      if (
        backingFilter !== "ALL" &&
        backingFilter !== "UNCLASSIFIED" &&
        asset.backing?.backingType !== backingFilter
      ) {
        return false;
      }
      if (needle) {
        const haystack =
          `${asset.symbol} ${asset.name} ${asset.issuerName} ${asset.assetClass} ${(asset.deployments ?? []).map((d) => d.contractAddress).join(" ")}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [
    summaries,
    chainFilter,
    assetClassFilter,
    issuerFilter,
    verificationFilter,
    marketDataFilter,
    backingFilter,
    query,
  ]);

  // Reset page to 1 whenever any filter or search query changes
  useEffect(() => {
    setPage(1);
  }, [
    query,
    chainFilter,
    assetClassFilter,
    issuerFilter,
    verificationFilter,
    marketDataFilter,
    backingFilter,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / EXPLORE_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);

  const paginatedSummaries = useMemo(() => {
    const start = (safePage - 1) * EXPLORE_PAGE_SIZE;
    return filtered.slice(start, start + EXPLORE_PAGE_SIZE);
  }, [filtered, safePage]);

  const isXLayerZeroState =
    chainFilter === "X Layer" && summaries && filtered.length === 0;
  const advancedFilterCount = [
    assetClassFilter,
    issuerFilter,
    backingFilter,
    verificationFilter,
    marketDataFilter,
  ].filter((value) => value !== "ALL").length;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Asset index</p>
          <h1 className={styles.heading}>Inspect the indexed RWA universe.</h1>
          <p className={styles.subheading}>
            Compare identity, backing, deployment, verification, eligibility,
            and market-data coverage without treating a catalog entry as an
            approval.
          </p>
        </div>
        <div className={styles.indexLedger}>
          <span>Current catalog</span>
          <strong>{summaries?.length ?? "UNKNOWN"}</strong>
          <small>
            {summaries === undefined
              ? "Loading records"
              : "Indexed asset records"}
          </small>
        </div>
      </header>

      <section
        className={styles.filterPanel}
        aria-labelledby="catalog-filters-title"
      >
        <div className={styles.filterHeader}>
          <div>
            <span>Query controls</span>
            <h2 id="catalog-filters-title">Filter the evidence set</h2>
          </div>
          <output aria-live="polite">
            {summaries === undefined
              ? "Loading"
              : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
          </output>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.searchBox}>
            <AliveIcon icon={Search01Icon} size="md" tone="muted" />
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              placeholder="Search symbol, product, issuer, category, or contract address"
              value={query}
              disabled={summaries === undefined}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search all indexed RWAs"
            />
          </div>
          <select
            value={chainFilter}
            disabled={summaries === undefined}
            onChange={(event) => setChainFilter(event.target.value)}
            aria-label="Filter by chain"
          >
            <option value="ALL">All chains</option>
            {chains.map((chain) => (
              <option key={chain} value={chain}>
                {chain}
              </option>
            ))}
          </select>
        </div>

        <details className={styles.filterDisclosure}>
          <summary>
            More filters
            {advancedFilterCount > 0 ? (
              <span>{advancedFilterCount} applied</span>
            ) : null}
          </summary>
          <div className={styles.advancedFilters}>
            <select
              disabled={summaries === undefined}
              value={assetClassFilter}
              onChange={(event) =>
                setAssetClassFilter(event.target.value as AssetClass | "ALL")
              }
              aria-label="Filter by asset class"
            >
              <option value="ALL">All asset classes</option>
              {assetClasses.map((assetClass) => (
                <option key={assetClass} value={assetClass}>
                  {assetClass}
                </option>
              ))}
            </select>
            <select
              disabled={summaries === undefined}
              value={issuerFilter}
              onChange={(event) => setIssuerFilter(event.target.value)}
              aria-label="Filter by issuer"
            >
              <option value="ALL">All issuers</option>
              {issuers.map((issuer) => (
                <option key={issuer} value={issuer}>
                  {issuer}
                </option>
              ))}
            </select>
            <select
              disabled={summaries === undefined}
              value={backingFilter}
              onChange={(event) => setBackingFilter(event.target.value)}
              aria-label="Filter by backing classification"
            >
              <option value="ALL">All backing types</option>
              {BACKING_FILTERS.filter((v) => v !== "ALL").map((v) => (
                <option key={v} value={v}>
                  Unclassified
                </option>
              ))}
              {BACKING_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              disabled={summaries === undefined}
              value={verificationFilter}
              onChange={(event) =>
                setVerificationFilter(
                  event.target.value as (typeof VERIFICATION_FILTERS)[number],
                )
              }
              aria-label="Filter by verification status"
            >
              {VERIFICATION_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {VERIFICATION_LABELS[status]}
                </option>
              ))}
            </select>
            <select
              disabled={summaries === undefined}
              value={marketDataFilter}
              onChange={(event) =>
                setMarketDataFilter(
                  event.target.value as (typeof MARKET_DATA_FILTERS)[number],
                )
              }
              aria-label="Filter by market data availability"
            >
              {MARKET_DATA_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {MARKET_DATA_LABELS[status]}
                </option>
              ))}
            </select>
            {advancedFilterCount > 0 ? (
              <button
                type="button"
                className={styles.clearFilters}
                onClick={() => {
                  setAssetClassFilter("ALL");
                  setIssuerFilter("ALL");
                  setBackingFilter("ALL");
                  setVerificationFilter("ALL");
                  setMarketDataFilter("ALL");
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </details>
      </section>

      {chainFilter !== "ALL" ? (
        <p className={styles.resultSummary}>
          {chainFilter.toUpperCase()} -- indexed verified deployments:{" "}
          {filtered.length}
        </p>
      ) : null}

      {loadError ? (
        <div className={styles.errorState} role="alert">
          <strong>Asset catalog unavailable</strong>
          <span>{loadError}</span>
          <button type="button" onClick={loadSummaries}>
            Try again
          </button>
        </div>
      ) : isXLayerZeroState ? (
        <div className={styles.emptyState}>
          <AliveIconTile icon={FileSearchIcon} tone="muted" />
          <p>No verified X Layer RWA deployments are indexed yet.</p>
          <p className={styles.emptyStateSub}>
            This reflects the currently loaded catalog snapshot.
          </p>
        </div>
      ) : (
        <div className={styles.tableCard}>
          <AssetTable
            summaries={paginatedSummaries}
            loading={summaries === undefined}
            emptyLabel={
              summaries ? "No assets match these filters." : "Loading…"
            }
            watchedIds={watchedIds}
            onToggleWatch={(assetId) => toggleWatch(assetId)}
          />
          {filtered.length > EXPLORE_PAGE_SIZE ? (
            <nav
              className={styles.paginationRow}
              aria-label="Explore assets pagination"
            >
              <span className={styles.paginationInfo}>
                Showing {(safePage - 1) * EXPLORE_PAGE_SIZE + 1} to{" "}
                {Math.min(safePage * EXPLORE_PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.pageNavButton}
                  disabled={safePage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  ←
                </button>
                {getPaginationItems(safePage, totalPages).map((item, idx) =>
                  item === "…" ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className={styles.paginationEllipsis}
                      aria-hidden="true"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      className={styles.pageButton}
                      aria-current={item === safePage ? "page" : undefined}
                      aria-label={`Page ${item}`}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className={styles.pageNavButton}
                  disabled={safePage === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  →
                </button>
              </div>
            </nav>
          ) : null}
        </div>
      )}
    </div>
  );
}
