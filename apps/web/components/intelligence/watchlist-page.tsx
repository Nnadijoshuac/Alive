"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listAssetSummaries,
  type AssetSummary,
} from "@/lib/asset-intelligence-summary";
import { getWatchlist, toggleWatch } from "@/lib/watchlist-state";
import { AssetTable } from "./asset-table";
import styles from "./overview.module.css";

export function WatchlistPage() {
  const [summaries, setSummaries] = useState<AssetSummary[]>();
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string>();

  const loadSummaries = useCallback(() => {
    setSummaries(undefined);
    setLoadError(undefined);
    listAssetSummaries()
      .then(setSummaries)
      .catch((requestError: unknown) => {
        setSummaries([]);
        setLoadError(
          requestError instanceof Error
            ? requestError.message
            : "The watchlist catalog could not be loaded.",
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

  const watched = useMemo(
    () =>
      (summaries ?? []).filter((summary) => watchedIds.has(summary.asset.id)),
    [summaries, watchedIds],
  );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Watchlist</p>
          <h1 className={styles.heading}>
            Keep evidence-critical assets close.
          </h1>
          <p className={styles.subheading}>
            This list is stored in this browser only. Watching an asset does not
            verify it, approve it, or create an onchain position.
          </p>
        </div>
        <div className={styles.methodLedger}>
          <span>Browser-local list</span>
          <ol>
            <li>
              <b>{watched.length}</b>
              <small>Watched assets</small>
            </li>
            <li>
              <b>{summaries === undefined ? "Loading" : "Ready"}</b>
              <small>Catalog state</small>
            </li>
            <li>
              <b>Local</b>
              <small>Storage scope</small>
            </li>
          </ol>
        </div>
      </header>

      {loadError ? (
        <div className={styles.errorNote} role="alert">
          <strong>Watchlist data unavailable</strong>
          <span>{loadError}</span>
          <button
            className={styles.retryButton}
            type="button"
            onClick={loadSummaries}
          >
            Try again
          </button>
        </div>
      ) : summaries !== undefined && watched.length === 0 ? (
        <div className={styles.analysisPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelKicker}>No saved assets</span>
              <h2>Your watchlist is empty</h2>
            </div>
            <Link className={styles.exploreLink} href="/explore">
              Browse assets →
            </Link>
          </div>
          <p className={styles.subheading}>
            Star an indexed asset to keep its verification state within reach.
          </p>
        </div>
      ) : (
        <div className={styles.tableCard}>
          <AssetTable
            summaries={watched}
            loading={summaries === undefined}
            emptyLabel="Your watchlist is empty. Star an asset from Explore to add it here."
            watchedIds={watchedIds}
            onToggleWatch={(assetId) => toggleWatch(assetId)}
          />
        </div>
      )}
    </div>
  );
}
