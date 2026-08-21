"use client";

import Link from "next/link";
import { FileSearchIcon, StarIcon } from "@hugeicons/core-free-icons";
import { AliveIcon, AliveIconTile } from "@/components/ui/alive-icon";
import {
  dataStatus,
  eligibilityStatus,
  verificationStatus,
  verifiedChains,
  type AssetSummary,
} from "@/lib/asset-intelligence-summary";
import { formatPrice, formatRelativeAgo } from "@/lib/rwa-format";
import { AssetIdentity } from "./asset-identity";
import styles from "./asset-table.module.css";

function backingLabel(summary: AssetSummary) {
  const backing = summary.asset.backing;
  if (!backing) return <span className={styles.muted}>UNKNOWN</span>;
  return (
    <span className={styles.backingBadge}>
      {backing.backingType.replaceAll("_", " ")}
    </span>
  );
}

function chainBadges(summary: AssetSummary) {
  const chains = verifiedChains(summary.asset);
  if (chains.length === 0) return <span className={styles.muted}>UNKNOWN</span>;
  return (
    <span className={styles.chainBadges}>
      {chains.map((chain) => (
        <span className={styles.chainBadge} key={chain}>
          {chain}
        </span>
      ))}
    </span>
  );
}

function verificationPill(summary: AssetSummary) {
  const status = verificationStatus(summary);
  if (status === "VERIFIED")
    return <span className={styles.pillEligible}>VERIFIED</span>;
  if (status === "NOT_ANALYZED")
    return <span className={styles.pillUnknown}>NOT ANALYZED</span>;
  return <span className={styles.pillUnknown}>UNVERIFIED</span>;
}

function eligibilityPill(summary: AssetSummary) {
  const status = eligibilityStatus(summary);
  if (status === "ELIGIBLE")
    return <span className={styles.pillEligible}>ELIGIBLE</span>;
  if (status === "RESTRICTED")
    return <span className={styles.pillRestricted}>RESTRICTED</span>;
  return <span className={styles.pillUnknown}>NOT EVALUATED</span>;
}

function dataPill(summary: AssetSummary) {
  const status = dataStatus(summary);
  if (status === "LIVE")
    return <span className={styles.pillEligible}>LIVE</span>;
  if (status === "DEMO")
    return <span className={styles.pillUnknown}>DEMO</span>;
  return <span className={styles.pillUnknown}>UNAVAILABLE</span>;
}

export function AssetTable({
  summaries,
  emptyLabel = "No assets to show.",
  loading = false,
  watchedIds,
  onToggleWatch,
}: {
  summaries: AssetSummary[];
  emptyLabel?: string;
  loading?: boolean;
  watchedIds?: Set<string>;
  onToggleWatch?: (assetId: string) => void;
}) {
  if (loading) {
    return (
      <div className={styles.loadingState} role="status" aria-live="polite">
        <span>Loading current asset records</span>
        <div className={styles.loadingRows} aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className={styles.empty}>
        <AliveIconTile icon={FileSearchIcon} tone="muted" />
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>
          Indexed assets and their current verification state
        </caption>
        <thead>
          <tr>
            {onToggleWatch ? (
              <th aria-label="Watch" className={styles.watchCol} />
            ) : null}
            <th className={styles.assetCol}>Asset</th>
            <th className={styles.typeCol}>Type</th>
            <th className={styles.issuerCol}>Issuer</th>
            <th className={styles.backingCol}>Backing</th>
            <th className={styles.chainsCol}>Chains</th>
            <th className={styles.valueCol}>Value</th>
            <th className={styles.verificationCol}>Verification</th>
            <th className={styles.eligibilityCol}>Eligibility</th>
            <th className={styles.dataCol}>Data</th>
            <th className={styles.checkedCol}>Last checked</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((summary) => (
            <tr key={summary.asset.id} className={styles.row}>
              {onToggleWatch ? (
                <td className={styles.watchCol}>
                  <button
                    type="button"
                    className={styles.watchButton}
                    onClick={() => onToggleWatch(summary.asset.id)}
                    data-watched={
                      watchedIds?.has(summary.asset.id) ? "true" : "false"
                    }
                    aria-label={
                      watchedIds?.has(summary.asset.id)
                        ? `Remove ${summary.asset.symbol} from watchlist`
                        : `Add ${summary.asset.symbol} to watchlist`
                    }
                  >
                    <AliveIcon icon={StarIcon} size="sm" />
                  </button>
                </td>
              ) : null}
              <td className={styles.assetCol} data-label="Asset">
                <Link
                  className={styles.assetLink}
                  href={`/assets/${summary.asset.id}`}
                  aria-label={`Open ${summary.asset.symbol} asset passport`}
                >
                  <AssetIdentity asset={summary.asset} size={30} />
                </Link>
              </td>
              <td
                className={`${styles.muted} ${styles.typeCol}`}
                data-label="Type"
              >
                {summary.asset.assetClass}
              </td>
              <td className={styles.issuerCol} data-label="Issuer">
                <span
                  className={styles.issuer}
                  title={summary.asset.issuerName}
                >
                  {summary.asset.issuerName}
                </span>
              </td>
              <td className={styles.backingCol} data-label="Backing">
                {backingLabel(summary)}
              </td>
              <td className={styles.chainsCol} data-label="Chains">
                {chainBadges(summary)}
              </td>
              <td
                className={`${styles.value} ${styles.valueCol}`}
                data-label="Value"
              >
                {summary.quote ? formatPrice(summary.quote.price) : "UNKNOWN"}
              </td>
              <td className={styles.verificationCol} data-label="Verification">
                {verificationPill(summary)}
              </td>
              <td className={styles.eligibilityCol} data-label="Eligibility">
                {eligibilityPill(summary)}
              </td>
              <td className={styles.dataCol} data-label="Data">
                {dataPill(summary)}
              </td>
              <td
                className={`${styles.muted} ${styles.checkedCol}`}
                data-label="Last checked"
              >
                {summary.verdict
                  ? formatRelativeAgo(summary.verdict.evaluatedAt)
                  : "UNKNOWN"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
