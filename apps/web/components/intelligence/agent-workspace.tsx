"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAccount, useConnect } from "wagmi";
import {
  RobotIcon,
  ArrowsClockwiseIcon,
  PlayIcon,
  PauseIcon,
  ListChecksIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  DatabaseIcon,
  WalletIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import type {
  AgentContextSnapshot,
  ProposedAgentAction,
  AgentStrategy,
  RwaAsset,
} from "@alive/shared";
import {
  getAgentSnapshot,
  evaluateAgentStrategy,
  recordAgentInteraction,
  askAgentQuestion,
  getMarketplaceStrategies,
  syncWalletContext,
  type MarketplaceStrategySource,
} from "@/lib/agent-api";
import { TradeDrawer } from "@/components/intelligence/trade-drawer";
import { getRwaAsset } from "@/lib/rwa-api";
import styles from "./agent-workspace.module.css";

const DEFAULT_DEMO_WALLET = "0xe2475653b6f8a846152a5508a8e1b1faae1a44e5" as `0x${string}`;

type WorkspacePhase = "DISCONNECTED" | "UNDERSTANDING" | "FIRST_REVEAL" | "EVALUATING" | "ACTIVE";

interface ChatMessage {
  sender: "user" | "agent";
  text: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  citations?: string[];
  timestamp: string;
}

export function AgentWorkspace() {
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const [demoAddressSelected, setDemoAddressSelected] = useState<string | null>(null);

  const activeWalletAddress = useMemo(() => {
    if (isWagmiConnected && wagmiAddress) return wagmiAddress;
    return demoAddressSelected || "";
  }, [isWagmiConnected, wagmiAddress, demoAddressSelected]);

  const [phase, setPhase] = useState<WorkspacePhase>("DISCONNECTED");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  const [snapshot, setSnapshot] = useState<AgentContextSnapshot | null>(null);
  const [activeStrategy, setActiveStrategy] = useState<AgentStrategy | null>(null);
  const [strategyDataMode, setStrategyDataMode] = useState<MarketplaceStrategySource | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [showLevel3Evidence, setShowLevel3Evidence] = useState<Record<string, boolean>>({});
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  // Q&A State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState<string>("");
  const [isAsking, setIsAsking] = useState<boolean>(false);

  // Trade Drawer State
  const [isTradeDrawerOpen, setIsTradeDrawerOpen] = useState<boolean>(false);
  const [selectedAssetForTrade, setSelectedAssetForTrade] = useState<RwaAsset | null>(null);
  const [tradePaymentTokenAddr, setTradePaymentTokenAddr] = useState<`0x${string}` | undefined>(undefined);
  const [tradeAmount, setTradeAmount] = useState<string | undefined>(undefined);
  const [activeExecutingActionId, setActiveExecutingActionId] = useState<string | null>(null);

  // Track wallets evaluated during this browser session. This is not an
  // authorization record and does not enable autonomous monitoring.
  const [evaluatedWallets, setEvaluatedWallets] = useState<Set<string>>(new Set());

  const loadData = useCallback(async (wallet: string) => {
    if (!wallet) return false;
    try {
      const snap = await getAgentSnapshot(wallet);
      setSnapshot(snap);
      setLastSyncTime(new Date());

      if (snap.activeStrategy) {
        setActiveStrategy(snap.activeStrategy);
        setStrategyDataMode("SERVICE");
      } else {
        const marketplace = await getMarketplaceStrategies();
        setStrategyDataMode(marketplace.dataMode);
        if (marketplace.strategies.length > 0) {
          setActiveStrategy(marketplace.strategies[0] ?? null);
        }
      }
      return true;
    } catch (err) {
      console.error("Failed to load agent workspace data:", err);
      return false;
    }
  }, []);

  // Handle phase changes when wallet connects
  useEffect(() => {
    if (!activeWalletAddress) {
      setPhase("DISCONNECTED");
      setSnapshot(null);
      setStrategyDataMode(null);
      return;
    }

    const norm = activeWalletAddress.toLowerCase();
    const wasEvaluated = evaluatedWallets.has(norm);
    setSnapshot(null);
    setActiveStrategy(null);
    setStrategyDataMode(null);
    setActivationError(null);
    setPhase("UNDERSTANDING");
    let cancelled = false;
    void loadData(activeWalletAddress).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        setActivationError("Wallet context is unavailable. Missing values remain UNKNOWN.");
      }
      setPhase(loaded && wasEvaluated ? "ACTIVE" : "FIRST_REVEAL");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWalletAddress, evaluatedWallets.size]);

  const handleConnectWallet = () => {
    setActivationError(null);
    const connector = connectors[0];
    if (connector) {
      connect({ connector });
    } else {
      setActivationError("No compatible wallet connector is available in this browser.");
    }
  };

  const handleUseSampleWallet = () => {
    setActivationError(null);
    setDemoAddressSelected(DEFAULT_DEMO_WALLET);
  };

  const handleEvaluateStrategy = async () => {
    if (!activeWalletAddress) return;
    setActivationError(null);
    setPhase("EVALUATING");

    try {
      const evaluated = await evaluateAgentStrategy(activeWalletAddress);
      setSnapshot(evaluated);
      setActiveStrategy(evaluated.activeStrategy);
      setStrategyDataMode("SERVICE");
      setLastSyncTime(new Date(evaluated.timestamp));
      setEvaluatedWallets((prev) => new Set([...prev, activeWalletAddress.toLowerCase()]));
      setPhase("ACTIVE");
    } catch (err) {
      console.error("Failed to activate agent:", err);
      setActivationError(
        err instanceof Error ? err.message : "The strategy evaluation could not be completed.",
      );
      setPhase("FIRST_REVEAL");
    }
  };

  const handleSyncWallet = async () => {
    if (!activeWalletAddress || isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback("Syncing...");

    try {
      await syncWalletContext(activeWalletAddress);
      const evalSnap = await evaluateAgentStrategy(activeWalletAddress);
      setSnapshot(evalSnap);
      setLastSyncTime(new Date());

      setSyncFeedback("Wallet updated");
      setTimeout(() => setSyncFeedback(null), 2500);
    } catch (err) {
      console.error("Failed to sync wallet context:", err);
      setSyncFeedback("Wallet sync failed");
      setTimeout(() => setSyncFeedback(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReviewAction = async (action: ProposedAgentAction) => {
    setActiveExecutingActionId(action.id);
    setReviewError(null);
    try {
      const passport = await getRwaAsset(action.assetId);
      setSelectedAssetForTrade(passport.asset);
      setTradePaymentTokenAddr(action.paymentTokenAddress);
      setTradeAmount(action.amountFormatted);
      setIsTradeDrawerOpen(true);
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : "The asset passport could not be loaded for trade review.",
      );
    }
  };

  const handleDismissAction = async (actionId: string) => {
    if (!activeWalletAddress) return;
    setReviewError(null);
    try {
      await recordAgentInteraction({
        id: `int-${Date.now()}`,
        agentId: "agent-alive-core-v1",
        walletAddress: activeWalletAddress as `0x${string}`,
        actionId,
        event: "DISMISSED",
        timestamp: new Date().toISOString(),
      });

      if (snapshot) {
        setSnapshot({
          ...snapshot,
          proposedActions: snapshot.proposedActions.filter((a) => a.id !== actionId),
        });
      }
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : "The dismissal could not be recorded. The proposal remains visible.",
      );
    }
  };

  const handleTradeSuccess = async (txHash: string) => {
    try {
      if (activeExecutingActionId && activeWalletAddress) {
        await recordAgentInteraction({
          id: `int-${Date.now()}`,
          agentId: "agent-alive-core-v1",
          walletAddress: activeWalletAddress as `0x${string}`,
          actionId: activeExecutingActionId,
          event: "EXECUTED",
          txHash,
          timestamp: new Date().toISOString(),
        });
      }
      if (activeWalletAddress) {
        await loadData(activeWalletAddress);
      }
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? `Trade confirmed, but the activity record could not refresh: ${error.message}`
          : "Trade confirmed, but the activity record could not refresh.",
      );
    }
  };

  const handleAskQuestion = async (qText?: string) => {
    const question = qText || inputQuestion.trim();
    if (!question || isAsking || !activeWalletAddress) return;

    const userMsg: ChatMessage = {
      sender: "user",
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion("");
    setIsAsking(true);

    try {
      const res = await askAgentQuestion(activeWalletAddress, question);
      const agentMsg: ChatMessage = {
        sender: "agent",
        text: res.answer,
        confidence: res.confidence,
        citations: res.citations,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch {
      const errMsg: ChatMessage = {
        sender: "agent",
        text: "Portfolio context is temporarily unavailable. Try the question again.",
        confidence: "LOW",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsAsking(false);
    }
  };

  const toggleLevel3 = (actionId: string) => {
    setShowLevel3Evidence((prev) => ({
      ...prev,
      [actionId]: !prev[actionId],
    }));
  };

  const primaryAction = snapshot?.proposedActions?.[0] ?? null;

  const totalValueUsd = snapshot?.walletPortfolio?.totalValueUsd ?? 0;
  const stablePercent = snapshot?.walletPortfolio?.stablecoinPct?.toFixed(0) ?? "0";
  const positionCount = snapshot?.walletPortfolio?.positions?.length ?? 0;
  const tradeCount30d = snapshot?.walletHistorySummary?.tradesLast30d ?? 0;
  const stablecoinReserve = snapshot?.walletPortfolio?.stablecoinValueUsd;
  const actionPosition = primaryAction
    ? snapshot?.walletPortfolio?.positions?.find(
        (position) => position.assetId === primaryAction.assetId,
      )
    : undefined;
  const currentAllocationBps = actionPosition?.allocationBps;
  const targetAllocationBps = primaryAction
    ? activeStrategy?.targetAllocations?.[primaryAction.assetId] ??
      activeStrategy?.targetAllocations?.[primaryAction.targetTokenSymbol]
    : undefined;
  const usingSampleWallet = Boolean(demoAddressSelected && !isWagmiConnected);
  const strategySourceLabel =
    strategyDataMode === "REFERENCE"
      ? "REFERENCE TEMPLATE"
      : strategyDataMode ?? "UNKNOWN";
  const evaluatedAtLabel = snapshot
    ? lastSyncTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "UNKNOWN";

  // =========================================================================
  // 1. DISCONNECTED STATE
  // =========================================================================
  if (phase === "DISCONNECTED") {
    return (
      <div className={styles.container}>
        <div className={styles.disconnectedCard}>
          <div className={styles.disconnectedIconWrap}>
            <RobotIcon size={32} />
          </div>
          <div className={styles.disconnectedTitleGroup}>
            <span className={styles.disconnectedBadge}>Agent lab · preview</span>
            <h1 className={styles.disconnectedTitle}>
              Connect a wallet to evaluate the data available to ALIVE.
            </h1>
            <p className={styles.disconnectedDesc}>
              This read-only preview checks observed positions against deterministic strategy rules. It does not authorize monitoring or execution.
            </p>
          </div>
          <div className={styles.disconnectedButtonGroup}>
            <button
              type="button"
              className={styles.primaryConnectBtn}
              onClick={handleConnectWallet}
            >
              <WalletIcon size={18} weight="bold" />
              Connect wallet
            </button>
            <button
              type="button"
              className={styles.sampleWalletBtn}
              onClick={handleUseSampleWallet}
            >
              Use labelled sample wallet
            </button>
            {activationError ? (
              <p className={styles.inlineError} role="alert">{activationError}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. PROGRESSIVE UNDERSTANDING TRANSITION
  // =========================================================================
  if (phase === "UNDERSTANDING") {
    return (
      <div className={styles.container}>
        <div className={styles.syncProgressCard}>
          <div className={styles.disconnectedIconWrap}>
            <ArrowsClockwiseIcon size={28} className="animate-spin" />
          </div>
          <div>
            <h2 className={styles.syncProgressTitle}>Wallet connected</h2>
            <p className={styles.syncProgressSubtitle}>Reading available wallet context...</p>
          </div>

          <div className={styles.syncStepsList}>
            <div className={styles.syncStepRow}>
              <div className={styles.stepDotActive} />
              <span className={styles.syncStepLabelActive}>
                Requesting the latest available snapshot
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 3. FIRST CONTEXT REVEAL & STRATEGY SELECTION
  // =========================================================================
  if (phase === "FIRST_REVEAL") {
    return (
      <div className={styles.container}>
        <div className={styles.firstRevealCard}>
          <div className={styles.revealHeader}>
            <span className={styles.revealBadge}>
              {usingSampleWallet ? "Sample wallet context" : "Wallet context"}
            </span>
            <h1 className={styles.revealTitle}>
              Available wallet context
            </h1>
            <div className={styles.revealStatsGrid}>
              <div className={styles.revealStatItem}>
                <span className={styles.revealStatValue}>
                  {snapshot ? `${positionCount} tracked` : "UNKNOWN"}
                </span>
                <span className={styles.revealStatLabel}>RWA Positions</span>
              </div>
              <div className={styles.revealStatItem}>
                <span className={styles.revealStatValue}>
                  {stablecoinReserve == null
                    ? "UNKNOWN"
                    : `$${stablecoinReserve.toLocaleString()}`}
                </span>
                <span className={styles.revealStatLabel}>Stablecoin Reserve</span>
              </div>
              <div className={styles.revealStatItem}>
                <span className={styles.revealStatValue}>
                  {snapshot ? `${tradeCount30d} trades` : "UNKNOWN"}
                </span>
                <span className={styles.revealStatLabel}>Last 30 Days</span>
              </div>
            </div>
          </div>

          <div className={styles.revealStrategySection}>
            <h2 className={styles.revealSectionPrompt}>
              Choose a strategy to evaluate.
            </h2>

            <div className={styles.strategyCardFeatured}>
              <div className={styles.strategyCardHeader}>
                <h3 className={styles.strategyCardTitle}>
                  {activeStrategy?.name ?? "Strategy unavailable"}
                </h3>
                <span className={styles.strategyBadgeRecommended}>{strategySourceLabel}</span>
              </div>
              <p className={styles.strategyCardDesc}>
                {activeStrategy?.description ?? "No strategy description is available."}
              </p>

              <div className={styles.strategyRulesSummaryList}>
                {activeStrategy?.rules?.length ? (
                  activeStrategy.rules.slice(0, 4).map((rule) => (
                    <div className={styles.strategyRulePill} key={rule.id}>
                      <CheckCircleIcon size={14} weight="bold" />
                      {rule.name}
                    </div>
                  ))
                ) : (
                  <div className={styles.strategyRulePill}>No rules available</div>
                )}
              </div>

              {/* Collapsed Advanced Settings */}
              <div>
                <button
                  type="button"
                  className={styles.advancedToggleBtn}
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  aria-expanded={showAdvancedSettings}
                >
                  <SlidersHorizontalIcon size={14} />
                  Strategy details
                  {showAdvancedSettings ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
                </button>

                {showAdvancedSettings && (
                  <div className={styles.advancedSettingsDrawer}>
                    <div className={styles.advancedSettingItem}>
                      <span className={styles.advancedSettingLabel}>Strategy ID</span>
                      <span className={styles.advancedSettingValue}>{activeStrategy?.id ?? "UNKNOWN"}</span>
                    </div>
                    <div className={styles.advancedSettingItem}>
                      <span className={styles.advancedSettingLabel}>Rule source</span>
                      <span className={styles.advancedSettingValue}>{strategySourceLabel}</span>
                    </div>
                    <div className={styles.advancedSettingItem}>
                      <span className={styles.advancedSettingLabel}>Rebalance threshold</span>
                      <span className={styles.advancedSettingValue}>
                        {activeStrategy?.rebalanceThresholdBps == null
                          ? "UNKNOWN"
                          : `${(activeStrategy.rebalanceThresholdBps / 100).toFixed(2)}%`}
                      </span>
                    </div>
                    <div className={styles.advancedSettingItem}>
                      <span className={styles.advancedSettingLabel}>Target Universe</span>
                      <span className={styles.advancedSettingValue}>
                        {activeStrategy?.targetAssetClasses?.join(", ") || "UNKNOWN"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.revealActionsRow}>
              <button
                type="button"
                className={styles.activatePrimaryBtn}
                onClick={handleEvaluateStrategy}
              >
                <PlayIcon size={16} weight="bold" />
                Open evaluation preview
              </button>
              <Link href="/strategies" className={styles.exploreSecondaryBtn}>
                Explore strategies
              </Link>
            </div>
            {activationError ? (
              <p className={styles.inlineError} role="alert">{activationError}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 4. EVALUATION IN PROGRESS
  // =========================================================================
  if (phase === "EVALUATING") {
    return (
      <div className={styles.container}>
        <div className={styles.activationMomentCard}>
          <span className={styles.activationBadge}>Evaluation running</span>
          <h2 className={styles.activationTitle}>
            Checking this wallet against {activeStrategy?.name ?? "the selected strategy"}.
          </h2>
          <p className={styles.activationDesc}>
            This is a read-only strategy evaluation. It does not authorize monitoring, trading, or delegated execution.
          </p>
          <div className={styles.activationProgress}>
            <ArrowsClockwiseIcon size={16} className="animate-spin" />
            Evaluating available portfolio data...
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 5. ACTIVE AGENT HOME
  // =========================================================================
  return (
    <div className={styles.container}>
      {/* 1. AGENT HEADER */}
      <header className={styles.agentHeader}>
        <div className={styles.agentTitleRow}>
          <div className={styles.agentTitleGroup}>
            <h1 className={styles.agentName}>
              <RobotIcon size={28} />
              {activeStrategy?.name ?? "Strategy unavailable"}
              <span className={isPaused ? styles.statusPillPaused : styles.statusPillActive}>
                {isPaused ? "PREVIEW PAUSED" : "PREVIEW READY"}
              </span>
            </h1>
            <div className={styles.agentMetaRow}>
              <span>
                Evaluation strategy:{" "}
                <Link href="/strategies" className={styles.strategyLink}>
                  {activeStrategy?.name ?? "UNKNOWN"}
                </Link>
              </span>
              <span>Evaluated at {evaluatedAtLabel}</span>
              <span>Source: {strategySourceLabel}</span>
              {usingSampleWallet ? <span className={styles.sampleDataLabel}>Sample wallet data</span> : null}
            </div>
          </div>

          <div className={styles.headerControls}>
            <button
              type="button"
              className={styles.pauseToggleBtn}
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? (
                <>
                  <PlayIcon size={14} /> Resume preview
                </>
              ) : (
                <>
                  <PauseIcon size={14} /> Pause preview
                </>
              )}
            </button>
            <button
              type="button"
              className={styles.syncBtn}
              onClick={handleSyncWallet}
              disabled={isSyncing}
            >
              <ArrowsClockwiseIcon size={14} className={isSyncing ? "animate-spin" : ""} />
              {syncFeedback ? syncFeedback : isSyncing ? "Syncing..." : "Sync wallet"}
            </button>
          </div>
        </div>

        {/* 2. SUMMARY ROW */}
        <div className={styles.summaryRow}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Portfolio Value</span>
            <span className={styles.summaryValue}>
              {snapshot
                ? `$${totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "UNKNOWN"}
            </span>
            <span className={styles.summarySub}>Observed wallet data</span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Active Positions</span>
            <span className={styles.summaryValue}>{snapshot ? `${positionCount} RWAs` : "UNKNOWN"}</span>
            <span className={styles.summarySub}>Recognized tokenized assets</span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Stablecoin Reserve</span>
            <span className={styles.summaryValue}>{snapshot ? `${stablePercent}%` : "UNKNOWN"}</span>
            <span className={styles.summarySub}>Liquidity & rebalance floor</span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Observable Trades</span>
            <span className={styles.summaryValue}>{snapshot ? tradeCount30d : "UNKNOWN"}</span>
            <span className={styles.summarySub}>Activity in last 30 days</span>
          </div>
        </div>
      </header>

      {/* 3. PRIMARY CURRENT INSIGHT (OR ZERO-ACTION STATE) */}
      {primaryAction ? (
        <section className={styles.insightCard}>
          <div className={styles.insightHeader}>
            <ListChecksIcon size={18} />
            Strategy evaluation
          </div>

          <div className={styles.insightContent}>
            <h2 className={styles.insightTitle}>
              {primaryAction.actionType} proposal for {primaryAction.targetTokenSymbol}
            </h2>
            <p className={styles.insightDescription}>
              {primaryAction.explanation}
            </p>

            <div className={styles.insightMetricsRow}>
              <div className={styles.insightMetric}>
                <span className={styles.insightMetricVal}>
                  {currentAllocationBps == null
                    ? "UNKNOWN"
                    : `${(currentAllocationBps / 100).toFixed(1)}%`}
                </span>
                <span className={styles.insightMetricLabel}>Current allocation</span>
              </div>
              <ArrowRightIcon className={styles.metricArrow} size={16} />
              <div className={styles.insightMetric}>
                <span className={styles.insightMetricVal}>
                  {targetAllocationBps == null
                    ? "UNKNOWN"
                    : `${(targetAllocationBps / 100).toFixed(1)}%`}
                </span>
                <span className={styles.insightMetricLabel}>Target allocation</span>
              </div>
              <div className={`${styles.insightMetric} ${styles.proposedMetric}`}>
                <span className={styles.insightMetricVal}>
                  {primaryAction.amountFormatted} {primaryAction.targetTokenSymbol}
                </span>
                <span className={styles.insightMetricLabel}>
                  Proposed trade (about ${primaryAction.estimatedUsdValue.toFixed(2)})
                </span>
              </div>
            </div>
          </div>

          {/* Progressive "Why this action?" Panel */}
          <div className={styles.whyContainer}>
            <button
              type="button"
              className={styles.whyTrigger}
              onClick={() =>
                setExpandedActionId(
                  expandedActionId === primaryAction.id ? null : primaryAction.id,
                )
              }
              aria-expanded={expandedActionId === primaryAction.id}
            >
              <span>Why this action?</span>
              {expandedActionId === primaryAction.id ? (
                <CaretUpIcon size={16} />
              ) : (
                <CaretDownIcon size={16} />
              )}
            </button>

            {expandedActionId === primaryAction.id && (
              <>
                {/* Level 1: Plain summary */}
                <p className={styles.whyLevel1}>
                  {primaryAction.explanation}
                </p>

                {/* Level 2: Structured Evidence */}
                <div className={styles.whyGrid}>
                  <div className={styles.whyEvidenceItem}>
                    <span className={styles.whyEvidenceLabel}>Strategy rule</span>
                    <span className={styles.whyEvidenceValue}>
                      {primaryAction.deterministicReason}
                    </span>
                  </div>
                  <div className={styles.whyEvidenceItem}>
                    <span className={styles.whyEvidenceLabel}>Wallet state</span>
                    <span className={styles.whyEvidenceValue}>
                      {currentAllocationBps == null
                        ? "UNKNOWN"
                        : `${(currentAllocationBps / 100).toFixed(1)}% of $${totalValueUsd.toFixed(0)}`}
                    </span>
                  </div>
                  <div className={styles.whyEvidenceItem}>
                    <span className={styles.whyEvidenceLabel}>Recent history</span>
                    <span className={styles.whyEvidenceValue}>
                      {tradeCount30d} trades in 30d
                    </span>
                  </div>
                  <div className={styles.whyEvidenceItem}>
                    <span className={styles.whyEvidenceLabel}>Asset status</span>
                    <span className={styles.whyEvidenceValue}>
                      {actionPosition
                        ? `${actionPosition.verificationStatus} / ${actionPosition.eligibilityStatus} / ${actionPosition.marketStatus}`
                        : "UNKNOWN"}
                    </span>
                  </div>
                  <div className={styles.whyEvidenceItem}>
                    <span className={styles.whyEvidenceLabel}>Execution route</span>
                    <span className={styles.whyEvidenceValue}>
                      {actionPosition?.routeStatus ?? "UNKNOWN"}
                    </span>
                  </div>
                </div>

                {/* Level 3: Deep Technical Evidence (Progressively Disclosed) */}
                <div>
                  <button
                    type="button"
                    className={styles.level3ToggleBtn}
                    onClick={() => toggleLevel3(primaryAction.id)}
                    aria-expanded={Boolean(showLevel3Evidence[primaryAction.id])}
                  >
                    {showLevel3Evidence[primaryAction.id]
                      ? "Hide technical execution details"
                      : "View technical execution details"}
                    {showLevel3Evidence[primaryAction.id] ? (
                      <CaretUpIcon size={14} />
                    ) : (
                      <CaretDownIcon size={14} />
                    )}
                  </button>

                  {showLevel3Evidence[primaryAction.id] && (
                    <div className={styles.level3EvidenceDrawer}>
                      <div className={styles.level3Item}>
                        <span className={styles.level3Label}>Target Contract</span>
                        <span className={styles.level3Val}>
                          {primaryAction.targetTokenAddress}
                        </span>
                      </div>
                      <div className={styles.level3Item}>
                        <span className={styles.level3Label}>Deterministic Rule ID</span>
                        <span className={styles.level3Val}>
                          {primaryAction.deterministicRuleId}
                        </span>
                      </div>
                      <div className={styles.level3Item}>
                        <span className={styles.level3Label}>Action ID</span>
                        <span className={styles.level3Val}>
                          {primaryAction.id}
                        </span>
                      </div>
                      <div className={styles.level3Item}>
                        <span className={styles.level3Label}>Timestamp</span>
                        <span className={styles.level3Val}>
                          {new Date(primaryAction.createdAt).toISOString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className={styles.insightFooter}>
            <div className={styles.insightBadges}>
              <span className={primaryAction.policyCheckPassed ? styles.badgeVerified : styles.badgeBlocked}>
                {primaryAction.policyCheckPassed ? "POLICY CHECK PASSED" : "POLICY CHECK BLOCKED"}
              </span>
              <span
                className={
                  actionPosition?.routeStatus === "AVAILABLE"
                    ? styles.badgeRouteAvailable
                    : styles.badgeRoute
                }
              >
                ROUTE {actionPosition?.routeStatus ?? "UNKNOWN"}
              </span>
            </div>

            {/* Clear Button Hierarchy: ONE Primary CTA, Ghost secondary */}
            <div className={styles.ctaButtonGroup}>
              <button
                type="button"
                className={styles.ghostActionBtn}
                onClick={() => handleDismissAction(primaryAction.id)}
              >
                Dismiss
              </button>
              <button
                type="button"
                className={styles.primaryReviewBtn}
                onClick={() => void handleReviewAction(primaryAction)}
                disabled={
                  !primaryAction.policyCheckPassed ||
                  actionPosition?.eligibilityStatus !== "ELIGIBLE" ||
                  actionPosition?.routeStatus !== "AVAILABLE"
                }
              >
                Review trade on X Layer
                <ArrowRightIcon size={16} weight="bold" />
              </button>
            </div>
          </div>
          {reviewError ? <p className={styles.inlineError} role="alert">{reviewError}</p> : null}
        </section>
      ) : (
        /* Positive Zero-Action State */
        <section className={styles.zeroActionCard}>
          <CheckCircleIcon size={32} className={styles.zeroActionIcon} weight="fill" />
          <div className={styles.zeroActionContent}>
            <h2 className={styles.zeroActionTitle}>
              No strategy action was proposed.
            </h2>
            <p className={styles.zeroActionDesc}>
              The latest evaluation returned no reviewable action. This preview does not imply continuous monitoring or future compliance.
            </p>
          </div>
        </section>
      )}

      {/* 4. WHAT THIS AGENT KNOWS */}
      <section className={styles.agentKnowledgeCard}>
        <div className={styles.knowledgeHeader}>
          <h2 className={styles.knowledgeTitle}>
            <DatabaseIcon size={20} />
            Available context
          </h2>
        </div>

        <div className={styles.knowledgeSummaryGrid}>
          <div className={styles.knowledgeItem}>
            <span className={styles.knowledgeItemLabel}>Tracked Holdings</span>
            <span className={styles.knowledgeItemValue}>
              {snapshot ? `${positionCount} recognized RWA positions` : "UNKNOWN"}
            </span>
          </div>

          <div className={styles.knowledgeItem}>
            <span className={styles.knowledgeItemLabel}>Cash & Stablecoin Buffer</span>
            <span className={styles.knowledgeItemValue}>
              {snapshot ? `${stablePercent}% observed stablecoin allocation` : "UNKNOWN"}
            </span>
          </div>

          <div className={styles.knowledgeItem}>
            <span className={styles.knowledgeItemLabel}>Trading Profile</span>
            <span className={styles.knowledgeItemValue}>
              {snapshot ? `${tradeCount30d} observed trades in 30 days` : "UNKNOWN"}
            </span>
          </div>
        </div>

        {/* Collapsed Technical Token Balance Table */}
        <button
          type="button"
          className={styles.technicalToggleBtn}
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          aria-expanded={showTechnicalDetails}
        >
          {showTechnicalDetails ? "Hide technical holdings details" : "View technical holdings details"}
          {showTechnicalDetails ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
        </button>

        {showTechnicalDetails && (
          <div className={styles.technicalDrawer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Symbol</th>
                  <th>Amount</th>
                  <th>USD Value</th>
                  <th>Allocation</th>
                </tr>
              </thead>
              <tbody>
                {snapshot?.walletPortfolio?.positions?.map((pos) => (
                  <tr key={pos.assetId}>
                    <td className={styles.dataTablePrimary}>{pos.assetId}</td>
                    <td>{pos.symbol}</td>
                    <td>{pos.balanceFormatted}</td>
                    <td>${(pos.valueUsd ?? 0).toFixed(2)}</td>
                    <td>{((pos.allocationBps || 0) / 100).toFixed(1)}%</td>
                  </tr>
                ))}
                {!snapshot?.walletPortfolio?.positions?.length ? (
                  <tr>
                    <td colSpan={5}>No recognized positions are available.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. ASK AGENT Q&A */}
      <section className={styles.askAgentSection}>
        <div className={styles.askHeader}>
          <h2 className={styles.askTitle}>Ask about your portfolio</h2>
          <span className={styles.askSubtitle}>
            Direct questions answered with deterministic portfolio facts and evidence citations.
          </span>
        </div>

        <div className={styles.chipsRow}>
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => handleAskQuestion("Why are you proposing this?")}
          >
            Why are you proposing this?
          </button>
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => handleAskQuestion("What changed in my portfolio?")}
          >
            What changed?
          </button>
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => handleAskQuestion("What have I traded recently on X Layer?")}
          >
            What have I traded recently?
          </button>
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => handleAskQuestion("What can I trade right now?")}
          >
            What can I trade right now?
          </button>
        </div>

        {messages.length > 0 && (
          <div className={styles.chatBox}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={msg.sender === "user" ? styles.chatUserMsg : styles.chatAgentMsg}
              >
                <div>{msg.text}</div>
                {msg.citations && msg.citations.length > 0 && (
                  <div className={styles.evidenceCitations}>
                    <span>Evidence citations:</span>
                    {msg.citations.map((cite, ci) => (
                      <span key={ci} className={styles.citationPill}>
                        {cite}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isAsking && (
              <div className={styles.chatAgentMsg}>
                <span className={styles.askingStatus}>
                  <ArrowsClockwiseIcon size={14} className={styles.spinIcon} />
                  Analyzing wallet context and strategy rules...
                </span>
              </div>
            )}
          </div>
        )}

        <form
          className={styles.askInputRow}
          onSubmit={(e) => {
            e.preventDefault();
            handleAskQuestion();
          }}
        >
          <label className="sr-only" htmlFor="agent-question">
            Ask about portfolio allocations or strategy rules
          </label>
          <input
            type="text"
            id="agent-question"
            className={styles.askInput}
            placeholder="Ask about allocations or strategy rules..."
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            disabled={isAsking}
          />
          <button
            type="submit"
            className={styles.askSendBtn}
            disabled={!inputQuestion.trim() || isAsking}
          >
            Ask
          </button>
        </form>
      </section>

      {/* Trade Drawer for reviewing and executing actions */}
      <TradeDrawer
        isOpen={isTradeDrawerOpen}
        onClose={() => setIsTradeDrawerOpen(false)}
        asset={selectedAssetForTrade}
        initialPaymentTokenAddress={tradePaymentTokenAddr}
        initialAmount={tradeAmount}
        onTradeSuccess={handleTradeSuccess}
      />
    </div>
  );
}
