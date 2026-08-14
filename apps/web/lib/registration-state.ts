import type { Hex } from "./types";

export type RegistrationCommitState =
  | "submitted"
  | "local-only"
  | "contracts-missing"
  | "wallet-required"
  | "wrong-network"
  | "owner-mismatch"
  | "ready";

export function getRegistrationCommitState({
  transactionHash,
  locallyAuthorized,
  registryConfigured,
  walletConnected,
  walletCorrectNetwork,
  walletAddress,
  assetOwner,
}: {
  transactionHash: Hex | null;
  locallyAuthorized: boolean;
  registryConfigured: boolean;
  walletConnected: boolean;
  walletCorrectNetwork: boolean;
  walletAddress?: string;
  assetOwner?: string;
}): RegistrationCommitState {
  if (transactionHash) return "submitted";
  if (locallyAuthorized) return "local-only";
  if (!registryConfigured) return "contracts-missing";
  if (!walletConnected || !walletAddress) return "wallet-required";
  if (!walletCorrectNetwork) return "wrong-network";
  if (!assetOwner || walletAddress.toLowerCase() !== assetOwner.toLowerCase()) {
    return "owner-mismatch";
  }
  return "ready";
}
