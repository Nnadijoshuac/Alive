"use client";

import React, { useEffect, useState } from "react";
import type {
  AgentContextSnapshot,
  AgentStrategy,
  ProposedAgentAction,
  RwaAsset,
  WalletContext,
} from "@alive/shared";
import {
  ArrowClockwiseIcon,
  BrainIcon,
  CheckCircleIcon,
  CpuIcon,
  DatabaseIcon,
  LightningIcon,
  RobotIcon,
  ScalesIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import {
  askAgent,
  cloneStrategy,
  fetchAgentSnapshot,
  fetchMarketplaceStrategies,
  fetchWalletContext,
  fetchWalletStrategies,
  recordAgentInteraction,
  setActiveStrategy,
  syncWalletContext,
} from "@/lib/agent-api";
import {
  connectWallet,
  getConnectedAccount,
  isWalletAvailable,
} from "@/lib/rwa-trade";
import { TradeDrawer } from "./trade-drawer";
import styles from "./agent-workspace.module.css";

const DEMO_WALLET = "0xe2475653b6f8a846152a5508a8e1b1faae1a44e5";

type ChatItem = {
  id: string;
  sender: "USER" | "AGENT";
  text: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW" | undefined;
  citations?: string[] | undefined;
  timestamp: string;
};

export function AgentWorkspace() {
  const [walletAddress, setWalletAddress] = useState<string>(DEMO_WALLET);
  const [isLiveWalletConnected, setIsLiveWalletConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Agent Context Data
  const [snapshot, setSnapshot] = useState<AgentContextSnapshot | null>(null);
  const [walletContext, setWalletContext] = useState<WalletContext | null>(null);
  const [marketplaceStrategies, setMarketplaceStrategies] = useState<AgentStrategy[]>([]);
  const [userStrategies, setUserStrategies] = useState<AgentStrategy[]>([]);

  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<"PROPOSALS" | "WALLET_INTEL" | "MARKETPLACE" | "ASK">("PROPOSALS");
  const [expandedWhy, setExpandedWhy] = useState<Record<string, boolean>>({});

  // Chat Q&A state
  const [chatHistory, setChatHistory] = useState<ChatItem[]>([
    {
      id: "init-1",
      sender: "AGENT",
      text: "Hello. I am your ALIVE Portfolio Agent on X Layer. I monitor your onchain positions, spendable tokens, and deterministic policy rules to propose verifiable capital rebalancing.",
      confidence: "HIGH",
      citations: ["alive_core_agent", "xlayer_mainnet"],
      timestamp: new Date().toISOString(),
    },
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isAsking, setIsAsking] = useState<boolean>(false);

  // Trade Drawer Execution State
  const [selectedAssetForTrade, setSelectedAssetForTrade] = useState<RwaAsset | null>(null);
  const [tradePaymentTokenAddr, setTradePaymentTokenAddr] = useState<string | undefined>(undefined);
  const [tradeAmount, setTradeAmount] = useState<string | undefined>(undefined);
  const [isTradeDrawerOpen, setIsTradeDrawerOpen] = useState<boolean>(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  // 1. Initial Wallet Detection & Context Loading
  useEffect(() => {
    async function init() {
      if (isWalletAvailable()) {
        const connected = await getConnectedAccount();
        if (connected) {
          setWalletAddress(connected);
          setIsLiveWalletConnected(true);
        }
      }
    }
    init();
  }, []);

  // 2. Load Agent Snapshot & Strategies for Current Wallet
  const loadAgentData = async (addr: string, force = false) => {
    setIsLoading(true);
    try {
      const [snap, stratList] = await Promise.all([
        fetchAgentSnapshot(addr, force),
        fetchMarketplaceStrategies(),
      ]);
      setSnapshot(snap);
      setMarketplaceStrategies(stratList);
      if (snap.walletPortfolio) {
        // Fetch full context
        const ctx = await fetchWalletContext(addr, force);
        setWalletContext(ctx);
      }
      const userStrats = await fetchWalletStrategies(addr);
      setUserStrategies(userStrats);
    } catch (err) {
      console.error("Failed to load agent snapshot:", err);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadAgentData(walletAddress);
  }, [walletAddress]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncWalletContext(walletAddress);
      await loadAgentData(walletAddress, true);
    } catch (err) {
      console.error("Sync failed:", err);
      setIsSyncing(false);
    }
  };

  const handleConnectWallet = async () => {
    try {
      const acc = await connectWallet();
      if (acc) {
        setWalletAddress(acc);
        setIsLiveWalletConnected(true);
      }
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
  };

  // Action Handling
  const handleApproveAndTrade = async (action: ProposedAgentAction) => {
    setActiveActionId(action.id);
    // Record interaction
    await recordAgentInteraction({
      id: `int-${Date.now()}`,
      agentId: "agent-alive-core-v1",
      walletAddress: walletAddress as `0x${string}`,
      actionId: action.id,
      event: "APPROVED",
      timestamp: new Date().toISOString(),
    });

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
    await recordAgentInteraction({
      id: `int-${Date.now()}`,
      agentId: "agent-alive-core-v1",
      walletAddress: walletAddress as `0x${string}`,
      actionId,
      event: "DISMISSED",
      timestamp: new Date().toISOString(),
    });

    // Remove from active view
    if (snapshot) {
      setSnapshot({
        ...snapshot,
        proposedActions: snapshot.proposedActions.filter((a) => a.id !== actionId),
      });
    }
  };

  const handleTradeSuccess = async (txHash: string) => {
    if (activeActionId) {
      await recordAgentInteraction({
        id: `int-${Date.now()}`,
        agentId: "agent-alive-core-v1",
        walletAddress: walletAddress as `0x${string}`,
        actionId: activeActionId,
        event: "EXECUTED",
        txHash,
        timestamp: new Date().toISOString(),
      });
    }
    // Re-sync wallet state
    handleSync();
  };

  // Strategy Activation
  const handleSelectStrategy = async (strategyId: string) => {
    await setActiveStrategy(walletAddress, strategyId);
    await loadAgentData(walletAddress, true);
  };

  const handleCloneStrategy = async (strategyId: string) => {
    const cloned = await cloneStrategy(strategyId, walletAddress);
    if (cloned) {
      await setActiveStrategy(walletAddress, cloned.id);
      await loadAgentData(walletAddress, true);
    }
  };

  // Chat Q&A
  const handleSendChat = async (questionText?: string) => {
    const q = (questionText || chatInput).trim();
    if (!q || isAsking) return;

    const userMsg: ChatItem = {
      id: `user-${Date.now()}`,
      sender: "USER",
      text: q,
      timestamp: new Date().toISOString(),
    };

    setChatHistory((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsAsking(true);

    try {
      const res = await askAgent(walletAddress, q);
      const agentMsg: ChatItem = {
        id: `agent-${Date.now()}`,
        sender: "AGENT",
        text: res.answer,
        confidence: res.confidence,
        citations: res.citations,
        timestamp: new Date().toISOString(),
      };
      setChatHistory((prev) => [...prev, agentMsg]);
    } catch {
      const errorMsg: ChatItem = {
        id: `agent-${Date.now()}`,
        sender: "AGENT",
        text: "I encountered an error querying the portfolio intelligence service. Please retry.",
        confidence: "LOW",
        timestamp: new Date().toISOString(),
      };
      setChatHistory((prev) => [...prev, errorMsg]);
    } finally {
      setIsAsking(false);
    }
  };

  const toggleWhy = (actionId: string) => {
    setExpandedWhy((prev) => ({
      ...prev,
      [actionId]: !prev[actionId],
    }));
  };

  const portfolio = snapshot?.walletPortfolio;
  const behavior = snapshot?.walletHistorySummary;
  const activeStrategy = snapshot?.activeStrategy;
  const proposedActions = snapshot?.proposedActions || [];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>ALIVE Agent Workspace</h1>
            <span className={styles.badge}>
              <RobotIcon size={14} weight="fill" />
              Autonomous Portfolio Intelligence
            </span>
          </div>
          <p className={styles.subtitle}>
            A context-aware portfolio agent continuously reading your onchain activity, positions, spendables, and deterministic policy to propose non-custodial rebalancing.
          </p>
        </div>

        <div className={styles.walletControls}>
          <div className={styles.walletBadge}>
            <span className={styles.walletDot} />
            {isLiveWalletConnected ? "Connected: " : "Demo Wallet: "}
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </div>
          {!isLiveWalletConnected && (
            <button
              className={styles.syncButton}
              onClick={handleConnectWallet}
              title="Connect real Web3 wallet"
            >
              Connect Wallet
            </button>
          )}
          <button
            className={styles.syncButton}
            onClick={handleSync}
            disabled={isSyncing}
            title="Refresh onchain holdings & evaluate policy"
          >
            <ArrowClockwiseIcon
              size={16}
              className={isSyncing ? "animate-spin" : ""}
            />
            {isSyncing ? "Syncing..." : "Sync State"}
          </button>
        </div>
      </div>

      {/* Top Metrics Grid */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Total Portfolio Value</span>
          <span className={styles.metricValue}>
            ${(portfolio?.totalValueUsd || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={styles.metricSub}>X Layer Verified Assets</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Stablecoin Reserve</span>
          <span className={styles.metricValue}>
            {portfolio?.stablecoinPct || 0}%
          </span>
          <span className={styles.metricSub}>USDC / USDT Liquid Holdings</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>30-Day Activity</span>
          <span className={styles.metricValue}>
            {behavior?.tradesLast30d || 0} Trades
          </span>
          <span className={styles.metricSub}>
            {behavior?.observedTradeCount || 0} lifetime observed
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Median Trade Size</span>
          <span className={styles.metricValue}>
            ${(behavior?.medianTradeSizeUsd || 0).toFixed(0)}
          </span>
          <span className={styles.metricSub}>Conservative sizing baseline</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Gas Reserve (OKB)</span>
          <span className={styles.metricValue}>
            {parseFloat(walletContext?.capabilities.gasBalanceFormatted || "0.0").toFixed(4)}
          </span>
          <span className={styles.metricSub}>
            {BigInt(walletContext?.capabilities.gasBalance || "0") > 1_000_000_000_000_000n
              ? "Ready for Gas"
              : "Low Gas Balance"}
          </span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className={styles.tabsNav}>
        <button
          className={`${styles.tabButton} ${activeTab === "PROPOSALS" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("PROPOSALS")}
        >
          <LightningIcon size={18} />
          Action Proposals
          {proposedActions.length > 0 && (
            <span className={styles.tabCount}>{proposedActions.length}</span>
          )}
        </button>

        <button
          className={`${styles.tabButton} ${activeTab === "WALLET_INTEL" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("WALLET_INTEL")}
        >
          <DatabaseIcon size={18} />
          What This Agent Knows
        </button>

        <button
          className={`${styles.tabButton} ${activeTab === "MARKETPLACE" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("MARKETPLACE")}
        >
          <SlidersHorizontalIcon size={18} />
          Strategy Marketplace
        </button>

        <button
          className={`${styles.tabButton} ${activeTab === "ASK" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("ASK")}
        >
          <BrainIcon size={18} />
          Ask Agent Q&A
        </button>
      </div>

      {/* TAB 1: ACTION PROPOSALS */}
      {activeTab === "PROPOSALS" && (
        <div className={styles.proposalsContainer}>
          {/* Active Strategy Header Banner */}
          <div className={styles.strategyBanner}>
            <div className={styles.strategyBannerInfo}>
              <div className={styles.strategyBannerTitleRow}>
                <span className={styles.strategyBannerTitle}>
                  Active Strategy: {activeStrategy?.name || "RWA Core Balance v1"}
                </span>
                <span className={styles.badge}>Live Rule Enforcement</span>
              </div>
              <span className={styles.strategyBannerDesc}>
                {activeStrategy?.description}
              </span>
              <div className={styles.strategyRulesBadge}>
                <span>Rules: {activeStrategy?.rules.length || 0} active constraints</span>
                <span>•</span>
                <span>Target: {activeStrategy?.targetAssetClasses.join(", ")}</span>
              </div>
            </div>

            <button
              className={styles.cloneButton}
              onClick={() => setActiveTab("MARKETPLACE")}
            >
              Switch Strategy
            </button>
          </div>

          {/* Proposals List */}
          {proposedActions.length === 0 ? (
            <div className={styles.emptyState}>
              <ShieldCheckIcon size={48} color="#22c55e" />
              <span className={styles.emptyTitle}>Portfolio In Policy Compliance</span>
              <span className={styles.emptyDesc}>
                Your wallet allocations currently satisfy all deterministic rules in &apos;{activeStrategy?.name}&apos;. The agent will propose rebalancing if market prices drift or cash reserves fluctuate.
              </span>
            </div>
          ) : (
            proposedActions.map((action) => {
              const isWhyOpen = expandedWhy[action.id] ?? true;
              return (
                <div key={action.id} className={styles.proposalCard}>
                  <div className={styles.proposalHeader}>
                    <div className={styles.proposalActionInfo}>
                      <span
                        className={
                          action.actionType === "BUY"
                            ? styles.actionPillBuy
                            : action.actionType === "SELL"
                              ? styles.actionPillSell
                              : styles.actionPillRebalance
                        }
                      >
                        {action.actionType}
                      </span>
                      <span className={styles.proposalTarget}>
                        {action.targetTokenSymbol}
                      </span>
                      <span className={styles.proposalAmount}>
                        {action.amountFormatted} {action.paymentTokenSymbol}
                        <span className={styles.proposalAmountSub}>
                          (~${action.estimatedUsdValue.toFixed(2)})
                        </span>
                      </span>
                    </div>

                    <div className={styles.actionButtons}>
                      {action.policyCheckPassed ? (
                        <button
                          className={styles.tradeButton}
                          onClick={() => handleApproveAndTrade(action)}
                        >
                          <LightningIcon size={16} weight="bold" />
                          Approve & Trade on X Layer
                        </button>
                      ) : (
                        <button className={styles.tradeButton} disabled>
                          Execution Blocked
                        </button>
                      )}
                      <button
                        className={styles.dismissButton}
                        onClick={() => handleDismissAction(action.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>

                  {/* Why Breakdown */}
                  <div className={styles.whySection}>
                    <div className={styles.whyHeader} onClick={() => toggleWhy(action.id)}>
                      <span className={styles.whyTitle}>
                        <BrainIcon size={16} weight="bold" />
                        Why did the agent propose this?
                      </span>
                      <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                        {isWhyOpen ? "▲ Hide" : "▼ Show"}
                      </span>
                    </div>

                    {isWhyOpen && (
                      <div className={styles.whyContent}>
                        <div>
                          <strong>Deterministic Rule:</strong> {action.explanation}
                        </div>
                        <div>
                          <strong>Observed Metric:</strong> {action.deterministicReason}
                        </div>
                        <div>
                          <strong>Context Evidence:</strong>
                          <ul className={styles.evidenceList}>
                            {action.contextEvidence.map((ev, i) => (
                              <li key={i}>{ev}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Policy & Capability Status */}
                  <div className={styles.policyStatusRow}>
                    {action.policyCheckPassed ? (
                      <span className={styles.policyBadgePass}>
                        <CheckCircleIcon size={14} weight="fill" />
                        Policy Guard: PASS (Contract verified, route available, gas ready)
                      </span>
                    ) : (
                      <span className={styles.policyBadgeBlocked}>
                        <WarningCircleIcon size={14} weight="fill" />
                        Policy Guard: BLOCKED ({action.policyViolationReason})
                      </span>
                    )}

                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Created: {new Date(action.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: WHAT THIS AGENT KNOWS */}
      {activeTab === "WALLET_INTEL" && (
        <div className={styles.walletContextGrid}>
          {/* Holdings */}
          <div className={styles.contextSection}>
            <span className={styles.contextSectionTitle}>
              <DatabaseIcon size={18} color="#22c55e" />
              Onchain Holdings (X Layer)
            </span>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Balance</th>
                  <th>Value (USD)</th>
                  <th>Alloc</th>
                </tr>
              </thead>
              <tbody>
                {portfolio?.positions.map((pos) => (
                  <tr key={pos.assetId}>
                    <td>{pos.symbol}</td>
                    <td>{pos.balanceFormatted}</td>
                    <td>${(pos.valueUsd || 0).toFixed(2)}</td>
                    <td>{((pos.allocationBps || 0) / 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Spendable Tokens */}
          <div className={styles.contextSection}>
            <span className={styles.contextSectionTitle}>
              <LightningIcon size={18} color="#22c55e" />
              Spendable Payment Tokens
            </span>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Balance</th>
                  <th>Decimals</th>
                  <th>Contract</th>
                </tr>
              </thead>
              <tbody>
                {walletContext?.capabilities.spendableTokens.map((t) => (
                  <tr key={t.address}>
                    <td>{t.symbol}</td>
                    <td>{t.balanceFormatted}</td>
                    <td>{t.decimals}</td>
                    <td>{t.address.slice(0, 6)}...{t.address.slice(-4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Capability Matrix */}
          <div className={styles.contextSection}>
            <span className={styles.contextSectionTitle}>
              <ShieldCheckIcon size={18} color="#22c55e" />
              Execution Capability Matrix
            </span>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Route</th>
                  <th>Verified</th>
                  <th>Can Buy</th>
                  <th>Can Sell</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(walletContext?.capabilities.capabilitiesByAsset || {}).map((cap) => (
                  <tr key={cap.assetId}>
                    <td>{cap.assetId.toUpperCase()}</td>
                    <td>{cap.routeAvailable ? "AVAILABLE" : "NO_ROUTE"}</td>
                    <td>{cap.verificationStatus}</td>
                    <td style={{ color: cap.canBuy ? "#22c55e" : "#ef4444" }}>
                      {cap.canBuy ? "YES" : "NO"}
                    </td>
                    <td style={{ color: cap.canSell ? "#22c55e" : "#ef4444" }}>
                      {cap.canSell ? "YES" : "NO"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Observed Behavior */}
          <div className={styles.contextSection}>
            <span className={styles.contextSectionTitle}>
              <ScalesIcon size={18} color="#22c55e" />
              Observed Wallet Behavior (Evidence Baseline)
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.85rem", color: "#cbd5e1" }}>
              <div><strong>Lifetime Observed Trades:</strong> {behavior?.observedTradeCount || 0}</div>
              <div><strong>30-Day Trade Count:</strong> {behavior?.tradesLast30d || 0}</div>
              <div><strong>Median Trade Size:</strong> ${behavior?.medianTradeSizeUsd || 0}</div>
              <div><strong>Average Trade Size:</strong> ${behavior?.averageTradeSizeUsd || 0}</div>
              <div><strong>Average Holding Period:</strong> {behavior?.averageHoldingPeriodDays || 0} days</div>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "8px" }}>
                * Privacy invariant: Metrics are purely empirical onchain calculations used solely for transaction sizing without psychological labels.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STRATEGY MARKETPLACE */}
      {activeTab === "MARKETPLACE" && (
        <div className={styles.marketplaceGrid}>
          {marketplaceStrategies.map((strat) => {
            const isActive = activeStrategy?.id === strat.id || activeStrategy?.clonedFrom === strat.id;
            return (
              <div
                key={strat.id}
                className={`${styles.marketplaceCard} ${isActive ? styles.marketplaceCardActive : ""}`}
              >
                <div className={styles.marketplaceCardHeader}>
                  <div className={styles.marketplaceCardTitleRow}>
                    <h3 className={styles.marketplaceCardTitle}>{strat.name}</h3>
                    {isActive && <span className={styles.badge}>Active</span>}
                  </div>
                  <p className={styles.marketplaceCardDesc}>{strat.description}</p>
                </div>

                {/* Rules */}
                <div className={styles.rulesList}>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                    Deterministic Rules ({strat.rules.length})
                  </span>
                  {strat.rules.map((rule) => (
                    <div key={rule.id} className={styles.ruleItem}>
                      <span>{rule.name}</span>
                      <span className={styles.rulePill}>
                        {rule.conditionVariable} {rule.operator} {rule.thresholdValue}% → {rule.action}
                      </span>
                    </div>
                  ))}
                </div>

                <div className={styles.marketplaceCardActions}>
                  {isActive ? (
                    <button className={styles.activateButton} disabled>
                      Currently Active
                    </button>
                  ) : (
                    <button
                      className={styles.activateButton}
                      onClick={() => handleSelectStrategy(strat.id)}
                    >
                      Activate Strategy
                    </button>
                  )}
                  <button
                    className={styles.cloneButton}
                    onClick={() => handleCloneStrategy(strat.id)}
                  >
                    Clone & Customize
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 4: ASK AGENT Q&A */}
      {activeTab === "ASK" && (
        <div className={styles.askContainer}>
          <div className={styles.quickPrompts}>
            <button
              className={styles.promptChip}
              onClick={() => handleSendChat("What is my current portfolio balance and stablecoin reserve?")}
            >
              What is my current portfolio balance?
            </button>
            <button
              className={styles.promptChip}
              onClick={() => handleSendChat("Why did the agent propose this rebalancing action?")}
            >
              Why did the agent propose this action?
            </button>
            <button
              className={styles.promptChip}
              onClick={() => handleSendChat("Can I buy SPYx on X Layer right now?")}
            >
              Can I buy SPYx on X Layer?
            </button>
            <button
              className={styles.promptChip}
              onClick={() => handleSendChat("Can I trade wMETAx on X Layer right now?")}
            >
              Can I trade wMETAx?
            </button>
          </div>

          <div className={styles.chatHistory}>
            {chatHistory.map((item) => (
              <div
                key={item.id}
                className={item.sender === "USER" ? styles.userMessage : styles.agentMessage}
              >
                <div>{item.text}</div>
                {item.sender === "AGENT" && (
                  <div className={styles.agentMeta}>
                    {item.confidence && (
                      <span className={styles.badge} style={{ fontSize: "0.68rem", padding: "2px 6px" }}>
                        Confidence: {item.confidence}
                      </span>
                    )}
                    {item.citations && item.citations.length > 0 && (
                      <div className={styles.citationsRow}>
                        <span>Sources:</span>
                        {item.citations.map((c, i) => (
                          <span key={i} className={styles.citationTag}>
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {isAsking && (
              <div className={styles.agentMessage}>
                <span style={{ color: "#22c55e", fontStyle: "italic" }}>
                  Evaluating onchain state & policy...
                </span>
              </div>
            )}
          </div>

          <div className={styles.inputRow}>
            <input
              type="text"
              className={styles.inputField}
              placeholder="Ask your agent anything about your portfolio, strategy rules, or tradeability..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendChat();
              }}
            />
            <button
              className={styles.sendButton}
              onClick={() => handleSendChat()}
              disabled={isAsking || !chatInput.trim()}
            >
              Ask Agent
            </button>
          </div>
        </div>
      )}

      {/* Trade Drawer for Direct Execution */}
      {selectedAssetForTrade && (
        <TradeDrawer
          isOpen={isTradeDrawerOpen}
          onClose={() => setIsTradeDrawerOpen(false)}
          asset={selectedAssetForTrade}
          initialPaymentTokenAddress={tradePaymentTokenAddr}
          initialAmount={tradeAmount}
          onTradeSuccess={handleTradeSuccess}
        />
      )}
    </div>
  );
}
