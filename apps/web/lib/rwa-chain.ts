import { createPublicClient, http, isAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import type { PortfolioPolicy } from "@alive/shared";
import { activeChain, explorerAddressUrl } from "./chain";

function address(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? value : undefined;
}

export const rwaContractAddresses = {
  assetRegistry: address(process.env.NEXT_PUBLIC_RWA_ASSET_REGISTRY_ADDRESS),
  eligibilityRegistry: address(
    process.env.NEXT_PUBLIC_ELIGIBILITY_REGISTRY_ADDRESS,
  ),
  policyRegistry: address(process.env.NEXT_PUBLIC_POLICY_REGISTRY_ADDRESS),
  strategyVerifier: address(process.env.NEXT_PUBLIC_STRATEGY_VERIFIER_ADDRESS),
  vaultFactory: address(process.env.NEXT_PUBLIC_RWA_VAULT_FACTORY_ADDRESS),
  vault: address(process.env.NEXT_PUBLIC_RWA_VAULT_ADDRESS),
  executionRouter: address(process.env.NEXT_PUBLIC_RWA_ROUTER_ADDRESS),
  cashToken: address(process.env.NEXT_PUBLIC_RWA_CASH_TOKEN_ADDRESS),
  faucet: address(process.env.NEXT_PUBLIC_RWA_FAUCET_ADDRESS),
  demoAssetToken: address(
    process.env.NEXT_PUBLIC_DEMO_ASSET_TOKEN_ADDRESS,
  ),
} as const;

/** The demo asset the verification gateway walkthrough uses by default. */
export const demoAssetId =
  process.env.NEXT_PUBLIC_DEMO_ASSET_ID?.trim() || "ttbill-a";

const requiredRwaAddresses = [
  rwaContractAddresses.assetRegistry,
  rwaContractAddresses.eligibilityRegistry,
  rwaContractAddresses.policyRegistry,
  rwaContractAddresses.strategyVerifier,
  rwaContractAddresses.vaultFactory,
  rwaContractAddresses.executionRouter,
  rwaContractAddresses.cashToken,
];

export const rwaContractConfiguration = {
  chainId: activeChain.id,
  chainName: activeChain.name,
  rpcUrl: activeChain.rpcUrls.default.http[0],
  configuredCount: requiredRwaAddresses.filter(Boolean).length,
  requiredCount: requiredRwaAddresses.length,
  complete: requiredRwaAddresses.every(Boolean),
  demoFaucetConfigured: Boolean(rwaContractAddresses.faucet),
};

export const rwaVaultAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "activePolicyVersion", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "activePolicyHash", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "guardedExecutor", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "cashToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "cashAssetId", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "assetRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "policyRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "strategyVerifier", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "executionRouter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "activatePolicy", stateMutability: "nonpayable", inputs: [{ name: "version", type: "uint32" }], outputs: [] },
  { type: "function", name: "depositCash", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "eligibilityRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "depositEligibleAsset",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assetId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "EligibleAssetDeposited",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "assetId", type: "bytes32", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  // Surfaced so the UI can name the exact contract-level refusal rather than
  // paraphrasing it. This is the revert the gateway demo turns on.
  { type: "error", name: "AssetNotEligible", inputs: [{ name: "assetId", type: "bytes32" }] },
  { type: "error", name: "AssetNotEnabled", inputs: [{ name: "assetId", type: "bytes32" }] },
  { type: "error", name: "AssetNotRegistered", inputs: [{ name: "assetId", type: "bytes32" }] },
  { type: "error", name: "AssetNotAllowed", inputs: [{ name: "assetId", type: "bytes32" }] },
] as const;

export const rwaVaultFactoryAbi = [
  { type: "function", name: "createVault", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "vault", type: "address" }] },
  { type: "event", name: "VaultCreated", inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "vault", type: "address", indexed: true },
    { name: "vaultIndex", type: "uint256", indexed: true },
  ] },
] as const;

