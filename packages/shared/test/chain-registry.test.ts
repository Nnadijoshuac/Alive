import { describe, expect, it } from "vitest";

import {
  CHAIN_REGISTRY,
  X_LAYER_MAINNET_CHAIN_ID,
  X_LAYER_TESTNET_CHAIN_ID,
  chainById,
  publiclySelectableChains,
} from "../src/chain-registry.js";

describe("chain registry -- X Layer mandate invariants", () => {
  it("X Layer Mainnet is always present in the public registry, independent of any catalog result count", () => {
    const chains = publiclySelectableChains();
    expect(chains.some((c) => c.chainName === "X Layer" && c.chainId === X_LAYER_MAINNET_CHAIN_ID)).toBe(
      true,
    );
  });

  it("X Layer Mainnet and Testnet chain IDs are the correct, distinct, well-known values", () => {
    expect(X_LAYER_MAINNET_CHAIN_ID).toBe(196);
    expect(X_LAYER_TESTNET_CHAIN_ID).toBe(1_952);
    expect(X_LAYER_MAINNET_CHAIN_ID).not.toBe(X_LAYER_TESTNET_CHAIN_ID);
  });

  it("X Layer Testnet (the Attack Lab harness chain) is excluded from public discovery by construction", () => {
    const chains = publiclySelectableChains();
    expect(chains.some((c) => c.chainId === X_LAYER_TESTNET_CHAIN_ID)).toBe(false);
    // It still exists in the full registry -- just not in the public-facing list.
    expect(chainById(X_LAYER_TESTNET_CHAIN_ID)?.networkType).toBe("TESTNET");
  });

  it("chainById never confuses X Layer Mainnet and Testnet with each other", () => {
    expect(chainById(196)?.chainName).toBe("X Layer");
    expect(chainById(196)?.networkType).toBe("MAINNET");
    expect(chainById(1_952)?.chainName).toBe("X Layer Testnet");
    expect(chainById(1_952)?.networkType).toBe("TESTNET");
  });

  it("every registry entry has a unique chainId", () => {
    const ids = CHAIN_REGISTRY.map((c) => c.chainId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
