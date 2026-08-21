/**
 * Broadcasts real X Layer Testnet transactions for the Attack Lab demo
 * flow. This is the same contract-interaction logic already proven in
 * packages/contracts/scripts/prove-gateway-flow.ts, made importable so the
 * Attack Lab's server-side orchestrator can drive it from an HTTP request
 * instead of a one-off CLI run -- not a second, parallel implementation.
 *
 * Uses a broadcasting wallet (DEPLOYER_PRIVATE_KEY -- pays gas, does not
 * need to be the registry's authorized signer) separate from the
 * EligibilitySigner (signs the EIP-712 attestation, never broadcasts).
 * Never returns the private key; only public addresses, tx hashes, and
 * decoded contract results.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  encodeFunctionData,
  http,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export function assetIdHashFor(assetId: string): `0x${string}` {
  return keccak256(toBytes(assetId));
}

const ELIGIBILITY_ABI = [
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
    type: "function",
    name: "isEligible",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const VAULT_ABI = [
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
  { type: "error", name: "AssetNotEligible", inputs: [{ name: "assetId", type: "bytes32" }] },
  { type: "error", name: "AssetNotEnabled", inputs: [{ name: "assetId", type: "bytes32" }] },
  { type: "error", name: "AssetNotRegistered", inputs: [{ name: "assetId", type: "bytes32" }] },
  { type: "error", name: "AssetNotAllowed", inputs: [{ name: "assetId", type: "bytes32" }] },
] as const;

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

function findRepoRoot(): string {
  let current = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Fall back to walking up from this compiled file's own location, in case
  // the process cwd is not the repo root (e.g. started from services/intelligence).
  let fromModule = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(fromModule, "pnpm-workspace.yaml"))) return fromModule;
    const parent = path.dirname(fromModule);
    if (parent === fromModule) break;
    fromModule = parent;
  }
  throw new Error("Could not locate the workspace root");
}

function decodeContractRefusal(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    const node = current as {
      name?: string;
      data?: { errorName?: string } | Hex;
      cause?: unknown;
    };
    if (
      node.name === "ContractFunctionRevertedError" &&
      typeof node.data === "object" &&
      node.data?.errorName
    ) {
      return node.data.errorName;
    }
    if (typeof node.data === "string" && node.data !== "0x") {
      try {
        return decodeErrorResult({ abi: VAULT_ABI, data: node.data }).errorName;
      } catch {
        /* keep walking */
      }
    }
    current = node.cause;
  }
  return "unknown revert";
}

export type GatewayClientConfig = {
  chainId: number;
  rpcUrl: string;
  eligibilityRegistry: Address;
  vault: Address;
  token: Address;
  deployerPrivateKey: `0x${string}`;
};

export type ConfigStatus =
  | { configured: true; config: GatewayClientConfig }
  | { configured: false; missing: string[] };

/**
 * Resolves what's needed to broadcast, or reports exactly what's missing.
 * Never throws for a missing-config case -- callers decide how to surface
 * that (this is the "fail clearly, don't silently downgrade" boundary).
 */
export function resolveGatewayClientConfig(assetId: string): ConfigStatus {
  const missing: string[] = [];
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!deployerKey) missing.push("DEPLOYER_PRIVATE_KEY");
  const chainIdRaw = process.env.ELIGIBILITY_CHAIN_ID?.trim();
  if (!chainIdRaw) missing.push("ELIGIBILITY_CHAIN_ID");
  const rpcUrl =
    process.env.X_LAYER_TESTNET_RPC_URL?.trim() ||
    (chainIdRaw === "1952" ? "https://testrpc.xlayer.tech/terigon" : undefined);
  if (!rpcUrl) missing.push("X_LAYER_TESTNET_RPC_URL");

  if (missing.length > 0) return { configured: false, missing };

  const chainId = Number(chainIdRaw);
  const repoRoot = findRepoRoot();
  const recordPath = path.join(
    repoRoot,
    "packages/contracts/deployments",
    `rwa-${chainId}.json`,
  );
  if (!existsSync(recordPath)) {
    return { configured: false, missing: [`deployment record at ${recordPath}`] };
  }
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
    contracts: Record<string, { address: Address }>;
    demoOnlyContracts?: Record<string, { address: Address }>;
  };
  const all = { ...record.contracts, ...(record.demoOnlyContracts ?? {}) };
  const eligibilityRegistry = all.AliveEligibilityRegistry?.address;
  const vault = all.AliveVault?.address;
  const token = all[`MockRwaToken:${assetId}`]?.address;
  if (!eligibilityRegistry) missing.push("AliveEligibilityRegistry in deployment record");
  if (!vault) missing.push("AliveVault in deployment record");
  if (!token) missing.push(`MockRwaToken:${assetId} in deployment record`);
  if (missing.length > 0) return { configured: false, missing };

  return {
    configured: true,
    config: {
      chainId,
      rpcUrl: rpcUrl!,
      eligibilityRegistry: eligibilityRegistry!,
      vault: vault!,
      token: token!,
      deployerPrivateKey: (deployerKey!.startsWith("0x") ? deployerKey : `0x${deployerKey}`) as `0x${string}`,
    },
  };
}

