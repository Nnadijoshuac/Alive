"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightIcon,
  CoinsIcon,
  FactoryIcon,
  LockKeyOpenIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import {
  formatUnits,
  parseEventLogs,
  parseUnits,
  type Hex,
} from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { useWalletSnapshot } from "@/components/wallet-shell";
import { activeChain, explorerTransactionUrl } from "@/lib/chain";
import {
  demoRwaFaucetAbi,
  policyRegistryArguments,
  rwaCashTokenAbi,
  rwaContractAddresses,
  rwaPolicyRegistryAbi,
  rwaVaultAbi,
  rwaVaultFactoryAbi,
  type RwaVaultRead,
} from "@/lib/rwa-chain";
import { getRwaPolicy, type PolicyRecord } from "@/lib/rwa-api";
import { readRwaState, rememberRwaState } from "@/lib/rwa-state";
import { truncateIdentifier } from "@/lib/rwa-format";
import { ConsequenceReview, Notice, OperationStatus, styles } from "./ui";

type TransactionPhase =
  | "IDLE"
  | "WAITING_WALLET"
  | "SUBMITTED"
  | "CONFIRMED"
  | "CONFIRMATION_UNKNOWN"
  | "CANCELLED"
  | "FAILED";

function wasWalletRejected(error: unknown): boolean {
  return error instanceof Error && /rejected|denied|declined/iu.test(error.message);
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (/rejected|denied|declined/iu.test(error.message)) return "The wallet rejected the transaction.";
  return error.message;
}

export function VaultFactoryActions() {
  const wallet = useWalletSnapshot();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [phase, setPhase] = useState<TransactionPhase>("IDLE");
  const [transactionHash, setTransactionHash] = useState<Hex>();
  const [error, setError] = useState<string>();

  async function createVault() {
    if (!rwaContractAddresses.vaultFactory || !publicClient || !wallet.connected || !wallet.correctNetwork) return;
    setWorking(true); setPhase("WAITING_WALLET"); setError(undefined); setTransactionHash(undefined);
    let confirmedOnchain = false;
    let revertedOnchain = false;
    let submittedHash: Hex | undefined;
    try {
      const hash = await writeContractAsync({
        address: rwaContractAddresses.vaultFactory,
        abi: rwaVaultFactoryAbi,
        functionName: "createVault",
        chainId: activeChain.id,
      });
      submittedHash = hash;
      setTransactionHash(hash);
      setPhase("SUBMITTED");
      setReviewing(false);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        revertedOnchain = true;
        throw new Error("Vault creation reverted onchain.");
      }
      confirmedOnchain = true;
      setPhase("CONFIRMED");
      const logs = parseEventLogs({ abi: rwaVaultFactoryAbi, eventName: "VaultCreated", logs: receipt.logs });
      const vaultAddress = logs[0]?.args.vault;
      if (!vaultAddress) throw new Error("Vault creation confirmed, but VaultCreated could not be decoded.");
      rememberRwaState({ vaultAddress });
      router.push(`/vault/${vaultAddress}`);
    } catch (requestError) {
      setPhase(
        confirmedOnchain
          ? "CONFIRMED"
          : revertedOnchain
            ? "FAILED"
            : submittedHash
              ? "CONFIRMATION_UNKNOWN"
              : wasWalletRejected(requestError)
                ? "CANCELLED"
                : "FAILED",
      );
      setError(errorMessage(requestError, submittedHash ? "Vault creation confirmation could not be verified." : "Vault creation failed."));
    } finally { setWorking(false); setReviewing(false); }
  }

  if (!rwaContractAddresses.vaultFactory) {
    return <Notice title="Vault factory not configured" tone="warning">Set NEXT_PUBLIC_RWA_VAULT_FACTORY_ADDRESS to a reviewed deployment before this client can create a user-owned vault.</Notice>;
  }
  if (!wallet.connected || !wallet.correctNetwork) {
    return <Notice title="Wallet and network required" tone="warning">Connect the owner wallet on {activeChain.name}. The factory makes that caller the vault owner.</Notice>;
  }
  return (
    <div className={styles.stack}>
      <button className={styles.button} type="button" onClick={() => setReviewing(true)} disabled={working || reviewing}>
        <FactoryIcon size={17} /> Review vault creation
      </button>
      {reviewing ? (
        <ConsequenceReview
          title="Create an owner-controlled vault"
          description="Your wallet will submit a factory transaction. A vault address is shown only after the receipt confirms and the VaultCreated event can be decoded."
          facts={[
            { label: "Owner", value: wallet.address ?? "UNKNOWN" },
            { label: "Network", value: `${activeChain.name} / chain ${activeChain.id}` },
            { label: "Factory", value: rwaContractAddresses.vaultFactory },
            { label: "Effect", value: "Deploy a new vault contract" },
          ]}
          confirmLabel="Create vault in wallet"
          busyLabel="Waiting for wallet"
          busy={working}
          onCancel={() => setReviewing(false)}
          onConfirm={() => void createVault()}
        />
      ) : null}
      <TransactionFeedback phase={phase} hash={transactionHash} error={error} label="Vault creation" />
    </div>
  );
}

