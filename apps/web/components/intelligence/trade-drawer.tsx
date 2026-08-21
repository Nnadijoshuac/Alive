"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CoinMarketCapMarketContext, MarketQuote, RwaAsset } from "@alive/shared";
import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  CopyIcon,
  GlobeHemisphereWestIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  getPaymentTokens,
  getTradeAvailability,
  getTradeQuote,
  getTradeTransaction,
  type PaymentTokenInfo,
  type TradeAvailabilityResult,
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
  const [availability, setAvailability] = useState<TradeAvailabilityResult | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState<boolean>(false);
  const [paymentTokenError, setPaymentTokenError] = useState<string | null>(null);
  const [quoteRefreshNonce, setQuoteRefreshNonce] = useState<number>(0);
  const [quoteClock, setQuoteClock] = useState<number>(() => Date.now());

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
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

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

    setPaymentTokenError(null);
    getPaymentTokens()
      .then((tokens) => {
        setPaymentTokens(tokens);
        setSelectedTokenAddr((current) =>
          current || initialPaymentTokenAddress || tokens[0]?.contractAddress || "",
        );
      })
      .catch((error: unknown) => {
        setPaymentTokens([]);
        setPaymentTokenError(
          error instanceof Error
            ? error.message
            : "Payment tokens could not be loaded.",
        );
      });

    if (isWalletAvailable()) {
      getConnectedAccount().then((acc) => setWalletAddress(acc ?? null));
      getWalletChainId().then((cid) => setWalletChainId(cid ?? null));
    }
  }, [isOpen, initialAmount, initialPaymentTokenAddress]);

  // Eligibility, source provenance, and deployment are checked before any
  // executable quote is requested. A verified deployment alone is not
  // sufficient authorization to trade.
  useEffect(() => {
    if (!isOpen || !asset) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailability(null);
    getTradeAvailability(asset.id)
      .then((result) => {
        if (!cancelled) setAvailability(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAvailability({
            assetId: asset.id,
            status: "PROVIDER_UNAVAILABLE",
            reason:
              error instanceof Error
                ? error.message
                : "Trade availability could not be verified.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, asset]);

  // 2. Debounce Amount Input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(amount.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [amount]);

  // 3. Fetch Quote on Amount / Token Change
  useEffect(() => {
    if (
      !isOpen ||
      !asset ||
      availability?.status !== "AVAILABLE" ||
      !selectedTokenAddr ||
      !debouncedAmount ||
      parseFloat(debouncedAmount) <= 0
    ) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    setIsQuoting(true);
    setQuoteError(null);

    let cancelled = false;
    getTradeQuote({
      assetId: asset.id,
      fromTokenAddress: selectedTokenAddr,
      amount: debouncedAmount,
      slippageBps: 50,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.quote.hasRoute) {
          setQuote(res.quote);
        } else {
          setQuote(null);
          setQuoteError(res.quote.reason ?? "No active liquidity pool route on X Layer.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(
          err instanceof Error ? err.message : "Failed to fetch quote.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsQuoting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    asset,
    availability?.status,
    selectedTokenAddr,
    debouncedAmount,
    quoteRefreshNonce,
  ]);

  useEffect(() => {
    if (!isOpen || !quote) return;
    setQuoteClock(Date.now());
    const interval = window.setInterval(() => setQuoteClock(Date.now()), 1000);
    const expiresAt = Date.parse(quote.expiresAt);
    const refresh = window.setTimeout(
      () => setQuoteRefreshNonce((value) => value + 1),
      Math.max(0, expiresAt - Date.now()) + 100,
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(refresh);
    };
  }, [isOpen, quote]);

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

  useEffect(() => {
    setAuthState((current) =>
      current === "WAITING_WALLET" || current === "SUBMITTED_ONCHAIN"
        ? current
        : "IDLE",
    );
    setTxHash(null);
  }, [selectedTokenAddr, debouncedAmount]);

  // Reset state on close
  const handleClose = useCallback(() => {
    if (isPending) return;
    setAmount("");
    setQuote(null);
    setQuoteError(null);
    setAvailability(null);
    setTxHash(null);
    setAuthState("IDLE");
    setActionError(null);
    onClose();
  }, [isPending, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, isOpen]);

  const handleCopyContract = async () => {
    if (!targetContract) return;
    try {
      await navigator.clipboard.writeText(targetContract);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("The contract address could not be copied.");
    }
  };

  const handleConnect = async () => {
    setActionError(null);
    try {
      const acc = await connectWallet();
      if (acc) {
        setWalletAddress(acc);
        const cid = await getWalletChainId();
        setWalletChainId(cid ?? null);
      } else {
        setActionError("Wallet connection was cancelled.");
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Wallet connection failed.",
      );
    }
  };

  const handleSwitchNetwork = async () => {
    setActionError(null);
    try {
      await switchNetworkToXLayer();
      const cid = await getWalletChainId();
      setWalletChainId(cid ?? null);
    } catch (err) {
      console.error("Failed to switch network to X Layer:", err);
      setActionError(
        err instanceof Error ? err.message : "Network switch was not completed.",
      );
    }
  };

  const verifyCurrentAvailability = async () => {
    if (!asset) throw new Error("Asset passport is unavailable.");
    const current = await getTradeAvailability(asset.id);
    setAvailability(current);
    if (current.status !== "AVAILABLE") {
      throw new Error(
        current.reason ?? `Trade blocked: ${current.status.replaceAll("_", " ")}.`,
      );
    }
  };

  const handleApprove = async () => {
    if (!walletAddress || !quote?.routerAddress || !asset) return;
    setIsApproving(true);
    setActionError(null);

    try {
      await verifyCurrentAvailability();
      if (Date.parse(quote.expiresAt) <= Date.now()) {
        throw new Error("The quote expired before approval. A new quote is loading.");
      }
      const approvedTxHash = await requestTokenApproval(
        selectedTokenAddr,
        quote.routerAddress,
        walletAddress,
        BigInt(quote.fromToken.amountRaw),
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
    setActionError(null);

    try {
      await verifyCurrentAvailability();
      if (Date.parse(quote.expiresAt) <= Date.now()) {
        throw new Error("The quote expired. Wait for the refreshed quote before signing.");
      }
      setAuthState("WAITING_WALLET");
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
      const message = err instanceof Error ? err.message : "Transaction cancelled or failed.";
      const cancelled = /cancel|reject|denied/i.test(message);
      setAuthState(cancelled ? "CANCELLED" : "FAILED");
      setActionError(message);
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
      : "UNAVAILABLE";

  const displayChange =
    marketContext?.priceChange24hPct !== undefined
      ? `${marketContext.priceChange24hPct >= 0 ? "+" : ""}${marketContext.priceChange24hPct.toFixed(2)}%`
      : undefined;

  const quoteExpiresAt = quote ? Date.parse(quote.expiresAt) : 0;
  const quoteSecondsRemaining = quote
    ? Math.max(0, Math.ceil((quoteExpiresAt - quoteClock) / 1000))
    : 0;
  const quoteExpired = Boolean(quote && quoteExpiresAt <= quoteClock);

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-review-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <h2 className={styles.title} id="trade-review-title">Review trade</h2>
            <span className={styles.networkBadge}>
              <GlobeHemisphereWestIcon size={12} weight="bold" />
              X Layer Mainnet
            </span>
          </div>
          <button
            ref={closeButtonRef}
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Close trade drawer"
            disabled={isPending}
          >
            <XIcon size={17} />
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
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => void handleCopyContract()}
                    aria-label="Copy target contract address"
                  >
                    {copied ? <CheckCircleIcon size={13} weight="fill" /> : <CopyIcon size={13} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <a
                    href={`https://www.okx.com/web3/explorer/xlayer/address/${targetContract}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.contractLink}
                  >
                    Explorer <ArrowSquareOutIcon size={13} />
                  </a>
                </div>
              </div>
            )}
          </div>

          {availabilityLoading ? (
            <div className={`${styles.statusMessage} ${styles.statusWaiting}`} role="status">
              <CircleNotchIcon className={styles.statusSpinner} size={16} />
              <span>Checking source, eligibility, deployment, and route...</span>
            </div>
          ) : availability?.status !== "AVAILABLE" ? (
            <div className={`${styles.statusMessage} ${styles.statusError}`} role="alert">
              <WarningCircleIcon size={16} />
              <div>
                <strong>
                  Trade blocked: {availability?.status?.replaceAll("_", " ") ?? "UNKNOWN"}
                </strong>
                <span>{availability?.reason ?? "Trade availability could not be verified."}</span>
              </div>
            </div>
          ) : (
            <div className={styles.availabilityReady} role="status">
              <CheckCircleIcon size={15} weight="fill" />
              <div>
                <strong>Policy check passed</strong>
                <span>Eligibility and route checks passed for this request.</span>
              </div>
            </div>
          )}

          {paymentTokenError ? (
            <div className={`${styles.statusMessage} ${styles.statusError}`} role="alert">
              <WarningCircleIcon size={16} />
              <span>{paymentTokenError}</span>
            </div>
          ) : null}

          {/* Swap Input Form */}
          <div className={styles.swapForm}>
            {/* YOU PAY */}
            <div className={styles.swapCard}>
              <div className={styles.cardHeader}>
                <label htmlFor="trade-amount">You pay</label>
                {walletAddress && (
                  <div className={styles.balanceRow}>
                    <span>Balance: {tokenBalance}</span>
                    <button
                      className={styles.maxBtn}
                      type="button"
                      onClick={() => setAmount(tokenBalance)}
                      disabled={isPending || availability?.status !== "AVAILABLE"}
                    >
                      MAX
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  id="trade-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    setAmount(val);
                  }}
                  className={styles.amountInput}
                  disabled={isPending || availability?.status !== "AVAILABLE"}
                />
                <select
                  value={selectedTokenAddr}
                  onChange={(e) => setSelectedTokenAddr(e.target.value)}
                  className={styles.tokenSelect}
                  disabled={isPending || availability?.status !== "AVAILABLE"}
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
              <div className={styles.arrowIcon} aria-hidden="true">
                <ArrowDownIcon size={15} weight="bold" />
              </div>
            </div>

            {/* YOU RECEIVE */}
            <div className={styles.swapCard}>
              <div className={styles.cardHeader}>
                <span>You receive (estimated)</span>
                <span>Exact input</span>
              </div>
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  readOnly
                  placeholder="0.00"
                  value={
                    isQuoting
                      ? "Calculating quote..."
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
                aria-expanded={showExecutionDetails}
              >
                <span>Execution details</span>
                {showExecutionDetails ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
              </button>

              {showExecutionDetails && (
                <div className={styles.quoteDetails}>
                  <div className={styles.quoteRow}>
                    <span>Exchange rate</span>
                    <span className={styles.quoteValue}>
                      1 {quote.toToken.symbol} ≈ {quote.executionPrice.toFixed(2)}{" "}
                      {quote.fromToken.symbol}
                    </span>
                  </div>
                  <div className={styles.quoteRow}>
                    <span>Price impact</span>
                    <span className={styles.quoteValue}>
                      {quote.priceImpactPct < 0.01
                        ? "< 0.01%"
                        : `${quote.priceImpactPct.toFixed(2)}%`}
                    </span>
                  </div>
                  <div className={styles.quoteRow}>
                    <span>Estimated network fee</span>
                    <span className={styles.quoteValue}>
                      ${quote.estimatedGasUsd.toFixed(2)} USD estimate
                    </span>
                  </div>
                  <div className={styles.quoteRow}>
                    <span>Minimum received at 0.50% slippage</span>
                    <span className={styles.quoteValue}>
                      {quote.minimumReceived} {quote.toToken.symbol}
                    </span>
                  </div>
                  <div className={styles.quoteRow}>
                    <span>Provider and route</span>
                    <span className={styles.quoteValue}>
                      {quote.provider} / {quote.routeName}
                    </span>
                  </div>
                  {quote.tradeFeeUsd !== undefined ? (
                    <div className={styles.quoteRow}>
                      <span>Trade fee</span>
                      <span className={styles.quoteValue}>${quote.tradeFeeUsd.toFixed(2)} USD</span>
                    </div>
                  ) : null}
                  <div className={styles.quoteRow}>
                    <span>Quote validity</span>
                    <span className={styles.quoteValue}>
                      {quoteExpired
                        ? "Refreshing quote"
                        : `Fetched ${new Date(quote.quoteFetchedAt).toLocaleTimeString()} (${quoteSecondsRemaining}s left)`}
                    </span>
                  </div>
                  <div className={styles.quoteRow}>
                    <span>Approval scope</span>
                    <span className={styles.quoteValue}>
                      Exactly {quote.fromToken.amount} {quote.fromToken.symbol}
                    </span>
                  </div>
                  <div className={styles.quoteRow}>
                    <span>Approval spender</span>
                    <span className={styles.quoteValue} title={quote.allowanceTarget}>
                      {quote.allowanceTarget.slice(0, 8)}...{quote.allowanceTarget.slice(-6)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Wallet Authorization & Status States */}
          {authState === "WAITING_WALLET" && (
            <div className={`${styles.statusMessage} ${styles.statusWaiting}`} role="status" aria-live="polite">
              <CircleNotchIcon className={styles.statusSpinner} size={16} />
              <span>Waiting for wallet authorization. Review the request in your wallet.</span>
            </div>
          )}

          {authState === "SUBMITTED_ONCHAIN" && (
            <div className={`${styles.statusMessage} ${styles.statusWaiting}`} role="status" aria-live="polite">
              <CircleNotchIcon className={styles.statusSpinner} size={16} />
              <span>Submitted on X Layer. Waiting for onchain confirmation.</span>
            </div>
          )}

          {authState === "CONFIRMED" && txHash && (
            <div className={`${styles.statusMessage} ${styles.statusSuccess}`} role="status" aria-live="polite">
              <span><CheckCircleIcon size={16} weight="fill" /> Trade confirmed on X Layer</span>
              <a
                href={`https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.txLink}
              >
                View receipt <ArrowSquareOutIcon size={13} />
              </a>
            </div>
          )}

          {quoteError && (
            <div className={`${styles.statusMessage} ${styles.statusError}`} role="alert">
              <WarningCircleIcon size={16} />
              <span>{quoteError}</span>
            </div>
          )}

          {actionError && (
            <div className={`${styles.statusMessage} ${styles.statusError}`} role="alert">
              <WarningCircleIcon size={16} />
              <span>{actionError}</span>
            </div>
          )}

          {/* Dynamic Action Button */}
          {availabilityLoading ? (
            <button type="button" className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              Checking trade availability...
            </button>
          ) : availability?.status !== "AVAILABLE" ? (
            <button type="button" className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              Trade unavailable
            </button>
          ) : !walletAddress ? (
            <button
              className={`${styles.actionButton} ${styles.btnPrimary}`}
              onClick={handleConnect}
              type="button"
            >
              Connect wallet
            </button>
          ) : isWrongChain ? (
            <button
              className={`${styles.actionButton} ${styles.btnWarning}`}
              onClick={handleSwitchNetwork}
              type="button"
            >
              Switch to X Layer (Chain 196)
            </button>
          ) : !amount || parseFloat(amount) <= 0 ? (
            <button type="button" className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              Enter an amount
            </button>
          ) : isQuoting ? (
            <button type="button" className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              Getting live quote...
            </button>
          ) : quoteExpired ? (
            <button type="button" className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              Refreshing expired quote...
            </button>
          ) : !quote ? (
            <button type="button" className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              No route available
            </button>
          ) : isBalanceInsufficient ? (
            <button type="button" className={`${styles.actionButton} ${styles.btnDisabled}`} disabled>
              Insufficient {currentPaymentToken?.symbol ?? "USDC"} balance
            </button>
          ) : isAllowanceNeeded ? (
            <button
              className={`${styles.actionButton} ${styles.btnPrimary}`}
              onClick={handleApprove}
              disabled={isApproving}
              type="button"
            >
              {isApproving
                ? `Approving ${debouncedAmount} ${currentPaymentToken?.symbol ?? "USDC"}...`
                : `Approve exactly ${debouncedAmount} ${currentPaymentToken?.symbol ?? "USDC"}`}
            </button>
          ) : (
            <button
              className={`${styles.actionButton} ${styles.btnPrimary}`}
              onClick={handleTrade}
              disabled={isPending}
              type="button"
            >
              {authState === "WAITING_WALLET"
                ? "Waiting for wallet..."
                : authState === "SUBMITTED_ONCHAIN"
                ? "Confirming on X Layer..."
                : `Confirm trade for ${asset.symbol}`}
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
