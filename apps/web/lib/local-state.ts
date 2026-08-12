import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type {
  Address,
  AssetRecord,
  Hex,
  SignedAttestation,
  VerificationResult,
} from "./types";

const ASSET_KEY = "alive.local.assets";
const VERIFICATION_KEY = "alive.local.verifications";
const ESCROW_KEY = "alive.local.escrows";

export interface LocalAssetEntry {
  asset: AssetRecord;
  transactionHash?: Hex;
}

export interface LocalVerificationEntry {
  result: VerificationResult;
  signedAttestation?: SignedAttestation;
}

export interface LocalEscrowEntry {
  escrowId: Hex;
  assetId: Hex;
  transactionHash: Hex;
  createdAt: string;
}

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(
      window.localStorage.getItem(key) ?? "[]",
    ) as unknown;
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function localAssets(): LocalAssetEntry[] {
  return readArray<LocalAssetEntry>(ASSET_KEY);
}

function storableAssetEntry(entry: LocalAssetEntry): LocalAssetEntry {
  return {
    asset: entry.asset,
    ...(entry.transactionHash === undefined
      ? {}
      : { transactionHash: entry.transactionHash }),
  };
}

export function rememberAsset(entry: LocalAssetEntry): void {
  const current = localAssets()
    .filter((item) => item.asset.assetId !== entry.asset.assetId)
    .map(storableAssetEntry);
  window.localStorage.setItem(
    ASSET_KEY,
    JSON.stringify([storableAssetEntry(entry), ...current]),
  );
}

export function localVerifications(): LocalVerificationEntry[] {
  return readArray<LocalVerificationEntry>(VERIFICATION_KEY);
}

export function rememberVerification(entry: LocalVerificationEntry): void {
  const current = localVerifications().filter(
    (item) => item.result.sessionId !== entry.result.sessionId,
  );
  window.localStorage.setItem(
    VERIFICATION_KEY,
    JSON.stringify([entry, ...current]),
  );
}

export function localEscrows(): LocalEscrowEntry[] {
  return readArray<LocalEscrowEntry>(ESCROW_KEY);
}

export function rememberEscrow(entry: LocalEscrowEntry): void {
  const current = localEscrows().filter(
    (item) => item.escrowId !== entry.escrowId,
  );
  window.localStorage.setItem(ESCROW_KEY, JSON.stringify([entry, ...current]));
}

export function clearPresentationState(): void {
  window.localStorage.removeItem(ASSET_KEY);
  window.localStorage.removeItem(VERIFICATION_KEY);
  window.localStorage.removeItem(ESCROW_KEY);
}

export function localSubjectAccount(): ReturnType<typeof privateKeyToAccount> {
  if (typeof window === "undefined")
    throw new Error("Local signer is available only in the browser.");
  const key = "alive.local.signing-key";
  const existing = window.sessionStorage.getItem(key);
  const privateKey = existing?.match(/^0x[0-9a-fA-F]{64}$/)
    ? (existing as Hex)
    : (() => {
        const value = generatePrivateKey();
        window.sessionStorage.setItem(key, value);
        return value;
      })();
  return privateKeyToAccount(privateKey);
}

export function localSubjectAddress(): Address {
  return localSubjectAccount().address;
}
