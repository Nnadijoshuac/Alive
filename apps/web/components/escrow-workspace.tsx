"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircleIcon,
  CurrencyCircleDollarIcon,
  LockKeyIcon,
  ShieldWarningIcon,
} from "@phosphor-icons/react";
import { formatUnits, keccak256, stringToHex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import {
  activeChain,
  contractAddresses,
  contractsConfigured,
  explorerTransactionUrl,
} from "@/lib/chain";
import { erc20Abi, escrowAbi } from "@/lib/contracts";
import {
  EscrowStatus,
  escrowCanSettle,
  escrowStatusName,
  escrowWasFunded,
} from "@/lib/escrow-status";
import { formatDate, formatScore, truncateHash } from "@/lib/format";
import type { Address, Hex } from "@/lib/types";
import { VerificationWorkflow } from "./verification-workflow";
import {
  Button,
  Field,
  InlineNotice,
  KeyValue,
  Skeleton,
  StatusBadge,
} from "./ui";
import { TransactionFlow, type TransactionStep } from "./transaction-flow";
import { useWalletSnapshot, WalletRequirement } from "./wallet-shell";

interface EscrowRecord {
  assetId: Hex;
  buyer: Address;
  seller: Address;
  token: Address;
  amount: bigint;
  requiredIdentityScore: number;
  requiredLivenessScore: number;
  createdAt: bigint;
  expiresAt: bigint;
  status: number;
}

export function EscrowWorkspace({ escrowId }: { escrowId: string }) {
  const wallet = useWalletSnapshot();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [record, setRecord] = useState<EscrowRecord | null>(null);
  const [context, setContext] = useState<Hex | null>(null);
  const [decimals, setDecimals] = useState(6);
  const [symbol, setSymbol] = useState("TOKEN");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<
    "approve" | "fund" | "cancel" | "refund" | "dispute" | null
  >(null);
  const [transactionHash, setTransactionHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [nowSeconds, setNowSeconds] = useState(() =>
    Math.floor(Date.now() / 1_000),
  );

  const load = useCallback(async () => {
    if (
      !contractsConfigured ||
      !contractAddresses.escrow ||
      !publicClient ||
      !/^0x[0-9a-fA-F]{64}$/.test(escrowId)
    ) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [returned, returnedContext] = await Promise.all([
        publicClient.readContract({
          address: contractAddresses.escrow,
          abi: escrowAbi,
          functionName: "getEscrow",
          args: [escrowId as Hex],
        }),
        publicClient.readContract({
          address: contractAddresses.escrow,
          abi: escrowAbi,
          functionName: "escrowContext",
          args: [escrowId as Hex],
        }),
      ]);
      const typed = returned as EscrowRecord;
      setRecord(typed);
      setContext(returnedContext);
      const tokenInfo = await Promise.allSettled([
        publicClient.readContract({
          address: typed.token,
          abi: erc20Abi,
          functionName: "decimals",
        }),
        publicClient.readContract({
          address: typed.token,
          abi: erc20Abi,
          functionName: "symbol",
        }),
      ]);
      if (tokenInfo[0].status === "fulfilled")
        setDecimals(Number(tokenInfo[0].value));
      if (tokenInfo[1].status === "fulfilled") setSymbol(tokenInfo[1].value);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Escrow could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [escrowId, publicClient]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setNowSeconds(Math.floor(Date.now() / 1_000)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const runEscrowAction = async (
    action: "cancel" | "refund" | "dispute",
    functionName: "cancelEscrow" | "refundEscrow" | "raiseDispute",
  ) => {
    if (!contractAddresses.escrow || !publicClient) return;
    setWorking(action);
    setError(null);
    try {
      const args =
        functionName === "raiseDispute"
          ? ([
              escrowId as Hex,
              keccak256(stringToHex(disputeReason.trim())),
            ] as const)
          : ([escrowId as Hex] as const);
      const hash = await writeContractAsync({
        address: contractAddresses.escrow,
        abi: escrowAbi,
        functionName,
        chainId: activeChain.id,
        args,
      });
      setTransactionHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw new Error(`${action} transaction did not confirm.`);
      if (action === "dispute") setDisputeReason("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error &&
          caught.message.toLowerCase().includes("rejected")
          ? "The wallet rejected the transaction."
          : caught instanceof Error
            ? caught.message
            : "Escrow action failed.",
      );
    } finally {
      setWorking(null);
    }
  };

  const approveAndFund = async () => {
    if (!record || !contractAddresses.escrow || !publicClient) return;
    setError(null);
    try {
      setWorking("approve");
      const approval = await writeContractAsync({
        address: record.token,
        abi: erc20Abi,
        functionName: "approve",
        chainId: activeChain.id,
        args: [contractAddresses.escrow, record.amount],
      });
      setTransactionHash(approval);
      const approvalReceipt = await publicClient.waitForTransactionReceipt({
        hash: approval,
      });
      if (approvalReceipt.status !== "success")
        throw new Error("Token approval did not confirm.");
      setWorking("fund");
      const funding = await writeContractAsync({
        address: contractAddresses.escrow,
        abi: escrowAbi,
        functionName: "fundEscrow",
        chainId: activeChain.id,
        args: [escrowId as Hex],
      });
      setTransactionHash(funding);
      const fundingReceipt = await publicClient.waitForTransactionReceipt({
        hash: funding,
      });
      if (fundingReceipt.status !== "success")
        throw new Error("Escrow funding did not confirm.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error &&
          caught.message.toLowerCase().includes("rejected")
          ? "The wallet rejected the transaction."
          : caught instanceof Error
            ? caught.message
            : "Funding failed.",
      );
    } finally {
      setWorking(null);
    }
  };

  if (!contractsConfigured)
    return (
      <div className="state-panel">
        <LockKeyIcon size={42} />
        <h2>Contracts not deployed.</h2>
        <p>
          This route will read and mutate real escrow state after the public
          contract addresses are configured.
        </p>
      </div>
    );
  if (!/^0x[0-9a-fA-F]{64}$/.test(escrowId))
    return (
      <div className="state-panel">
        <ShieldWarningIcon size={42} />
        <h2>Invalid escrow ID.</h2>
        <p>
          Escrow identifiers are 32-byte hexadecimal values emitted by the
          contract.
        </p>
      </div>
    );
  if (loading)
    return (
      <div className="passport-loading">
        <Skeleton className="skeleton-wide" />
        <Skeleton className="skeleton-tall" />
      </div>
    );
  if (!record)
    return (
      <div className="state-panel">
        <ShieldWarningIcon size={42} />
        <h2>Escrow not available.</h2>
        <p>{error ?? "The contract did not return this escrow."}</p>
        <Button className="button-secondary" onClick={() => void load()}>
          Retry contract read
        </Button>
      </div>
    );

  const steps: TransactionStep[] = [
    {
      label: "Created",
      detail: formatDate(Number(record.createdAt) * 1000),
      state: "confirmed",
    },
    {
      label: "Funded",
      detail:
        escrowCanSettle(record.status) || record.status === EscrowStatus.Funded
          ? `${formatUnits(record.amount, decimals)} ${symbol} locked`
          : record.status === EscrowStatus.Released
            ? "Funds released to seller"
            : record.status === EscrowStatus.Refunded
              ? "Funds returned to buyer"
              : "Buyer approval and funding required",
      state: escrowWasFunded(record.status)
        ? "confirmed"
        : working
          ? "pending"
          : "idle",
    },
    {
      label: "Physical verification",
      detail:
        record.status === EscrowStatus.Disputed
          ? "Disputed, but a valid attestation can still settle"
          : record.status === EscrowStatus.AwaitingVerification
            ? "Fresh attestation required"
            : record.status === EscrowStatus.Released
              ? "Accepted attestation consumed"
              : "Unavailable in current state",
      state:
        record.status === EscrowStatus.Released
          ? "confirmed"
          : escrowCanSettle(record.status)
            ? "pending"
            : "idle",
    },
    {
      label: "Payment",
      detail:
        record.status === EscrowStatus.Released
          ? "Released to seller"
          : record.status === EscrowStatus.Refunded
            ? "Refunded to buyer"
            : record.status === EscrowStatus.Cancelled
              ? "Cancelled before funding"
              : "Funds remain controlled by the contract",
      state:
        record.status === EscrowStatus.Released ||
        record.status === EscrowStatus.Refunded
          ? "confirmed"
          : "blocked",
    },
  ];
  const expired = nowSeconds >= Number(record.expiresAt);
  const connectedIsBuyer =
    wallet.address?.toLowerCase() === record.buyer.toLowerCase();
  const connectedIsSeller =
    wallet.address?.toLowerCase() === record.seller.toLowerCase();
  const connectedIsParty = connectedIsBuyer || connectedIsSeller;

  const headline =
    record.status === EscrowStatus.Released
      ? "Payment released."
      : record.status === EscrowStatus.Refunded
        ? "Payment refunded."
        : record.status === EscrowStatus.Cancelled
          ? "Escrow cancelled."
          : record.status === EscrowStatus.Disputed
            ? "Dispute active. Verification remains available."
            : escrowCanSettle(record.status)
              ? "Awaiting physical verification."
              : "Escrow created.";

  return (
    <div className="escrow-workspace">
      <section className="escrow-status panel">
        <header>
          <div>
            <StatusBadge
              tone={
                record.status === EscrowStatus.Released
                  ? "success"
                  : escrowCanSettle(record.status)
                    ? "active"
                    : record.status === EscrowStatus.Refunded ||
                        record.status === EscrowStatus.Cancelled
                      ? "warning"
                      : "neutral"
              }
            >
              {escrowStatusName(record.status)}
            </StatusBadge>
            <h2>{headline}</h2>
          </div>
          <CurrencyCircleDollarIcon size={38} />
        </header>
        <div className="escrow-values">
          <KeyValue label="Asset">
            {truncateHash(record.assetId, 14, 10)}
          </KeyValue>
          <KeyValue label="Buyer">{truncateHash(record.buyer, 14, 8)}</KeyValue>
          <KeyValue label="Seller">
            {truncateHash(record.seller, 14, 8)}
          </KeyValue>
          <KeyValue label="Value">
            {formatUnits(record.amount, decimals)} {symbol}
          </KeyValue>
          <KeyValue label="Identity requirement">
            {formatScore(record.requiredIdentityScore)}
          </KeyValue>
          <KeyValue label="Liveness requirement">
            {formatScore(record.requiredLivenessScore)}
          </KeyValue>
          <KeyValue label="Expiry">
            {formatDate(Number(record.expiresAt) * 1000)}
          </KeyValue>
          <KeyValue label="Context">
            {context ? truncateHash(context, 14, 10) : "Unavailable"}
          </KeyValue>
        </div>
        <TransactionFlow steps={steps} />
        {record.status === EscrowStatus.Created ? (
          <div className="funding-actions">
            <WalletRequirement />
            {!connectedIsBuyer ? (
              <InlineNotice tone="warning" title="Buyer wallet required">
                Only the recorded buyer can fund or cancel this escrow.
              </InlineNotice>
            ) : (
              <>
                <Button
                  className="button-primary"
                  disabled={
                    Boolean(working) || !wallet.correctNetwork || expired
                  }
                  onClick={() => void approveAndFund()}
                >
                  {working === "approve"
                    ? "Approving token"
                    : working === "fund"
                      ? "Funding contract"
                      : "Approve and fund"}
                </Button>
                <Button
                  className="button-secondary"
                  disabled={Boolean(working) || !wallet.correctNetwork}
                  onClick={() => void runEscrowAction("cancel", "cancelEscrow")}
                >
                  {working === "cancel" ? "Cancelling" : "Cancel escrow"}
                </Button>
              </>
            )}
          </div>
        ) : null}
        {escrowCanSettle(record.status) ? (
          <div className="funding-actions">
            <WalletRequirement />
            {expired ? (
              <InlineNotice tone="warning" title="Escrow expired">
                New verification cannot settle this escrow. The buyer can
                recover the locked funds.
              </InlineNotice>
            ) : null}
            {connectedIsSeller || (connectedIsBuyer && expired) ? (
              <Button
                className="button-secondary"
                disabled={Boolean(working) || !wallet.correctNetwork}
                onClick={() => void runEscrowAction("refund", "refundEscrow")}
              >
                {working === "refund"
                  ? "Submitting refund"
                  : connectedIsSeller
                    ? "Authorize buyer refund"
                    : "Recover expired funds"}
              </Button>
            ) : null}
            {record.status === EscrowStatus.AwaitingVerification &&
            connectedIsParty &&
            !expired ? (
              <div className="form-grid">
                <Field
                  label="Dispute reason"
                  hint="Only its hash is stored onchain."
                >
                  <input
                    className="input"
                    value={disputeReason}
                    maxLength={500}
                    onChange={(event) => setDisputeReason(event.target.value)}
                    placeholder="Describe the offchain dispute"
                  />
                </Field>
                <Button
                  className="button-secondary"
                  disabled={
                    Boolean(working) ||
                    !wallet.correctNetwork ||
                    !disputeReason.trim()
                  }
                  onClick={() =>
                    void runEscrowAction("dispute", "raiseDispute")
                  }
                >
                  {working === "dispute" ? "Raising dispute" : "Commit dispute"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {transactionHash && explorerTransactionUrl(transactionHash) ? (
          <a
            className="text-link"
            href={explorerTransactionUrl(transactionHash)}
            target="_blank"
            rel="noreferrer"
          >
            View latest transaction
          </a>
        ) : null}
        {error ? (
          <InlineNotice tone="warning" title="Contract action incomplete">
            {error}
          </InlineNotice>
        ) : null}
      </section>
      {escrowCanSettle(record.status) && context && !expired ? (
        <section className="escrow-verification">
          <header>
            <CheckCircleIcon size={28} />
            <div>
              <h2>Verify and settle</h2>
              <p>
                The connected verifier subject must be the recorded seller. A
                valid signature will be consumed atomically with payment
                release.
              </p>
            </div>
          </header>
          <VerificationWorkflow
            assetId={record.assetId}
            context={context}
            escrowId={escrowId as Hex}
            expectedSubject={record.seller}
            onSettled={load}
          />
        </section>
      ) : null}
      {record.status === EscrowStatus.Released ? (
        <section className="released-state">
          <CheckCircleIcon size={50} weight="fill" />
          <p className="eyebrow">Onchain outcome</p>
          <h2>Physical proof released programmable value.</h2>
          <p>
            The contract state reports released. This interface does not invent
            the settlement result.
          </p>
        </section>
      ) : null}
    </div>
  );
}
