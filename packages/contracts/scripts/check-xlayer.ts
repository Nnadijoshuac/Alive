/**
 * Read-only X Layer connectivity + configuration probe.
 *
 * Verifies, against the live chain rather than a stored deployment record:
 *   - the RPC is reachable,
 *   - the chain ID it reports matches what hardhat.config.ts / chains.ts expect,
 *   - the current block height and base fee,
 *   - the deployer's native OKB balance, when DEPLOYER_PRIVATE_KEY is set.
 *
 * Never prints a private key. Only the derived public address is shown.
 *
 * Usage:
 *   pnpm --filter @alive/contracts check:xlayer:testnet
 *   pnpm --filter @alive/contracts check:xlayer:mainnet
 */
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Target = {
  label: string;
  expectedChainId: number;
  rpcUrl: string;
};

const TARGETS: Record<string, Target> = {
  testnet: {
    label: "X Layer Testnet",
    expectedChainId: 1952,
    rpcUrl:
      process.env.X_LAYER_TESTNET_RPC_URL ??
      "https://testrpc.xlayer.tech/terigon",
  },
  mainnet: {
    label: "X Layer Mainnet",
    expectedChainId: 196,
    rpcUrl: process.env.X_LAYER_MAINNET_RPC_URL ?? "https://rpc.xlayer.tech",
  },
};

function deployerAddress(): string | undefined {
  const key = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!key) return undefined;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex value");
  }
  return privateKeyToAccount(key as `0x${string}`).address;
}

function eligibilitySignerAddress(): string | undefined {
  const key = process.env.ELIGIBILITY_SIGNER_PRIVATE_KEY?.trim();
  if (!key) return undefined;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "ELIGIBILITY_SIGNER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex value",
    );
  }
  return privateKeyToAccount(key as `0x${string}`).address;
}

async function main(): Promise<void> {
  const which = (process.argv[2] ?? "testnet").toLowerCase();
  const target = TARGETS[which];
  if (!target) {
    throw new Error(`Unknown target "${which}". Use testnet or mainnet.`);
  }

  process.stdout.write(`\n${target.label}\n`);
  process.stdout.write(`RPC              ${target.rpcUrl}\n`);
  process.stdout.write(`Expected chainId ${target.expectedChainId}\n`);

  const client = createPublicClient({ transport: http(target.rpcUrl, { timeout: 20_000 }) });

  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch (error) {
    process.stdout.write(
      `\nRPC UNREACHABLE: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Reported chainId ${chainId}\n`);
  if (chainId !== target.expectedChainId) {
    process.stdout.write(
      `\nCHAIN ID MISMATCH: repository expects ${target.expectedChainId}, RPC reports ${chainId}.\n` +
        `Do not deploy until this is reconciled.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const blockNumber = await client.getBlockNumber();
  process.stdout.write(`Block height     ${blockNumber}\n`);
  try {
    const fees = await client.estimateFeesPerGas();
    if (fees.maxFeePerGas !== undefined) {
      process.stdout.write(`maxFeePerGas     ${fees.maxFeePerGas} wei\n`);
    }
    if (fees.gasPrice !== undefined) {
      process.stdout.write(`gasPrice         ${fees.gasPrice} wei\n`);
    }
  } catch {
    const gasPrice = await client.getGasPrice();
    process.stdout.write(`gasPrice         ${gasPrice} wei (legacy)\n`);
  }

  const signer = eligibilitySignerAddress();
  if (signer) {
    process.stdout.write(`Eligibility signer ${signer}\n`);
  } else {
    process.stdout.write(`Eligibility signer NOT CONFIGURED\n`);
  }

  const deployer = deployerAddress();
  if (!deployer) {
    process.stdout.write(
      `\nDEPLOYER_PRIVATE_KEY is not set locally, so no balance check was performed.\n`,
    );
    return;
  }

  const balance = await client.getBalance({ address: deployer as `0x${string}` });
  process.stdout.write(`\nDeployer address ${deployer}\n`);
  process.stdout.write(`Deployer balance ${formatEther(balance)} OKB\n`);
  if (balance === 0n) {
    process.stdout.write(
      `\nDEPLOYER IS UNFUNDED. Fund this address with ${target.label} OKB before deploying.\n`,
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
