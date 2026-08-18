"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssetClass } from "@alive/shared";
import {
  dataStatus,
  listAssetSummaries,
  verificationStatus,
  verifiedChains,
  type AssetSummary,
  type VerificationStatus,
} from "@/lib/asset-intelligence-summary";
import { getWatchlist, toggleWatch } from "@/lib/watchlist-state";
import { AssetTable } from "./asset-table";
import styles from "./overview.module.css";
import filterStyles from "./explore.module.css";

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

/** LIVE/AVAILABLE/UNAVAILABLE (directive §19, §44) mapped onto the existing DataStatus enum -- "DEMO" is the generic "some real, non-live-monitored source" bucket, never actually reachable for today's real catalog (no real asset has a non-Chainlink feed yet), kept as an option so the architecture doesn't need to change again once one exists. */
function marketDataBucket(summary: AssetSummary): (typeof MARKET_DATA_FILTERS)[number] {
  const status = dataStatus(summary);
  if (status === "LIVE") return "LIVE";
  if (status === "DEMO") return "AVAILABLE";
  return "UNAVAILABLE";
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
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());

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

  // Every filter option is seeded from what the catalog actually contains
  // (directive §7: "the UI should display only chains that currently have
  // relevant catalog entries") -- never a hardcoded chain/issuer list.
  const chains = useMemo(() => {
    const set = new Set<string>();
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
      if (needle) {
        const haystack = `${asset.symbol} ${asset.name} ${asset.issuerName} ${asset.assetClass} ${(asset.deployments ?? []).map((d) => d.contractAddress).join(" ")}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [summaries, chainFilter, assetClassFilter, issuerFilter, verificationFilter, marketDataFilter, query]);

  return (
    <div className={styles.page}>
      <div>
        <p className={styles.eyebrow}>Explore</p>
        <h1 className={styles.heading}>The real RWA universe ALIVE has indexed.</h1>
        <p className={styles.subheading}>
          Search by symbol, product, issuer, category, or contract address. Filter by chain,
          asset class, issuer, verification, and market data.
        </p>
      </div>

      <div className={filterStyles.filterRow}>
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          placeholder="Search symbol, product, issuer, category, or contract address"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search all indexed RWAs"
        />
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

      <div className={styles.tableCard}>
        <AssetTable
          summaries={filtered}
          emptyLabel={summaries ? "No assets match these filters." : "Loading…"}
          watchedIds={watchedIds}
          onToggleWatch={(assetId) => toggleWatch(assetId)}
        />
      </div>
    </div>
  );
}
