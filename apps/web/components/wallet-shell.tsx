"use client";

import { useMemo, useState } from "react";
import { WalletIcon, PlugsConnectedIcon, WarningIcon } from "@phosphor-icons/react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import { authorizationTypedData, type AuthorizationSigner } from "@/lib/authorization";
import { activeChain } from "@/lib/chain";
import { truncateHash } from "@/lib/format";
import { Button, InlineNotice } from "./ui";

export interface WalletSnapshot {
  address?: `0x${string}`;
  connected: boolean;
  correctNetwork: boolean;
}

export function useWalletSnapshot(): WalletSnapshot {
  const account = useAccount();
  return useMemo(
    () => ({
      ...(account.address ? { address: account.address } : {}),
      connected: account.isConnected,
      correctNetwork: account.chainId === activeChain.id,
    }),
    [account.address, account.chainId, account.isConnected],
  );
}

export function useWalletAuthorizationSigner(): AuthorizationSigner | undefined {
  const account = useAccount();
  const { data: walletClient } = useWalletClient();
  return useMemo(() => {
    if (!account.address || !walletClient) return undefined;
    return {
      address: account.address,
      sign: async (authorization, domain) => walletClient.signTypedData({
        account: account.address,
        ...authorizationTypedData(authorization, domain),
      }),
    };
  }, [account.address, walletClient]);
}

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { address, isConnected, chainId, status } = useAccount();
  const { connectors, connect, error: connectError, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const [expanded, setExpanded] = useState(false);
  const connector = connectors[0];
  const wrongNetwork = isConnected && chainId !== activeChain.id;

  if (!isConnected) {
    return (
      <div className="wallet-control">
        <Button
          className="button-secondary"
          disabled={!connector || isConnecting}
          onClick={() => connector && connect({ connector })}
        >
          <WalletIcon size={18} weight="bold" />
          {isConnecting ? "Opening wallet" : compact ? "Connect" : "Connect wallet"}
        </Button>
        {connectError ? <span className="wallet-error">{connectError.message.includes("rejected") ? "Connection rejected." : connectError.message}</span> : null}
      </div>
    );
  }

  if (wrongNetwork) {
    return (
      <div className="wallet-control">
        <Button className="button-warning" disabled={isSwitching} onClick={() => switchChain({ chainId: activeChain.id })}>
          <WarningIcon size={18} weight="bold" />
          {isSwitching ? "Switching" : `Switch to ${activeChain.name}`}
        </Button>
        {switchError ? <span className="wallet-error">Network switch was not completed.</span> : null}
      </div>
    );
  }

  return (
    <div className="wallet-menu">
      <button className="wallet-address" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <PlugsConnectedIcon size={17} weight="bold" />
        {status === "reconnecting" ? "Reconnecting" : truncateHash(address ?? "")}
      </button>
      {expanded ? (
        <div className="wallet-popover">
          <span>Connected to {activeChain.name}</span>
          <button type="button" onClick={() => disconnect()}>Disconnect</button>
        </div>
      ) : null}
    </div>
  );
}

export function WalletRequirement() {
  const wallet = useWalletSnapshot();
  if (!wallet.connected) {
    return <InlineNotice tone="warning" title="Wallet required">Connect an injected EVM wallet to bind this operation to its owner.</InlineNotice>;
  }
  if (!wallet.correctNetwork) {
    return <InlineNotice tone="warning" title="Wrong network">Switch to {activeChain.name} before an onchain transaction.</InlineNotice>;
  }
  return <InlineNotice tone="success" title="Wallet ready">{wallet.address ? truncateHash(wallet.address, 12, 8) : "Connected"}</InlineNotice>;
}
