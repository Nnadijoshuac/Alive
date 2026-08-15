"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Notice, styles } from "./ui";

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
  const [transactionHash, setTransactionHash] = useState<Hex>();
  const [error, setError] = useState<string>();

  async function createVault() {
    if (!rwaContractAddresses.vaultFactory || !publicClient || !wallet.connected || !wallet.correctNetwork) return;
    setWorking(true); setError(undefined); setTransactionHash(undefined);
    try {
      const hash = await writeContractAsync({
        address: rwaContractAddresses.vaultFactory,
        abi: rwaVaultFactoryAbi,
        functionName: "createVault",
        chainId: activeChain.id,
      });
      setTransactionHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Vault creation reverted onchain.");
      const logs = parseEventLogs({ abi: rwaVaultFactoryAbi, eventName: "VaultCreated", logs: receipt.logs });
      const vaultAddress = logs[0]?.args.vault;
      if (!vaultAddress) throw new Error("Vault creation confirmed, but VaultCreated could not be decoded.");
      rememberRwaState({ vaultAddress });
      router.push(`/vault/${vaultAddress}`);
    } catch (requestError) {
      setError(errorMessage(requestError, "Vault creation failed."));
    } finally { setWorking(false); }
  }

  if (!rwaContractAddresses.vaultFactory) {
    return <Notice title="Vault factory not configured" tone="warning">Set NEXT_PUBLIC_RWA_VAULT_FACTORY_ADDRESS to a reviewed deployment before this client can create a user-owned vault.</Notice>;
  }
  if (!wallet.connected || !wallet.correctNetwork) {
    return <Notice title="Wallet and network required" tone="warning">Connect the owner wallet on {activeChain.name}. The factory makes that caller the vault owner.</Notice>;
  }
  return (
    <div className={styles.stack}>
      <button className={styles.button} type="button" onClick={createVault} disabled={working}>
        <FactoryIcon size={17} /> {working ? "Creating vault" : "Create owner-controlled vault"}
      </button>
      {transactionHash ? <TransactionLink hash={transactionHash} label="Vault creation submitted" /> : null}
      {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
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
  const [registeredVersion, setRegisteredVersion] = useState<number>();
  const [working, setWorking] = useState<"claim" | "approve" | "deposit" | "register" | "activate">();
  const [transactionHash, setTransactionHash] = useState<Hex>();
  const [error, setError] = useState<string>();

  const ownerWallet = Boolean(wallet.address && vault.owner && wallet.address.toLowerCase() === vault.owner.toLowerCase());

  const load = useCallback(async () => {
    if (!publicClient || !wallet.address || !vault.cashToken || !vault.policyRegistry) return;
    const state = readRwaState();
    if (state.policyId) {
      try { setPolicy(await getRwaPolicy(state.policyId)); }
      catch { setPolicy(undefined); }
    } else setPolicy(undefined);
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
      setError(errorMessage(requestError, "Vault funding facts could not be read."));
    }
  }, [publicClient, vault.address, vault.cashToken, vault.policyRegistry, wallet.address]);

  useEffect(() => void load(), [load]);

  const amountUnits = useMemo(() => {
    try { return facts ? parseUnits(amount, facts.decimals) : undefined; }
    catch { return undefined; }
  }, [amount, facts]);

  async function confirm(kind: NonNullable<typeof working>, submit: () => Promise<Hex>) {
    if (!publicClient) return;
    setWorking(kind); setError(undefined); setTransactionHash(undefined);
    try {
      const hash = await submit();
      setTransactionHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${kind} transaction reverted onchain.`);
      if (kind === "register") {
        const logs = parseEventLogs({ abi: rwaPolicyRegistryAbi, eventName: "PolicyRegistered", logs: receipt.logs });
        const version = logs[0]?.args.version;
        if (version !== undefined) setRegisteredVersion(version);
      }
      await load();
      await onRefresh();
    } catch (requestError) {
      setError(errorMessage(requestError, `${kind} transaction failed.`));
    } finally { setWorking(undefined); }
  }

  if (!wallet.connected || !wallet.correctNetwork) {
    return <Notice title="Wallet and network required" tone="warning">Connect the owner wallet on {activeChain.name} to claim demo cash, approve, deposit, or register policy.</Notice>;
  }
  if (!ownerWallet) {
    return <Notice title="Connected wallet is not the vault owner" tone="warning">Owner-only policy activation is intentionally unavailable. Connect {vault.owner ? truncateIdentifier(vault.owner, 12, 10) : "the onchain owner"}.</Notice>;
  }
  if (!facts || !vault.cashToken || !vault.policyRegistry) {
    return <Notice title="Reading transaction prerequisites">Token decimals, balances, allowance, and registry version must resolve before an action is enabled.</Notice>;
  }

  const enoughAllowance = amountUnits !== undefined && facts.allowance >= amountUnits;
  const enoughBalance = amountUnits !== undefined && facts.balance >= amountUnits;
  const registryArgs = policy ? policyRegistryArguments(policy.policyHash, policy.policy) : undefined;
  const versionToActivate = registeredVersion ?? facts.latestPolicyVersion;
  const activeMatchesLocal = Boolean(policy && vault.activePolicyHash?.toLowerCase() === policy.policyHash.toLowerCase());

  return (
    <div className={styles.stack}>
      <div className={styles.grid2}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.kicker}>Demo cash rail</p><h2>Claim, approve, deposit</h2><p>Each confirmed action is a separate wallet transaction.</p></div><CoinsIcon size={23} color="#6de493" /></div>
          <dl className={styles.definitionList}>
            <Fact label="Wallet balance" value={`${formatUnits(facts.balance, facts.decimals)} ${facts.symbol}`} />
            <Fact label="Vault cash balance" value={`${formatUnits(facts.vaultBalance, facts.decimals)} ${facts.symbol}`} />
            <Fact label="Vault allowance" value={`${formatUnits(facts.allowance, facts.decimals)} ${facts.symbol}`} />
          </dl>
          {rwaContractAddresses.faucet && facts.faucetMatchesCash ? (
            <button className={styles.buttonQuiet} type="button" disabled={facts.faucetClaimed || working !== undefined} onClick={() => confirm("claim", () => writeContractAsync({ address: rwaContractAddresses.faucet!, abi: demoRwaFaucetAbi, functionName: "claim", chainId: activeChain.id }))}>
              {working === "claim" ? "Claiming demo cash" : facts.faucetClaimed ? "Demo cash already claimed" : `Claim ${facts.faucetAmount === undefined ? "demo cash" : `${formatUnits(facts.faucetAmount, facts.decimals)} ${facts.symbol}`}`}
            </button>
          ) : <Notice title="Demo faucet unavailable" tone="warning">No configured faucet was verified against this vault's cash token.</Notice>}
          <label className={styles.field}><span className={styles.fieldLabel}>Deposit amount in {facts.symbol}</span><input className={styles.input} value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} /></label>
          <div className={styles.actions}>
            <button className={styles.buttonSecondary} type="button" disabled={!amountUnits || working !== undefined} onClick={() => confirm("approve", () => writeContractAsync({ address: vault.cashToken!, abi: rwaCashTokenAbi, functionName: "approve", chainId: activeChain.id, args: [vault.address, amountUnits!] }))}>{working === "approve" ? "Approving" : enoughAllowance ? "Allowance confirmed" : "Approve vault"}</button>
            <button className={styles.button} type="button" disabled={!amountUnits || !enoughAllowance || !enoughBalance || working !== undefined} onClick={() => confirm("deposit", () => writeContractAsync({ address: vault.address, abi: rwaVaultAbi, functionName: "depositCash", chainId: activeChain.id, args: [amountUnits!] }))}>{working === "deposit" ? "Depositing" : "Deposit cash"} <UploadSimpleIcon size={16} /></button>
          </div>
          {!enoughBalance && amountUnits ? <p className={styles.errorText}>Wallet cash balance is below the entered amount.</p> : null}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.kicker}>Policy Registry</p><h2>Register and activate</h2><p>The canonical hash is committed with the contract-enforceable V1 subset.</p></div><LockKeyOpenIcon size={23} color="#6de493" /></div>
          {policy && registryArgs ? (
            <>
              <dl className={styles.definitionList}>
                <Fact label="Local policy" value={truncateIdentifier(policy.id)} />
                <Fact label="Canonical hash" value={truncateIdentifier(policy.policyHash, 14, 10)} />
                <Fact label="Latest onchain version" value={String(facts.latestPolicyVersion)} />
                <Fact label="Active local match" value={activeMatchesLocal ? "YES" : "NO"} />
              </dl>
              <Notice title="Enforceable subset" tone="warning">The V1 contract enforces asset, issuer, class, cash, freshness, slippage, and approval fields. Offchain liquidity and risk scores remain policy-engine checks, not vault claims.</Notice>
              <label className={styles.checkboxRow}><input className={styles.checkbox} type="checkbox" checked={approvedPolicy} onChange={(event) => setApprovedPolicy(event.target.checked)} /> I reviewed the canonical hash and approve an onchain registration transaction for this vault.</label>
              <div className={styles.actions}>
                <button className={styles.buttonSecondary} type="button" disabled={!approvedPolicy || working !== undefined || activeMatchesLocal} onClick={() => confirm("register", () => writeContractAsync({ address: vault.policyRegistry!, abi: rwaPolicyRegistryAbi, functionName: "registerPolicy", chainId: activeChain.id, args: [vault.address, registryArgs.input, registryArgs.classLimits, registryArgs.allowedAssets, registryArgs.blockedAssets] }))}>{working === "register" ? "Registering policy" : activeMatchesLocal ? "Policy already active" : "Register policy"}</button>
                <button className={styles.button} type="button" disabled={!approvedPolicy || versionToActivate < 1 || working !== undefined || activeMatchesLocal} onClick={() => confirm("activate", () => writeContractAsync({ address: vault.address, abi: rwaVaultAbi, functionName: "activatePolicy", chainId: activeChain.id, args: [versionToActivate] }))}>{working === "activate" ? "Activating policy" : `Activate version ${versionToActivate}`} <ArrowRightIcon size={16} /></button>
              </div>
            </>
          ) : <Notice title="No local policy selected" tone="warning">Compile a mandate in this browser before registering a policy for the vault. <Link href="/create">Create mandate</Link></Notice>}
        </article>
      </div>
      {transactionHash ? <TransactionLink hash={transactionHash} label={`${working ?? "Latest"} transaction submitted`} /> : null}
      {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
      <Notice title="Strategy execution intentionally unavailable">The intelligence API does not yet return a token-amount execution plan or authorized EIP-712 strategy payload. ALIVE will not manufacture calldata or a signature from display weights.</Notice>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className={styles.definitionRow}><dt>{label}</dt><dd className={styles.hash}>{value}</dd></div>;
}

function TransactionLink({ hash, label }: { hash: Hex; label: string }) {
  const explorer = explorerTransactionUrl(hash);
  return (
    <Notice title={label} tone="success">
      <span className={styles.hash}>{hash}</span>
      {explorer ? <a className={styles.textButton} href={explorer} target="_blank" rel="noreferrer">Open transaction</a> : null}
    </Notice>
  );
}
