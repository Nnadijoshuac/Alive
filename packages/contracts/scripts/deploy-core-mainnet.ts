/**
 * Deploys the ALIVE core protocol to X Layer Mainnet (chain 196).
 *
 * SCOPE — deliberately narrower than the testnet deployment.
 *
 * This deploys only the four contracts that do not depend on an execution
 * venue:
 *
 *   AliveRwaAssetRegistry     -- the approved-asset registry
 *   AliveEligibilityRegistry  -- signed verdicts and the isEligible gate
 *   AlivePolicyRegistry       -- versioned, vault-owner-controlled policy
 *   AliveStrategyVerifier     -- EIP-712 strategy capability consumption
 *
 * It deliberately does NOT deploy AliveVault or AliveVaultFactory. Both
 * require an IRwaExecutionRouter, and the only implementation in this
 * repository is MockRwaRouter -- a deterministic demo price fixture that is
 * explicitly not a DEX and not an oracle. Wiring a mainnet vault to it would
 * put demo execution infrastructure on mainnet under a production-looking
 * name, which is precisely what must not happen. A vault belongs on mainnet
 * once a real execution adapter exists, not before.
 *
 * It also deploys no demo tokens, no faucet, and no mock router, and it
 * refuses to run if the demo-asset flags are set.
 *
 * BROADCAST GUARD: requires ALLOW_MAINNET_DEPLOY=true.
 *
 * Usage:
 *   pnpm --filter @alive/contracts deploy:core:mainnet
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ethers, network } from "hardhat";

type DeploymentEntry = {
  address: string;
  transactionHash: string;
  blockNumber: number;
  runtimeBytecodePresent: boolean;
};

type DeployedContract = {
  getAddress(): Promise<string>;
  deploymentTransaction(): { hash: string } | null;
};

async function deploymentEntry(
  label: string,
  contract: DeployedContract,
): Promise<DeploymentEntry> {
  const transaction = contract.deploymentTransaction();
  if (!transaction) throw new Error(`${label}: deployment transaction missing`);
  const address = await contract.getAddress();
  const receipt = await ethers.provider.getTransactionReceipt(transaction.hash);
  if (!receipt) throw new Error(`${label}: no receipt for ${transaction.hash}`);
  if (receipt.status !== 1) {
    throw new Error(`${label}: deployment reverted (${transaction.hash})`);
  }
  const code = await ethers.provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${label}: no runtime bytecode at ${address}`);
  }
  console.log(
    `  ${label.padEnd(26)} ${address}  block ${receipt.blockNumber}  ${(code.length - 2) / 2} bytes`,
  );
  return {
    address,
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
    runtimeBytecodePresent: true,
  };
}

async function main(): Promise<void> {
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== 196n) {
    throw new Error(
      `This script targets X Layer Mainnet (196); connected chain is ${chain.chainId}.`,
    );
  }

  // Refuse to carry any demo intent onto mainnet.
  for (const flag of [
    "DEPLOY_RWA_MOCKS",
    "ALLOW_PUBLIC_DEMO_DEPLOYMENT",
    "ALLOW_DEMO_ASSETS",
    "ALLOW_MOCK_ROUTER",
  ]) {
    if (process.env[flag]?.toLowerCase() === "true") {
      throw new Error(
        `${flag}=true is set. Demo infrastructure must never be deployed to mainnet. Unset it and retry.`,
      );
    }
  }

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    throw new Error(
      "No deployer configured. Set MAINNET_DEPLOYER_PRIVATE_KEY for X Layer Mainnet.",
    );
  }

  const eligibilitySigner = process.env.MAINNET_ELIGIBILITY_SIGNER?.trim();
  if (!eligibilitySigner || !ethers.isAddress(eligibilitySigner)) {
    throw new Error(
      "Set MAINNET_ELIGIBILITY_SIGNER to the public address that will sign mainnet eligibility verdicts. Reusing the testnet signer is not acceptable.",
    );
  }
  const strategySigner = process.env.MAINNET_STRATEGY_SIGNER?.trim();
  if (!strategySigner || !ethers.isAddress(strategySigner)) {
    throw new Error(
      "Set MAINNET_STRATEGY_SIGNER to the public address that will sign mainnet strategies.",
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  const feeData = await ethers.provider.getFeeData();

  console.log("\nALIVE core protocol -- X Layer Mainnet (chain 196)");
  console.log(`Deployer            ${deployer.address}`);
  console.log(`Balance             ${ethers.formatEther(balance)} OKB`);
  console.log(
    `maxFeePerGas        ${feeData.maxFeePerGas?.toString() ?? feeData.gasPrice?.toString() ?? "unknown"} wei`,
  );
  console.log(`Eligibility signer  ${eligibilitySigner}`);
  console.log(`Strategy signer     ${strategySigner}`);
  console.log("\nPlanned deployment (core only, no demo infrastructure):");
  for (const name of [
    "AliveRwaAssetRegistry",
    "AliveEligibilityRegistry",
    "AlivePolicyRegistry",
    "AliveStrategyVerifier",
  ]) {
    console.log(`  - ${name}`);
  }
  console.log(
    "\nNot deployed: AliveVault and AliveVaultFactory require an IRwaExecutionRouter,\n" +
      "and the only implementation here is the demo MockRwaRouter. They belong on\n" +
      "mainnet once a real execution adapter exists.",
  );

  if (process.env.ALLOW_MAINNET_DEPLOY?.toLowerCase() !== "true") {
    console.log("\n================================================");
    console.log("MAINNET DEPLOYMENT PREPARED.");
    console.log("");
    console.log("No transaction has been broadcast.");
    console.log("");
    console.log("Set ALLOW_MAINNET_DEPLOY=true locally when ready.");
    console.log("================================================\n");
    return;
  }

  if (balance === 0n) {
    throw new Error("Deployer holds no OKB on mainnet. Fund it before deploying.");
  }

  console.log("\nALLOW_MAINNET_DEPLOY=true -- broadcasting.\n");

  const AssetRegistry = await ethers.getContractFactory("AliveRwaAssetRegistry");
  const assetRegistry = await AssetRegistry.deploy(deployer.address);
  await assetRegistry.waitForDeployment();

  const EligibilityRegistry = await ethers.getContractFactory(
    "AliveEligibilityRegistry",
  );
  const eligibilityRegistry = await EligibilityRegistry.deploy(
    await assetRegistry.getAddress(),
    eligibilitySigner,
    deployer.address,
  );
  await eligibilityRegistry.waitForDeployment();

  const PolicyRegistry = await ethers.getContractFactory("AlivePolicyRegistry");
  const policyRegistry = await PolicyRegistry.deploy(
    await assetRegistry.getAddress(),
    deployer.address,
  );
  await policyRegistry.waitForDeployment();

  const Verifier = await ethers.getContractFactory("AliveStrategyVerifier");
  const verifier = await Verifier.deploy(strategySigner, deployer.address);
  await verifier.waitForDeployment();

  console.log("Verifying receipts and runtime bytecode...");
  const contracts: Record<string, DeploymentEntry> = {
    AliveRwaAssetRegistry: await deploymentEntry(
      "AliveRwaAssetRegistry",
      assetRegistry,
    ),
    AliveEligibilityRegistry: await deploymentEntry(
      "AliveEligibilityRegistry",
      eligibilityRegistry,
    ),
    AlivePolicyRegistry: await deploymentEntry(
      "AlivePolicyRegistry",
      policyRegistry,
    ),
    AliveStrategyVerifier: await deploymentEntry(
      "AliveStrategyVerifier",
      verifier,
    ),
  };

  const exportData = {
    protocol: "ALIVE core protocol",
    demoOnly: false,
    scope:
      "Core registries and verifiers only. No vault, factory, router, faucet, or demo asset is deployed on mainnet.",
    network: network.name,
    chainId: Number(chain.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    eligibilitySigner,
    strategySigner,
    contracts,
    demoOnlyContracts: {},
  };

  const outputDirectory = path.resolve(__dirname, "../deployments");
  const outputPath = path.join(outputDirectory, "rwa-196.json");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(exportData, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(`\nMainnet deployment export written to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
