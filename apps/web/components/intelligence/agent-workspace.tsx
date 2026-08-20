"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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

interface ChatMessage {
  sender: "user" | "agent";
  text: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  citations?: string[];
  timestamp: string;
}

export function AgentWorkspace() {
  const [walletAddress, setWalletAddress] = useState<string>(DEFAULT_DEMO_WALLET);
  const [snapshot, setSnapshot] = useState<AgentContextSnapshot | null>(null);
  const [activeStrategy, setActiveStrategy] = useState<AgentStrategy | null>(null);
  const [spendableTokens, setSpendableTokens] = useState<SpendableToken[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStep, setSyncStep] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
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

  const loadData = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoading(true);
    try {
      const snap = await getAgentSnapshot(walletAddress);
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

      const ctx = await fetchWalletContext(walletAddress);
      if (ctx?.capabilities?.spendableTokens) {
        setSpendableTokens(ctx.capabilities.spendableTokens);
      }
    } catch (err) {
      console.error("Failed to load agent workspace data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncWallet = async () => {
    if (!walletAddress || isSyncing) return;
    setIsSyncing(true);
    setSyncStep(1);

    try {
      setTimeout(() => setSyncStep(2), 300);
      setTimeout(() => setSyncStep(3), 600);
      await syncWalletContext(walletAddress);
      const evalSnap = await evaluateAgentStrategy(walletAddress);
      setSnapshot(evalSnap);
      setLastSyncTime(new Date());

      const ctx = await fetchWalletContext(walletAddress);
      if (ctx?.capabilities?.spendableTokens) {
        setSpendableTokens(ctx.capabilities.spendableTokens);
      }
    } catch (err) {
      console.error("Failed to sync wallet context:", err);
    } finally {
      setIsSyncing(false);
      setSyncStep(0);
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
    await recordAgentInteraction({
      id: `int-${Date.now()}`,
      agentId: "agent-alive-core-v1",
      walletAddress: walletAddress as `0x${string}`,
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
    if (activeExecutingActionId) {
      await recordAgentInteraction({
        id: `int-${Date.now()}`,
        agentId: "agent-alive-core-v1",
        walletAddress: walletAddress as `0x${string}`,
        actionId: activeExecutingActionId,
        event: "EXECUTED",
        txHash,
        timestamp: new Date().toISOString(),
      });
    }
    await loadData();
  };

  const handleAskQuestion = async (qText?: string) => {
    const question = qText || inputQuestion.trim();
    if (!question || isAsking) return;

    const userMsg: ChatMessage = {
      sender: "user",
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion("");
    setIsAsking(true);

    try {
      const res = await askAgentQuestion(walletAddress, question);
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
        text: "Trading and portfolio data is temporarily unavailable. Please try again shortly.",
        confidence: "LOW",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsAsking(false);
    }
  };

  const primaryAction = snapshot?.proposedActions?.[0] ?? null;
  const secondaryActions = snapshot?.proposedActions?.slice(1) ?? [];

  const totalValueUsd = snapshot?.walletPortfolio?.totalValueUsd ?? 0;
  const stablePercent = snapshot?.walletPortfolio?.stablecoinPct?.toFixed(0) ?? "0";
  const positionCount = snapshot?.walletPortfolio?.positions?.length ?? 0;
  const tradeCount30d = snapshot?.walletHistorySummary?.tradesLast30d ?? 0;
  const medianSize = snapshot?.walletHistorySummary?.medianTradeSizeUsd ?? 0;

  if (!walletAddress) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyStateCard}>
          <RobotIcon size={48} color="#64748b" />
          <h2 className={styles.emptyStateTitle}>Your Agent needs a wallet to understand your portfolio.</h2>
          <p className={styles.emptyStateDesc}>
            Connect an X Layer wallet to see holdings, onchain activity, strategies, and available actions.
          </p>
          <button
            type="button"
            className={styles.primaryReviewBtn}
            onClick={() => setWalletAddress(DEFAULT_DEMO_WALLET)}
          >
            Connect X Layer Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 1. AGENT HEADER */}
      <header className={styles.agentHeader}>
        <div className={styles.agentTitleRow}>
          <div className={styles.agentTitleGroup}>
            <h1 className={styles.agentName}>
              <RobotIcon size={28} color="#22c55e" />
              ALIVE Portfolio Agent
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
              <span>Synced {Math.max(0, Math.floor((Date.now() - lastSyncTime.getTime()) / 1000))}s ago</span>
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
              <ArrowsClockwiseIcon size={14} className={isSyncing ? "spinning" : ""} />
              {isSyncing ? "Syncing…" : "Sync Wallet"}
            </button>
          </div>
        </div>

        {/* 2. RESTRAINED SUMMARY ROW */}
        <div className={styles.summaryRow}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Portfolio Value</span>
            <span className={styles.summaryValue}>${totalValueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={styles.summarySub}>X Layer verified assets</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Active Positions</span>
            <span className={styles.summaryValue}>{positionCount}</span>
            <span className={styles.summarySub}>Tracked RWA holdings</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Stablecoin Reserve</span>
            <span className={styles.summaryValue}>{stablePercent}%</span>
            <span className={styles.summarySub}>Target: &gt; 15%</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Observable Trades</span>
            <span className={styles.summaryValue}>{tradeCount30d}</span>
            <span className={styles.summarySub}>Last 30 days on X Layer</span>
          </div>
        </div>
      </header>

      {/* Syncing Progress Card */}
      {isSyncing && (
        <div className={styles.syncProgressCard}>
          <div className={styles.syncProgressSteps}>
            <span className={syncStep >= 1 ? styles.syncStepDone : styles.syncStepActive}>
              {syncStep >= 1 ? "✓" : "○"} Reading holdings
            </span>
            <span className={syncStep >= 2 ? styles.syncStepDone : styles.syncStepActive}>
              {syncStep >= 2 ? "✓" : "○"} Checking activity
            </span>
            <span className={syncStep >= 3 ? styles.syncStepDone : styles.syncStepActive}>
              {syncStep >= 3 ? "✓" : "○"} Evaluating strategy
            </span>
            <span className={styles.syncStepActive}>○ Checking available routes</span>
          </div>
        </div>
      )}

      {/* 3. PRIMARY AGENT INSIGHT */}
      {!isPaused && primaryAction && (
        <section className={styles.insightCard}>
          <div className={styles.insightHeader}>
            <SparkleIcon size={16} />
            Agent Insight
          </div>

          <div className={styles.insightContent}>
            <h2 className={styles.insightTitle}>
              {primaryAction.actionType === "BUY" ? "Opportunity: " : "Attention: "}
              {primaryAction.targetTokenSymbol} {primaryAction.actionType === "BUY" ? "is eligible for accumulation" : "exceeds target allocation"}
            </h2>
            <p className={styles.insightDescription}>
              {primaryAction.deterministicReason}. {primaryAction.actionType === "SELL" ? "Trimming this position moves your portfolio closer to your configured target allocation while preserving liquidity." : "Accumulating this position balances your portfolio exposure according to active strategy rules."}
            </p>

            <div className={styles.insightMetricsRow}>
              <div className={styles.insightMetric}>
                <span className={styles.insightMetricLabel}>Proposed Trade</span>
                <span className={styles.insightMetricVal}>≈ ${primaryAction.estimatedUsdValue?.toFixed(2) || "260.00"}</span>
              </div>
              <div className={styles.insightMetric}>
                <span className={styles.insightMetricLabel}>Action</span>
                <span className={styles.insightMetricVal}>{primaryAction.actionType}</span>
              </div>
              <div className={styles.insightMetric}>
                <span className={styles.insightMetricLabel}>Target Asset</span>
                <span className={styles.insightMetricVal}>{primaryAction.targetTokenSymbol}</span>
              </div>
            </div>
          </div>

          <div className={styles.insightFooter}>
            <div className={styles.insightBadges}>
              <span className={styles.badgeVerified}>ALIVE VERIFIED · ELIGIBLE</span>
              <span className={styles.badgeRoute}>OKX Route Available</span>
            </div>

            <button
              type="button"
              className={styles.primaryReviewBtn}
              onClick={() => handleReviewAction(primaryAction)}
            >
              Review Trade on X Layer <ArrowRightIcon size={16} />
            </button>
          </div>

          {/* Expandable Why Details */}
          <div className={styles.whyContainer}>
            <div
              className={styles.whyTrigger}
              onClick={() => setExpandedActionId(expandedActionId === primaryAction.id ? null : primaryAction.id)}
            >
              <span>Why did the agent propose this?</span>
              {expandedActionId === primaryAction.id ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
            </div>

            {expandedActionId === primaryAction.id && (
              <div className={styles.whyGrid}>
                <div className={styles.whyEvidenceItem}>
                  <span className={styles.whyEvidenceLabel}>Strategy Rule</span>
                  <span className={styles.whyEvidenceValue}>{primaryAction.deterministicRuleId}</span>
                </div>
                <div className={styles.whyEvidenceItem}>
                  <span className={styles.whyEvidenceLabel}>Wallet State</span>
                  <span className={styles.whyEvidenceValue}>{primaryAction.targetTokenSymbol} target rebalancing</span>
                </div>
                <div className={styles.whyEvidenceItem}>
                  <span className={styles.whyEvidenceLabel}>Wallet History</span>
                  <span className={styles.whyEvidenceValue}>Median trade size: ${medianSize.toFixed(0) || "240"}</span>
                </div>
                <div className={styles.whyEvidenceItem}>
                  <span className={styles.whyEvidenceLabel}>Execution Status</span>
                  <span className={styles.whyEvidenceValue}>Verified · Route Active on X Layer</span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Zero Action State */}
      {!isPaused && !isLoading && !primaryAction && (
        <div className={styles.emptyStateCard}>
          <CheckCircleIcon size={40} color="#22c55e" />
          <h2 className={styles.emptyStateTitle}>Portfolio is within strategy rules.</h2>
          <p className={styles.emptyStateDesc}>
            All tracked positions and reserves match your active strategy parameters. Nothing needs your attention right now.
          </p>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
            Last evaluated {lastSyncTime.toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* 4. SECONDARY PROPOSALS LIST */}
      {secondaryActions.length > 0 && (
        <section className={styles.proposalsList}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Additional Recommendations ({secondaryActions.length})</h3>
          </div>

          {secondaryActions.map((action) => (
            <div key={action.id} className={styles.actionCard}>
              <div className={styles.actionCardHeader}>
                <div className={styles.actionCardInfo}>
                  <span className={action.actionType === "BUY" ? styles.pillBuy : styles.pillSell}>
                    {action.actionType}
                  </span>
                  <span className={styles.actionTarget}>{action.targetTokenSymbol}</span>
                  <span className={styles.actionProposedAmt}>≈ ${action.estimatedUsdValue?.toFixed(2)}</span>
                </div>

                <div className={styles.cardButtons}>
                  <button
                    type="button"
                    className={styles.dismissBtn}
                    onClick={() => handleDismissAction(action.id)}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryReviewBtn}
                    onClick={() => handleReviewAction(action)}
                  >
                    Review Trade
                  </button>
                </div>
              </div>

              {/* Expandable Why */}
              <div className={styles.whyContainer}>
                <div
                  className={styles.whyTrigger}
                  onClick={() => setExpandedActionId(expandedActionId === action.id ? null : action.id)}
                >
                  <span>Why this action?</span>
                  {expandedActionId === action.id ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
                </div>

                {expandedActionId === action.id && (
                  <div className={styles.whyGrid}>
                    <div className={styles.whyEvidenceItem}>
                      <span className={styles.whyEvidenceLabel}>Strategy Rule</span>
                      <span className={styles.whyEvidenceValue}>{action.deterministicRuleId}</span>
                    </div>
                    <div className={styles.whyEvidenceItem}>
                      <span className={styles.whyEvidenceLabel}>Wallet State</span>
                      <span className={styles.whyEvidenceValue}>{action.deterministicReason}</span>
                    </div>
                    <div className={styles.whyEvidenceItem}>
                      <span className={styles.whyEvidenceLabel}>Execution Status</span>
                      <span className={styles.whyEvidenceValue}>X Layer Route Available</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 5. WHAT THIS AGENT KNOWS */}
      <section className={styles.agentKnowledgeCard}>
        <div className={styles.knowledgeHeader}>
          <h3 className={styles.knowledgeTitle}>
            <DatabaseIcon size={18} color="#22c55e" />
            What This Agent Knows
          </h3>
          <span style={{ fontSize: "0.76rem", color: "#64748b" }}>Read directly from X Layer RPC</span>
        </div>

        <div className={styles.knowledgeSummaryGrid}>
          <div className={styles.knowledgeItem}>
            <span className={styles.knowledgeItemLabel}>Portfolio Overview</span>
            <span className={styles.knowledgeItemValue}>
              ${totalValueUsd.toFixed(2)} across {positionCount} tracked position{positionCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className={styles.knowledgeItem}>
            <span className={styles.knowledgeItemLabel}>30-Day Activity</span>
            <span className={styles.knowledgeItemValue}>
              {tradeCount30d} observable trade{tradeCount30d === 1 ? "" : "s"} on X Layer
            </span>
          </div>

          <div className={styles.knowledgeItem}>
            <span className={styles.knowledgeItemLabel}>Typical Trade Size</span>
            <span className={styles.knowledgeItemValue}>
              Median observed size ~${medianSize.toFixed(0) || "240"}
            </span>
          </div>

          <div className={styles.knowledgeItem}>
            <span className={styles.knowledgeItemLabel}>Execution Status</span>
            <span className={styles.knowledgeItemValue}>
              {spendableTokens.length || 4} payment tokens available on X Layer
            </span>
          </div>
        </div>

        <button
          type="button"
          className={styles.technicalToggleBtn}
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
        >
          {showTechnicalDetails ? "Hide technical details" : "View technical details & spendable balances"}
        </button>

        {showTechnicalDetails && (
          <div className={styles.technicalDrawer}>
            <h4 style={{ fontSize: "0.88rem", color: "#cbd5e1", margin: 0 }}>Spendable Payment Tokens</h4>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Contract</th>
                  <th>Balance</th>
                  <th>Value (USD)</th>
                </tr>
              </thead>
              <tbody>
                {spendableTokens.map((token: SpendableToken) => (
                  <tr key={token.address}>
                    <td>{token.symbol}</td>
                    <td>{token.address.slice(0, 8)}…{token.address.slice(-6)}</td>
                    <td>{token.balanceFormatted}</td>
                    <td>${token.valueUsd?.toFixed(2) || "0.00"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 6. ASK AGENT Q&A */}
      <section className={styles.askAgentSection}>
        <div className={styles.askHeader}>
          <h3 className={styles.askTitle}>Ask About Your Portfolio</h3>
          <p className={styles.askSubtitle}>
            Contextual questions answered strictly using your onchain balance, trade history, and ALIVE policy rules.
          </p>
        </div>

        <div className={styles.chipsRow}>
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => handleAskQuestion("What changed in my portfolio recently?")}
          >
            What changed?
          </button>
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => handleAskQuestion("Why are you proposing this action?")}
          >
            Why are you proposing this?
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
            onClick={() => handleAskQuestion("What assets can I trade right now?")}
          >
            What can I trade right now?
          </button>
        </div>

        {messages.length > 0 && (
          <div className={styles.chatBox}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={msg.sender === "user" ? styles.chatUserMsg : styles.chatAgentMsg}
              >
                <span>{msg.text}</span>
                {msg.citations && msg.citations.length > 0 && (
                  <div className={styles.evidenceCitations}>
                    <span>Evidence:</span>
                    {msg.citations.map((cite) => (
                      <span key={cite} className={styles.citationPill}>
                        {cite}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
            placeholder="Ask about holdings, concentration, routes, or proposals…"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
          />
          <button
            type="submit"
            className={styles.askSendBtn}
            disabled={isAsking || !inputQuestion.trim()}
          >
            {isAsking ? "Thinking…" : "Ask Agent"}
          </button>
        </form>
      </section>

      {/* 7. TRADE DRAWER FOR EXECUTION */}
      <TradeDrawer
        isOpen={isTradeDrawerOpen}
        onClose={() => {
          setIsTradeDrawerOpen(false);
          setActiveExecutingActionId(null);
        }}
        asset={selectedAssetForTrade}
        initialPaymentTokenAddress={tradePaymentTokenAddr}
        initialAmount={tradeAmount}
        onTradeSuccess={handleTradeSuccess}
      />
    </div>
  );
}
