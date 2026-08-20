"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClockCounterClockwiseIcon,
  RobotIcon,
  ShieldCheckIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { listActivity, type ActivityEntry } from "@/lib/activity-log";
import { formatRelativeAgo, formatTimestamp } from "@/lib/rwa-format";
import styles from "./overview.module.css";
import activityStyles from "./activity.module.css";

interface UnifiedActivityItem {
  id: string;
  type: "AGENT_DECISION" | "TRADE" | "VERIFICATION";
  title: string;
  subtitle: string;
  status: string;
  statusTone: "ELIGIBLE" | "RESTRICTED" | "UNKNOWN" | "ACTIVE" | "COMPLETED";
  timestamp: string;
  linkHref?: string;
  txHash?: string;
}

export function ActivityPage() {
  const [items, setItems] = useState<UnifiedActivityItem[]>([]);
  const [filter, setFilter] = useState<"ALL" | "AGENT" | "VERIFICATION">("ALL");

  useEffect(() => {
    // 1. Verification activity from local store
    const localVerifications = listActivity().map((entry, idx) => ({
      id: `ver-${entry.assetId}-${entry.timestamp}-${idx}`,
      type: "VERIFICATION" as const,
      title: `${entry.symbol} Verification`,
      subtitle: entry.action,
      status: entry.result,
      statusTone: (entry.result === "ELIGIBLE"
        ? "ELIGIBLE"
        : entry.result === "RESTRICTED"
        ? "RESTRICTED"
        : "UNKNOWN") as UnifiedActivityItem["statusTone"],
      timestamp: entry.timestamp,
      linkHref: `/assets/${entry.assetId}`,
    }));

    // 2. Initial sample of agent events if any
    const agentEvents: UnifiedActivityItem[] = [
      {
        id: "evt-strat-1",
        type: "AGENT_DECISION",
        title: "Strategy Activated",
        subtitle: "RWA Core Balance v1 set as primary operating strategy on X Layer",
        status: "ACTIVE",
        statusTone: "ACTIVE",
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        linkHref: "/strategies",
      },
      {
        id: "evt-eval-1",
        type: "AGENT_DECISION",
        title: "Portfolio Evaluated",
        subtitle: "Concentration and stablecoin reserve evaluated against strategy rules",
        status: "COMPLETED",
        statusTone: "ELIGIBLE",
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        linkHref: "/agents",
      },
    ];

    const combined = [...agentEvents, ...localVerifications].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    setItems(combined);
  }, []);

  const filtered = items.filter((item) => {
    if (filter === "ALL") return true;
    if (filter === "AGENT") return item.type === "AGENT_DECISION" || item.type === "TRADE";
    if (filter === "VERIFICATION") return item.type === "VERIFICATION";
    return true;
  });

  return (
    <div className={styles.page}>
      <div>
        <p className={styles.eyebrow}>Activity</p>
        <h1 className={styles.heading}>Decisions &amp; Activity</h1>
        <p className={styles.subheading}>
          Chronological record of Agent evaluations, trade proposals, strategy updates, and RWA verifications.
        </p>
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
        <button
          type="button"
          className={filter === "ALL" ? activityStyles.filterActive : activityStyles.filterBtn}
          onClick={() => setFilter("ALL")}
        >
          All Activity
        </button>
        <button
          type="button"
          className={filter === "AGENT" ? activityStyles.filterActive : activityStyles.filterBtn}
          onClick={() => setFilter("AGENT")}
        >
          Agent &amp; Trades
        </button>
        <button
          type="button"
          className={filter === "VERIFICATION" ? activityStyles.filterActive : activityStyles.filterBtn}
          onClick={() => setFilter("VERIFICATION")}
        >
          Verifications
        </button>
      </div>

      {filtered.length > 0 ? (
        <ul className={activityStyles.list}>
          {filtered.map((item) => (
            <li className={activityStyles.item} key={item.id}>
              <div className={activityStyles.itemMain}>
                <div className={activityStyles.iconCol}>
                  {item.type === "AGENT_DECISION" ? (
                    <RobotIcon size={18} color="#22c55e" />
                  ) : item.type === "TRADE" ? (
                    <ArrowUpRightIcon size={18} color="#38bdf8" />
                  ) : (
                    <ShieldCheckIcon size={18} color="#94a3b8" />
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {item.linkHref ? (
                    <Link href={item.linkHref} className={activityStyles.titleLink}>
                      {item.title}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: 650, color: "#fff" }}>{item.title}</span>
                  )}
                  <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>{item.subtitle}</span>
                </div>
                <span className={activityStyles.result} data-tone={item.statusTone}>
                  {item.status}
                </span>
              </div>
              <span
                className={activityStyles.timestamp}
                title={formatTimestamp(item.timestamp)}
              >
                {formatRelativeAgo(item.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.subheading}>No matching activity recorded yet.</p>
      )}
    </div>
  );
}
