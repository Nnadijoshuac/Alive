"use client";

import React, { useEffect, useState } from "react";
import type { CoinMarketCapMarketContext, MarketQuote, RwaAsset } from "@alive/shared";
import {
  getPaymentTokens,
  getTradeQuote,
  getTradeTransaction,
  type PaymentTokenInfo,
  type TradeQuoteResult,
} from "../../lib/rwa-api";
import {
  connectWallet,
  getConnectedAccount,
  getWalletChainId,
  getTokenBalance,
  getTokenAllowance,
  isWalletAvailable,
  requestTokenApproval,
  sendSwapTransaction,
  switchNetworkToXLayer,
  waitForTransactionReceipt,
  XLAYER_MAINNET_CONFIG,
} from "../../lib/rwa-trade";
import styles from "./trade-drawer.module.css";

export type TradeDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  asset: RwaAsset | null | undefined;
  liveQuote?: MarketQuote | undefined;
  marketContext?: CoinMarketCapMarketContext | undefined;
  initialPaymentTokenAddress?: string | undefined;
  initialAmount?: string | undefined;
  onTradeSuccess?: ((txHash: string) => void) | undefined;
};

type AuthorizationState =
  | "IDLE"
  | "WAITING_WALLET"
  | "SUBMITTED_ONCHAIN"
  | "CONFIRMED"
  | "CANCELLED"
  | "FAILED";

