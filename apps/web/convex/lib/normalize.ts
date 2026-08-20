/**
 * Normalizes an EVM wallet address to canonical lowercase format.
 * Throws an error if the address is not a valid 42-character 0x-prefixed hex string.
 */
export function normalizeWalletAddress(address: string): string {
  if (!address || typeof address !== "string") {
    throw new Error("Invalid wallet address: must be a non-empty string");
  }
  const trimmed = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(trimmed)) {
    throw new Error(`Invalid EVM address format: ${address}`);
  }
  return trimmed;
}
