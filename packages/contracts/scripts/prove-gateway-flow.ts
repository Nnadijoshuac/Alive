/**
 * Proves the ALIVE verification gateway against a real chain.
 *
 *   ELIGIBLE   -> depositEligibleAsset SUCCEEDS
 *   NAV stale  -> RESTRICTED -> the SAME deposit is REJECTED by the contract
 *   restored   -> ELIGIBLE   -> the deposit SUCCEEDS again
 *
 * Every eligibility verdict is produced by the real intelligence service
 * (ingest -> AI/deterministic extraction -> passport -> market data ->
 * deterministic rules) and signed with the real EIP-712 signer. Every chain
 * step is a real broadcast whose receipt is verified. Nothing here simulates
 * an outcome, and the rejection is captured from actual contract logic.
 *
 * Requires a running intelligence service with DEMO_MODE=true and a
 * configured eligibility signer whose address matches the deployed
 * AliveEligibilityRegistry's authorizedSigner.
 *
 * Usage:
 *   pnpm --filter @alive/contracts prove:flow 1952
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  encodeFunctionData,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CHAINS: Record<number, { name: string; rpcEnv: string; fallback: string }> = {
  31337: { name: "local", rpcEnv: "LOCAL_RPC_URL", fallback: "http://127.0.0.1:8545" },
  1952: {
    name: "xlayer-testnet",
    rpcEnv: "X_LAYER_TESTNET_RPC_URL",
    fallback: "https://testrpc.xlayer.tech/terigon",
  },
};

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
  {
    type: "function",
    name: "authorizedSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
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
  throw new Error("Could not locate the workspace root");
}

/**
 * Pulls the contract's own custom-error name out of a viem revert, so the
 * proof records "AssetNotEligible" rather than a stringified error object.
 * Walks the cause chain because viem nests the reverted-error detail.
 */
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

type Step = {
  step: string;
  aliveStatus?: string;
  aliveReasons?: string[];
  txHash?: string;
  blockNumber?: number;
  outcome: string;
  contractError?: string;
};

