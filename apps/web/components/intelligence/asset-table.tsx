"use client";

import { useRouter } from "next/navigation";
import { StarIcon } from "@phosphor-icons/react";
import {
  dataStatus,
  eligibilityStatus,
  verificationStatus,
  type AssetSummary,
} from "@/lib/asset-intelligence-summary";
import { formatPrice, formatRelativeAgo } from "@/lib/rwa-format";
import styles from "./asset-table.module.css";

function verificationPill(summary: AssetSummary) {
  return verificationStatus(summary) === "VERIFIED" ? (
    <span className={styles.pillEligible}>VERIFIED</span>
  ) : (
    <span className={styles.pillUnknown}>UNVERIFIED</span>
  );
}

function eligibilityPill(summary: AssetSummary) {
  const status = eligibilityStatus(summary);
  if (status === "ELIGIBLE") return <span className={styles.pillEligible}>ELIGIBLE</span>;
  if (status === "RESTRICTED")
    return <span className={styles.pillRestricted}>RESTRICTED</span>;
  return <span className={styles.pillUnknown}>NOT EVALUATED</span>;
}

function dataPill(summary: AssetSummary) {
  const status = dataStatus(summary);
  if (status === "LIVE") return <span className={styles.pillEligible}>LIVE</span>;
  if (status === "DEMO") return <span className={styles.pillUnknown}>DEMO</span>;
  return <span className={styles.pillUnknown}>UNAVAILABLE</span>;
}

export function AssetTable({
  summaries,
  emptyLabel = "No assets to show.",
  watchedIds,
  onToggleWatch,
}: {
  summaries: AssetSummary[];
  emptyLabel?: string;
  watchedIds?: Set<string>;
  onToggleWatch?: (assetId: string) => void;
}) {
  const router = useRouter();

  if (summaries.length === 0) {
    return <div className={styles.empty}>{emptyLabel}</div>;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {onToggleWatch ? <th aria-label="Watch" /> : null}
          <th>Asset</th>
          <th>Type</th>
          <th>Issuer</th>
          <th>Value</th>
          <th>Verification</th>
          <th>Eligibility</th>
          <th>Data</th>
          <th>Last checked</th>
        </tr>
      </thead>
      <tbody>
        {summaries.map((summary) => (
          <tr
            key={summary.asset.id}
            className={styles.row}
            onClick={() => router.push(`/assets/${summary.asset.id}`)}
          >
            {onToggleWatch ? (
              <td
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleWatch(summary.asset.id);
                }}
              >
                <button
                  type="button"
                  className={styles.watchButton}
                  aria-label={
                    watchedIds?.has(summary.asset.id)
                      ? `Remove ${summary.asset.symbol} from watchlist`
                      : `Add ${summary.asset.symbol} to watchlist`
                  }
                >
                  <StarIcon
                    size={15}
                    weight={watchedIds?.has(summary.asset.id) ? "fill" : "regular"}
                  />
                </button>
              </td>
            ) : null}
            <td>
              <div className={styles.assetCell}>
                <span className={styles.symbol}>{summary.asset.symbol}</span>
                <span className={styles.assetName}>{summary.asset.name}</span>
              </div>
            </td>
            <td className={styles.muted}>{summary.asset.assetClass}</td>
            <td className={styles.muted}>{summary.asset.issuerName}</td>
            <td className={styles.value}>
              {summary.quote ? formatPrice(summary.quote.price) : "—"}
            </td>
            <td>{verificationPill(summary)}</td>
            <td>{eligibilityPill(summary)}</td>
            <td>{dataPill(summary)}</td>
            <td className={styles.muted}>
              {summary.verdict ? formatRelativeAgo(summary.verdict.evaluatedAt) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