type CashFacts = {
  decimals: number;
  symbol: string;
  balance: bigint;
  vaultBalance: bigint;
  allowance: bigint;
  latestPolicyVersion: number;
  faucetClaimed?: boolean;
  faucetAmount?: bigint;
  faucetMatchesCash: boolean;
};

export function VaultOnchainActions({ vault, onRefresh }: { vault: RwaVaultRead; onRefresh: () => Promise<void> }) {
  const wallet = useWalletSnapshot();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [policy, setPolicy] = useState<PolicyRecord>();
  const [facts, setFacts] = useState<CashFacts>();
  const [amount, setAmount] = useState("10000");
  const [approvedPolicy, setApprovedPolicy] = useState(false);
  const [approvedActivation, setApprovedActivation] = useState(false);
  const [registeredPolicy, setRegisteredPolicy] = useState<{
    version: number;
    policyHash: string;
    vaultAddress: `0x${string}`;
  }>();
  const [working, setWorking] = useState<"claim" | "approve" | "deposit" | "register" | "activate">();
  const [reviewing, setReviewing] = useState<"claim" | "approve" | "deposit" | "register" | "activate">();
  const [phase, setPhase] = useState<TransactionPhase>("IDLE");
  const [transactionHash, setTransactionHash] = useState<Hex>();
  const [error, setError] = useState<string>();
  const [prerequisiteError, setPrerequisiteError] = useState<string>();
  const [readingPrerequisites, setReadingPrerequisites] = useState(false);
  const readGeneration = useRef(0);

  const ownerWallet = Boolean(wallet.address && vault.owner && wallet.address.toLowerCase() === vault.owner.toLowerCase());

  const load = useCallback(async () => {
    const generation = ++readGeneration.current;
    setFacts(undefined);
    setPolicy(undefined);
    setPrerequisiteError(undefined);
    setReadingPrerequisites(true);
    if (!publicClient || !wallet.address || !vault.cashToken || !vault.policyRegistry) {
      setReadingPrerequisites(false);
      return;
    }
    const state = readRwaState();
    if (state.policyId) {
      try {
        const nextPolicy = await getRwaPolicy(state.policyId);
        if (generation === readGeneration.current) setPolicy(nextPolicy);
      } catch (requestError) {
        if (generation === readGeneration.current) {
          setPrerequisiteError(errorMessage(requestError, "The selected policy record could not be read."));
        }
      }
    }
    try {
      const [decimals, symbol, balance, vaultBalance, allowance, latestPolicyVersion] = await Promise.all([
        publicClient.readContract({ address: vault.cashToken, abi: rwaCashTokenAbi, functionName: "decimals" }),
        publicClient.readContract({ address: vault.cashToken, abi: rwaCashTokenAbi, functionName: "symbol" }),
        publicClient.readContract({ address: vault.cashToken, abi: rwaCashTokenAbi, functionName: "balanceOf", args: [wallet.address] }),
        publicClient.readContract({ address: vault.cashToken, abi: rwaCashTokenAbi, functionName: "balanceOf", args: [vault.address] }),
        publicClient.readContract({ address: vault.cashToken, abi: rwaCashTokenAbi, functionName: "allowance", args: [wallet.address, vault.address] }),
        publicClient.readContract({ address: vault.policyRegistry, abi: rwaPolicyRegistryAbi, functionName: "latestVersion", args: [vault.address] }),
      ]);
      let faucetClaimed: boolean | undefined;
      let faucetAmount: bigint | undefined;
      let faucetMatchesCash = false;
      if (rwaContractAddresses.faucet) {
        const [claimed, claimAmount, token] = await Promise.all([
          publicClient.readContract({ address: rwaContractAddresses.faucet, abi: demoRwaFaucetAbi, functionName: "hasClaimed", args: [wallet.address] }),
          publicClient.readContract({ address: rwaContractAddresses.faucet, abi: demoRwaFaucetAbi, functionName: "claimAmount" }),
          publicClient.readContract({ address: rwaContractAddresses.faucet, abi: demoRwaFaucetAbi, functionName: "token" }),
        ]);
        faucetClaimed = claimed;
        faucetAmount = claimAmount;
        faucetMatchesCash = token.toLowerCase() === vault.cashToken.toLowerCase();
      }
      if (generation !== readGeneration.current) return;
      setFacts({
        decimals,
        symbol,
        balance,
        vaultBalance,
        allowance,
        latestPolicyVersion,
        ...(faucetClaimed === undefined ? {} : { faucetClaimed }),
        ...(faucetAmount === undefined ? {} : { faucetAmount }),
        faucetMatchesCash,
      });
    } catch (requestError) {
      if (generation === readGeneration.current) {
        setPrerequisiteError(errorMessage(requestError, "Vault funding facts could not be read."));
      }
    } finally {
      if (generation === readGeneration.current) setReadingPrerequisites(false);
    }
  }, [publicClient, vault.address, vault.cashToken, vault.policyRegistry, wallet.address]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    setRegisteredPolicy(undefined);
    setApprovedPolicy(false);
    setApprovedActivation(false);
  }, [vault.address]);

  const amountUnits = useMemo(() => {
    try {
      if (!facts) return undefined;
      const parsed = parseUnits(amount, facts.decimals);
      return parsed > 0n ? parsed : undefined;
    }
    catch { return undefined; }
  }, [amount, facts]);

  async function confirm(kind: NonNullable<typeof working>, submit: () => Promise<Hex>) {
    if (!publicClient) return;
    setWorking(kind); setPhase("WAITING_WALLET"); setError(undefined); setTransactionHash(undefined);
    let confirmedOnchain = false;
    let revertedOnchain = false;
    let submittedHash: Hex | undefined;
    try {
      const hash = await submit();
      submittedHash = hash;
      setTransactionHash(hash);
      setPhase("SUBMITTED");
      setReviewing(undefined);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        revertedOnchain = true;
        throw new Error(`${kind} transaction reverted onchain.`);
      }
      confirmedOnchain = true;
      setPhase("CONFIRMED");
      if (kind === "register") {
        const logs = parseEventLogs({ abi: rwaPolicyRegistryAbi, eventName: "PolicyRegistered", logs: receipt.logs });
        const version = logs[0]?.args.version;
        if (version !== undefined && policy) {
          setRegisteredPolicy({
            version,
            policyHash: policy.policyHash,
            vaultAddress: vault.address,
          });
          setApprovedPolicy(false);
          setApprovedActivation(false);
        }
      }
      await load();
      await onRefresh();
    } catch (requestError) {
      setPhase(
        confirmedOnchain
          ? "CONFIRMED"
          : revertedOnchain
            ? "FAILED"
            : submittedHash
              ? "CONFIRMATION_UNKNOWN"
              : wasWalletRejected(requestError)
                ? "CANCELLED"
                : "FAILED",
      );
      setError(errorMessage(requestError, submittedHash ? `${kind} confirmation could not be verified.` : `${kind} transaction failed.`));
    } finally { setWorking(undefined); setReviewing(undefined); }
  }

  if (!wallet.connected || !wallet.correctNetwork) {
    return <Notice title="Wallet and network required" tone="warning">Connect the owner wallet on {activeChain.name} to claim demo cash, approve, deposit, or register policy.</Notice>;
  }
  if (!ownerWallet) {
    return <Notice title="Connected wallet is not the vault owner" tone="warning">Owner-only policy activation is intentionally unavailable. Connect {vault.owner ? truncateIdentifier(vault.owner, 12, 10) : "the onchain owner"}.</Notice>;
  }
  if (!facts || !vault.cashToken || !vault.policyRegistry) {
    return (
      <Notice title={prerequisiteError ? "Transaction prerequisites unavailable" : "Reading transaction prerequisites"} tone={prerequisiteError ? "warning" : "info"}>
        {prerequisiteError ?? "Token decimals, balances, allowance, and registry version must resolve before an action is enabled."}
        {prerequisiteError ? <button className={styles.textButton} type="button" onClick={() => void load()} disabled={readingPrerequisites}>Retry prerequisite read</button> : null}
      </Notice>
    );
  }

  const enoughAllowance = amountUnits !== undefined && facts.allowance >= amountUnits;
  const enoughBalance = amountUnits !== undefined && facts.balance >= amountUnits;
  const registryArgs = policy ? policyRegistryArguments(policy.policyHash, policy.policy) : undefined;
  const versionToActivate =
    policy &&
    registeredPolicy?.vaultAddress.toLowerCase() === vault.address.toLowerCase() &&
    registeredPolicy.policyHash.toLowerCase() === policy.policyHash.toLowerCase()
      ? registeredPolicy.version
      : undefined;
  const activeMatchesLocal = Boolean(policy && vault.activePolicyHash?.toLowerCase() === policy.policyHash.toLowerCase());

  const reviewContent = reviewing
    ? {
        claim: {
          title: "Claim labelled demo cash",
          description: "Your wallet will call the configured demo faucet. This is a separate transaction and does not deposit funds into the vault.",
          confirmLabel: "Claim in wallet",
          facts: [
            { label: "Amount", value: facts.faucetAmount === undefined ? "DEMO AMOUNT FROM CONTRACT" : `${formatUnits(facts.faucetAmount, facts.decimals)} ${facts.symbol}` },
            { label: "Recipient", value: wallet.address ?? "UNKNOWN" },
            { label: "Faucet", value: rwaContractAddresses.faucet ?? "NOT CONFIGURED" },
            { label: "Network", value: `${activeChain.name} / chain ${activeChain.id}` },
          ],
        },
        approve: {
          title: `Approve ${facts.symbol} for this vault`,
          description: "This approval is limited to the entered deposit amount. It permits the vault contract to transfer that amount; it does not deposit funds by itself.",
          confirmLabel: "Approve exact amount",
          facts: [
            { label: "Allowance", value: `${amount} ${facts.symbol}` },
            { label: "Spender", value: vault.address },
            { label: "Token", value: vault.cashToken },
            { label: "Network", value: `${activeChain.name} / chain ${activeChain.id}` },
          ],
        },
        deposit: {
          title: `Deposit ${amount} ${facts.symbol}`,
          description: "Your wallet will transfer the entered cash amount into this vault. The transaction is enabled only after balance and exact allowance checks pass.",
          confirmLabel: "Deposit in wallet",
          facts: [
            { label: "Amount", value: `${amount} ${facts.symbol}` },
            { label: "Destination", value: vault.address },
            { label: "Owner wallet", value: wallet.address ?? "UNKNOWN" },
            { label: "Network", value: `${activeChain.name} / chain ${activeChain.id}` },
          ],
        },
        register: {
          title: "Register the canonical policy",
          description: "Your wallet will commit the displayed canonical hash and contract-enforceable rule subset to the configured Policy Registry for this vault.",
          confirmLabel: "Register policy in wallet",
          facts: [
            { label: "Policy", value: policy?.id ?? "UNKNOWN" },
            { label: "Canonical hash", value: policy?.policyHash ?? "UNKNOWN" },
            { label: "Registry", value: vault.policyRegistry },
            { label: "Vault", value: vault.address },
          ],
        },
        activate: {
          title: `Activate policy version ${versionToActivate ?? "UNKNOWN"}`,
          description: "Your wallet will change the vault's active policy version. Future guarded execution will evaluate against that onchain version.",
          confirmLabel: `Activate version ${versionToActivate ?? "UNKNOWN"}`,
          facts: [
            { label: "Version", value: versionToActivate === undefined ? "UNKNOWN" : String(versionToActivate) },
            { label: "Vault", value: vault.address },
            { label: "Current active hash", value: vault.activePolicyHash ?? "NOT ACTIVE" },
            { label: "Network", value: `${activeChain.name} / chain ${activeChain.id}` },
          ],
        },
      }[reviewing]
    : undefined;

  function submitReviewedAction() {
    if (!reviewing) return;
    if (reviewing === "claim" && rwaContractAddresses.faucet) {
      void confirm("claim", () => writeContractAsync({ address: rwaContractAddresses.faucet!, abi: demoRwaFaucetAbi, functionName: "claim", chainId: activeChain.id }));
      return;
    }
    if (reviewing === "approve" && amountUnits) {
      void confirm("approve", () => writeContractAsync({ address: vault.cashToken!, abi: rwaCashTokenAbi, functionName: "approve", chainId: activeChain.id, args: [vault.address, amountUnits] }));
      return;
    }
    if (reviewing === "deposit" && amountUnits) {
      void confirm("deposit", () => writeContractAsync({ address: vault.address, abi: rwaVaultAbi, functionName: "depositCash", chainId: activeChain.id, args: [amountUnits] }));
      return;
    }
    if (reviewing === "register" && registryArgs) {
      void confirm("register", () => writeContractAsync({ address: vault.policyRegistry!, abi: rwaPolicyRegistryAbi, functionName: "registerPolicy", chainId: activeChain.id, args: [vault.address, registryArgs.input, registryArgs.classLimits, registryArgs.allowedAssets, registryArgs.blockedAssets] }));
      return;
    }
    if (reviewing === "activate" && versionToActivate !== undefined && versionToActivate > 0) {
      void confirm("activate", () => writeContractAsync({ address: vault.address, abi: rwaVaultAbi, functionName: "activatePolicy", chainId: activeChain.id, args: [versionToActivate] }));
    }
  }

  return (
    <div className={styles.stack}>
      {prerequisiteError ? <Notice title="Some prerequisites could not be read" tone="warning">{prerequisiteError} Policy registration stays unavailable until the read succeeds.</Notice> : null}
      <div className={styles.grid2}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.kicker}>Demo cash rail</p><h2>Claim, approve, deposit</h2><p>Each confirmed action is a separate wallet transaction.</p></div><CoinsIcon size={23} color="currentColor" /></div>
          <dl className={styles.definitionList}>
            <Fact label="Wallet balance" value={`${formatUnits(facts.balance, facts.decimals)} ${facts.symbol}`} />
            <Fact label="Vault cash balance" value={`${formatUnits(facts.vaultBalance, facts.decimals)} ${facts.symbol}`} />
            <Fact label="Vault allowance" value={`${formatUnits(facts.allowance, facts.decimals)} ${facts.symbol}`} />
          </dl>
          {rwaContractAddresses.faucet && facts.faucetMatchesCash ? (
            <button className={styles.buttonQuiet} type="button" disabled={facts.faucetClaimed || working !== undefined || reviewing !== undefined} onClick={() => setReviewing("claim")}>
              {working === "claim" ? "Claiming demo cash" : facts.faucetClaimed ? "Demo cash already claimed" : `Claim ${facts.faucetAmount === undefined ? "demo cash" : `${formatUnits(facts.faucetAmount, facts.decimals)} ${facts.symbol}`}`}
            </button>
          ) : <Notice title="Demo faucet unavailable" tone="warning">No configured faucet was verified against this vault's cash token.</Notice>}
          <label className={styles.field}><span className={styles.fieldLabel}>Deposit amount in {facts.symbol}</span><input className={styles.input} value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} disabled={working !== undefined || reviewing !== undefined} /></label>
          <div className={styles.actions}>
            <button className={styles.buttonSecondary} type="button" disabled={!amountUnits || enoughAllowance || working !== undefined || reviewing !== undefined} onClick={() => setReviewing("approve")}>{working === "approve" ? "Approving" : enoughAllowance ? "Allowance confirmed" : "Review approval"}</button>
            <button className={styles.button} type="button" disabled={!amountUnits || !enoughAllowance || !enoughBalance || working !== undefined || reviewing !== undefined} onClick={() => setReviewing("deposit")}>{working === "deposit" ? "Depositing" : "Review deposit"} <UploadSimpleIcon size={16} /></button>
          </div>
          {!enoughBalance && amountUnits ? <p className={styles.errorText}>Wallet cash balance is below the entered amount.</p> : null}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.kicker}>Policy Registry</p><h2>Register and activate</h2><p>The canonical hash is committed with the contract-enforceable V1 subset.</p></div><LockKeyOpenIcon size={23} color="currentColor" /></div>
          {policy && registryArgs ? (
            <>
              <dl className={styles.definitionList}>
                <Fact label="Local policy" value={truncateIdentifier(policy.id)} />
                <Fact label="Canonical hash" value={truncateIdentifier(policy.policyHash, 14, 10)} />
                <Fact label="Latest onchain version" value={String(facts.latestPolicyVersion)} />
                <Fact label="Active local match" value={activeMatchesLocal ? "YES" : "NO"} />
              </dl>
              <Notice title="Enforceable subset" tone="warning">The V1 contract enforces asset, issuer, class, cash, freshness, slippage, and approval fields. Offchain liquidity and risk scores remain policy-engine checks, not vault claims.</Notice>
              <label className={styles.checkboxRow}><input className={styles.checkbox} type="checkbox" checked={approvedPolicy} onChange={(event) => setApprovedPolicy(event.target.checked)} disabled={working !== undefined || reviewing !== undefined} /> I reviewed the canonical hash and approve an onchain registration transaction for this vault.</label>
              <label className={styles.checkboxRow}><input className={styles.checkbox} type="checkbox" checked={approvedActivation} onChange={(event) => setApprovedActivation(event.target.checked)} disabled={versionToActivate === undefined || working !== undefined || reviewing !== undefined} /> I reviewed the version registered in this session and approve a separate activation transaction.</label>
              <div className={styles.actions}>
                <button className={styles.buttonSecondary} type="button" disabled={!approvedPolicy || working !== undefined || reviewing !== undefined || activeMatchesLocal} onClick={() => setReviewing("register")}>{working === "register" ? "Registering policy" : activeMatchesLocal ? "Policy already active" : "Review registration"}</button>
                <button className={styles.button} type="button" disabled={!approvedActivation || versionToActivate === undefined || versionToActivate < 1 || working !== undefined || reviewing !== undefined || activeMatchesLocal} onClick={() => setReviewing("activate")}>{working === "activate" ? "Activating policy" : versionToActivate === undefined ? "Register this policy first" : `Review version ${versionToActivate}`} <ArrowRightIcon size={16} /></button>
              </div>
            </>
          ) : <Notice title="No local policy selected" tone="warning">Compile a mandate in this browser before registering a policy for the vault. <Link href="/create">Create mandate</Link></Notice>}
        </article>
      </div>
      {reviewContent ? (
        <ConsequenceReview
          title={reviewContent.title}
          description={reviewContent.description}
          facts={reviewContent.facts}
          confirmLabel={reviewContent.confirmLabel}
          busyLabel="Waiting for wallet"
          busy={working !== undefined}
          onCancel={() => setReviewing(undefined)}
          onConfirm={submitReviewedAction}
        />
      ) : null}
      <TransactionFeedback phase={phase} hash={transactionHash} error={error} label={working ? `${working} transaction` : "Latest transaction"} />
      <Notice title="Strategy execution intentionally unavailable">The intelligence API does not yet return a token-amount execution plan or authorized EIP-712 strategy payload. ALIVE will not manufacture calldata or a signature from display weights.</Notice>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className={styles.definitionRow}><dt>{label}</dt><dd className={styles.hash}>{value}</dd></div>;
}

