import {
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";
import { z } from "zod";
import { AddressSchema, Bytes32Schema, SignatureSchema } from "./schemas.js";

export const StrategyProposalSchema = z
  .object({
    vault: AddressSchema,
    policyHash: Bytes32Schema,
    portfolioBeforeHash: Bytes32Schema,
    portfolioAfterHash: Bytes32Schema,
    marketSnapshotHash: Bytes32Schema,
    executionPlanHash: Bytes32Schema,
    strategyNonce: Bytes32Schema,
    marketTimestamp: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    issuedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    expiresAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine((strategy) => strategy.expiresAt > strategy.issuedAt, {
    message: "Strategy expiry must be after issue time",
    path: ["expiresAt"],
  })
  .refine((strategy) => strategy.expiresAt - strategy.issuedAt <= 86_400, {
    message: "Strategy lifetime cannot exceed 86400 seconds",
    path: ["expiresAt"],
  })
  .refine((strategy) => strategy.marketTimestamp <= strategy.issuedAt, {
    message: "Market timestamp cannot be after strategy issue time",
    path: ["marketTimestamp"],
  })
  .refine(
    (strategy) => strategy.portfolioBeforeHash !== strategy.portfolioAfterHash,
    {
      message: "Strategy must commit to a portfolio state change",
      path: ["portfolioAfterHash"],
    },
  )
  .refine(
    (strategy) =>
      [
        strategy.policyHash,
        strategy.portfolioBeforeHash,
        strategy.portfolioAfterHash,
        strategy.marketSnapshotHash,
        strategy.executionPlanHash,
        strategy.strategyNonce,
      ].every((value) => value !== `0x${"00".repeat(32)}`),
    {
      message: "Strategy commitments and nonce cannot be zero bytes32",
      path: ["strategyNonce"],
    },
  );

export const StrategyDomainSchema = z
  .object({
    chainId: z.number().int().positive(),
    verifyingContract: AddressSchema,
  })
  .strict();

export const SignedStrategyProposalSchema = z
  .object({
    proposal: StrategyProposalSchema,
    domain: StrategyDomainSchema,
    signature: SignatureSchema,
    digest: Bytes32Schema,
    signer: AddressSchema,
  })
  .strict();

export type StrategyProposal = z.infer<typeof StrategyProposalSchema>;
export type StrategyDomain = z.infer<typeof StrategyDomainSchema>;
export type SignedStrategyProposal = z.infer<
  typeof SignedStrategyProposalSchema
>;

export const ALIVE_STRATEGY_DOMAIN_NAME = "ALIVE RWA Strategy";
export const ALIVE_STRATEGY_DOMAIN_VERSION = "1";
export const ALIVE_STRATEGY_PRIMARY_TYPE = "Strategy";
export const ALIVE_STRATEGY_TYPE_STRING =
  "Strategy(address vault,bytes32 policyHash,bytes32 portfolioBeforeHash,bytes32 portfolioAfterHash,bytes32 marketSnapshotHash,bytes32 executionPlanHash,bytes32 strategyNonce,uint64 marketTimestamp,uint64 issuedAt,uint64 expiresAt)";

export const aliveStrategyTypes = {
  Strategy: [
    { name: "vault", type: "address" },
    { name: "policyHash", type: "bytes32" },
    { name: "portfolioBeforeHash", type: "bytes32" },
    { name: "portfolioAfterHash", type: "bytes32" },
    { name: "marketSnapshotHash", type: "bytes32" },
    { name: "executionPlanHash", type: "bytes32" },
    { name: "strategyNonce", type: "bytes32" },
    { name: "marketTimestamp", type: "uint64" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

export function getAliveStrategyDomain(input: StrategyDomain): TypedDataDomain {
  const domain = StrategyDomainSchema.parse(input);
  return {
    name: ALIVE_STRATEGY_DOMAIN_NAME,
    version: ALIVE_STRATEGY_DOMAIN_VERSION,
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract as Address,
  };
}

export function getAliveStrategyTypedData(
  proposalInput: StrategyProposal,
  domainInput: StrategyDomain,
) {
  const proposal = StrategyProposalSchema.parse(proposalInput);
  return {
    domain: getAliveStrategyDomain(domainInput),
    types: aliveStrategyTypes,
    primaryType: ALIVE_STRATEGY_PRIMARY_TYPE,
    message: {
      vault: proposal.vault as Address,
      policyHash: proposal.policyHash as Hex,
      portfolioBeforeHash: proposal.portfolioBeforeHash as Hex,
      portfolioAfterHash: proposal.portfolioAfterHash as Hex,
      marketSnapshotHash: proposal.marketSnapshotHash as Hex,
      executionPlanHash: proposal.executionPlanHash as Hex,
      strategyNonce: proposal.strategyNonce as Hex,
      marketTimestamp: BigInt(proposal.marketTimestamp),
      issuedAt: BigInt(proposal.issuedAt),
      expiresAt: BigInt(proposal.expiresAt),
    },
  } as const;
}

export function hashAliveStrategy(
  proposal: StrategyProposal,
  domain: StrategyDomain,
): Hex {
  return hashTypedData(getAliveStrategyTypedData(proposal, domain));
}

export async function recoverAliveStrategySigner(
  proposal: StrategyProposal,
  domain: StrategyDomain,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    ...getAliveStrategyTypedData(proposal, domain),
    signature,
  });
}
