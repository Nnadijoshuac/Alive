"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import {
  CheckIcon,
  ArrowRightIcon,
  XIcon,
  ShieldCheckIcon,
  CodeIcon,
  CheckCircleIcon,
  CaretDownIcon,
  CaretUpIcon,
} from "@phosphor-icons/react";
import type { AgentStrategy } from "@alive/shared";
import {
  getMarketplaceStrategies,
  cloneStrategy,
  setActiveStrategy,
  type MarketplaceStrategySource,
} from "@/lib/agent-api";
import styles from "./strategies-view.module.css";

type CategoryFilter = "ALL" | "FREE" | "BALANCED" | "TREASURY" | "EQUITY" | "YIELD";

export function StrategiesView() {
  const router = useRouter();
  const { address: wagmiAddress, isConnected } = useAccount();
  const currentWallet = isConnected && wagmiAddress ? wagmiAddress : undefined;

  const [strategies, setStrategies] = useState<AgentStrategy[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<CategoryFilter>("ALL");
  const [selectedStrategy, setSelectedStrategy] = useState<AgentStrategy | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [showTechnicalRules, setShowTechnicalRules] = useState<boolean>(false);
  const [isAdopting, setIsAdopting] = useState<boolean>(false);
  const [adoptedSuccess, setAdoptedSuccess] = useState<boolean>(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataMode, setDataMode] = useState<MarketplaceStrategySource | null>(null);
  const detailDialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const loadStrategies = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await getMarketplaceStrategies();
      setStrategies(response.strategies);
      setDataMode(response.dataMode);
    } catch (error) {
      console.error("Failed to fetch marketplace strategies:", error);
      setDataMode(null);
      setLoadError(
        error instanceof Error
          ? error.message
          : "The strategy library is unavailable.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStrategies();
  }, [loadStrategies]);

  useEffect(() => {
    if (!isDetailOpen) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      detailDialogRef.current
        ?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
        ?.focus();
    });

    function handleDialogKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDetailOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        detailDialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleDialogKeys);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [isDetailOpen]);

  const filteredStrategies = strategies.filter((strat) => {
    if (selectedFilter === "ALL") return true;
    if (selectedFilter === "FREE") return !strat.pricing?.isPaid;
    const cat = strat.targetAssetClasses?.[0]?.toUpperCase() || "BALANCED";
    return cat === selectedFilter || strat.name.toUpperCase().includes(selectedFilter);
  });

  const handleUseStrategy = async (strategy: AgentStrategy) => {
    if (!currentWallet) {
      setAdoptError("Connect a wallet before selecting a strategy. No sample wallet is used automatically.");
      return;
    }
    setIsAdopting(true);
    setAdoptError(null);
    try {
      // 1. Clone strategy for this wallet
      const cloned = await cloneStrategy(strategy.id, currentWallet, `${strategy.name} (Active)`);
      if (cloned && cloned.id) {
        // 2. Set as active strategy
        await setActiveStrategy(currentWallet, cloned.id);
        setAdoptedSuccess(true);
        setTimeout(() => {
          setIsDetailOpen(false);
          router.push("/agents");
        }, 700);
      } else {
        setAdoptError("The strategy copy did not return a valid policy record.");
      }
    } catch (err) {
      console.error("Failed to adopt strategy:", err);
      setAdoptError(err instanceof Error ? err.message : "The strategy could not be selected.");
    } finally {
      setIsAdopting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.previewLabel}>
            Preview workspace / {dataMode === "REFERENCE" ? "reference templates" : dataMode?.toLowerCase() ?? "loading"}
          </span>
          <h1 className={styles.title}>Strategy library</h1>
          <p className={styles.subtitle}>
            Inspect deterministic templates and their execution boundaries. Selecting a template does not authorize monitoring or trading.
          </p>
        </div>
      </header>

      {/* Category Filter Pills */}
      <div className={styles.filtersRow} aria-label="Filter strategies">
        {(["ALL", "FREE", "BALANCED", "TREASURY", "EQUITY", "YIELD"] as CategoryFilter[]).map((cat) => (
          <button
            key={cat}
            type="button"
            className={selectedFilter === cat ? styles.filterBtnActive : styles.filterBtn}
            onClick={() => setSelectedFilter(cat)}
            aria-pressed={selectedFilter === cat}
          >
            {cat.charAt(0) + cat.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div
          className={styles.strategiesGrid}
          aria-label="Loading strategies"
          aria-busy="true"
        >
          {[0, 1, 2].map((item) => (
            <div key={item} className={styles.strategySkeleton} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className={styles.libraryState} role="alert">
          <div>
            <strong>Strategy library unavailable</strong>
            <span>{loadError}</span>
          </div>
          <button type="button" onClick={() => void loadStrategies()}>
            Try again
          </button>
        </div>
      ) : filteredStrategies.length === 0 ? (
        <div className={styles.libraryState}>
          <div>
            <strong>No matching strategies</strong>
            <span>Choose another filter to inspect the available templates.</span>
          </div>
          <button type="button" onClick={() => setSelectedFilter("ALL")}>
            Show all
          </button>
        </div>
      ) : (
        <div className={styles.strategiesGrid}>
        {filteredStrategies.map((strat) => (
          <article key={strat.id} className={styles.strategyCard}>
            <div className={styles.cardTop}>
              <div className={styles.cardCategoryRow}>
                <span className={styles.categoryTag}>{strat.targetAssetClasses?.[0] || "BALANCED"}</span>
                <span className={!strat.pricing?.isPaid ? styles.priceTagFree : styles.priceTagPaid}>
                  {!strat.pricing?.isPaid ? "FREE" : `${strat.pricing.priceUsd} USD`}
                </span>
              </div>

              <h2 className={styles.strategyName}>{strat.name}</h2>
              <span className={styles.creatorText}>
                Author: {strat.author ? `${strat.author.slice(0, 6)}...${strat.author.slice(-4)}` : "ALIVE Protocol"}
              </span>
              <p className={styles.descriptionText}>{strat.description}</p>
            </div>

            <div className={styles.cardBottom}>
              <div className={styles.verifiedTag}>
                <ShieldCheckIcon size={14} />
                <span>Deterministic rules</span>
              </div>
              <button
                type="button"
                className={styles.viewDetailBtn}
                onClick={() => {
                  setSelectedStrategy(strat);
                  setShowTechnicalRules(false);
                  setAdoptedSuccess(false);
                  setAdoptError(null);
                  setIsDetailOpen(true);
                }}
              >
                Inspect strategy <ArrowRightIcon size={14} />
              </button>
            </div>
          </article>
        ))}
        </div>
      )}

      {/* Explainer: Why Deterministic Rules */}
      <aside className={styles.explainerCard}>
        <div className={styles.explainerIconWrap}>
          <ShieldCheckIcon size={24} />
        </div>
        <div className={styles.explainerContent}>
          <h3 className={styles.explainerTitle}>Why strategy boundaries are deterministic</h3>
          <p className={styles.explainerDesc}>
            ALIVE preserves a verifiable causal chain. AI is used for interpretation, research, and natural language queries, but rebalancing triggers, slippage limits, and portfolio calculations are governed by deterministic, verifiable rules.
          </p>
        </div>
      </aside>

      {/* Strategy Detail Modal with Progressive Disclosure */}
      {isDetailOpen && selectedStrategy && (
        <div className={styles.modalOverlay} onClick={() => setIsDetailOpen(false)}>
          <div
            ref={detailDialogRef}
            className={styles.modalContent}
            role="dialog"
            aria-modal="true"
            aria-labelledby="strategy-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h2 className={styles.modalTitle} id="strategy-detail-title">{selectedStrategy.name}</h2>
                <span className={styles.creatorText}>
                  Created by {selectedStrategy.author
                    ? `${selectedStrategy.author.slice(0, 8)}...${selectedStrategy.author.slice(-6)}`
                    : "UNKNOWN"}
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

            {/* Level 1 & 2: Plain-Language Strategy Rules */}
            <div className={styles.operatesSection}>
              <div className={styles.operatesTitle}>
                <ShieldCheckIcon size={16} />
                Plain-language policy rules
              </div>
              <ul className={styles.operatesList}>
                <li className={styles.operatesItem}>
                  <CheckCircleIcon size={15} weight="fill" />
                  <span>Verified and eligible X Layer assets only</span>
                </li>
                <li className={styles.operatesItem}>
                  <CheckCircleIcon size={15} weight="fill" />
                  <span>Target asset universe: {selectedStrategy.targetAssetClasses?.join(", ") || "UNKNOWN"}</span>
                </li>
                <li className={styles.operatesItem}>
                  <CheckCircleIcon size={15} weight="fill" />
                  <span>
                    Rebalances when allocation deviates more than{" "}
                    {selectedStrategy.rebalanceThresholdBps !== undefined
                      ? `${selectedStrategy.rebalanceThresholdBps / 100}%`
                      : "UNKNOWN"}
                  </span>
                </li>
                <li className={styles.operatesItem}>
                  <CheckCircleIcon size={15} weight="fill" />
                  <span>{(selectedStrategy.rules || []).length} active deterministic boundary conditions</span>
                </li>
              </ul>
            </div>

            {/* Level 3: Collapsible Technical Rules */}
            <div>
              <button
                type="button"
                className={styles.technicalToggleBtn}
                onClick={() => setShowTechnicalRules(!showTechnicalRules)}
                aria-expanded={showTechnicalRules}
              >
                <CodeIcon size={14} />
                {showTechnicalRules ? "Hide technical rules" : "View technical execution rules"}
                {showTechnicalRules ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
              </button>

              {showTechnicalRules && (
                <div className={styles.technicalRulesDrawer}>
                  <table className={styles.rulesTable}>
                    <thead>
                      <tr>
                        <th>Rule ID</th>
                        <th>Condition</th>
                        <th>Operator</th>
                        <th>Threshold</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedStrategy.rules || []).map((r, idx) => (
                        <tr key={idx}>
                          <td>{r.id || `rule-${idx + 1}`}</td>
                          <td>{r.conditionVariable}</td>
                          <td>{r.operator}</td>
                          <td>
                            {typeof r.thresholdValue === "number"
                              ? `${r.thresholdValue} bps`
                              : String(r.thresholdValue)}
                          </td>
                          <td className={styles.ruleAction}>{r.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.useStrategyBtn}
              onClick={() => handleUseStrategy(selectedStrategy)}
              disabled={isAdopting || !currentWallet}
            >
              {adoptedSuccess ? (
                <>
                  <CheckIcon size={16} style={{ marginRight: 6 }} /> Selected for preview. Redirecting...
                </>
              ) : isAdopting ? (
                "Selecting strategy..."
              ) : !currentWallet ? (
                "Connect a wallet to select"
              ) : (
                "Select strategy for preview"
              )}
            </button>
            {adoptError ? <p className={styles.adoptError} role="alert">{adoptError}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
