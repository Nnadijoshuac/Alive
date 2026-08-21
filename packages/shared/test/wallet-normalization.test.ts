import { describe, it, expect } from "vitest";

function normalizeWalletAddress(address: string): string {
  if (!address || typeof address !== "string") {
    throw new Error("Invalid wallet address: must be a non-empty string");
  }
  const trimmed = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(trimmed)) {
    throw new Error(`Invalid EVM address format: ${address}`);
  }
  return trimmed;
}

describe("Wallet Address Normalization and Data Isolation Invariants", () => {
  it("normalizes mixed-case and uppercase checksum addresses to lowercase", () => {
    const rawUpper = "0xE2475653B6F8A846152A5508A8E1B1FAAE1A44E5";
    const rawMixed = "0xe2475653B6F8a846152A5508A8e1b1FAae1A44E5";
    const normalized = "0xe2475653b6f8a846152a5508a8e1b1faae1a44e5";

    expect(normalizeWalletAddress(rawUpper)).toBe(normalized);
    expect(normalizeWalletAddress(rawMixed)).toBe(normalized);
    expect(normalizeWalletAddress(normalized)).toBe(normalized);
  });

  it("trims surrounding whitespace from addresses", () => {
    const padded = "  0xe2475653b6f8a846152a5508a8e1b1faae1a44e5  ";
    expect(normalizeWalletAddress(padded)).toBe("0xe2475653b6f8a846152a5508a8e1b1faae1a44e5");
  });

  it("rejects non-hex or invalid length addresses", () => {
    expect(() => normalizeWalletAddress("")).toThrow();
    expect(() => normalizeWalletAddress("0x123")).toThrow();
    expect(() => normalizeWalletAddress("0xZZZ75653b6f8a846152a5508a8e1b1faae1a44e5")).toThrow();
    expect(() => normalizeWalletAddress("not-an-address")).toThrow();
  });

  it("ensures uppercase and lowercase addresses map to identical storage partition", () => {
    const wallet1 = "0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333";
    const wallet2 = "0xaaaabbbbccccddddeeeeffff0000111122223333";

    const storageMap = new Map<string, string>();
    storageMap.set(normalizeWalletAddress(wallet1), "active_agent_memory");

    expect(storageMap.get(normalizeWalletAddress(wallet2))).toBe("active_agent_memory");
  });

  it("strictly isolates distinct wallets from cross-contamination", () => {
    const walletA = normalizeWalletAddress("0x1111111111111111111111111111111111111111");
    const walletB = normalizeWalletAddress("0x2222222222222222222222222222222222222222");

    const walletSnapshots = new Map<string, { portfolioValue: number; strategy: string }>();
    walletSnapshots.set(walletA, { portfolioValue: 50_000, strategy: "RWA Core Balance" });
    walletSnapshots.set(walletB, { portfolioValue: 12_500, strategy: "High Yield T-Bills" });

    expect(walletSnapshots.get(walletA)?.portfolioValue).toBe(50_000);
    expect(walletSnapshots.get(walletB)?.portfolioValue).toBe(12_500);
    expect(walletSnapshots.get(walletA)?.strategy).not.toBe(walletSnapshots.get(walletB)?.strategy);
  });
});