export const demoRwaFaucetAbi = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "hasClaimed", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "claimAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export const aliveEligibilityRegistryAbi = [
  {
    type: "function",
    name: "isEligible",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getRecord",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "eligible", type: "bool" },
          { name: "reasonHash", type: "bytes32" },
          { name: "passportHash", type: "bytes32" },
          { name: "marketSnapshotHash", type: "bytes32" },
          { name: "policyHash", type: "bytes32" },
          { name: "issuedAt", type: "uint64" },
          { name: "validUntil", type: "uint64" },
          { name: "version", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "publishEligibility",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "attestation",
        type: "tuple",
        components: [
          { name: "assetIdHash", type: "bytes32" },
          { name: "eligible", type: "bool" },
          { name: "reasonHash", type: "bytes32" },
          { name: "passportHash", type: "bytes32" },
          { name: "marketSnapshotHash", type: "bytes32" },
          { name: "policyHash", type: "bytes32" },
          { name: "issuedAt", type: "uint64" },
          { name: "validUntil", type: "uint64" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "digest", type: "bytes32" }],
  },
  {
    type: "event",
    name: "EligibilityUpdated",
    inputs: [
      { name: "assetId", type: "bytes32", indexed: true },
      { name: "eligible", type: "bool", indexed: false },
      { name: "reasonHash", type: "bytes32", indexed: false },
      { name: "validUntil", type: "uint64", indexed: false },
      { name: "version", type: "uint64", indexed: false },
    ],
  },
] as const;

export const rwaCashTokenAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export const rwaPolicyRegistryAbi = [
  { type: "function", name: "latestVersion", stateMutability: "view", inputs: [{ name: "vault", type: "address" }], outputs: [{ type: "uint32" }] },
  {
    type: "function",
    name: "registerPolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "input", type: "tuple", components: [
        { name: "policyHash", type: "bytes32" },
        { name: "maximumSingleAssetBps", type: "uint16" },
        { name: "maximumSingleIssuerBps", type: "uint16" },
        { name: "minimumCashBps", type: "uint16" },
        { name: "maximumSlippageBps", type: "uint16" },
        { name: "maximumPriceAgeSeconds", type: "uint32" },
        { name: "approvalMode", type: "uint8" },
        { name: "allowlistEnabled", type: "bool" },
      ] },
      { name: "classLimits", type: "tuple[]", components: [
        { name: "assetClass", type: "bytes32" },
        { name: "minimumBps", type: "uint16" },
        { name: "maximumBps", type: "uint16" },
      ] },
      { name: "allowedAssets", type: "bytes32[]" },
      { name: "blockedAssets", type: "bytes32[]" },
    ],
    outputs: [{ name: "version", type: "uint32" }],
  },
  { type: "event", name: "PolicyRegistered", inputs: [
    { name: "vault", type: "address", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "version", type: "uint32", indexed: true },
    { name: "policyHash", type: "bytes32", indexed: false },
    { name: "enforceablePolicyHash", type: "bytes32", indexed: false },
    { name: "approvalMode", type: "uint8", indexed: false },
  ] },
] as const;

function bytes32Label(value: string): Hex {
  return keccak256(toBytes(value));
}

function sortHex(values: Hex[]): Hex[] {
  return [...values].sort((left, right) => BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0);
}

export function policyRegistryArguments(policyHash: Hex, policy: PortfolioPolicy) {
  const classLimits = policy.assetClassLimits.map((limit) => ({
    assetClass: bytes32Label(limit.assetClass),
    minimumBps: limit.minimumBps,
    maximumBps: limit.maximumBps,
  })).sort((left, right) => BigInt(left.assetClass) < BigInt(right.assetClass) ? -1 : BigInt(left.assetClass) > BigInt(right.assetClass) ? 1 : 0);
  const allowedAssets = sortHex(policy.allowedAssetIds.map(bytes32Label));
  const blockedAssets = sortHex(policy.blockedAssetIds.map(bytes32Label));
  return {
    input: {
      policyHash,
      maximumSingleAssetBps: policy.maximumSingleAssetBps,
      maximumSingleIssuerBps: policy.maximumSingleIssuerBps,
      minimumCashBps: policy.minimumCashBps,
      maximumSlippageBps: policy.maximumSlippageBps,
      maximumPriceAgeSeconds: policy.maximumPriceAgeSeconds,
      approvalMode: policy.userApprovalRequired ? 0 : 1,
      allowlistEnabled: allowedAssets.length > 0,
    },
    classLimits,
    allowedAssets,
    blockedAssets,
  } as const;
}

export type RwaVaultRead = {
  address: Address;
  chainId: number;
  chainName: string;
  explorerUrl?: string;
  bytecodePresent: boolean;
  interfaceReadable: boolean;
  owner?: Address;
  activePolicyVersion?: number;
  activePolicyHash?: Hex;
  guardedExecutor?: Address;
  cashToken?: Address;
  cashAssetId?: Hex;
  assetRegistry?: Address;
  policyRegistry?: Address;
  strategyVerifier?: Address;
  executionRouter?: Address;
};

