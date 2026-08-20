"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  SlidersHorizontalIcon,
  CheckIcon,
  ArrowRightIcon,
  XIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { AgentStrategy } from "@alive/shared";
import { getMarketplaceStrategies, cloneStrategy, setActiveStrategy } from "@/lib/agent-api";
import styles from "./strategies-view.module.css";

const DEFAULT_DEMO_WALLET = "0xe2475653b6f8a846152a5508a8e1b1faae1a44e5" as `0x${string}`;

type CategoryFilter = "ALL" | "FREE" | "BALANCED" | "TREASURY" | "EQUITY" | "YIELD";

export function StrategiesView() {
  const router = useRouter();
  const [strategies, setStrategies] = useState<AgentStrategy[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<CategoryFilter>("ALL");
  const [selectedStrategy, setSelectedStrategy] = useState<AgentStrategy | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [isAdopting, setIsAdopting] = useState<boolean>(false);
  const [adoptedSuccess, setAdoptedSuccess] = useState<boolean>(false);

  useEffect(() => {
    getMarketplaceStrategies()
      .then((res) => setStrategies(res.strategies))
      .catch((err) => console.error("Failed to fetch marketplace strategies:", err));
  }, []);

  const filteredStrategies = strategies.filter((strat) => {
    if (selectedFilter === "ALL") return true;
    if (selectedFilter === "FREE") return !strat.pricing.isPaid;
    const cat = strat.targetAssetClasses?.[0]?.toUpperCase() || "BALANCED";
    return cat === selectedFilter || strat.name.toUpperCase().includes(selectedFilter);
  });

  const handleUseStrategy = async (strategy: AgentStrategy) => {
    setIsAdopting(true);
    try {
      // 1. Clone strategy for this wallet
      const cloned = await cloneStrategy(strategy.id, DEFAULT_DEMO_WALLET, `${strategy.name} (Active)`);
      if (cloned && cloned.id) {
        // 2. Set as active strategy
        await setActiveStrategy(DEFAULT_DEMO_WALLET, cloned.id);
        setAdoptedSuccess(true);
        setTimeout(() => {
          setIsDetailOpen(false);
          router.push("/agents");
        }, 1200);
      }
    } catch (err) {
      console.error("Failed to adopt strategy:", err);
    } finally {
      setIsAdopting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>Strategies</h1>
          <p className={styles.subtitle}>Discover verified operating strategies for ALIVE Agents.</p>
        </div>
      </header>

      {/* Category Filter Pills */}
      <div className={styles.filtersRow}>
        {(["ALL", "FREE", "BALANCED", "TREASURY", "EQUITY", "YIELD"] as CategoryFilter[]).map((cat) => (
          <button
            key={cat}
            type="button"
            className={selectedFilter === cat ? styles.filterBtnActive : styles.filterBtn}
            onClick={() => setSelectedFilter(cat)}
          >
            {cat.charAt(0) + cat.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Strategies Grid */}
      <div className={styles.strategiesGrid}>
        {filteredStrategies.map((strat) => (
          <div key={strat.id} className={styles.strategyCard}>
            <div className={styles.cardTop}>
              <div className={styles.cardCategoryRow}>
                <span className={styles.categoryTag}>{strat.targetAssetClasses?.[0] || "BALANCED"}</span>
                <span className={!strat.pricing.isPaid ? styles.priceTagFree : styles.priceTagPaid}>
                  {!strat.pricing.isPaid ? "FREE" : `${strat.pricing.priceUsd} USD`}
                </span>
              </div>

              <h2 className={styles.strategyName}>{strat.name}</h2>
              <span className={styles.creatorText}>
                by {strat.author.slice(0, 6)}…{strat.author.slice(-4)}
              </span>
              <p className={styles.descriptionText}>{strat.description}</p>
            </div>

            <div className={styles.cardBottom}>
              <span className={styles.usageStats}>
                Verified on X Layer
              </span>
              <button
                type="button"
                className={styles.viewDetailBtn}
                onClick={() => {
                  setSelectedStrategy(strat);
                  setAdoptedSuccess(false);
                  setIsDetailOpen(true);
                }}
              >
                View strategy <ArrowRightIcon size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Strategy Detail Modal */}
      {isDetailOpen && selectedStrategy && (
        <div className={styles.modalOverlay} onClick={() => setIsDetailOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h2 className={styles.modalTitle}>{selectedStrategy.name}</h2>
                <span className={styles.creatorText}>
                  Created by {selectedStrategy.author.slice(0, 8)}…{selectedStrategy.author.slice(-6)}
                </span>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsDetailOpen(false)}
                aria-label="Close modal"
              >
                <XIcon size={20} />
              </button>
            </div>

            <p className={styles.descriptionText}>{selectedStrategy.description}</p>

            {/* How It Operates */}
            <div className={styles.operatesSection}>
              <div className={styles.operatesTitle}>
                <ShieldCheckIcon size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                How It Operates
              </div>
              <ul className={styles.operatesList}>
                <li className={styles.operatesItem}>
                  <span className={styles.operatesBullet}>✓</span>
                  <span>Verified and eligible X Layer assets only</span>
                </li>
                <li className={styles.operatesItem}>
                  <span className={styles.operatesBullet}>✓</span>
                  <span>Target asset universe: {selectedStrategy.targetAssetClasses.join(", ")}</span>
                </li>
                <li className={styles.operatesItem}>
                  <span className={styles.operatesBullet}>✓</span>
                  <span>Rebalancing threshold: {selectedStrategy.rebalanceThresholdBps ? `${selectedStrategy.rebalanceThresholdBps / 100}%` : "5%"} deviation</span>
                </li>
                <li className={styles.operatesItem}>
                  <span className={styles.operatesBullet}>✓</span>
                  <span>{selectedStrategy.rules.length} active deterministic rules</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              className={styles.useStrategyBtn}
              onClick={() => handleUseStrategy(selectedStrategy)}
              disabled={isAdopting}
            >
              {adoptedSuccess ? (
                <>
                  <CheckIcon size={16} style={{ marginRight: 6 }} /> Activated on Agent! Redirecting…
                </>
              ) : isAdopting ? (
                "Configuring Agent…"
              ) : (
                "Use This Strategy on Agent"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
