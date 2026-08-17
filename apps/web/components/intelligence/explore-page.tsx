"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssetClass } from "@alive/shared";
import { listAssetSummaries, type AssetSummary } from "@/lib/asset-intelligence-summary";
import { getWatchlist, toggleWatch } from "@/lib/watchlist-state";
import { AssetTable } from "./asset-table";
import styles from "./overview.module.css";
import filterStyles from "./explore.module.css";

const VERIFICATION_FILTERS = ["ALL", "ELIGIBLE", "RESTRICTED", "UNKNOWN"] as const;

export function ExplorePage() {
  const [summaries, setSummaries] = useState<AssetSummary[]>();
  const [assetClassFilter, setAssetClassFilter] = useState<AssetClass | "ALL">("ALL");
  const [statusFilter, setStatusFilter] =
    useState<(typeof VERIFICATION_FILTERS)[number]>("ALL");
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

  const assetClasses = useMemo(() => {
    const set = new Set<AssetClass>();
    for (const summary of summaries ?? []) set.add(summary.asset.assetClass);
    return Array.from(set).sort();
  }, [summaries]);

  const filtered = useMemo(() => {
    return (summaries ?? []).filter((summary) => {
      if (assetClassFilter !== "ALL" && summary.asset.assetClass !== assetClassFilter) {
        return false;
      }
      if (statusFilter !== "ALL") {
        const status = summary.verdict?.status ?? "UNKNOWN";
        if (status !== statusFilter) return false;
      }
      return true;
    });
  }, [summaries, assetClassFilter, statusFilter]);

  return (
    <div className={styles.page}>
      <div>
        <p className={styles.eyebrow}>Explore</p>
        <h1 className={styles.heading}>Discover tokenized real-world assets.</h1>
        <p className={styles.subheading}>
          Filter by asset class and current ALIVE verification status.
        </p>
      </div>

      <div className={filterStyles.filterRow}>
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
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as (typeof VERIFICATION_FILTERS)[number])
          }
          aria-label="Filter by verification status"
        >
          {VERIFICATION_FILTERS.map((status) => (
            <option key={status} value={status}>
              {status === "ALL" ? "All statuses" : status}
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
