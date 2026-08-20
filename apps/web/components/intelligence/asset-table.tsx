"use client";

import { useRouter } from "next/navigation";
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
  if (!backing) return <span className={styles.muted}>—</span>;
  return <span className={styles.backingBadge}>{backing.backingType.replaceAll("_", " ")}</span>;
}

function chainBadges(summary: AssetSummary) {
  const chains = verifiedChains(summary.asset);
  if (chains.length === 0) return <span className={styles.muted}>—</span>;
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
  if (status === "VERIFIED") return <span className={styles.pillEligible}>VERIFIED</span>;
  if (status === "NOT_ANALYZED")
    return <span className={styles.pillUnknown}>NOT ANALYZED</span>;
  return <span className={styles.pillUnknown}>UNVERIFIED</span>;
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
        <thead>
          <tr>
            {onToggleWatch ? <th aria-label="Watch" className={styles.watchCol} /> : null}
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
            <tr
              key={summary.asset.id}
              className={styles.row}
              onClick={() => router.push(`/assets/${summary.asset.id}`)}
            >
              {onToggleWatch ? (
                <td
                  className={styles.watchCol}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleWatch(summary.asset.id);
                  }}
                >
                  <button
                    type="button"
                    className={styles.watchButton}
                    data-watched={watchedIds?.has(summary.asset.id) ? "true" : "false"}
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
              <td className={styles.assetCol}>
                <AssetIdentity asset={summary.asset} size={30} />
              </td>
              <td className={`${styles.muted} ${styles.typeCol}`}>{summary.asset.assetClass}</td>
              <td className={styles.issuerCol}>
                <span className={styles.issuer} title={summary.asset.issuerName}>
                  {summary.asset.issuerName}
                </span>
              </td>
              <td className={styles.backingCol}>{backingLabel(summary)}</td>
              <td className={styles.chainsCol}>{chainBadges(summary)}</td>
              <td className={`${styles.value} ${styles.valueCol}`}>
                {summary.quote ? formatPrice(summary.quote.price) : "—"}
              </td>
              <td className={styles.verificationCol}>{verificationPill(summary)}</td>
              <td className={styles.eligibilityCol}>{eligibilityPill(summary)}</td>
              <td className={styles.dataCol}>{dataPill(summary)}</td>
              <td className={`${styles.muted} ${styles.checkedCol}`}>
                {summary.verdict ? formatRelativeAgo(summary.verdict.evaluatedAt) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
