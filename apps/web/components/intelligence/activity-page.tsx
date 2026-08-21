"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BrowserIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { listActivity } from "@/lib/activity-log";
import { formatRelativeAgo, formatTimestamp } from "@/lib/rwa-format";
import styles from "./overview.module.css";
import activityStyles from "./activity.module.css";

interface ActivityItem {
  id: string;
  assetId: string;
  symbol: string;
  action: string;
  status: "ELIGIBLE" | "RESTRICTED" | "UNKNOWN";
  timestamp: string;
}

export function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const localItems = listActivity()
      .map((entry, index): ActivityItem => {
        const status: ActivityItem["status"] =
          entry.result === "ELIGIBLE" || entry.result === "RESTRICTED"
            ? entry.result
            : "UNKNOWN";
        return {
          id: `${entry.assetId}-${entry.timestamp}-${index}`,
          assetId: entry.assetId,
          symbol: entry.symbol,
          action: entry.action,
          status,
          timestamp: entry.timestamp,
        };
      })
      .sort(
        (left, right) =>
          new Date(right.timestamp).getTime() -
          new Date(left.timestamp).getTime(),
      );
    setItems(localItems);
    setHydrated(true);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Activity</p>
          <h1 className={styles.heading}>
            Review what this browser actually checked.
          </h1>
          <p className={styles.subheading}>
            Only verification checks completed here appear in this record. It is
            not a backend monitor, wallet ledger, or onchain transaction feed.
          </p>
        </div>
        <div className={styles.methodLedger}>
          <span>Record boundary</span>
          <ol>
            <li>
              <b>{hydrated ? items.length : "UNKNOWN"}</b>
              <small>Local checks</small>
            </li>
            <li>
              <b>Browser</b>
              <small>Storage scope</small>
            </li>
            <li>
              <b>No</b>
              <small>Synthetic events</small>
            </li>
          </ol>
        </div>
      </header>

      <div className={activityStyles.originNotice} role="note">
        <BrowserIcon size={17} aria-hidden="true" />
        <div>
          <strong>Browser-local record</strong>
          <span>
            Clearing site data removes this history. Onchain outcomes appear
            only when a real transaction exists.
          </span>
        </div>
      </div>

      {!hydrated ? (
        <div className={styles.analysisPanel} role="status">
          Reading browser-local activity…
        </div>
      ) : items.length > 0 ? (
        <section aria-labelledby="verification-history-title">
          <div className={activityStyles.listHeader}>
            <h2 id="verification-history-title">Verification checks</h2>
            <span>{items.length} recorded</span>
          </div>
          <ul className={activityStyles.list}>
            {items.map((item) => (
              <li className={activityStyles.item} key={item.id}>
                <div className={activityStyles.itemMain}>
                  <span className={activityStyles.iconCol} aria-hidden="true">
                    <ShieldCheckIcon size={17} />
                  </span>
                  <div className={activityStyles.itemCopy}>
                    <Link
                      href={`/assets/${item.assetId}`}
                      className={activityStyles.titleLink}
                    >
                      {item.symbol}
                      <ArrowRightIcon size={13} aria-hidden="true" />
                    </Link>
                    <span>{item.action} · Browser local</span>
                  </div>
                </div>
                <span className={activityStyles.result} data-tone={item.status}>
                  {item.status}
                </span>
                <time
                  className={activityStyles.timestamp}
                  dateTime={item.timestamp}
                  title={formatTimestamp(item.timestamp)}
                >
                  {formatRelativeAgo(item.timestamp)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className={activityStyles.emptyState}>
          <ShieldCheckIcon size={22} aria-hidden="true" />
          <div>
            <h2>No verification checks yet</h2>
            <p>
              Choose an asset and run its sourced eligibility check. The result
              will appear here.
            </p>
          </div>
          <Link href="/overview">
            Verify an asset
            <ArrowRightIcon size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
