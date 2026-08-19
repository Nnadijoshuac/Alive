"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSearchIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { publiclySelectableChains, type AssetClass, type BackingType } from "@alive/shared";
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
import { EXPLORE_PAGE_SIZE, getPaginationItems } from "@/lib/pagination";
import { AssetTable } from "./asset-table";
import styles from "./explore.module.css";

export { EXPLORE_PAGE_SIZE, getPaginationItems };

const VERIFICATION_FILTERS = ["ALL", "VERIFIED", "NOT_ANALYZED", "UNVERIFIED"] as const;
const VERIFICATION_LABELS: Record<(typeof VERIFICATION_FILTERS)[number], string> = {
  ALL: "All verification states",
  VERIFIED: "Verified",
  NOT_ANALYZED: "Not analyzed",
  UNVERIFIED: "Unverified",
};

const MARKET_DATA_FILTERS = ["ALL", "LIVE", "AVAILABLE", "UNAVAILABLE"] as const;
const MARKET_DATA_LABELS: Record<(typeof MARKET_DATA_FILTERS)[number], string> = {
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
function marketDataBucket(summary: AssetSummary): (typeof MARKET_DATA_FILTERS)[number] {
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

/**
 * Computes compact pagination page numbers and ellipses.
 * Examples:
 * - Total <= 7: [1, 2, 3] or [1, 2, 3, 4, 5, 6, 7]
 * - Beginning: [1, 2, 3, "…", 18]
 * - Middle: [1, "…", 8, 9, 10, "…", 18]
 * - End: [1, "…", 16, 17, 18]
 */
export function getPaginationItems(currentPage: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // Beginning: 1 2 3 … 18
  if (currentPage <= 3) {
    return [1, 2, 3, "…", totalPages];
  }

  // End: 1 … 16 17 18
  if (currentPage >= totalPages - 2) {
    return [1, "…", totalPages - 2, totalPages - 1, totalPages];
  }

  // Middle: 1 … 8 9 10 … 18
  return [1, "…", currentPage - 1, currentPage, currentPage + 1, "…", totalPages];
}

export function ExplorePage() {
  const [summaries, setSummaries] = useState<AssetSummary[]>();
  const [query, setQuery] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("ALL");
  const [assetClassFilter, setAssetClassFilter] = useState<AssetClass | "ALL">("ALL");
  const [issuerFilter, setIssuerFilter] = useState<string>("ALL");
  const [verificationFilter, setVerificationFilter] =
    useState<(typeof VERIFICATION_FILTERS)[number]>("ALL");
  const [marketDataFilter, setMarketDataFilter] =
    useState<(typeof MARKET_DATA_FILTERS)[number]>("ALL");
  const [backingFilter, setBackingFilter] = useState<string>("ALL");
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  useEffect(() => {
    setWatchedIds(new Set(getWatchlist()));
    listAssetSummaries()
      .then(setSummaries)
      .catch(() => setSummaries([]));
    function onChange() {
      setWatchedIds(new Set(getWatchlist()));
    }
    window.addEventListener("alive:watchlist-changed", onChange);
    return () => window.removeEventListener("alive:watchlist-changed", onChange);
  }, []);

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
      if (chainFilter !== "ALL" && !verifiedChains(asset).includes(chainFilter)) return false;
      if (assetClassFilter !== "ALL" && asset.assetClass !== assetClassFilter) return false;
      if (issuerFilter !== "ALL" && asset.issuerName !== issuerFilter) return false;
      if (
        verificationFilter !== "ALL" &&
        verificationStatus(summary) !== (verificationFilter as VerificationStatus)
      ) {
        return false;
      }
      if (marketDataFilter !== "ALL" && marketDataBucket(summary) !== marketDataFilter) {
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
        const haystack = `${asset.symbol} ${asset.name} ${asset.issuerName} ${asset.assetClass} ${(asset.deployments ?? []).map((d) => d.contractAddress).join(" ")}`.toLowerCase();
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / EXPLORE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedSummaries = useMemo(() => {
    const start = (safePage - 1) * EXPLORE_PAGE_SIZE;
    return filtered.slice(start, start + EXPLORE_PAGE_SIZE);
  }, [filtered, safePage]);

  const isXLayerZeroState = chainFilter === "X Layer" && summaries && filtered.length === 0;

  return (
    <div className={styles.page}>
      <div>
        <p className={styles.eyebrow}>Explore</p>
        <h1 className={styles.heading}>The real RWA universe ALIVE has indexed.</h1>
        <p className={styles.subheading}>
          Search by symbol, product, issuer, category, or contract address. Filter by chain,
          asset class, issuer, backing, verification, and market data.
        </p>
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
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search all indexed RWAs"
          />
        </div>
        <select
          value={chainFilter}
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
        <select
          value={assetClassFilter}
          onChange={(event) => setAssetClassFilter(event.target.value as AssetClass | "ALL")}
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
          value={verificationFilter}
          onChange={(event) =>
            setVerificationFilter(event.target.value as (typeof VERIFICATION_FILTERS)[number])
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
          value={marketDataFilter}
          onChange={(event) =>
            setMarketDataFilter(event.target.value as (typeof MARKET_DATA_FILTERS)[number])
          }
          aria-label="Filter by market data availability"
        >
          {MARKET_DATA_FILTERS.map((status) => (
            <option key={status} value={status}>
              {MARKET_DATA_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      {chainFilter !== "ALL" ? (
        <p className={styles.resultSummary}>
          {chainFilter.toUpperCase()} -- indexed verified deployments: {filtered.length}
        </p>
      ) : null}

      {isXLayerZeroState ? (
        <div className={styles.emptyState}>
          <AliveIconTile icon={FileSearchIcon} tone="muted" />
          <p>No verified X Layer RWA deployments are indexed yet.</p>
          <p className={styles.emptyStateSub}>ALIVE is actively indexing X Layer.</p>
        </div>
      ) : (
        <div className={styles.tableCard}>
          <AssetTable
            summaries={paginatedSummaries}
            emptyLabel={summaries ? "No assets match these filters." : "Loading…"}
            watchedIds={watchedIds}
            onToggleWatch={(assetId) => toggleWatch(assetId)}
          />
          {filtered.length > EXPLORE_PAGE_SIZE ? (
            <nav className={styles.paginationRow} aria-label="Explore assets pagination">
              <span className={styles.paginationInfo}>
                Showing {(safePage - 1) * EXPLORE_PAGE_SIZE + 1}–
                {Math.min(safePage * EXPLORE_PAGE_SIZE, filtered.length)} of {filtered.length}
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
