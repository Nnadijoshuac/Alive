"use client";

import { useEffect, useMemo, useState } from "react";
import { listAssetSummaries, type AssetSummary } from "@/lib/asset-intelligence-summary";
import { getWatchlist, toggleWatch } from "@/lib/watchlist-state";
import { AssetTable } from "./asset-table";
import styles from "./overview.module.css";

export function WatchlistPage() {
  const [summaries, setSummaries] = useState<AssetSummary[]>();
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

  const watched = useMemo(
    () => (summaries ?? []).filter((summary) => watchedIds.has(summary.asset.id)),
    [summaries, watchedIds],
  );

  return (
    <div className={styles.page}>
      <div>
        <p className={styles.eyebrow}>Watchlist</p>
        <h1 className={styles.heading}>Assets you&apos;re tracking.</h1>
        <p className={styles.subheading}>
          Stored in this browser only. Star an asset from Explore or here to add it.
        </p>
      </div>

      <div className={styles.tableCard}>
        <AssetTable
          summaries={watched}
          emptyLabel="Your watchlist is empty. Star an asset from Explore to add it here."
          watchedIds={watchedIds}
          onToggleWatch={(assetId) => toggleWatch(assetId)}
        />
      </div>
    </div>
  );
}
