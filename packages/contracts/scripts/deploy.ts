import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ethers, network } from "hardhat";

type DeploymentEntry = {
  address: string;
  transactionHash: string;
};

async function deploymentEntry(contract: {
  getAddress(): Promise<string>;
  deploymentTransaction(): { hash: string } | null;
}): Promise<DeploymentEntry> {
  const transaction = contract.deploymentTransaction();
  if (!transaction) {
    throw new Error("Deployment transaction was not available");
  }
  return {
    address: await contract.getAddress(),
    transactionHash: transaction.hash,
  };
}

async function main(): Promise<void> {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const localVerifier = signers[1];
  if (!deployer) {
    throw new Error(
      "No deployer is configured. Set DEPLOYER_PRIVATE_KEY for X Layer.",
    );
  }

  const chain = await ethers.provider.getNetwork();
  const isLocal = chain.chainId === 31_337n;
  const verifierAddress = isLocal
    ? (process.env.VERIFIER_ADDRESS ?? localVerifier?.address)
    : process.env.VERIFIER_ADDRESS;
  if (!verifierAddress || !ethers.isAddress(verifierAddress)) {
    throw new Error(
      "Set VERIFIER_ADDRESS to the public address of the offchain EIP-712 signer.",
    );
  }

  const AssetRegistry = await ethers.getContractFactory("AliveAssetRegistry");
  const assetRegistry = await AssetRegistry.deploy();
  await assetRegistry.waitForDeployment();

  const AttestationRegistry = await ethers.getContractFactory(
    "AliveAttestationRegistry",
  );
  const attestationRegistry = await AttestationRegistry.deploy(
    await assetRegistry.getAddress(),
    verifierAddress,
    deployer.address,
  );
  await attestationRegistry.waitForDeployment();

  const Escrow = await ethers.getContractFactory("AliveEscrow");
  const escrow = await Escrow.deploy(
    await assetRegistry.getAddress(),
    await attestationRegistry.getAddress(),
  );
  await escrow.waitForDeployment();

  const authorizeData = attestationRegistry.interface.encodeFunctionData(
    "setAuthorizedConsumer",
    [await escrow.getAddress(), true],
  );
  const authorizeTransaction = await deployer.sendTransaction({
    to: await attestationRegistry.getAddress(),
    data: authorizeData,
  });
  await authorizeTransaction.wait();

  const contracts: Record<string, DeploymentEntry> = {
    AliveAssetRegistry: await deploymentEntry(assetRegistry),
    AliveAttestationRegistry: await deploymentEntry(attestationRegistry),
    AliveEscrow: await deploymentEntry(escrow),
  };

  const deployMock =
    isLocal || process.env.DEPLOY_MOCK_USDT?.toLowerCase() === "true";
  if (deployMock) {
    const TestToken = await ethers.getContractFactory("MockUSDT");
    const testToken = await TestToken.deploy(deployer.address);
    await testToken.waitForDeployment();
    contracts.MockUSDT = await deploymentEntry(testToken);
  }

  const exportData = {
    network: network.name,
    chainId: Number(chain.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    authorizedVerifier: verifierAddress,
    contracts,
  };
  const outputDirectory = path.resolve(__dirname, "../deployments");
  const outputPath = path.join(outputDirectory, `${chain.chainId}.json`);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(exportData, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  }).catch((error: unknown) => {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (code === "EEXIST") {
      throw new Error(
        `Refusing to overwrite ${outputPath}. Archive or remove it explicitly first.`,
      );
    }
    throw error;
  });

  console.log(JSON.stringify(exportData, null, 2));
  console.log(`Address export written to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
