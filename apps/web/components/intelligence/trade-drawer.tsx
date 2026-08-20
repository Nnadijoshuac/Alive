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
  asset: RwaAsset;
  liveQuote?: MarketQuote | undefined;
  marketContext?: CoinMarketCapMarketContext | undefined;
};

export function TradeDrawer({
  isOpen,
  onClose,
  asset,
  liveQuote,
  marketContext,
}: TradeDrawerProps) {
  const [paymentTokens, setPaymentTokens] = useState<PaymentTokenInfo[]>([]);
  const [selectedTokenAddr, setSelectedTokenAddr] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [debouncedAmount, setDebouncedAmount] = useState<string>("");
  const [quote, setQuote] = useState<TradeQuoteResult["quote"] | null>(null);
  const [isQuoting, setIsQuoting] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<string>("0.00");
  const [tokenAllowance, setTokenAllowance] = useState<bigint>(0n);

  // Action state
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const isPending = isQuoting || isApproving || isSubmitting;

  // Verified X Layer target deployment
  const xlayerDeployment = asset.deployments?.find(
    (d) => d.chainId === 196 && d.deploymentStatus === "VERIFIED",
  );
  const targetContract = xlayerDeployment?.contractAddress ?? "";

  // 1. Initial Load of Payment Tokens & Wallet Status
  useEffect(() => {
    if (!isOpen) return;

    getPaymentTokens().then((tokens) => {
      setPaymentTokens(tokens);
      if (tokens.length > 0 && !selectedTokenAddr) {
        setSelectedTokenAddr(tokens[0]!.contractAddress);
      }
    });

    if (isWalletAvailable()) {
      getConnectedAccount().then((acc) => setWalletAddress(acc ?? null));
      getWalletChainId().then((cid) => setWalletChainId(cid ?? null));
    }
  }, [isOpen, selectedTokenAddr]);

  // 2. Debounce Amount Input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(amount.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [amount]);

  // 3. Fetch Quote on Amount / Token Change
  useEffect(() => {
    if (!isOpen || !selectedTokenAddr || !debouncedAmount || parseFloat(debouncedAmount) <= 0) {
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
  }, [isOpen, asset.id, selectedTokenAddr, debouncedAmount]);

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
    setTradeSuccess(false);
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
    setActionError(null);
    try {
      const acc = await connectWallet();
      setWalletAddress(acc);
      const cid = await getWalletChainId();
      setWalletChainId(cid ?? null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Wallet connection failed.");
    }
  };

  const handleSwitchNetwork = async () => {
    setActionError(null);
    try {
      await switchNetworkToXLayer();
      const cid = await getWalletChainId();
      setWalletChainId(cid ?? null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to switch network.");
    }
  };

  const handleApprove = async () => {
    if (!walletAddress || !quote?.routerAddress || !selectedTokenAddr) return;
    setActionError(null);
    setIsApproving(true);
    try {
      await requestTokenApproval(selectedTokenAddr, quote.routerAddress, walletAddress);
      // Refresh allowance
      const newAllw = await getTokenAllowance(selectedTokenAddr, walletAddress, quote.routerAddress);
      setTokenAllowance(newAllw);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Approval rejected by user.");
    } finally {
      setIsApproving(false);
    }
  };

  const handleTrade = async () => {
    if (!walletAddress || !quote || !selectedTokenAddr) return;
    setActionError(null);
    setIsSubmitting(true);
    setTradeSuccess(false);
    setTxHash(null);

    try {
      const txData = await getTradeTransaction({
        assetId: asset.id,
        fromTokenAddress: selectedTokenAddr,
        amount: debouncedAmount,
        userWalletAddress: walletAddress,
        slippageBps: 50,
      });

      const hash = await sendSwapTransaction(txData.transaction, walletAddress);
      setTxHash(hash);

      // Wait for onchain receipt
      const receipt = await waitForTransactionReceipt(hash);
      if (receipt.status) {
        setTradeSuccess(true);
      } else {
        setActionError("Transaction failed onchain.");
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Transaction cancelled or failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

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
            <h2 className={styles.title}>Trade on X Layer</h2>
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
                <span>Verified Contract</span>
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
                <span>Exact-In Quote</span>
              </div>
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  readOnly
                  placeholder="0.00"
                  value={
                    isQuoting
                      ? "Quoting..."
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

          {/* Quote Execution Details */}
          {quote && (
            <div className={styles.quoteDetails}>
              <div className={styles.quoteRow}>
                <span>Execution Rate</span>
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
                  ${quote.estimatedGasUsd.toFixed(2)} OKB
                </span>
              </div>
              <div className={styles.quoteRow}>
                <span>Min Received (0.5% slippage)</span>
                <span className={styles.quoteValue}>
                  {quote.minimumReceived} {quote.toToken.symbol}
                </span>
              </div>
              <div className={styles.quoteRow}>
                <span>Routing Provider</span>
                <span className={styles.quoteValue}>{quote.routeName}</span>
              </div>
            </div>
          )}

          {/* Error and Success Notifications */}
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

          {tradeSuccess && txHash && (
            <div className={`${styles.statusMessage} ${styles.statusSuccess}`}>
              ✓ Trade settled on X Layer!{" "}
              <a
                href={`https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#4ade80", textDecoration: "underline" }}
              >
                View Transaction ↗
              </a>
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
              Getting real quote...
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
                ? `Approving ${currentPaymentToken?.symbol ?? "USDC"}...`
                : `Approve ${currentPaymentToken?.symbol ?? "USDC"}`}
            </button>
          ) : (
            <button
              className={`${styles.actionButton} ${styles.btnPrimary}`}
              onClick={handleTrade}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Confirming in Wallet..."
                : `Trade ${asset.symbol}`}
            </button>
          )}

          {/* Disclaimer */}
          <div className={styles.disclaimer}>
            ALIVE eligibility reflects configured verification rules, not investment advice.
            Trades are executed through your connected self-custodial wallet on X Layer.
          </div>
        </div>
      </div>
    </div>
  );
}
