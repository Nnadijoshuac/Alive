"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRightIcon,
  CurrencyCircleDollarIcon,
  LockKeyIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { isAddress, parseEventLogs, parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import {
  activeChain,
  contractAddresses,
  contractsConfigured,
  explorerTransactionUrl,
} from "@/lib/chain";
import { escrowAbi } from "@/lib/contracts";
import { rememberEscrow } from "@/lib/local-state";
import type { Hex } from "@/lib/types";
import { Button, Field, InlineNotice, KeyValue } from "./ui";
import { TransactionFlow, type TransactionStep } from "./transaction-flow";
import { useWalletSnapshot, WalletRequirement } from "./wallet-shell";

export function EscrowCreateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wallet = useWalletSnapshot();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [assetId, setAssetId] = useState(searchParams.get("assetId") ?? "");
  const [seller, setSeller] = useState("");
  const [token, setToken] = useState(contractAddresses.testToken ?? "");
  const [amount, setAmount] = useState("10");
  const [identity, setIdentity] = useState("8500");
  const [liveness, setLiveness] = useState("8000");
  const [duration, setDuration] = useState("7");
  const [working, setWorking] = useState(false);
  const [transactionHash, setTransactionHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid =
    /^0x[0-9a-fA-F]{64}$/.test(assetId) &&
    isAddress(seller) &&
    isAddress(token) &&
    Number(amount) > 0 &&
    Number(identity) >= 0 &&
    Number(identity) <= 10_000 &&
    Number(liveness) >= 0 &&
    Number(liveness) <= 10_000 &&
    Number(duration) > 0 &&
    Number(duration) <= 30;

  const steps = useMemo<TransactionStep[]>(
    () => [
      {
        label: "Escrow terms",
        detail: valid
          ? "Inputs satisfy client-side bounds"
          : "Complete all required values",
        state: valid ? "confirmed" : "idle",
      },
      {
        label: "Wallet signature",
        detail: transactionHash
          ? "Creation submitted"
          : "Buyer authorizes creation",
        state:
          working && !transactionHash
            ? "pending"
            : transactionHash
              ? "confirmed"
              : contractsConfigured
                ? "idle"
                : "blocked",
      },
      {
        label: "Contract confirmation",
        detail: transactionHash ?? "Escrow ID comes from the contract event",
        state: working && transactionHash ? "pending" : "idle",
      },
    ],
    [transactionHash, valid, working],
  );

  const create = async () => {
    if (
      !valid ||
      !contractAddresses.escrow ||
      !wallet.connected ||
      !wallet.correctNetwork
    )
      return;
    setWorking(true);
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: contractAddresses.escrow,
        abi: escrowAbi,
        functionName: "createEscrow",
        chainId: activeChain.id,
        args: [
          assetId as Hex,
          seller as `0x${string}`,
          token as `0x${string}`,
          parseUnits(amount, 6),
          Number(identity),
          Number(liveness),
          BigInt(Math.floor(Date.now() / 1000) + Number(duration) * 86_400),
        ],
      });
      setTransactionHash(hash);
      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      if (!receipt || receipt.status !== "success")
        throw new Error("Escrow creation did not confirm successfully.");
      const logs = parseEventLogs({
        abi: escrowAbi,
        eventName: "EscrowCreated",
        logs: receipt.logs,
      });
      const escrowId = logs[0]?.args.escrowId;
      if (!escrowId)
        throw new Error(
          "Escrow creation confirmed, but its event could not be decoded.",
        );
      rememberEscrow({
        escrowId,
        assetId: assetId as Hex,
        transactionHash: hash,
        createdAt: new Date().toISOString(),
      });
      router.push(`/escrow/${escrowId}`);
    } catch (caught) {
      setError(
        caught instanceof Error &&
          caught.message.toLowerCase().includes("rejected")
          ? "The wallet rejected escrow creation."
          : caught instanceof Error
            ? caught.message
            : "Escrow creation failed.",
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="escrow-create-layout">
      <section className="escrow-form panel">
        <header>
          <CurrencyCircleDollarIcon size={29} />
          <div>
            <h2>Define release conditions</h2>
            <p>
              The connected wallet is the buyer. The asset owner must be the
              seller at contract execution.
            </p>
          </div>
        </header>
        <div className="form-grid">
          <Field
            label="Asset ID"
            {...(assetId && !/^0x[0-9a-fA-F]{64}$/.test(assetId)
              ? { error: "Use a 32-byte hexadecimal asset ID." }
              : {})}
          >
            <input
              className="input mono"
              value={assetId}
              onChange={(event) => setAssetId(event.target.value)}
              placeholder="0x..."
            />
          </Field>
          <Field
            label="Seller address"
            {...(seller && !isAddress(seller)
              ? { error: "Enter a valid EVM address." }
              : {})}
          >
            <input
              className="input mono"
              value={seller}
              onChange={(event) => setSeller(event.target.value)}
              placeholder="0x..."
            />
          </Field>
          <Field
            label="Payment token"
            hint="Use the deployed test token for a local or testnet demo."
          >
            <input
              className="input mono"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="0x..."
            />
          </Field>
          <Field
            label="Amount"
            hint="Displayed and submitted using 6 token decimals."
          >
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field
            label="Required identity score"
            hint="Integer basis points from 0 to 10,000."
          >
            <input
              className="input"
              type="number"
              min="0"
              max="10000"
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
            />
          </Field>
          <Field
            label="Required liveness score"
            hint="Integer basis points from 0 to 10,000."
          >
            <input
              className="input"
              type="number"
              min="0"
              max="10000"
              value={liveness}
              onChange={(event) => setLiveness(event.target.value)}
            />
          </Field>
          <Field
            label="Duration in days"
            hint="The contract permits a maximum of 30 days."
          >
            <input
              className="input"
              type="number"
              min="1"
              max="30"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </Field>
        </div>
        {!contractsConfigured ? (
          <InlineNotice tone="warning" title="Contracts not deployed">
            Escrow submission is disabled until public contract addresses are
            configured.
          </InlineNotice>
        ) : (
          <WalletRequirement />
        )}
        {error ? (
          <InlineNotice tone="warning" title="Escrow not created">
            {error}
          </InlineNotice>
        ) : null}
        {transactionHash && explorerTransactionUrl(transactionHash) ? (
          <a
            className="text-link"
            href={explorerTransactionUrl(transactionHash)}
            target="_blank"
            rel="noreferrer"
          >
            View pending creation transaction
          </a>
        ) : null}
        <Button
          className="button-primary create-escrow-button"
          disabled={
            !valid ||
            !contractsConfigured ||
            !wallet.connected ||
            !wallet.correctNetwork ||
            working
          }
          onClick={() => void create()}
        >
          {working ? "Confirming escrow" : "Create escrow"}
          <ArrowRightIcon size={17} />
        </Button>
      </section>
      <aside className="escrow-summary panel">
        <LockKeyIcon size={28} />
        <h3>Verification-gated release</h3>
        <p>
          Funds do not move because the interface says success. The contract
          consumes a fresh signature and enforces asset, subject, context,
          expiry, identity, and liveness.
        </p>
        <TransactionFlow steps={steps} />
        <div className="threshold-summary">
          <KeyValue label="Identity threshold">
            {(Number(identity || 0) / 100).toFixed(2)}%
          </KeyValue>
          <KeyValue label="Liveness threshold">
            {(Number(liveness || 0) / 100).toFixed(2)}%
          </KeyValue>
          <KeyValue label="Maximum duration">{duration || 0} days</KeyValue>
          <KeyValue label="Outcome">
            <span className="accent">
              <ShieldCheckIcon size={15} />
              Policy controlled
            </span>
          </KeyValue>
        </div>
      </aside>
    </div>
  );
}
