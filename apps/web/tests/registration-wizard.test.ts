import { describe, expect, it } from "vitest";
import { getRegistrationCommitState } from "../lib/registration-state";

const owner = `0x${"ab".repeat(20)}`;
const otherWallet = `0x${"cd".repeat(20)}`;

function state(
  overrides: Partial<Parameters<typeof getRegistrationCommitState>[0]> = {},
) {
  return getRegistrationCommitState({
    transactionHash: null,
    locallyAuthorized: false,
    registryConfigured: true,
    walletConnected: true,
    walletCorrectNetwork: true,
    walletAddress: owner,
    assetOwner: owner.toUpperCase(),
    ...overrides,
  });
}

describe("registration commit controls", () => {
  it("allows only the connected owner on the configured network", () => {
    expect(state()).toBe("ready");
    expect(state({ walletAddress: otherWallet })).toBe("owner-mismatch");
    expect(state({ walletCorrectNetwork: false })).toBe("wrong-network");
    expect(state({ walletConnected: false })).toBe("wallet-required");
    expect(state({ registryConfigured: false })).toBe("contracts-missing");
  });

  it("keeps local authorization explicitly offchain", () => {
    expect(state({ locallyAuthorized: true })).toBe("local-only");
  });

  it("blocks another submission once a transaction hash exists", () => {
    expect(state({ transactionHash: `0x${"ef".repeat(32)}` })).toBe(
      "submitted",
    );
  });
});