export type SignedAttestation = {
  attestation: {
    assetIdHash: `0x${string}`;
    eligible: boolean;
    reasonHash: `0x${string}`;
    passportHash: `0x${string}`;
    marketSnapshotHash: `0x${string}`;
    policyHash: `0x${string}`;
    issuedAt: number;
    validUntil: number;
    nonce: `0x${string}`;
  };
  signature: `0x${string}`;
};

export type PublishResult = {
  txHash: `0x${string}`;
  blockNumber: number;
  onchainEligible: boolean;
};

export type DepositResult =
  | { ok: true; txHash: `0x${string}`; blockNumber: number; broadcast: true }
  | { ok: false; contractError: string; broadcast: false };

/**
 * One gateway client bound to a specific asset's deployed demo token.
 * Holds the broadcasting wallet in memory only; never serializes or logs
 * the private key.
 */
export class GatewayClient {
  readonly #publicClient;
  readonly #walletClient;
  readonly #account;
  readonly config: GatewayClientConfig;
  readonly assetIdHash: `0x${string}`;

  constructor(config: GatewayClientConfig, assetIdHash: `0x${string}`) {
    this.config = config;
    this.assetIdHash = assetIdHash;
    this.#account = privateKeyToAccount(config.deployerPrivateKey);
    const chain = {
      id: config.chainId,
      name: `chain-${config.chainId}`,
      nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    } as const;
    this.#publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
    this.#walletClient = createWalletClient({
      account: this.#account,
      chain,
      transport: http(config.rpcUrl),
    });
  }

  /** The broadcasting wallet's public address -- safe to return to the client. */
  get broadcasterAddress(): Address {
    return this.#account.address;
  }

  async #send(to: Address, data: Hex): Promise<{ hash: Hex; blockNumber: number }> {
    const hash = await this.#walletClient.sendTransaction({ to, data });
    const receipt = await this.#publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`transaction ${hash} reverted`);
    }
    return { hash, blockNumber: Number(receipt.blockNumber) };
  }

  async #waitForBlock(target: number): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const head = await this.#publicClient.getBlockNumber();
      if (Number(head) >= target) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`RPC did not reach block ${target} in time`);
  }

  async publishVerdict(signed: SignedAttestation): Promise<PublishResult> {
    const data = encodeFunctionData({
      abi: ELIGIBILITY_ABI,
      functionName: "publishEligibility",
      args: [
        {
          assetIdHash: signed.attestation.assetIdHash,
          eligible: signed.attestation.eligible,
          reasonHash: signed.attestation.reasonHash,
          passportHash: signed.attestation.passportHash,
          marketSnapshotHash: signed.attestation.marketSnapshotHash,
          policyHash: signed.attestation.policyHash,
          issuedAt: BigInt(signed.attestation.issuedAt),
          validUntil: BigInt(signed.attestation.validUntil),
          nonce: signed.attestation.nonce,
        },
        signed.signature,
      ],
    });
    const tx = await this.#send(this.config.eligibilityRegistry, data);
    await this.#waitForBlock(tx.blockNumber);
    const onchainEligible = await this.#publicClient.readContract({
      address: this.config.eligibilityRegistry,
      abi: ELIGIBILITY_ABI,
      functionName: "isEligible",
      args: [this.assetIdHash],
    });
    return { txHash: tx.hash, blockNumber: tx.blockNumber, onchainEligible };
  }

  async tokenDecimals(): Promise<number> {
    return this.#publicClient.readContract({
      address: this.config.token,
      abi: ERC20_ABI,
      functionName: "decimals",
    });
  }

  /** Ensures the broadcasting wallet holds and has approved the demo token, minting/approving only if needed. */
  async ensureFunded(amount: bigint): Promise<void> {
    const held = await this.#publicClient.readContract({
      address: this.config.token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [this.#account.address],
    });
    if (held < amount * 3n) {
      await this.#send(
        this.config.token,
        encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "mint",
          args: [this.#account.address, amount * 10n],
        }),
      );
    }
    await this.#send(
      this.config.token,
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [this.config.vault, amount * 10n],
      }),
    );
  }

  async attemptDeposit(amount: bigint): Promise<DepositResult> {
    try {
      await this.#publicClient.simulateContract({
        account: this.#account.address,
        address: this.config.vault,
        abi: VAULT_ABI,
        functionName: "depositEligibleAsset",
        args: [this.assetIdHash, amount],
      });
    } catch (error) {
      return { ok: false, contractError: decodeContractRefusal(error), broadcast: false };
    }
    const data = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: "depositEligibleAsset",
      args: [this.assetIdHash, amount],
    });
    const tx = await this.#send(this.config.vault, data);
    return { ok: true, txHash: tx.hash, blockNumber: tx.blockNumber, broadcast: true };
  }
}