const steps: Step[] = [];
function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function api(base: string, method: string, route: string, body?: unknown) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${route} returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`${route} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return json as any;
}

async function main(): Promise<void> {
  const chainId = Number(process.argv[2] ?? "1952");
  const chainInfo = CHAINS[chainId];
  if (!chainInfo) throw new Error(`Unsupported chain ${chainId}`);
  const intelligenceUrl = (
    process.env.INTELLIGENCE_URL ?? "http://127.0.0.1:4200"
  ).replace(/\/$/, "");
  const assetId = process.env.DEMO_ASSET_ID ?? "ttbill-a";
  const repoRoot = findRepoRoot();

  const recordPath = path.join(
    repoRoot,
    "packages/contracts/deployments",
    `rwa-${chainId}.json`,
  );
  if (!existsSync(recordPath)) throw new Error(`No deployment record at ${recordPath}`);
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  const all = { ...record.contracts, ...(record.demoOnlyContracts ?? {}) };
  const eligibilityRegistry = all.AliveEligibilityRegistry.address as Address;
  const vault = all.AliveVault.address as Address;
  const token = all[`MockRwaToken:${assetId}`]?.address as Address | undefined;
  if (!token) throw new Error(`Deployment record has no token for asset ${assetId}`);

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY is not set");
  const account = privateKeyToAccount(deployerKey as Hex);
  const rpcUrl = process.env[chainInfo.rpcEnv] ?? chainInfo.fallback;
  const chain = { id: chainId, name: chainInfo.name, nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as const;
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const assetIdHash = keccak256(toBytes(assetId));

  log(`\nALIVE gateway proof -- ${chainInfo.name} (chain ${chainId})`);
  log(`Asset              ${assetId}`);
  log(`EligibilityRegistry ${eligibilityRegistry}`);
  log(`Vault               ${vault}`);
  log(`Token               ${token}`);
  log(`Sender              ${account.address}\n`);

  // The registry must trust the signer the intelligence service actually uses.
  const onchainSigner = await publicClient.readContract({
    address: eligibilityRegistry,
    abi: ELIGIBILITY_ABI,
    functionName: "authorizedSigner",
  });
  log(`Registry authorizedSigner ${onchainSigner}`);

  /** Blocks until the node currently serving reads has caught up to `target`. */
  async function waitForBlock(target: number): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const head = await publicClient.getBlockNumber();
      if (Number(head) >= target) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`RPC did not reach block ${target} in time`);
  }

  async function send(
    label: string,
    to: Address,
    data: Hex,
  ): Promise<{ hash: Hex; blockNumber: number }> {
    const hash = await walletClient.sendTransaction({ to, data });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`${label}: transaction ${hash} reverted`);
    }
    log(`  ${label}: ${hash} (block ${receipt.blockNumber})`);
    return { hash, blockNumber: Number(receipt.blockNumber) };
  }

  // AliveEligibilityRegistry requires each verdict to be strictly newer than
  // the stored one, which is what stops an old ELIGIBLE verdict from being
  // replayed to undo a newer RESTRICTED one. Attestation timestamps have
  // one-second granularity, so a scripted run that publishes twice inside the
  // same second would collide with that rule. Wait out the second rather than
  // weakening the monotonicity check.
  let lastIssuedAt = 0;
  async function awaitNextSecond(): Promise<void> {
    if (lastIssuedAt === 0) return;
    while (Math.floor(Date.now() / 1_000) <= lastIssuedAt) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  /** Asks ALIVE for a fresh signed verdict, then publishes it onchain. */
  async function evaluateAndPublish(phase: string) {
    await awaitNextSecond();
    const evaluated = await api(intelligenceUrl, "GET", `/api/assets/${assetId}/eligibility`);
    const status = evaluated.verdict.status as string;
    const reasons = (evaluated.verdict.reasons as { code: string }[]).map((r) => r.code);
    log(`\n[${phase}] ALIVE verdict: ${status} (${reasons.join(", ")})`);

    const signed = await api(intelligenceUrl, "POST", `/api/assets/${assetId}/publish-verdict`);
    const attestation = signed.signed.attestation;
    const data = encodeFunctionData({
      abi: ELIGIBILITY_ABI,
      functionName: "publishEligibility",
      args: [
        {
          assetIdHash: attestation.assetIdHash,
          eligible: attestation.eligible,
          reasonHash: attestation.reasonHash,
          passportHash: attestation.passportHash,
          marketSnapshotHash: attestation.marketSnapshotHash,
          policyHash: attestation.policyHash,
          issuedAt: BigInt(attestation.issuedAt),
          validUntil: BigInt(attestation.validUntil),
          nonce: attestation.nonce,
        },
        signed.signed.signature as Hex,
      ],
    });
    lastIssuedAt = Number(attestation.issuedAt);
    const tx = await send(`publish ${status} verdict`, eligibilityRegistry, data);
    // A public RPC load-balances across nodes, so a read issued immediately
    // after the receipt can land on one that has not indexed that block yet
    // and return pre-publish state. Wait for the node serving us to reach the
    // receipt's block before trusting what it reports.
    await waitForBlock(tx.blockNumber);
    const onchain = await publicClient.readContract({
      address: eligibilityRegistry,
      abi: ELIGIBILITY_ABI,
      functionName: "isEligible",
      args: [assetIdHash],
    });
    log(`  registry.isEligible(${assetId}) = ${onchain}`);
    steps.push({
      step: `${phase}: publish verdict`,
      aliveStatus: status,
      aliveReasons: reasons,
      txHash: tx.hash,
      blockNumber: tx.blockNumber,
      outcome: `registry.isEligible=${onchain}`,
    });
    return { status, reasons, onchain };
  }

  /** Attempts the gated deposit; returns the decoded contract refusal if it reverts. */
  async function attemptDeposit(phase: string, amount: bigint) {
    const data = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: "depositEligibleAsset",
      args: [assetIdHash, amount],
    });
    try {
      // Simulate first so a guaranteed revert is surfaced as contract truth
      // rather than burned as a failed broadcast.
      await publicClient.simulateContract({
        account: account.address,
        address: vault,
        abi: VAULT_ABI,
        functionName: "depositEligibleAsset",
        args: [assetIdHash, amount],
      });
    } catch (error: unknown) {
      const decoded = decodeContractRefusal(error);
      log(`\n[${phase}] deposit REJECTED by contract: ${decoded}`);
      steps.push({
        step: `${phase}: gated deposit`,
        outcome: "REJECTED",
        contractError: decoded,
      });
      return { ok: false as const, contractError: decoded };
    }
    const tx = await send(`${phase} deposit`, vault, data);
    steps.push({
      step: `${phase}: gated deposit`,
      outcome: "CONFIRMED",
      txHash: tx.hash,
      blockNumber: tx.blockNumber,
    });
    return { ok: true as const, ...tx };
  }

  // ---- Setup: ensure the sender holds and has approved the demo asset.
  const decimals = await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" });
  const amount = parseUnits("100", decimals);
  const held = await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  if (held < amount * 3n) {
    log("Minting demo tTBILL to the sender (demo token, owner-mintable)...");
    await send("mint demo asset", token, encodeFunctionData({ abi: ERC20_ABI, functionName: "mint", args: [account.address, amount * 10n] }));
  }
  await send("approve vault", token, encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [vault, amount * 10n] }));

  // Ingest + extract so the passport carries documented facts.
  log("\nIngesting issuer document and extracting the Asset Passport...");
  await api(intelligenceUrl, "POST", `/api/assets/${assetId}/ingest`, {
    sourceId: `demo-doc-${assetId}`,
    sourceType: "DEMO_FIXTURE",
    input: { kind: "fixture", fixtureId: assetId, title: `${assetId} fact sheet` },
  });
  const extracted = await api(intelligenceUrl, "POST", `/api/assets/${assetId}/extract`);
  log(`  extraction mode: ${extracted.extraction.mode}`);

  // ---- PHASE 7: GOOD PATH
  await api(intelligenceUrl, "POST", "/api/demo/reset");
  const good = await evaluateAndPublish("GOOD PATH");
  if (!good.onchain) throw new Error("Expected the asset to be eligible onchain for the good path");
  const goodDeposit = await attemptDeposit("GOOD PATH", amount);
  if (!goodDeposit.ok) throw new Error("Good-path deposit was rejected; the demo is not provable");

  // ---- PHASE 8: BAD PATH (NAV goes stale)
  log("\nBreaking NAV freshness: 31 hours against a 24-hour bound...");
  await api(intelligenceUrl, "POST", `/api/demo/assets/${assetId}/nav-age`, { ageSeconds: 31 * 3600 });
  const bad = await evaluateAndPublish("BAD PATH");
  if (bad.onchain) throw new Error("Expected the asset to be ineligible onchain after NAV went stale");
  const badDeposit = await attemptDeposit("BAD PATH", amount);
  if (badDeposit.ok) throw new Error("Restricted asset was deposited; the gate did not hold");

  // ---- PHASE 9: RECOVERY
  log("\nRestoring valid NAV data...");
  await api(intelligenceUrl, "POST", "/api/demo/reset");
  const recovered = await evaluateAndPublish("RECOVERY");
  if (!recovered.onchain) throw new Error("Expected the asset to be eligible again after recovery");
  const recoveryDeposit = await attemptDeposit("RECOVERY", amount);
  if (!recoveryDeposit.ok) throw new Error("Recovery deposit was rejected");

  const vaultBalance = await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [vault] });
  log(`\nVault ${assetId} balance: ${formatUnits(vaultBalance, decimals)}`);

  const proof = {
    protocol: "ALIVE verification gateway",
    network: chainInfo.name,
    chainId,
    assetId,
    provedAt: new Date().toISOString(),
    sender: account.address,
    contracts: { eligibilityRegistry, vault, token },
    extractionMode: extracted.extraction.mode,
    sequence: steps,
  };
  const proofPath = path.join(repoRoot, "packages/contracts/deployments", `gateway-proof-${chainId}.json`);
  writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  log(`\nProof written to ${proofPath}`);
  log("\nELIGIBLE -> CONFIRMED | RESTRICTED -> REJECTED | RESTORED -> CONFIRMED");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
