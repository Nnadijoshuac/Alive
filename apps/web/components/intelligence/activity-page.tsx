"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listActivity, type ActivityEntry } from "@/lib/activity-log";
import { formatRelativeAgo, formatTimestamp } from "@/lib/rwa-format";
import styles from "./overview.module.css";
import activityStyles from "./activity.module.css";

export function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>();

  useEffect(() => {
    setEntries(listActivity());
  }, []);

  return (
    <div className={styles.page}>
      <div>
        <p className={styles.eyebrow}>Activity</p>
        <h1 className={styles.heading}>Recent verification activity.</h1>
        <p className={styles.subheading}>
          Recorded in this browser when you analyze an asset -- not a backend event feed.
        </p>
      </div>

      {entries && entries.length > 0 ? (
        <ul className={activityStyles.list}>
          {entries.map((entry, index) => (
            <li className={activityStyles.item} key={`${entry.assetId}-${entry.timestamp}-${index}`}>
              <div className={activityStyles.itemMain}>
                <Link href={`/assets/${entry.assetId}`}>{entry.symbol}</Link>
                <span>{entry.action}</span>
                <span className={activityStyles.result} data-tone={entry.result}>
                  {entry.result}
                </span>
              </div>
              <span
                className={activityStyles.timestamp}
                title={formatTimestamp(entry.timestamp)}
              >
                {formatRelativeAgo(entry.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.subheading}>No verification activity yet in this browser.</p>
      )}
    </div>
  );
}