export function TradeDrawer({
  isOpen,
  onClose,
  asset,
  liveQuote,
  marketContext,
  initialPaymentTokenAddress,
  initialAmount,
  onTradeSuccess,
}: TradeDrawerProps) {
  const [paymentTokens, setPaymentTokens] = useState<PaymentTokenInfo[]>([]);
  const [selectedTokenAddr, setSelectedTokenAddr] = useState<string>(initialPaymentTokenAddress || "");
  const [amount, setAmount] = useState<string>(initialAmount || "");
  const [debouncedAmount, setDebouncedAmount] = useState<string>(initialAmount || "");
  const [quote, setQuote] = useState<TradeQuoteResult["quote"] | null>(null);
  const [isQuoting, setIsQuoting] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [showExecutionDetails, setShowExecutionDetails] = useState<boolean>(true);

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<string>("0.00");
  const [tokenAllowance, setTokenAllowance] = useState<bigint>(0n);

  // Action & Authorization states
  const [authState, setAuthState] = useState<AuthorizationState>("IDLE");
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const isPending = isQuoting || isApproving || authState === "WAITING_WALLET" || authState === "SUBMITTED_ONCHAIN";

  // Verified X Layer target deployment
  const xlayerDeployment = asset?.deployments?.find(
    (d) => d.chainId === 196 && d.deploymentStatus === "VERIFIED",
  );
  const targetContract = xlayerDeployment?.contractAddress ?? "";

  // 1. Initial Load of Payment Tokens & Wallet Status
  useEffect(() => {
    if (!isOpen) return;

    if (initialAmount) {
      setAmount(initialAmount);
      setDebouncedAmount(initialAmount);
    }
    if (initialPaymentTokenAddress) {
      setSelectedTokenAddr(initialPaymentTokenAddress);
    }

    getPaymentTokens().then((tokens) => {
      setPaymentTokens(tokens);
      if (tokens.length > 0 && !selectedTokenAddr && !initialPaymentTokenAddress) {
        setSelectedTokenAddr(tokens[0]!.contractAddress);
      }
    });

    if (isWalletAvailable()) {
      getConnectedAccount().then((acc) => setWalletAddress(acc ?? null));
      getWalletChainId().then((cid) => setWalletChainId(cid ?? null));
    }
  }, [isOpen, selectedTokenAddr, initialAmount, initialPaymentTokenAddress]);

  // 2. Debounce Amount Input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(amount.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [amount]);

  // 3. Fetch Quote on Amount / Token Change
  useEffect(() => {
    if (!isOpen || !asset || !selectedTokenAddr || !debouncedAmount || parseFloat(debouncedAmount) <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    setIsQuoting(true);
    setQuoteError(null);

    getTradeQuote({
      assetId: asset.id,
      fromTokenAddress: selectedTokenAddr,
      amount: debouncedAmount,
      slippageBps: 50,
    })
      .then((res) => {
        if (res.quote.hasRoute) {
          setQuote(res.quote);
        } else {
          setQuote(null);
          setQuoteError(res.quote.reason ?? "No active liquidity pool route on X Layer.");
        }
      })
      .catch((err) => {
        setQuote(null);
        setQuoteError(err.message ?? "Failed to fetch quote.");
      })
      .finally(() => {
        setIsQuoting(false);
      });
  }, [isOpen, asset, selectedTokenAddr, debouncedAmount]);

  // 4. Update Token Balance & Allowance when Wallet or Token changes
  useEffect(() => {
    if (!walletAddress || !selectedTokenAddr || !isWalletAvailable()) return;

    const currentPaymentToken = paymentTokens.find(
      (t) => t.contractAddress.toLowerCase() === selectedTokenAddr.toLowerCase(),
    );
    const decimals = currentPaymentToken?.decimals ?? 6;

    getTokenBalance(selectedTokenAddr, walletAddress, decimals).then((bal) => {
      setTokenBalance(bal.human);
    });

    if (quote?.routerAddress) {
      getTokenAllowance(selectedTokenAddr, walletAddress, quote.routerAddress).then((allw) => {
        setTokenAllowance(allw);
      });
    }
  }, [walletAddress, selectedTokenAddr, paymentTokens, quote?.routerAddress]);

  // Reset state on close
  const handleClose = () => {
    setAmount("");
    setQuote(null);
    setQuoteError(null);
    setTxHash(null);
    setAuthState("IDLE");
    setActionError(null);
    onClose();
  };

  const handleCopyContract = () => {
    if (!targetContract) return;
    navigator.clipboard.writeText(targetContract);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = async () => {
    const acc = await connectWallet();
    if (acc) {
      setWalletAddress(acc);
      const cid = await getWalletChainId();
      setWalletChainId(cid ?? null);
    }
  };

  const handleSwitchNetwork = async () => {
    try {
      await switchNetworkToXLayer();
      const cid = await getWalletChainId();
      setWalletChainId(cid ?? null);
    } catch (err) {
      console.error("Failed to switch network to X Layer:", err);
    }
  };

  const handleApprove = async () => {
    if (!walletAddress || !quote?.routerAddress) return;
    setIsApproving(true);
    setActionError(null);

    try {
      const approvedTxHash = await requestTokenApproval(
        selectedTokenAddr,
        quote.routerAddress,
        walletAddress,
      );

      if (approvedTxHash) {
        const receipt = await waitForTransactionReceipt(approvedTxHash);
        if (receipt && receipt.status) {
          const newAllowance = await getTokenAllowance(
            selectedTokenAddr,
            walletAddress,
            quote.routerAddress,
          );
          setTokenAllowance(newAllowance);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval rejected or failed.";
      setActionError(msg);
    } finally {
      setIsApproving(false);
    }
  };

  const handleTrade = async () => {
    if (!walletAddress || !quote || !asset) return;
    setAuthState("WAITING_WALLET");
    setActionError(null);

    try {
      const txPayload = await getTradeTransaction({
        assetId: asset.id,
        fromTokenAddress: selectedTokenAddr,
        amount: debouncedAmount,
        userWalletAddress: walletAddress,
        slippageBps: 50,
      });

      if (!txPayload.transaction) {
        setAuthState("FAILED");
        setActionError("Failed to build swap transaction data.");
        return;
      }

      const submittedTxHash = await sendSwapTransaction(
        {
          to: txPayload.transaction.to,
          data: txPayload.transaction.data,
          value: txPayload.transaction.value,
          ...(txPayload.transaction.gasLimit ? { gasLimit: txPayload.transaction.gasLimit } : {}),
        },
        walletAddress,
      );

      if (submittedTxHash) {
        setTxHash(submittedTxHash);
        setAuthState("SUBMITTED_ONCHAIN");

        const receipt = await waitForTransactionReceipt(submittedTxHash);
        if (receipt && receipt.status) {
          setAuthState("CONFIRMED");
          if (onTradeSuccess) {
            onTradeSuccess(submittedTxHash);
          }
        } else {
          setAuthState("FAILED");
          setActionError("Transaction failed onchain.");
        }
      } else {
        setAuthState("CANCELLED");
        setActionError("Transaction cancelled by user.");
      }
    } catch (err: unknown) {
      setAuthState("CANCELLED");
      setActionError(err instanceof Error ? err.message : "Transaction cancelled or failed.");
    }
  };

  if (!isOpen || !asset) return null;

  const currentPaymentToken = paymentTokens.find(
    (t) => t.contractAddress.toLowerCase() === selectedTokenAddr.toLowerCase(),
  );

  const isWrongChain = walletChainId !== null && walletChainId !== XLAYER_MAINNET_CONFIG.chainIdDec;
  const isAllowanceNeeded = quote && tokenAllowance < BigInt(quote.fromToken.amountRaw);
  const isBalanceInsufficient =
    quote && parseFloat(tokenBalance) < parseFloat(debouncedAmount);

  const displayPrice = liveQuote?.price
    ? `$${parseFloat(liveQuote.price).toFixed(2)}`
    : marketContext?.priceUsd !== undefined
      ? `$${marketContext.priceUsd.toFixed(2)}`
      : "$--";

  const displayChange =
    marketContext?.priceChange24hPct !== undefined
      ? `${marketContext.priceChange24hPct >= 0 ? "+" : ""}${marketContext.priceChange24hPct.toFixed(2)}%`
      : undefined;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <h2 className={styles.title}>Review Trade</h2>
            <span className={styles.networkBadge}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                <circle cx="4" cy="4" r="3" />
              </svg>
              X Layer Mainnet
            </span>
          </div>
          <button className={styles.closeButton} onClick={handleClose} aria-label="Close trade drawer">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Target Asset Summary Card */}
          <div className={styles.assetSummaryCard}>
            <div className={styles.assetRow}>
              <div className={styles.assetLeft}>
                <div className={styles.assetLogo}>
                  {asset.symbol.slice(0, 4)}
                </div>
                <div className={styles.assetNames}>
                  <div className={styles.assetSymbol}>{asset.symbol}</div>
                  <div className={styles.assetProductName}>{asset.name}</div>
                </div>
              </div>
              <div className={styles.assetRight}>
                <div className={styles.marketPrice}>{displayPrice}</div>
                {displayChange && (
                  <div
                    className={`${styles.marketChange} ${
                      displayChange.startsWith("+") ? styles.changePos : styles.changeNeg
                    }`}
                  >
                    {displayChange} 24h
                  </div>
                )}
              </div>
            </div>

            {targetContract && (
              <div className={styles.contractRow}>
                <span>Target Contract</span>
                <div className={styles.contractLinks}>
                  <span className={styles.contractCode}>
                    {targetContract.slice(0, 6)}...{targetContract.slice(-4)}
                  </span>
                  <button className={styles.copyBtn} onClick={handleCopyContract}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <a
                    href={`https://www.okx.com/web3/explorer/xlayer/address/${targetContract}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.contractLink}
                  >
                    Explorer ↗
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Swap Input Form */}
          <div className={styles.swapForm}>
            {/* YOU PAY */}
            <div className={styles.swapCard}>
              <div className={styles.cardHeader}>
                <span>You Pay</span>
                {walletAddress && (
                  <div className={styles.balanceRow}>
                    <span>Balance: {tokenBalance}</span>
                    <button
                      className={styles.maxBtn}
                      onClick={() => setAmount(tokenBalance)}
                      disabled={isPending}
                    >
                      MAX
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    setAmount(val);
                  }}
                  className={styles.amountInput}
                  disabled={isPending}
                />
                <select
                  value={selectedTokenAddr}
                  onChange={(e) => setSelectedTokenAddr(e.target.value)}
                  className={styles.tokenSelect}
                  disabled={isPending}
                >
                  {paymentTokens.map((t) => (
                    <option key={t.contractAddress} value={t.contractAddress}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Arrow Divider */}
            <div className={styles.arrowDivider}>
              <div className={styles.arrowIcon}>↓</div>
            </div>

            {/* YOU RECEIVE */}
            <div className={styles.swapCard}>
              <div className={styles.cardHeader}>
                <span>You Receive (Estimated)</span>
                <span>Exact-In</span>
              </div>
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  readOnly
                  placeholder="0.00"
                  value={
                    isQuoting
                      ? "Calculating quote…"
                      : quote?.toToken.estimatedAmount ?? "0.00"
                  }
                  className={styles.amountInput}
                />
                <div className={styles.tokenPill}>
                  <span>{asset.symbol}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible Execution Details */}
          {quote && (
            <div className={styles.executionDetailsContainer}>
              <button
                type="button"
                className={styles.executionDetailsToggle}
                onClick={() => setShowExecutionDetails(!showExecutionDetails)}
              >
                <span>Execution Details</span>
                <span>{showExecutionDetails ? "▴" : "▾"}</span>
              </button>

              {showExecutionDetails && (
                <div className={styles.quoteDetails}>
                  <div className={styles.quoteRow}>
                    <span>Exchange Rate</span>
                    <span className={styles.quoteValue}>
                      1 {quote.toToken.symbol} ≈ {quote.executionPrice.toFixed(2)}{" "}
                      {quote.fromToken.symbol}
                    </span>
                  </div>
                  <div className={styles.quoteRow}>
                    <span>Price Impact</span>
                    <span className={styles.quoteValue}>
                      {quote.priceImpactPct < 0.01
                        ? "< 0.01%"
                        : `${quote.priceImpactPct.toFixed(2)}%`}
                    </span>
                  </div>
                  <div className={styles.quoteRow}>
                    <span>Estimated Network Fee</span>
                    <span className={styles.quoteValue}>
                      ~0.00012 OKB (${quote.estimatedGasUsd.toFixed(2)})
                    </span>
                  </div>
                  <div className={styles.quoteRow}>
                    <span>Min Received (0.50% slippage)</span>
                    <span className={styles.quoteValue}>
                      {quote.minimumReceived} {quote.toToken.symbol}
                    </span>
                  </div>
                  <div className={styles.quoteRow}>
                    <span>Liquidity Provider</span>
                    <span className={styles.quoteValue}>OKX DEX · X Layer Router</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Wallet Authorization & Status States */}
          {authState === "WAITING_WALLET" && (
            <div className={`${styles.statusMessage} ${styles.statusWaiting}`}>
              <div className={styles.pulseDot} />
              <span>Waiting for your wallet authorization… Please confirm the transaction in your wallet.</span>
            </div>
          )}

          {authState === "SUBMITTED_ONCHAIN" && (
            <div className={`${styles.statusMessage} ${styles.statusWaiting}`}>
              <div className={styles.pulseDot} />
              <span>Submitted on X Layer. Awaiting onchain confirmation…</span>
            </div>
          )}

          {authState === "CONFIRMED" && txHash && (
            <div className={`${styles.statusMessage} ${styles.statusSuccess}`}>
              <span>✓ Trade confirmed on X Layer!</span>
              <a
                href={`https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.txLink}
              >
                View on Explorer ↗
              </a>
            </div>
          )}

          {quoteError && (
            <div className={`${styles.statusMessage} ${styles.statusError}`}>
              {quoteError}
            </div>
          )}

          {actionError && (
            <div className={`${styles.statusMessage} ${styles.statusError}`}>
              {actionError}
            </div>
          )}

          {/* Dynamic Action Button */}
          {!walletAddress ? (
            <button
              className={`${styles.actionButton} ${styles.btnPrimary}`}
              onClick={handleConnect}
            >
              Connect Wallet
            </button>
          ) : isWrongChain ? (
            <button
              className={`${styles.actionButton} ${styles.btnWarning}`}
              onClick={handleSwitchNetwork}
            >
              Switch to X Layer (Chain 196)
            </button>
          ) : !amount || parseFloat(amount) <= 0 ? (
            <button className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              Enter an amount
            </button>
          ) : isQuoting ? (
            <button className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              Getting live quote…
            </button>
          ) : !quote ? (
            <button className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              No Route Available
            </button>
          ) : isBalanceInsufficient ? (
            <button className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              Insufficient {currentPaymentToken?.symbol ?? "USDC"} Balance
            </button>
          ) : isAllowanceNeeded ? (
            <button
              className={`${styles.actionButton} ${styles.btnPrimary}`}
              onClick={handleApprove}
              disabled={isApproving}
            >
              {isApproving
                ? `Approving ${currentPaymentToken?.symbol ?? "USDC"}…`
                : `Approve ${currentPaymentToken?.symbol ?? "USDC"}`}
            </button>
          ) : (
            <button
              className={`${styles.actionButton} ${styles.btnPrimary}`}
              onClick={handleTrade}
              disabled={isPending}
            >
              {authState === "WAITING_WALLET"
                ? "Waiting for wallet…"
                : authState === "SUBMITTED_ONCHAIN"
                ? "Confirming on X Layer…"
                : `Confirm Trade for ${asset.symbol}`}
            </button>
          )}

          {/* Institutional Disclaimer */}
          <div className={styles.disclaimer}>
            ALIVE provides policy checks and routing intelligence. Execution is self-custodial on X Layer.
          </div>
        </div>
      </div>
    </div>
  );
}