export async function readRwaVault(candidate: string): Promise<RwaVaultRead> {
  if (!isAddress(candidate)) throw new Error("The vault route does not contain a valid EVM address.");
  const vaultAddress = candidate as Address;
  const client = createPublicClient({ chain: activeChain, transport: http(rwaContractConfiguration.rpcUrl) });
  const bytecode = await client.getCode({ address: vaultAddress });
  const explorerUrl = explorerAddressUrl(vaultAddress);
  const base = {
    address: vaultAddress,
    chainId: activeChain.id,
    chainName: activeChain.name,
    ...(explorerUrl ? { explorerUrl } : {}),
    bytecodePresent: Boolean(bytecode && bytecode !== "0x"),
  };
  if (!base.bytecodePresent) return { ...base, interfaceReadable: false };

  try {
    const [owner, activePolicyVersion, activePolicyHash, guardedExecutor, cashToken, cashAssetId, assetRegistry, policyRegistry, strategyVerifier, executionRouter] = await Promise.all([
      client.readContract({ address: vaultAddress, abi: rwaVaultAbi, functionName: "owner" }),
      client.readContract({ address: vaultAddress, abi: rwaVaultAbi, functionName: "activePolicyVersion" }),
      client.readContract({ address: vaultAddress, abi: rwaVaultAbi, functionName: "activePolicyHash" }),
      client.readContract({ address: vaultAddress, abi: rwaVaultAbi, functionName: "guardedExecutor" }),
      client.readContract({ address: vaultAddress, abi: rwaVaultAbi, functionName: "cashToken" }),
      client.readContract({ address: vaultAddress, abi: rwaVaultAbi, functionName: "cashAssetId" }),
      client.readContract({ address: vaultAddress, abi: rwaVaultAbi, functionName: "assetRegistry" }),
      client.readContract({ address: vaultAddress, abi: rwaVaultAbi, functionName: "policyRegistry" }),
      client.readContract({ address: vaultAddress, abi: rwaVaultAbi, functionName: "strategyVerifier" }),
      client.readContract({ address: vaultAddress, abi: rwaVaultAbi, functionName: "executionRouter" }),
    ]);
    return {
      ...base,
      interfaceReadable: true,
      owner,
      activePolicyVersion,
      activePolicyHash,
      guardedExecutor,
      cashToken,
      cashAssetId,
      assetRegistry,
      policyRegistry,
      strategyVerifier,
      executionRouter,
    };
  } catch {
    return { ...base, interfaceReadable: false };
  }
}

export type OnchainEligibility = {
  configured: boolean;
  /** True only when the registry itself says the asset may be used now. */
  eligible: boolean;
  /** version 0 means no verdict has ever been published for this asset. */
  version: number;
  issuedAt?: number;
  validUntil?: number;
  expired?: boolean;
  passportHash?: Hex;
  policyHash?: Hex;
  marketSnapshotHash?: Hex;
};

/**
 * Reads the asset's live eligibility state straight from
 * AliveEligibilityRegistry, so the UI reports what the chain enforces
 * rather than restating an offchain verdict it happens to be holding.
 */
export async function readOnchainEligibility(
  assetId: string,
): Promise<OnchainEligibility> {
  const registry = rwaContractAddresses.eligibilityRegistry;
  if (!registry) return { configured: false, eligible: false, version: 0 };

  const assetIdHash = keccak256(toBytes(assetId));
  const client = createPublicClient({
    chain: activeChain,
    transport: http(activeChain.rpcUrls.default.http[0]),
  });

  try {
    const [eligible, record] = await Promise.all([
      client.readContract({
        address: registry,
        abi: aliveEligibilityRegistryAbi,
        functionName: "isEligible",
        args: [assetIdHash],
      }),
      client.readContract({
        address: registry,
        abi: aliveEligibilityRegistryAbi,
        functionName: "getRecord",
        args: [assetIdHash],
      }),
    ]);
    const issuedAt = Number(record.issuedAt);
    const validUntil = Number(record.validUntil);
    return {
      configured: true,
      eligible,
      version: Number(record.version),
      issuedAt,
      validUntil,
      expired: validUntil > 0 && Date.now() / 1_000 >= validUntil,
      passportHash: record.passportHash,
      policyHash: record.policyHash,
      marketSnapshotHash: record.marketSnapshotHash,
    };
  } catch {
    return { configured: true, eligible: false, version: 0 };
  }
}
