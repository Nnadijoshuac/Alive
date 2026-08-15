"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  LockKeyIcon,
  ShieldWarningIcon,
  VaultIcon,
} from "@phosphor-icons/react";
import { WalletButton } from "@/components/wallet-shell";
import { readRwaVault, type RwaVaultRead } from "@/lib/rwa-chain";
import { rememberRwaState } from "@/lib/rwa-state";
import { truncateIdentifier } from "@/lib/rwa-format";
import { ErrorState, LoadingState, Notice, PageIntro, styles } from "./ui";

const zeroAddress = `0x${"0".repeat(40)}`;
const zeroHash = `0x${"0".repeat(64)}`;

export function VaultWorkspace({ vaultAddress }: { vaultAddress: string }) {
  const [vault, setVault] = useState<RwaVaultRead>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await readRwaVault(vaultAddress);
      setVault(result);
      rememberRwaState({ vaultAddress: result.address });
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, [vaultAddress]);

  useEffect(() => void load(), [load]);

  return (
    <div className={styles.page}>
      <Link className={styles.textButton} href="/dashboard"><ArrowLeftIcon size={15} /> Dashboard</Link>
      <PageIntro
        eyebrow="Onchain vault reader"
        title="Contract facts, or a clear absence of them."
        description="ALIVE reads public bytecode and the expected vault interface from the configured chain. Failed reads remain failed reads. They do not become demo balances or pretend transaction history."
        aside={<WalletButton compact />}
      />
      {loading ? <section className={styles.section}><LoadingState label="Reading vault from the configured chain" /></section> : null}
      {error ? <section className={styles.section}><ErrorState error={error} retry={load} /></section> : null}

      {vault && !loading ? (
        <>
          <section className={styles.section}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><p className={styles.kicker}>Address</p><h2>{truncateIdentifier(vault.address, 14, 12)}</h2><p>{vault.chainName} / chain {vault.chainId}</p></div>
                <span className={`${styles.status} ${vault.interfaceReadable ? styles.success : styles.warning}`}>{vault.interfaceReadable ? "ALIVE interface read" : vault.bytecodePresent ? "Unknown contract" : "No bytecode"}</span>
              </div>
              <p className={styles.hash}>{vault.address}</p>
              {vault.explorerUrl ? <a className={styles.textButton} href={vault.explorerUrl} target="_blank" rel="noreferrer">Open block explorer <ArrowSquareOutIcon size={14} /></a> : null}
            </div>
          </section>

          {!vault.bytecodePresent ? (
            <section className={styles.section}>
              <div className={styles.empty}>
                <div className={styles.emptyInner}><span className={styles.emptyIcon}><ShieldWarningIcon size={26} /></span><h2>No contract bytecode at this address</h2><p>The configured RPC returned an empty account on {vault.chainName}. ALIVE has no vault state to display.</p><Link className={styles.button} href="/protocol">Inspect deployment configuration</Link></div>
              </div>
            </section>
          ) : !vault.interfaceReadable ? (
            <section className={styles.section}><Notice title="Not a readable ALIVE vault" tone="warning">Contract bytecode exists, but the expected owner, policy, executor, and cash-asset views could not all be read. No ALIVE vault claim is made.</Notice></section>
          ) : (
            <>
              <section className={styles.section} aria-labelledby="vault-facts-title">
                <div className={styles.sectionHeader}><div><p className={styles.kicker}>Onchain facts</p><h2 id="vault-facts-title">Vault control plane</h2></div><VaultIcon size={27} color="#6de493" /></div>
                <div className={styles.grid2}>
                  <article className={styles.panel}>
                    <div className={styles.panelHeader}><div><p className={styles.kicker}>Ownership</p><h2>User-controlled exit</h2></div><LockKeyIcon size={23} color="#6de493" /></div>
                    <dl className={styles.definitionList}>
                      <Fact label="Owner" value={vault.owner ?? "READ FAILED"} />
                      <Fact label="Guarded executor" value={vault.guardedExecutor === zeroAddress ? "NOT SET" : vault.guardedExecutor ?? "READ FAILED"} />
                      <Fact label="Cash token" value={vault.cashToken ?? "READ FAILED"} />
                      <Fact label="Cash asset ID" value={vault.cashAssetId ?? "READ FAILED"} />
                    </dl>
                  </article>
                  <article className={styles.panel}>
                    <div className={styles.panelHeader}><div><p className={styles.kicker}>Active policy</p><h2>{vault.activePolicyVersion ? `Version ${vault.activePolicyVersion}` : "No active version"}</h2></div></div>
                    <dl className={styles.definitionList}>
                      <Fact label="Version" value={String(vault.activePolicyVersion ?? "READ FAILED")} />
                      <Fact label="Policy hash" value={vault.activePolicyHash === zeroHash ? "NOT ACTIVE" : vault.activePolicyHash ?? "READ FAILED"} />
                      <Fact label="Source" value="PUBLIC RPC READ" />
                    </dl>
                  </article>
                </div>
              </section>
              <section className={styles.section}>
                <Notice title="Balances and execution history not indexed" tone="warning">This reader confirms the vault control interface only. The current app has no trusted holdings indexer or execution feed, so it does not estimate portfolio value or invent past trades.</Notice>
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return <div className={styles.definitionRow}><dt>{label}</dt><dd className={styles.hash}>{value}</dd></div>;
}