function TransactionFeedback({
  phase,
  hash,
  error,
  label,
}: {
  phase: TransactionPhase;
  hash: Hex | undefined;
  error: string | undefined;
  label: string;
}) {
  if (phase === "IDLE") return null;
  if (phase === "WAITING_WALLET") {
    return <OperationStatus title="Waiting for wallet authorization" detail={`${label}: review and confirm the transaction in your wallet.`} />;
  }
  if (phase === "CANCELLED") {
    return <OperationStatus title="Wallet authorization cancelled" detail={error ?? `${label} was not submitted.`} tone="warning" />;
  }
  if (phase === "FAILED") {
    return (
      <>
        <OperationStatus title="Transaction failed" detail={error ?? `${label} did not complete.`} tone="error" />
        {hash ? <TransactionLink hash={hash} label={`${label} transaction record`} confirmed={false} /> : null}
      </>
    );
  }
  if (phase === "CONFIRMATION_UNKNOWN") {
    return (
      <>
        <OperationStatus title="Confirmation unavailable" detail={error ?? `${label} was submitted, but its receipt could not be verified. Check the transaction before retrying.`} tone="warning" />
        {hash ? <TransactionLink hash={hash} label={`${label} submitted; confirmation unknown`} confirmed={false} /> : null}
      </>
    );
  }
  if (!hash) {
    return <OperationStatus title="Transaction status unavailable" detail="No transaction hash was returned." tone="error" />;
  }
  return (
    <>
      <TransactionLink
        hash={hash}
        label={phase === "CONFIRMED" ? `${label} confirmed onchain` : `${label} submitted; waiting for confirmation`}
        confirmed={phase === "CONFIRMED"}
      />
      {phase === "CONFIRMED" && error ? (
        <OperationStatus title="Confirmed, but the interface could not finish refreshing" detail={error} tone="warning" />
      ) : null}
    </>
  );
}

function TransactionLink({ hash, label, confirmed }: { hash: Hex; label: string; confirmed: boolean }) {
  const explorer = explorerTransactionUrl(hash);
  return (
    <Notice title={label} tone={confirmed ? "success" : "info"}>
      <span className={styles.hash}>{hash}</span>
      {explorer ? <a className={styles.textButton} href={explorer} target="_blank" rel="noreferrer">Open transaction</a> : null}
    </Notice>
  );
}
