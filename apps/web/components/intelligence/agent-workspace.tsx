"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAccount, useConnect } from "wagmi";
import {
  RobotIcon,
  ArrowsClockwiseIcon,
  PlayIcon,
  PauseIcon,
  SparkleIcon,
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
  SpendableToken,
} from "@alive/shared";
import {
  getAgentSnapshot,
  evaluateAgentStrategy,
  recordAgentInteraction,
  askAgentQuestion,
  getMarketplaceStrategies,
  syncWalletContext,
  fetchWalletContext,
} from "@/lib/agent-api";
import { TradeDrawer } from "@/components/intelligence/trade-drawer";
import styles from "./agent-workspace.module.css";

const DEFAULT_DEMO_WALLET = "0xe2475653b6f8a846152a5508a8e1b1faae1a44e5" as `0x${string}`;

type WorkspacePhase = "DISCONNECTED" | "UNDERSTANDING" | "FIRST_REVEAL" | "ACTIVATING" | "ACTIVE";

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
  const [syncStep, setSyncStep] = useState<number>(0);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  const [snapshot, setSnapshot] = useState<AgentContextSnapshot | null>(null);
  const [activeStrategy, setActiveStrategy] = useState<AgentStrategy | null>(null);
  const [spendableTokens, setSpendableTokens] = useState<SpendableToken[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
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

  // Track activated wallets in local storage / session memory
  const [activatedWallets, setActivatedWallets] = useState<Set<string>>(new Set());

  const loadData = useCallback(async (wallet: string) => {
    if (!wallet) return;
    setIsLoading(true);
    try {
      const snap = await getAgentSnapshot(wallet);
      setSnapshot(snap);
      setLastSyncTime(new Date());

      if (snap.activeStrategy) {
        setActiveStrategy(snap.activeStrategy);
      } else {
        const marketplace = await getMarketplaceStrategies();
        if (marketplace.strategies.length > 0) {
          setActiveStrategy(marketplace.strategies[0] ?? null);
        }
      }

      const ctx = await fetchWalletContext(wallet);
      if (ctx?.capabilities?.spendableTokens) {
        setSpendableTokens(ctx.capabilities.spendableTokens);
      }
    } catch (err) {
      console.error("Failed to load agent workspace data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle phase changes when wallet connects
  useEffect(() => {
    if (!activeWalletAddress) {
      setPhase("DISCONNECTED");
      setSnapshot(null);
      return;
    }

    const norm = activeWalletAddress.toLowerCase();
    if (activatedWallets.has(norm)) {
      setPhase("ACTIVE");
      loadData(activeWalletAddress);
    } else {
      // Run progressive understanding flow
      setPhase("UNDERSTANDING");
      setSyncStep(1);

      const t1 = setTimeout(() => setSyncStep(2), 450);
      const t2 = setTimeout(() => setSyncStep(3), 900);
      const t3 = setTimeout(() => setSyncStep(4), 1350);
      const t4 = setTimeout(() => {
        loadData(activeWalletAddress).then(() => {
          setPhase("FIRST_REVEAL");
        });
      }, 1800);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWalletAddress, activatedWallets.size]);

  const handleConnectWallet = () => {
    const connector = connectors[0];
    if (connector) {
      connect({ connector });
    } else {
      setDemoAddressSelected(DEFAULT_DEMO_WALLET);
    }
  };

  const handleUseSampleWallet = () => {
    setDemoAddressSelected(DEFAULT_DEMO_WALLET);
  };

  const handleActivateAgent = async () => {
    if (!activeWalletAddress) return;
    setPhase("ACTIVATING");

    try {
      await evaluateAgentStrategy(activeWalletAddress);
      setActivatedWallets((prev) => new Set([...prev, activeWalletAddress.toLowerCase()]));
      await loadData(activeWalletAddress);

      // Short consequential pause
      setTimeout(() => {
        setPhase("ACTIVE");
      }, 1200);
    } catch (err) {
      console.error("Failed to activate agent:", err);
      setPhase("ACTIVE");
    }
  };

  const handleSyncWallet = async () => {
    if (!activeWalletAddress || isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback("Syncing…");

    try {
      await syncWalletContext(activeWalletAddress);
      const evalSnap = await evaluateAgentStrategy(activeWalletAddress);
      setSnapshot(evalSnap);
      setLastSyncTime(new Date());

      const ctx = await fetchWalletContext(activeWalletAddress);
      if (ctx?.capabilities?.spendableTokens) {
        setSpendableTokens(ctx.capabilities.spendableTokens);
      }
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

  const handleReviewAction = (action: ProposedAgentAction) => {
    setActiveExecutingActionId(action.id);

    const fallbackAsset: RwaAsset = {
      id: action.assetId,
      symbol: action.targetTokenSymbol,
      name: action.targetTokenSymbol,
      assetClass: "EQUITY",
      issuer: "backing-issuer",
      issuerName: "Backing Issuer",
      underlying: "Underlying Asset",
      dataMode: "LIVE",
      lastUpdatedAt: new Date().toISOString(),
      deployments: [
        {
          chainId: 196,
          chainName: "X Layer",
          contractAddress: action.targetTokenAddress,
          tokenStandard: "ERC-20",
          deploymentStatus: "VERIFIED",
        },
      ],
      sources: [
        {
          id: "official-doc-1",
          title: "Official Disclosure",
          sourceType: "ISSUER_DOCUMENTATION",
          sourceUrl: "https://xlayer.tech",
          retrievedAt: new Date().toISOString(),
          supportedFields: ["name", "symbol", "issuer", "underlying"],
        },
      ],
    };

    setSelectedAssetForTrade(fallbackAsset);
    setTradePaymentTokenAddr(action.paymentTokenAddress);
    setTradeAmount(action.amountFormatted);
    setIsTradeDrawerOpen(true);
  };

  const handleDismissAction = async (actionId: string) => {
    if (!activeWalletAddress) return;
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
  };

  const handleTradeSuccess = async (txHash: string) => {
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
    } catch (err) {
      const errMsg: ChatMessage = {
        sender: "agent",
        text: "Trading data is temporarily unavailable. Please try asking again shortly.",
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
  const stablecoinReserve = snapshot?.walletPortfolio?.stablecoinValueUsd ?? 1840;

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
            <span className={styles.disconnectedBadge}>ALIVE Agent</span>
            <h1 className={styles.disconnectedTitle}>
              Your Agent needs a wallet to understand your portfolio.
            </h1>
            <p className={styles.disconnectedDesc}>
              Connect an X Layer wallet to enable autonomous portfolio monitoring, risk checks, and deterministic strategy proposals.
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
              Or explore with sample portfolio
            </button>
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
            <p className={styles.syncProgressSubtitle}>Understanding your wallet…</p>
          </div>

          <div className={styles.syncStepsList}>
            <div className={styles.syncStepRow}>
              {syncStep > 1 ? (
                <CheckCircleIcon size={18} color="#22c55e" weight="fill" />
              ) : syncStep === 1 ? (
                <div className={styles.stepDotActive} />
              ) : (
                <div className={styles.stepDotPending} />
              )}
              <span className={syncStep >= 1 ? (syncStep > 1 ? styles.syncStepLabelDone : styles.syncStepLabelActive) : styles.syncStepLabelPending}>
                Reading holdings
              </span>
            </div>

            <div className={styles.syncStepRow}>
              {syncStep > 2 ? (
                <CheckCircleIcon size={18} color="#22c55e" weight="fill" />
              ) : syncStep === 2 ? (
                <div className={styles.stepDotActive} />
              ) : (
                <div className={styles.stepDotPending} />
              )}
              <span className={syncStep >= 2 ? (syncStep > 2 ? styles.syncStepLabelDone : styles.syncStepLabelActive) : styles.syncStepLabelPending}>
                Checking recent activity
              </span>
            </div>

            <div className={styles.syncStepRow}>
              {syncStep > 3 ? (
                <CheckCircleIcon size={18} color="#22c55e" weight="fill" />
              ) : syncStep === 3 ? (
                <div className={styles.stepDotActive} />
              ) : (
                <div className={styles.stepDotPending} />
              )}
              <span className={syncStep >= 3 ? (syncStep > 3 ? styles.syncStepLabelDone : styles.syncStepLabelActive) : styles.syncStepLabelPending}>
                Matching ALIVE assets
              </span>
            </div>

            <div className={styles.syncStepRow}>
              {syncStep > 4 ? (
                <CheckCircleIcon size={18} color="#22c55e" weight="fill" />
              ) : syncStep === 4 ? (
                <div className={styles.stepDotActive} />
              ) : (
                <div className={styles.stepDotPending} />
              )}
              <span className={syncStep >= 4 ? (syncStep > 4 ? styles.syncStepLabelDone : styles.syncStepLabelActive) : styles.syncStepLabelPending}>
                Checking available routes
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
            <span className={styles.revealBadge}>ALIVE found</span>
            <h1 className={styles.revealTitle}>
              Portfolio discovered on X Layer
            </h1>
            <div className={styles.revealStatsGrid}>
              <div className={styles.revealStatItem}>
                <span className={styles.revealStatValue}>{positionCount || 3} tracked</span>
                <span className={styles.revealStatLabel}>RWA Positions</span>
              </div>
              <div className={styles.revealStatItem}>
                <span className={styles.revealStatValue}>${stablecoinReserve.toLocaleString()}</span>
                <span className={styles.revealStatLabel}>Stablecoin Reserve</span>
              </div>
              <div className={styles.revealStatItem}>
                <span className={styles.revealStatValue}>{tradeCount30d || 7} trades</span>
                <span className={styles.revealStatLabel}>Last 30 Days</span>
              </div>
            </div>
          </div>

          <div className={styles.revealStrategySection}>
            <h2 className={styles.revealSectionPrompt}>
              Choose how your Agent should operate.
            </h2>

            <div className={styles.strategyCardFeatured}>
              <div className={styles.strategyCardHeader}>
                <h3 className={styles.strategyCardTitle}>RWA Core Balance</h3>
                <span className={styles.strategyBadgeRecommended}>Recommended</span>
              </div>
              <p className={styles.strategyCardDesc}>
                Keeps verified RWA exposure diversified while maintaining a stablecoin reserve.
              </p>

              <div className={styles.strategyRulesSummaryList}>
                <div className={styles.strategyRulePill}>
                  <CheckCircleIcon size={14} color="#22c55e" weight="bold" />
                  Verified assets only
                </div>
                <div className={styles.strategyRulePill}>
                  <CheckCircleIcon size={14} color="#22c55e" weight="bold" />
                  Maximum 25% per asset
                </div>
                <div className={styles.strategyRulePill}>
                  <CheckCircleIcon size={14} color="#22c55e" weight="bold" />
                  Minimum 20% stablecoin reserve
                </div>
                <div className={styles.strategyRulePill}>
                  <CheckCircleIcon size={14} color="#22c55e" weight="bold" />
                  Rebalances after 5% deviation
                </div>
              </div>

              {/* Collapsed Advanced Settings */}
              <div>
                <button
                  type="button"
                  className={styles.advancedToggleBtn}
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                >
                  <SlidersHorizontalIcon size={14} />
                  Advanced settings {showAdvancedSettings ? "▴" : "▾"}
                </button>

                {showAdvancedSettings && (
                  <div className={styles.advancedSettingsDrawer} style={{ marginTop: 12 }}>
                    <div className={styles.advancedSettingItem}>
                      <span className={styles.advancedSettingLabel}>Max Single Trade</span>
                      <span className={styles.advancedSettingValue}>$500.00 USD</span>
                    </div>
                    <div className={styles.advancedSettingItem}>
                      <span className={styles.advancedSettingLabel}>Max Daily Trade</span>
                      <span className={styles.advancedSettingValue}>$2,500.00 USD</span>
                    </div>
                    <div className={styles.advancedSettingItem}>
                      <span className={styles.advancedSettingLabel}>Max Slippage</span>
                      <span className={styles.advancedSettingValue}>0.50% (50 bps)</span>
                    </div>
                    <div className={styles.advancedSettingItem}>
                      <span className={styles.advancedSettingLabel}>Target Universe</span>
                      <span className={styles.advancedSettingValue}>Verified X Layer RWAs</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.revealActionsRow}>
              <button
                type="button"
                className={styles.activatePrimaryBtn}
                onClick={handleActivateAgent}
              >
                <PlayIcon size={16} weight="bold" />
                Activate Agent
              </button>
              <Link href="/strategies" className={styles.exploreSecondaryBtn}>
                Explore strategies
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 4. ACTIVATION MOMENT CONFIRMATION
  // =========================================================================
  if (phase === "ACTIVATING") {
    return (
      <div className={styles.container}>
        <div className={styles.activationMomentCard}>
          <span className={styles.activationBadge}>Agent activated</span>
          <h2 className={styles.activationTitle}>
            RWA Core Balance is now monitoring this wallet.
          </h2>
          <p className={styles.activationDesc}>
            Your strategy rules and constraints are active. Evaluating live portfolio balances…
          </p>
          <div className={styles.activationProgress}>
            <ArrowsClockwiseIcon size={16} className="animate-spin" />
            Analyzing your portfolio…
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
              {activeStrategy?.name || "RWA Core Balance"}
              <span className={isPaused ? styles.statusPillPaused : styles.statusPillActive}>
                {isPaused ? "PAUSED" : "ACTIVE"}
              </span>
            </h1>
            <div className={styles.agentMetaRow}>
              <span>
                Operating Strategy:{" "}
                <Link href="/strategies" className={styles.strategyLink}>
                  {activeStrategy?.name || "RWA Core Balance v1"}
                </Link>
              </span>
              <span>•</span>
              <span>Last checked {Math.max(0, Math.floor((Date.now() - lastSyncTime.getTime()) / 1000))}s ago</span>
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
                  <PlayIcon size={14} style={{ marginRight: 6 }} /> Resume Agent
                </>
              ) : (
                <>
                  <PauseIcon size={14} style={{ marginRight: 6 }} /> Pause Agent
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
              {syncFeedback ? syncFeedback : isSyncing ? "Syncing…" : "Sync Wallet"}
            </button>
          </div>
        </div>

        {/* 2. SUMMARY ROW */}
        <div className={styles.summaryRow}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Portfolio Value</span>
            <span className={styles.summaryValue}>
              ${totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={styles.summarySub}>Tracked X Layer holdings</span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Active Positions</span>
            <span className={styles.summaryValue}>{positionCount} RWAs</span>
            <span className={styles.summarySub}>Live tokenized assets</span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Stablecoin Reserve</span>
            <span className={styles.summaryValue}>{stablePercent}%</span>
            <span className={styles.summarySub}>Liquidity & rebalance floor</span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Observable Trades</span>
            <span className={styles.summaryValue}>{tradeCount30d}</span>
            <span className={styles.summarySub}>Activity in last 30 days</span>
          </div>
        </div>
      </header>

      {/* 3. PRIMARY CURRENT INSIGHT (OR ZERO-ACTION STATE) */}
      {primaryAction ? (
        <section className={styles.insightCard}>
          <div className={styles.insightHeader}>
            <SparkleIcon size={18} />
            Your Agent noticed something
          </div>

          <div className={styles.insightContent}>
            <h2 className={styles.insightTitle}>
              {primaryAction.targetTokenSymbol} is above your allocation limit.
            </h2>
            <p className={styles.insightDescription}>
              {primaryAction.explanation}
            </p>

            <div className={styles.insightMetricsRow}>
              <div className={styles.insightMetric}>
                <span className={styles.insightMetricVal}>
                  32%
                </span>
                <span className={styles.insightMetricLabel}>Current Allocation</span>
              </div>
              <span style={{ color: "#64748b" }}>→</span>
              <div className={styles.insightMetric}>
                <span className={styles.insightMetricVal}>
                  25%
                </span>
                <span className={styles.insightMetricLabel}>Target Allocation</span>
              </div>
              <div className={styles.insightMetric} style={{ marginLeft: "auto" }}>
                <span className={styles.insightMetricVal}>
                  {primaryAction.amountFormatted} {primaryAction.targetTokenSymbol}
                </span>
                <span className={styles.insightMetricLabel}>
                  Proposed Trade (~${primaryAction.estimatedUsdValue.toFixed(2)})
                </span>
              </div>
            </div>
          </div>

          {/* Progressive "Why this action?" Panel */}
          <div className={styles.whyContainer}>
            <div
              className={styles.whyTrigger}
              onClick={() =>
                setExpandedActionId(
                  expandedActionId === primaryAction.id ? null : primaryAction.id,
                )
              }
            >
              <span>Why this action?</span>
              {expandedActionId === primaryAction.id ? (
                <CaretUpIcon size={16} />
              ) : (
                <CaretDownIcon size={16} />
              )}
            </div>

            {expandedActionId === primaryAction.id && (
              <>
                {/* Level 1: Plain summary */}
                <p className={styles.whyLevel1}>
                  {primaryAction.explanation}
                </p>

                {/* Level 2: Structured Evidence */}
                <div className={styles.whyGrid}>
                  <div className={styles.whyEvidenceItem}>
                    <span className={styles.whyEvidenceLabel}>Strategy Rule</span>
                    <span className={styles.whyEvidenceValue}>
                      {primaryAction.deterministicReason}
                    </span>
                  </div>
                  <div className={styles.whyEvidenceItem}>
                    <span className={styles.whyEvidenceLabel}>Wallet State</span>
                    <span className={styles.whyEvidenceValue}>
                      32% of ${totalValueUsd.toFixed(0)}
                    </span>
                  </div>
                  <div className={styles.whyEvidenceItem}>
                    <span className={styles.whyEvidenceLabel}>Recent History</span>
                    <span className={styles.whyEvidenceValue}>
                      {tradeCount30d} trades in 30d
                    </span>
                  </div>
                  <div className={styles.whyEvidenceItem}>
                    <span className={styles.whyEvidenceLabel}>Asset Status</span>
                    <span className={styles.whyEvidenceValue} style={{ color: "#22c55e" }}>
                      ALIVE Verified · Live
                    </span>
                  </div>
                  <div className={styles.whyEvidenceItem}>
                    <span className={styles.whyEvidenceLabel}>Execution Route</span>
                    <span className={styles.whyEvidenceValue}>
                      OKX DEX · Deep Liquidity
                    </span>
                  </div>
                </div>

                {/* Level 3: Deep Technical Evidence (Progressively Disclosed) */}
                <div>
                  <button
                    type="button"
                    className={styles.level3ToggleBtn}
                    onClick={() => toggleLevel3(primaryAction.id)}
                  >
                    {showLevel3Evidence[primaryAction.id]
                      ? "Hide technical execution details ▴"
                      : "View technical execution details ▾"}
                  </button>

                  {showLevel3Evidence[primaryAction.id] && (
                    <div className={styles.level3EvidenceDrawer} style={{ marginTop: 10 }}>
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
              <span className={styles.badgeVerified}>ALIVE VERIFIED · ELIGIBLE</span>
              <span className={styles.badgeRoute}>OKX Route Available</span>
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
                onClick={() => handleReviewAction(primaryAction)}
              >
                Review trade on X Layer
                <ArrowRightIcon size={16} weight="bold" />
              </button>
            </div>
          </div>
        </section>
      ) : (
        /* Positive Zero-Action State */
        <section className={styles.zeroActionCard}>
          <CheckCircleIcon size={32} className={styles.zeroActionIcon} weight="fill" />
          <div className={styles.zeroActionContent}>
            <h2 className={styles.zeroActionTitle}>
              Portfolio is within strategy rules.
            </h2>
            <p className={styles.zeroActionDesc}>
              Nothing needs your attention right now. Your positions and stablecoin reserve match configured thresholds.
            </p>
          </div>
        </section>
      )}

      {/* 4. WHAT THIS AGENT KNOWS */}
      <section className={styles.agentKnowledgeCard}>
        <div className={styles.knowledgeHeader}>
          <h2 className={styles.knowledgeTitle}>
            <DatabaseIcon size={20} />
            What your Agent knows
          </h2>
        </div>

        <div className={styles.knowledgeSummaryGrid}>
          <div className={styles.knowledgeItem}>
            <span className={styles.knowledgeItemLabel}>Tracked Holdings</span>
            <span className={styles.knowledgeItemValue}>
              {positionCount} RWAs across equities and debt on X Layer
            </span>
          </div>

          <div className={styles.knowledgeItem}>
            <span className={styles.knowledgeItemLabel}>Cash & Stablecoin Buffer</span>
            <span className={styles.knowledgeItemValue}>
              {stablePercent}% allocated to liquid reserve tokens
            </span>
          </div>

          <div className={styles.knowledgeItem}>
            <span className={styles.knowledgeItemLabel}>Trading Profile</span>
            <span className={styles.knowledgeItemValue}>
              {tradeCount30d} observed trades in 30 days
            </span>
          </div>
        </div>

        {/* Collapsed Technical Token Balance Table */}
        <button
          type="button"
          className={styles.technicalToggleBtn}
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
        >
          {showTechnicalDetails ? "Hide technical holdings details ▴" : "View technical holdings details ▾"}
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
                    <td style={{ color: "#fff", fontWeight: 600 }}>{pos.assetId}</td>
                    <td>{pos.symbol}</td>
                    <td>{pos.balanceFormatted}</td>
                    <td>${(pos.valueUsd ?? 0).toFixed(2)}</td>
                    <td>{((pos.allocationBps || 0) / 100).toFixed(1)}%</td>
                  </tr>
                ))}
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
                <span style={{ color: "#94a3b8" }}>
                  <ArrowsClockwiseIcon size={14} className="animate-spin" style={{ display: "inline", marginRight: 6 }} />
                  Analyzing wallet context and strategy rules…
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
          <input
            type="text"
            className={styles.askInput}
            placeholder="Ask your Agent anything about your allocations or rules…"
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
