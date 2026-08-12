import type { Address, AssetRecord, Hex, SignedAttestation, VerificationResult } from "./types";

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
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function localAssets(): LocalAssetEntry[] {
  return readArray<LocalAssetEntry>(ASSET_KEY);
}

export function rememberAsset(entry: LocalAssetEntry): void {
  const current = localAssets().filter((item) => item.asset.assetId !== entry.asset.assetId);
  window.localStorage.setItem(ASSET_KEY, JSON.stringify([entry, ...current]));
}

export function localVerifications(): LocalVerificationEntry[] {
  return readArray<LocalVerificationEntry>(VERIFICATION_KEY);
}

export function rememberVerification(entry: LocalVerificationEntry): void {
  const current = localVerifications().filter((item) => item.result.sessionId !== entry.result.sessionId);
  window.localStorage.setItem(VERIFICATION_KEY, JSON.stringify([entry, ...current]));
}

export function localEscrows(): LocalEscrowEntry[] {
  return readArray<LocalEscrowEntry>(ESCROW_KEY);
}

export function rememberEscrow(entry: LocalEscrowEntry): void {
  const current = localEscrows().filter((item) => item.escrowId !== entry.escrowId);
  window.localStorage.setItem(ESCROW_KEY, JSON.stringify([entry, ...current]));
}

export function clearPresentationState(): void {
  window.localStorage.removeItem(ASSET_KEY);
  window.localStorage.removeItem(VERIFICATION_KEY);
  window.localStorage.removeItem(ESCROW_KEY);
}

export function localSubjectAddress(): Address {
  if (typeof window === "undefined") return `0x${"0".repeat(40)}`;
  const key = "alive.local.subject";
  const existing = window.sessionStorage.getItem(key);
  if (existing?.match(/^0x[0-9a-fA-F]{40}$/)) return existing as Address;
  const bytes = new Uint8Array(20);
  window.crypto.getRandomValues(bytes);
  const value = `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as Address;
  window.sessionStorage.setItem(key, value);
  return value;
}
