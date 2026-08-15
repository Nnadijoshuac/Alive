import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  ALIVE_STRATEGY_DOMAIN_NAME,
  ALIVE_STRATEGY_PRIMARY_TYPE,
  ALIVE_STRATEGY_TYPE_STRING,
  StrategyProposalSchema,
  getAliveStrategyTypedData,
  hashAliveStrategy,
  recoverAliveStrategySigner,
  type StrategyDomain,
  type StrategyProposal,
} from "../src/index.js";

const proposal: StrategyProposal = {
  vault: `0x${"12".repeat(20)}`,
  policyHash: `0x${"01".repeat(32)}`,
  portfolioBeforeHash: `0x${"02".repeat(32)}`,
  portfolioAfterHash: `0x${"03".repeat(32)}`,
  marketSnapshotHash: `0x${"04".repeat(32)}`,
  executionPlanHash: `0x${"05".repeat(32)}`,
  strategyNonce: `0x${"06".repeat(32)}`,
  marketTimestamp: 1_699_999_990,
  issuedAt: 1_700_000_000,
  expiresAt: 1_700_000_300,
};

const domain: StrategyDomain = {
  chainId: 1_952,
  verifyingContract: `0x${"34".repeat(20)}`,
};

describe("strategy proposals", () => {
  it("requires expiring, strict, policy-bound proposals", () => {
    expect(
      StrategyProposalSchema.safeParse({
        ...proposal,
        expiresAt: proposal.issuedAt,
      }).success,
    ).toBe(false);
    expect(
      StrategyProposalSchema.safeParse({ ...proposal, arbitraryCalldata: "0x" })
        .success,
    ).toBe(false);
    expect(
      StrategyProposalSchema.safeParse({
        ...proposal,
        marketTimestamp: proposal.issuedAt + 1,
      }).success,
    ).toBe(false);
    expect(
      StrategyProposalSchema.safeParse({
        ...proposal,
        expiresAt: proposal.issuedAt + 86_401,
      }).success,
    ).toBe(false);
  });

  it("recovers the signer and binds every strategy context hash", async () => {
    const account = privateKeyToAccount(`0x${"42".repeat(32)}`);
    const signature = await account.signTypedData(
      getAliveStrategyTypedData(proposal, domain),
    );
    expect(ALIVE_STRATEGY_DOMAIN_NAME).toBe("ALIVE RWA Strategy");
    expect(ALIVE_STRATEGY_PRIMARY_TYPE).toBe("Strategy");
    expect(ALIVE_STRATEGY_TYPE_STRING).toBe(
      "Strategy(address vault,bytes32 policyHash,bytes32 portfolioBeforeHash,bytes32 portfolioAfterHash,bytes32 marketSnapshotHash,bytes32 executionPlanHash,bytes32 strategyNonce,uint64 marketTimestamp,uint64 issuedAt,uint64 expiresAt)",
    );
    await expect(
      recoverAliveStrategySigner(proposal, domain, signature),
    ).resolves.toBe(account.address);
    expect(hashAliveStrategy(proposal, domain)).not.toBe(
      hashAliveStrategy(
        { ...proposal, policyHash: `0x${"ff".repeat(32)}` },
        domain,
      ),
    );
    expect(hashAliveStrategy(proposal, domain)).not.toBe(
      hashAliveStrategy(
        { ...proposal, strategyNonce: `0x${"ee".repeat(32)}` },
        domain,
      ),
    );
  });
});
