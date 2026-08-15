import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ethers, network } from "hardhat";

type DeploymentEntry = {
  address: string;
  transactionHash: string;
};

type DeployedContract = {
  getAddress(): Promise<string>;
  deploymentTransaction(): { hash: string } | null;
};

async function deploymentEntry(
  contract: DeployedContract,
): Promise<DeploymentEntry> {
  const transaction = contract.deploymentTransaction();
  if (!transaction) throw new Error("Deployment transaction was unavailable");
  return {
    address: await contract.getAddress(),
    transactionHash: transaction.hash,
  };
}

const hashLabel = (value: string): string => ethers.id(value);
const sortBytes32 = (values: string[]): string[] =>
  [...values].sort((left, right) =>
    BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0,
  );

function decimalToE6(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new Error(`Demo price ${value} is not a six-decimal value`);
  return (
    BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"))
  );
}

async function main(): Promise<void> {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const localStrategySigner = signers[1];
  if (!deployer) {
    throw new Error(
      "No deployer is configured. Set DEPLOYER_PRIVATE_KEY for X Layer.",
    );
  }

  const chain = await ethers.provider.getNetwork();
  const isLocal = chain.chainId === 31_337n;
  const deployDemoTokens =
    isLocal || process.env.DEPLOY_RWA_MOCKS?.toLowerCase() === "true";
  if (!deployDemoTokens) {
    throw new Error(
      "This script deploys the demo execution stack. Set DEPLOY_RWA_MOCKS=true explicitly, or use a future production-asset deployment adapter.",
    );
  }
  if (
    !isLocal &&
    process.env.ALLOW_PUBLIC_DEMO_DEPLOYMENT?.toLowerCase() !== "true"
  ) {
    throw new Error(
      "Refusing to put demo RWA tokens on a public network without ALLOW_PUBLIC_DEMO_DEPLOYMENT=true.",
    );
  }

  const configuredSigner = process.env.RWA_STRATEGY_SIGNER?.trim();
  const strategySigner = configuredSigner || localStrategySigner?.address;
  if (!strategySigner || !ethers.isAddress(strategySigner)) {
    throw new Error(
      "Set RWA_STRATEGY_SIGNER to the public address of the EIP-712 strategy signer.",
    );
  }

  const localEligibilitySigner = signers[2];
  const configuredEligibilitySigner =
    process.env.RWA_ELIGIBILITY_SIGNER?.trim();
  const eligibilitySignerAddress =
    configuredEligibilitySigner || localEligibilitySigner?.address;
  if (
    !eligibilitySignerAddress ||
    !ethers.isAddress(eligibilitySignerAddress)
  ) {
    throw new Error(
      "Set RWA_ELIGIBILITY_SIGNER to the public address ALIVE's intelligence service signs eligibility verdicts with.",
    );
  }

  const demoPolicyFixture = JSON.parse(
    await readFile(
      path.resolve(__dirname, "../../../data/fixtures/killer-demo-policy.json"),
      "utf8",
    ),
  ) as {
    policy: {
      minimumCashBps: number;
      maximumSingleAssetBps: number;
      maximumSingleIssuerBps: number;
      maximumPriceAgeSeconds: number;
      maximumSlippageBps: number;
      assetClassLimits: {
        assetClass: string;
        minimumBps: number;
        maximumBps: number;
      }[];
    };
    policyHash: string;
  };
  const demoMarketFixture = JSON.parse(
    await readFile(
      path.resolve(
        __dirname,
        "../../../data/fixtures/market-snapshot.demo.json",
      ),
      "utf8",
    ),
  ) as { quotes: { assetId: string; price: string }[] };
  const demoPrices = new Map(
    demoMarketFixture.quotes.map((quote) => [
      quote.assetId,
      decimalToE6(quote.price),
    ]),
  );

  const Token = await ethers.getContractFactory("MockRwaToken");
  const tokenDefinitions = [
    ["tusdc", "Test USD Cash", "tUSDC", "CASH", "demo-cash-issuer"],
    [
      "ttbill-a",
      "Test Treasury Fund A",
      "tTBILL-A",
      "TREASURY",
      "demo-treasury-issuer-a",
    ],
    [
      "ttbill-b",
      "Test Treasury Fund B",
      "tTBILL-B",
      "TREASURY",
      "demo-treasury-issuer-b",
    ],
    [
      "ttbill-c",
      "Test Treasury Fund C",
      "tTBILL-C",
      "TREASURY",
      "demo-treasury-issuer-c",
    ],
    ["tgold", "Test Gold", "tGOLD", "GOLD", "demo-gold-issuer"],
    [
      "tsp500",
      "Test Broad Equity Index",
      "tSP500",
      "EQUITY",
      "demo-equity-issuer",
    ],
    ["tnvda", "Test NVDA Reference", "tNVDA", "EQUITY", "demo-equity-issuer"],
    ["taapl", "Test AAPL Reference", "tAAPL", "EQUITY", "demo-equity-issuer"],
  ] as const;
  const tokens: Record<string, any> = {};
  for (const [key, name, symbol] of tokenDefinitions) {
    const token = await Token.deploy(name, symbol, deployer.address);
    await token.waitForDeployment();
    tokens[key] = token;
  }

  const AssetRegistry = await ethers.getContractFactory(
    "AliveRwaAssetRegistry",
  );
  const assetRegistry: any = await AssetRegistry.deploy(deployer.address);
  await assetRegistry.waitForDeployment();

  const assetIds: Record<string, string> = {};
  for (const [key, name, , assetClass, issuer] of tokenDefinitions) {
    const assetId = hashLabel(key);
    assetIds[key] = assetId;
    const transaction = await assetRegistry.registerAsset(
      assetId,
      await tokens[key].getAddress(),
      hashLabel(assetClass),
      hashLabel(issuer),
      hashLabel(`metadata:${name}`),
      hashLabel(`provenance:synthetic-demo:${name}`),
    );
    await transaction.wait();
  }

  const Router = await ethers.getContractFactory("MockRwaRouter");
  const router: any = await Router.deploy(
    await tokens.tusdc.getAddress(),
    deployer.address,
  );
  await router.waitForDeployment();
  const nonCashTokens = tokenDefinitions
    .filter(([key]) => key !== "tusdc")
    .map(([key]) => tokens[key]);
  await (
    await router.setPrices(
      await Promise.all(nonCashTokens.map((token) => token.getAddress())),
      tokenDefinitions
        .filter(([key]) => key !== "tusdc")
        .map(([key]) => {
          const price = demoPrices.get(key);
          if (price === undefined)
            throw new Error(`Missing demo market price for ${key}`);
          return price;
        }),
    )
  ).wait();

  const routerLiquidity = 1_000_000n * 10n ** 6n;
  for (const token of Object.values(tokens)) {
    await (await token.mint(await router.getAddress(), routerLiquidity)).wait();
  }
  await (await tokens.tusdc.mint(deployer.address, 10_000n * 10n ** 6n)).wait();
  const Faucet = await ethers.getContractFactory("DemoRwaFaucet");
  const faucet: any = await Faucet.deploy(
    await tokens.tusdc.getAddress(),
    10_000n * 10n ** 6n,
    deployer.address,
  );
  await faucet.waitForDeployment();
  await (
    await tokens.tusdc.mint(await faucet.getAddress(), 10_000_000n * 10n ** 6n)
  ).wait();

  const Verifier = await ethers.getContractFactory("AliveStrategyVerifier");
  const verifier: any = await Verifier.deploy(strategySigner, deployer.address);
  await verifier.waitForDeployment();

  const PolicyRegistry = await ethers.getContractFactory("AlivePolicyRegistry");
  const policyRegistry: any = await PolicyRegistry.deploy(
    await assetRegistry.getAddress(),
    deployer.address,
  );
  await policyRegistry.waitForDeployment();

  const EligibilityRegistry = await ethers.getContractFactory(
    "AliveEligibilityRegistry",
  );
  const eligibilityRegistry: any = await EligibilityRegistry.deploy(
    await assetRegistry.getAddress(),
    eligibilitySignerAddress,
    deployer.address,
  );
  await eligibilityRegistry.waitForDeployment();

  const VaultFactory = await ethers.getContractFactory("AliveVaultFactory");
  const vaultFactory: any = await VaultFactory.deploy(
    assetIds.tusdc,
    await assetRegistry.getAddress(),
    await policyRegistry.getAddress(),
    await verifier.getAddress(),
    await router.getAddress(),
    await eligibilityRegistry.getAddress(),
  );
  await vaultFactory.waitForDeployment();

  const Vault = await ethers.getContractFactory("AliveVault");
  const vault: any = await Vault.deploy(
    deployer.address,
    assetIds.tusdc,
    await assetRegistry.getAddress(),
    await policyRegistry.getAddress(),
    await verifier.getAddress(),
    await router.getAddress(),
    await eligibilityRegistry.getAddress(),
  );
  await vault.waitForDeployment();

  if (isLocal && localEligibilitySigner) {
    console.log(
      "Publishing local demo eligibility verdicts (ELIGIBLE, 1h validity) for every demo asset...",
    );
    const eligibilityRegistryAddress = await eligibilityRegistry.getAddress();
    const eligibilityDomain = {
      name: "ALIVE Eligibility Gateway",
      version: "1",
      chainId: chain.chainId,
      verifyingContract: eligibilityRegistryAddress,
    };
    const eligibilityTypes = {
      EligibilityAttestation: [
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
    };
    const nowSeconds = Math.floor(Date.now() / 1_000);
    let nonceCounter = 0;
    for (const [key] of tokenDefinitions) {
      nonceCounter += 1;
      const attestation = {
        assetIdHash: assetIds[key]!,
        eligible: true,
        reasonHash: hashLabel(`demo-eligible:${key}`),
        passportHash: hashLabel(`demo-passport:${key}`),
        marketSnapshotHash: hashLabel(`demo-snapshot:${key}`),
        policyHash: hashLabel("demo-eligibility-policy-v1"),
        issuedAt: nowSeconds,
        validUntil: nowSeconds + 3_600,
        nonce: hashLabel(`demo-eligibility-nonce:${key}:${nonceCounter}`),
      };
      const signature = await localEligibilitySigner.signTypedData(
        eligibilityDomain,
        eligibilityTypes,
        attestation,
      );
      await (
        await eligibilityRegistry.publishEligibility(attestation, signature)
      ).wait();
    }
  } else {
    console.log(
      "Skipping automatic eligibility publication (not local): every demo asset starts NOT ELIGIBLE until ALIVE's intelligence service publishes a signed verdict for it.",
    );
  }

  const classLimits = demoPolicyFixture.policy.assetClassLimits
    .map((limit) => ({
      assetClass: hashLabel(limit.assetClass),
      minimumBps: limit.minimumBps,
      maximumBps: limit.maximumBps,
    }))
    .sort((left, right) =>
      BigInt(left.assetClass) < BigInt(right.assetClass) ? -1 : 1,
    );
  const canonicalPolicyHash = demoPolicyFixture.policyHash;
  const policyTransaction = await policyRegistry.registerPolicy(
    await vault.getAddress(),
    {
      policyHash: canonicalPolicyHash,
      maximumSingleAssetBps: demoPolicyFixture.policy.maximumSingleAssetBps,
      maximumSingleIssuerBps: demoPolicyFixture.policy.maximumSingleIssuerBps,
      minimumCashBps: demoPolicyFixture.policy.minimumCashBps,
      maximumSlippageBps: demoPolicyFixture.policy.maximumSlippageBps,
      maximumPriceAgeSeconds: demoPolicyFixture.policy.maximumPriceAgeSeconds,
      approvalMode: 0,
      allowlistEnabled: false,
    },
    classLimits,
    [],
    [],
  );
  await policyTransaction.wait();
  await (await vault.activatePolicy(1)).wait();

  const contracts: Record<string, DeploymentEntry> = {
    AliveRwaAssetRegistry: await deploymentEntry(assetRegistry),
    AlivePolicyRegistry: await deploymentEntry(policyRegistry),
    AliveStrategyVerifier: await deploymentEntry(verifier),
    AliveEligibilityRegistry: await deploymentEntry(eligibilityRegistry),
    AliveVaultFactory: await deploymentEntry(vaultFactory),
    AliveVault: await deploymentEntry(vault),
    MockRwaRouter: await deploymentEntry(router),
    DemoRwaFaucet: await deploymentEntry(faucet),
  };
  for (const [key, token] of Object.entries(tokens)) {
    contracts[`MockRwaToken:${key}`] = await deploymentEntry(token);
  }

  const exportData = {
    protocol: "ALIVE RWA Policy Vault V1",
    demoOnly: true,
    network: network.name,
    chainId: Number(chain.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    strategySigner,
    eligibilitySigner: eligibilitySignerAddress,
    activePolicyVersion: 1,
    canonicalPolicyHash,
    assetIds,
    contracts,
  };
  const outputDirectory = path.resolve(__dirname, "../deployments");
  const outputPath = path.join(
    outputDirectory,
    `rwa-${chain.chainId.toString()}.json`,
  );
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
  console.log(`RWA deployment export written to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
