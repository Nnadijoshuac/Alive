import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

type Position = { assetId: string; balance: bigint };
type MarketQuote = {
  assetId: string;
  priceInCashE6: bigint;
  updatedAt: bigint;
};
type Trade = {
  assetIn: string;
  assetOut: string;
  amountIn: bigint;
  quotedAmountOut: bigint;
  minimumAmountOut: bigint;
};
type ExecutionPlan = {
  trades: Trade[];
  beforePositions: Position[];
  afterPositions: Position[];
  marketQuotes: MarketQuote[];
};
type Strategy = {
  vault: string;
  policyHash: string;
  portfolioBeforeHash: string;
  portfolioAfterHash: string;
  marketSnapshotHash: string;
  executionPlanHash: string;
  strategyNonce: string;
  marketTimestamp: bigint;
  issuedAt: number;
  expiresAt: number;
};

type AssetIds = {
  cash: string;
  tTB1: string;
  tTB2: string;
  tTB3: string;
  tGOLD: string;
  tSP500: string;
  tNVDA: string;
  tAAPL: string;
  tNOPE: string;
};

type EligibilityAttestation = {
  assetIdHash: string;
  eligible: boolean;
  reasonHash: string;
  passportHash: string;
  marketSnapshotHash: string;
  policyHash: string;
  issuedAt: number;
  validUntil: number;
  nonce: string;
};

const ELIGIBILITY_TYPES = {
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

const STRATEGY_TYPES = {
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
};

const UNIT = 10n ** 6n;
const amount = (units: number | bigint): bigint => BigInt(units) * UNIT;
const hashLabel = (value: string): string =>
  ethers.keccak256(ethers.toUtf8Bytes(value));
const sortIds = (values: string[]): string[] =>
  [...values].sort((left, right) =>
    BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0,
  );

const CLASSES = {
  CASH: hashLabel("CASH"),
  TREASURY: hashLabel("TREASURY"),
  GOLD: hashLabel("GOLD"),
  EQUITY: hashLabel("EQUITY"),
};

const POLICY_HASH = hashLabel("alive-canonical-policy-v1");

let eligibilityNonceSequence = 0;

/** Publishes a currently-eligible verdict for assetIdHash, signed by
 * eligibilitySigner, so existing portfolio/strategy tests can hold the
 * asset without themselves being about eligibility. */
async function publishEligible(
  eligibilityRegistry: any,
  eligibilitySigner: { signTypedData: (...args: any[]) => Promise<string> },
  registryAddress: string,
  assetIdHash: string,
  overrides: Partial<EligibilityAttestation> = {},
): Promise<void> {
  eligibilityNonceSequence += 1;
  const now = await time.latest();
  const attestation: EligibilityAttestation = {
    assetIdHash,
    eligible: true,
    reasonHash: hashLabel("reasons:ok"),
    passportHash: hashLabel(`passport:${assetIdHash}`),
    marketSnapshotHash: hashLabel(`snapshot:${assetIdHash}`),
    policyHash: hashLabel("eligibility-policy-v1"),
    issuedAt: now,
    validUntil: now + 3_600,
    nonce: hashLabel(`eligibility-nonce-${eligibilityNonceSequence}`),
    ...overrides,
  };
  const network = await ethers.provider.getNetwork();
  const signature = await eligibilitySigner.signTypedData(
    {
      name: "ALIVE Eligibility Gateway",
      version: "1",
      chainId: network.chainId,
      verifyingContract: registryAddress,
    },
    ELIGIBILITY_TYPES,
    attestation,
  );
  await eligibilityRegistry.publishEligibility(attestation, signature);
}

async function deployRwaFixture() {
  const signers = await ethers.getSigners();
  const deployer = signers[0]!;
  const strategySigner = signers[1]!;
  const user = signers[2]!;
  const automation = signers[3]!;
  const attacker = signers[4]!;
  const wrongSigner = signers[5]!;
  const eligibilitySigner = signers[6]!;

  const Cash = await ethers.getContractFactory("MockUSDT");
  const cash: any = await Cash.deploy(deployer.address);
  await cash.waitForDeployment();

  const Token = await ethers.getContractFactory("MockRwaToken");
  const tokenSpecs = [
    ["Treasury Demo One", "tTB1", "TREASURY", "issuer-treasury-1"],
    ["Treasury Demo Two", "tTB2", "TREASURY", "issuer-treasury-2"],
    ["Treasury Demo Three", "tTB3", "TREASURY", "issuer-treasury-3"],
    ["Gold Demo", "tGOLD", "GOLD", "issuer-gold"],
    ["S&P 500 Demo", "tSP500", "EQUITY", "issuer-equity-basket"],
    ["Nvidia Demo", "tNVDA", "EQUITY", "issuer-equity-basket"],
    ["Apple Demo", "tAAPL", "EQUITY", "issuer-equity-basket"],
    ["Unapproved Equity Demo", "tNOPE", "EQUITY", "issuer-unapproved"],
  ] as const;
  const tokens: Record<string, any> = { cash };
  for (const [name, symbol] of tokenSpecs) {
    const token: any = await Token.deploy(name, symbol, deployer.address);
    await token.waitForDeployment();
    tokens[symbol] = token;
  }

  const AssetRegistry = await ethers.getContractFactory(
    "AliveRwaAssetRegistry",
  );
  const assetRegistry: any = await AssetRegistry.deploy(deployer.address);
  await assetRegistry.waitForDeployment();

  const assetIds: AssetIds = {
    cash: hashLabel("asset:tUSDC"),
    tTB1: hashLabel("asset:tTB1"),
    tTB2: hashLabel("asset:tTB2"),
    tTB3: hashLabel("asset:tTB3"),
    tGOLD: hashLabel("asset:tGOLD"),
    tSP500: hashLabel("asset:tSP500"),
    tNVDA: hashLabel("asset:tNVDA"),
    tAAPL: hashLabel("asset:tAAPL"),
    tNOPE: hashLabel("asset:tNOPE"),
  };
  await assetRegistry.registerAsset(
    assetIds.cash,
    await cash.getAddress(),
    CLASSES.CASH,
    hashLabel("issuer-cash"),
    hashLabel("metadata:tUSDC"),
    hashLabel("provenance:tUSDC"),
  );
  for (const [name, symbol, assetClass, issuer] of tokenSpecs) {
    const id = assetIds[symbol];
    await assetRegistry.registerAsset(
      id,
      await tokens[symbol].getAddress(),
      CLASSES[assetClass],
      hashLabel(issuer),
      hashLabel(`metadata:${name}`),
      hashLabel(`provenance:${name}`),
    );
  }

  const Router = await ethers.getContractFactory("MockRwaRouter");
  const router: any = await Router.deploy(
    await cash.getAddress(),
    deployer.address,
  );
  await router.waitForDeployment();
  const rwaTokens = tokenSpecs.map(([, symbol]) => tokens[symbol]);
  await router.setPrices(
    await Promise.all(rwaTokens.map((token) => token.getAddress())),
    rwaTokens.map(() => UNIT),
  );

  await cash.mint(user.address, amount(50_000));
  await cash.mint(await router.getAddress(), amount(1_000_000));
  for (const token of rwaTokens) {
    await token.mint(await router.getAddress(), amount(1_000_000));
  }

  const Verifier = await ethers.getContractFactory("AliveStrategyVerifier");
  const verifier: any = await Verifier.deploy(
    strategySigner.address,
    deployer.address,
  );
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
    eligibilitySigner.address,
    deployer.address,
  );
  await eligibilityRegistry.waitForDeployment();
  const eligibilityRegistryAddress = await eligibilityRegistry.getAddress();
  for (const [, symbol] of tokenSpecs) {
    if (symbol === "tNOPE") continue; // stays deliberately ineligible
    await publishEligible(
      eligibilityRegistry,
      eligibilitySigner,
      eligibilityRegistryAddress,
      assetIds[symbol],
    );
  }

  const Vault = await ethers.getContractFactory("AliveVault");
  const vault: any = await Vault.deploy(
    user.address,
    assetIds.cash,
    await assetRegistry.getAddress(),
    await policyRegistry.getAddress(),
    await verifier.getAddress(),
    await router.getAddress(),
    eligibilityRegistryAddress,
  );
  await vault.waitForDeployment();

  const allowedAssets = sortIds([
    assetIds.cash,
    ...tokenSpecs
      .filter(([, symbol]) => symbol !== "tNOPE")
      .map(([, symbol]) => assetIds[symbol]),
  ]);
  const classLimits = [
    { assetClass: CLASSES.CASH, minimumBps: 1_000, maximumBps: 3_000 },
    {
      assetClass: CLASSES.TREASURY,
      minimumBps: 5_000,
      maximumBps: 8_000,
    },
    { assetClass: CLASSES.GOLD, minimumBps: 500, maximumBps: 2_000 },
    { assetClass: CLASSES.EQUITY, minimumBps: 0, maximumBps: 2_000 },
  ].sort((left, right) =>
    BigInt(left.assetClass) < BigInt(right.assetClass) ? -1 : 1,
  );
  const policyInput = {
    policyHash: POLICY_HASH,
    maximumSingleAssetBps: 2_000,
    maximumSingleIssuerBps: 2_500,
    minimumCashBps: 1_000,
    maximumSlippageBps: 100,
    maximumPriceAgeSeconds: 120,
    approvalMode: 0,
    allowlistEnabled: true,
  };
  await policyRegistry
    .connect(user)
    .registerPolicy(
      await vault.getAddress(),
      policyInput,
      classLimits,
      allowedAssets,
      [],
    );
  await vault.connect(user).activatePolicy(1);
  await cash.connect(user).approve(await vault.getAddress(), amount(10_000));
  await vault.connect(user).depositCash(amount(10_000));

  return {
    deployer,
    strategySigner,
    user,
    automation,
    attacker,
    wrongSigner,
    eligibilitySigner,
    cash,
    tokens,
    assetIds,
    assetRegistry,
    policyRegistry,
    verifier,
    router,
    eligibilityRegistry,
    vault,
    classLimits,
    allowedAssets,
    policyInput,
  };
}

function positionsFrom(balances: Record<string, bigint>): Position[] {
  return Object.entries(balances)
    .filter(([, balance]) => balance > 0n)
    .map(([assetId, balance]) => ({ assetId, balance }))
    .sort((left, right) =>
      BigInt(left.assetId) < BigInt(right.assetId) ? -1 : 1,
    );
}

async function makeTrade(
  fixture: Awaited<ReturnType<typeof deployRwaFixture>>,
  assetIn: string,
  assetOut: string,
  amountIn: bigint,
): Promise<Trade> {
  const input = await fixture.assetRegistry.getAsset(assetIn);
  const output = await fixture.assetRegistry.getAsset(assetOut);
  const quotedAmountOut = await fixture.router.quote(
    input.token,
    output.token,
    amountIn,
  );
  return {
    assetIn,
    assetOut,
    amountIn,
    quotedAmountOut,
    minimumAmountOut: quotedAmountOut,
  };
}

async function buildPlan(
  fixture: Awaited<ReturnType<typeof deployRwaFixture>>,
  beforeBalances: Record<string, bigint>,
  afterBalances: Record<string, bigint>,
  tradeInputs: Array<[string, string, bigint]>,
): Promise<ExecutionPlan> {
  const trades = await Promise.all(
    tradeInputs.map(([assetIn, assetOut, amountIn]) =>
      makeTrade(fixture, assetIn, assetOut, amountIn),
    ),
  );
  const beforePositions = positionsFrom(beforeBalances);
  const afterPositions = positionsFrom(afterBalances);
  const ids = sortIds(
    Array.from(
      new Set([
        ...beforePositions.map(({ assetId }) => assetId),
        ...afterPositions.map(({ assetId }) => assetId),
        ...trades.flatMap(({ assetIn, assetOut }) => [assetIn, assetOut]),
      ]),
    ),
  );
  const marketQuotes: MarketQuote[] = [];
  for (const assetId of ids) {
    const asset = await fixture.assetRegistry.getAsset(assetId);
    const [priceInCashE6, updatedAt] = await fixture.router.getPrice(
      asset.token,
    );
    marketQuotes.push({ assetId, priceInCashE6, updatedAt });
  }
  return { trades, beforePositions, afterPositions, marketQuotes };
}

function initialBalances(
  fixture: Awaited<ReturnType<typeof deployRwaFixture>>,
): Record<string, bigint> {
  return { [fixture.assetIds.cash]: amount(10_000) };
}

function compliantBalances(
  fixture: Awaited<ReturnType<typeof deployRwaFixture>>,
): Record<string, bigint> {
  const ids = fixture.assetIds;
  return {
    [ids.cash]: amount(1_500),
    [ids.tTB1]: amount(2_000),
    [ids.tTB2]: amount(2_000),
    [ids.tTB3]: amount(1_000),
    [ids.tGOLD]: amount(1_500),
    [ids.tSP500]: amount(1_000),
    [ids.tNVDA]: amount(500),
    [ids.tAAPL]: amount(500),
  };
}

async function compliantInitialPlan(
  fixture: Awaited<ReturnType<typeof deployRwaFixture>>,
): Promise<ExecutionPlan> {
  const ids = fixture.assetIds;
  return buildPlan(
    fixture,
    initialBalances(fixture),
    compliantBalances(fixture),
    [
      [ids.cash, ids.tTB1, amount(2_000)],
      [ids.cash, ids.tTB2, amount(2_000)],
      [ids.cash, ids.tTB3, amount(1_000)],
      [ids.cash, ids.tGOLD, amount(1_500)],
      [ids.cash, ids.tSP500, amount(1_000)],
      [ids.cash, ids.tNVDA, amount(500)],
      [ids.cash, ids.tAAPL, amount(500)],
    ],
  );
}

let nonceSequence = 0;

async function makeSignedStrategy(
  fixture: Awaited<ReturnType<typeof deployRwaFixture>>,
  plan: ExecutionPlan,
  overrides: Partial<Strategy> = {},
  signer = fixture.strategySigner,
): Promise<{ strategy: Strategy; signature: string }> {
  nonceSequence += 1;
  const now = await time.latest();
  const strategy: Strategy = {
    vault: await fixture.vault.getAddress(),
    policyHash: POLICY_HASH,
    portfolioBeforeHash: await fixture.vault.hashPortfolio(
      plan.beforePositions,
    ),
    portfolioAfterHash: await fixture.vault.hashPortfolio(plan.afterPositions),
    marketSnapshotHash: await fixture.vault.hashMarketSnapshot(
      plan.marketQuotes,
    ),
    executionPlanHash: await fixture.vault.hashExecutionPlan(plan),
    strategyNonce: hashLabel(`strategy-nonce-${nonceSequence}`),
    marketTimestamp: plan.marketQuotes.reduce(
      (oldest, quote) => (quote.updatedAt < oldest ? quote.updatedAt : oldest),
      plan.marketQuotes[0]!.updatedAt,
    ),
    issuedAt: now,
    expiresAt: now + 60,
    ...overrides,
  };
  const network = await ethers.provider.getNetwork();
  const signature = await signer.signTypedData(
    {
      name: "ALIVE RWA Strategy",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await fixture.verifier.getAddress(),
    },
    STRATEGY_TYPES,
    strategy,
  );
  return { strategy, signature };
}

describe("ALIVE RWA registries", function () {
  it("registers only owner-approved, unique six-decimal assets with provenance", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const nvda = await fixture.assetRegistry.getAsset(fixture.assetIds.tNVDA);
    expect(nvda.token).to.equal(await fixture.tokens.tNVDA.getAddress());
    expect(nvda.assetClass).to.equal(CLASSES.EQUITY);
    expect(nvda.metadataHash).not.to.equal(ethers.ZeroHash);
    expect(nvda.provenanceHash).not.to.equal(ethers.ZeroHash);
    expect(nvda.enabled).to.equal(true);

    const LegacyToken = await ethers.getContractFactory(
      "ConfigurableFailureToken",
    );
    const eighteenDecimalToken: any = await LegacyToken.deploy(
      fixture.deployer.address,
      amount(1),
    );
    await expect(
      fixture.assetRegistry.registerAsset(
        hashLabel("asset:18-decimals"),
        await eighteenDecimalToken.getAddress(),
        CLASSES.EQUITY,
        hashLabel("issuer"),
        hashLabel("metadata"),
        hashLabel("provenance"),
      ),
    ).to.be.revertedWithCustomError(
      fixture.assetRegistry,
      "UnsupportedTokenDecimals",
    );
    await expect(
      fixture.assetRegistry
        .connect(fixture.attacker)
        .setAssetEnabled(fixture.assetIds.tNVDA, false),
    ).to.be.revertedWithCustomError(
      fixture.assetRegistry,
      "OwnableUnauthorizedAccount",
    );
  });

  it("creates immutable vault-bound policy versions and rejects unauthorized changes", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const policy = await fixture.policyRegistry.getPolicy(
      await fixture.vault.getAddress(),
      1,
    );
    expect(policy.owner).to.equal(fixture.user.address);
    expect(policy.policyHash).to.equal(POLICY_HASH);
    expect(policy.version).to.equal(1n);
    expect(policy.maximumSingleAssetBps).to.equal(2_000n);
    expect(policy.enforceablePolicyHash).not.to.equal(ethers.ZeroHash);

    await expect(
      fixture.policyRegistry
        .connect(fixture.attacker)
        .registerPolicy(
          await fixture.vault.getAddress(),
          { ...fixture.policyInput, policyHash: hashLabel("attacker-policy") },
          fixture.classLimits,
          fixture.allowedAssets,
          [],
        ),
    ).to.be.revertedWithCustomError(
      fixture.policyRegistry,
      "UnauthorizedPolicyManager",
    );

    await fixture.policyRegistry
      .connect(fixture.user)
      .registerPolicy(
        await fixture.vault.getAddress(),
        { ...fixture.policyInput, policyHash: hashLabel("policy-v2") },
        fixture.classLimits,
        fixture.allowedAssets,
        [],
      );
    expect(
      await fixture.policyRegistry.latestVersion(
        await fixture.vault.getAddress(),
      ),
    ).to.equal(2n);
    expect(
      (
        await fixture.policyRegistry.getPolicy(
          await fixture.vault.getAddress(),
          1,
        )
      ).policyHash,
    ).to.equal(POLICY_HASH);
  });

  it("rejects mathematically impossible class minima and conflicting asset rules", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const impossible = [
      { assetClass: CLASSES.TREASURY, minimumBps: 6_000, maximumBps: 8_000 },
      { assetClass: CLASSES.GOLD, minimumBps: 5_000, maximumBps: 6_000 },
    ].sort((left, right) =>
      BigInt(left.assetClass) < BigInt(right.assetClass) ? -1 : 1,
    );
    await expect(
      fixture.policyRegistry
        .connect(fixture.user)
        .registerPolicy(
          await fixture.vault.getAddress(),
          { ...fixture.policyInput, policyHash: hashLabel("impossible") },
          impossible,
          fixture.allowedAssets,
          [],
        ),
    ).to.be.revertedWithCustomError(
      fixture.policyRegistry,
      "TotalClassMinimumTooHigh",
    );

    const conflicted = fixture.allowedAssets[0]!;
    await expect(
      fixture.policyRegistry
        .connect(fixture.user)
        .registerPolicy(
          await fixture.vault.getAddress(),
          { ...fixture.policyInput, policyHash: hashLabel("conflict") },
          fixture.classLimits,
          fixture.allowedAssets,
          [conflicted],
        ),
    ).to.be.revertedWithCustomError(fixture.policyRegistry, "AssetConflict");
  });

  it("supports an explicit denylist when a policy does not use an allowlist", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    await fixture.policyRegistry.connect(fixture.user).registerPolicy(
      await fixture.vault.getAddress(),
      {
        ...fixture.policyInput,
        policyHash: hashLabel("denylist-policy"),
        allowlistEnabled: false,
      },
      fixture.classLimits,
      [],
      [fixture.assetIds.tNOPE],
    );
    expect(
      await fixture.policyRegistry.isAssetAllowed(
        await fixture.vault.getAddress(),
        2,
        fixture.assetIds.tNOPE,
      ),
    ).to.equal(false);
    expect(
      await fixture.policyRegistry.isAssetAllowed(
        await fixture.vault.getAddress(),
        2,
        fixture.assetIds.tNVDA,
      ),
    ).to.equal(true);
  });
});

describe("AliveVaultFactory", function () {
  it("creates a configured vault owned directly by the caller", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const Factory = await ethers.getContractFactory("AliveVaultFactory");
    const factory: any = await Factory.deploy(
      fixture.assetIds.cash,
      await fixture.assetRegistry.getAddress(),
      await fixture.policyRegistry.getAddress(),
      await fixture.verifier.getAddress(),
      await fixture.router.getAddress(),
      await fixture.eligibilityRegistry.getAddress(),
    );
    await factory.waitForDeployment();

    await expect(factory.connect(fixture.attacker).createVault())
      .to.emit(factory, "VaultCreated")
      .withArgs(fixture.attacker.address, anyValue, 0n);
    const vaultAddress = await factory.vaultAt(0);
    const vault: any = await ethers.getContractAt("AliveVault", vaultAddress);

    expect(await vault.owner()).to.equal(fixture.attacker.address);
    expect(await vault.cashAssetId()).to.equal(fixture.assetIds.cash);
    expect(await vault.assetRegistry()).to.equal(
      await fixture.assetRegistry.getAddress(),
    );
    expect(await factory.ownerVaultAt(fixture.attacker.address, 0)).to.equal(
      vaultAddress,
    );
    expect(await factory.isFactoryVault(vaultAddress)).to.equal(true);
  });
});

describe("DemoRwaFaucet", function () {
  it("issues one fixed synthetic cash allotment per address", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const Faucet = await ethers.getContractFactory("DemoRwaFaucet");
    const faucet: any = await Faucet.deploy(
      await fixture.cash.getAddress(),
      amount(10_000),
      fixture.deployer.address,
    );
    await faucet.waitForDeployment();
    await fixture.cash.mint(await faucet.getAddress(), amount(20_000));

    await expect(faucet.connect(fixture.attacker).claim())
      .to.emit(faucet, "DemoCashClaimed")
      .withArgs(fixture.attacker.address, amount(10_000));
    expect(await fixture.cash.balanceOf(fixture.attacker.address)).to.equal(
      amount(10_000),
    );
    await expect(
      faucet.connect(fixture.attacker).claim(),
    ).to.be.revertedWithCustomError(faucet, "AlreadyClaimed");
  });
});

describe("MockRwaRouter demo freshness", function () {
  it("lets any demo user refresh timestamps without changing prices", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const tokenAddress = await fixture.tokens.tNVDA.getAddress();
    const before = await fixture.router.getPrice(tokenAddress);

    await time.increase(180);
    await fixture.router
      .connect(fixture.attacker)
      .refreshPriceTimestamps([tokenAddress]);

    const after = await fixture.router.getPrice(tokenAddress);
    expect(after.priceInCashE6).to.equal(before.priceInCashE6);
    expect(after.updatedAt).to.be.greaterThan(before.updatedAt);
  });
});

describe("AliveVault onchain enforcement", function () {
  it("matches the documented offchain tuple encodings for every plan commitment", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const plan = await compliantInitialPlan(fixture);
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const portfolioHash = ethers.keccak256(
      coder.encode(
        ["tuple(bytes32 assetId,uint256 balance)[]"],
        [plan.beforePositions],
      ),
    );
    const afterHash = ethers.keccak256(
      coder.encode(
        ["tuple(bytes32 assetId,uint256 balance)[]"],
        [plan.afterPositions],
      ),
    );
    const marketHash = ethers.keccak256(
      coder.encode(
        ["tuple(bytes32 assetId,uint256 priceInCashE6,uint64 updatedAt)[]"],
        [plan.marketQuotes],
      ),
    );
    const tradesHash = ethers.keccak256(
      coder.encode(
        [
          "tuple(bytes32 assetIn,bytes32 assetOut,uint256 amountIn,uint256 quotedAmountOut,uint256 minimumAmountOut)[]",
        ],
        [plan.trades],
      ),
    );
    const planHash = ethers.keccak256(
      coder.encode(
        ["address", "bytes32", "bytes32", "bytes32", "bytes32"],
        [
          await fixture.router.getAddress(),
          tradesHash,
          portfolioHash,
          afterHash,
          marketHash,
        ],
      ),
    );
    expect(await fixture.vault.hashPortfolio(plan.beforePositions)).to.equal(
      portfolioHash,
    );
    expect(await fixture.vault.hashPortfolio(plan.afterPositions)).to.equal(
      afterHash,
    );
    expect(await fixture.vault.hashMarketSnapshot(plan.marketQuotes)).to.equal(
      marketHash,
    );
    expect(await fixture.vault.hashTrades(plan.trades)).to.equal(tradesHash);
    expect(await fixture.vault.hashExecutionPlan(plan)).to.equal(planHash);
  });

  it("allocates a funded vault into a compliant RWA portfolio", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const plan = await compliantInitialPlan(fixture);
    const { strategy, signature } = await makeSignedStrategy(fixture, plan);
    const digest = await fixture.verifier.hashStrategy(strategy);

    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(plan, strategy, signature),
    )
      .to.emit(fixture.vault, "StrategyExecuted")
      .withArgs(
        digest,
        strategy.strategyNonce,
        1,
        strategy.portfolioBeforeHash,
        strategy.portfolioAfterHash,
        strategy.executionPlanHash,
      );
    expect(
      await fixture.tokens.tTB1.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(amount(2_000));
    expect(
      await fixture.cash.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(amount(1_500));
    expect(
      await fixture.verifier.isNonceConsumed(
        await fixture.vault.getAddress(),
        strategy.strategyNonce,
      ),
    ).to.equal(true);
  });

  it("rejects a strategy into an asset ALIVE has marked RESTRICTED, then accepts it once ELIGIBLE again", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const ids = fixture.assetIds;
    const registryAddress = await fixture.eligibilityRegistry.getAddress();

    // ALIVE detects a rule violation (e.g. stale NAV) for tGOLD and
    // publishes a RESTRICTED verdict superseding the fixture's default
    // ELIGIBLE one.
    await publishEligible(
      fixture.eligibilityRegistry,
      fixture.eligibilitySigner,
      registryAddress,
      ids.tGOLD,
      { eligible: false, reasonHash: hashLabel("reasons:nav-stale") },
    );

    // A fully diversified, otherwise-compliant allocation (the same one
    // "allocates a funded vault into a compliant RWA portfolio" proves
    // succeeds on its own) that happens to include tGOLD.
    const plan = await compliantInitialPlan(fixture);
    const restricted = await makeSignedStrategy(fixture, plan);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(plan, restricted.strategy, restricted.signature),
    )
      .to.be.revertedWithCustomError(fixture.vault, "AssetNotEligible")
      .withArgs(ids.tGOLD);
    expect(
      await fixture.tokens.tGOLD.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(0n);
    expect(
      await fixture.verifier.isNonceConsumed(
        await fixture.vault.getAddress(),
        restricted.strategy.strategyNonce,
      ),
    ).to.equal(false);

    // ALIVE re-evaluates, NAV data is fresh again, publishes ELIGIBLE. The
    // vault's balances never changed (the prior call reverted), so the
    // exact same plan can be resubmitted with a freshly signed strategy.
    await publishEligible(
      fixture.eligibilityRegistry,
      fixture.eligibilitySigner,
      registryAddress,
      ids.tGOLD,
    );
    const recovered = await makeSignedStrategy(fixture, plan);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(plan, recovered.strategy, recovered.signature),
    ).to.emit(fixture.vault, "StrategyExecuted");
    expect(
      await fixture.tokens.tGOLD.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(amount(1_500));
  });

  it("lets the owner always exit a position in an asset that has become RESTRICTED", async function () {
    // tNVDA (EQUITY, class minimum 0 bps) so a full exit doesn't also trip
    // an unrelated class-minimum violation -- this test is specifically
    // about the eligibility gate exempting full-exit trades, not about
    // policy class-limit interactions.
    const fixture = await loadFixture(deployRwaFixture);
    const ids = fixture.assetIds;
    const plan = await compliantInitialPlan(fixture);
    const { strategy, signature } = await makeSignedStrategy(fixture, plan);
    await fixture.vault
      .connect(fixture.user)
      .executeStrategy(plan, strategy, signature);
    expect(
      await fixture.tokens.tNVDA.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(amount(500));

    await publishEligible(
      fixture.eligibilityRegistry,
      fixture.eligibilitySigner,
      await fixture.eligibilityRegistry.getAddress(),
      ids.tNVDA,
      { eligible: false, reasonHash: hashLabel("reasons:issuer-flagged") },
    );

    const exitBalances = compliantBalances(fixture);
    delete exitBalances[ids.tNVDA];
    exitBalances[ids.cash] = (exitBalances[ids.cash] ?? 0n) + amount(500);
    const exitPlan = await buildPlan(
      fixture,
      compliantBalances(fixture),
      exitBalances,
      [[ids.tNVDA, ids.cash, amount(500)]],
    );
    const exit = await makeSignedStrategy(fixture, exitPlan);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(exitPlan, exit.strategy, exit.signature),
    ).to.emit(fixture.vault, "StrategyExecuted");
    expect(
      await fixture.tokens.tNVDA.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(0n);
  });

  it("rejects the killer-demo 100% NVDA strategy onchain and rolls every effect back", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const ids = fixture.assetIds;
    const plan = await buildPlan(
      fixture,
      initialBalances(fixture),
      { [ids.tNVDA]: amount(10_000) },
      [[ids.cash, ids.tNVDA, amount(10_000)]],
    );
    const { strategy, signature } = await makeSignedStrategy(fixture, plan);

    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(plan, strategy, signature),
    ).to.be.revertedWithCustomError(fixture.vault, "AssetAllocationExceeded");
    expect(
      await fixture.cash.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(amount(10_000));
    expect(
      await fixture.tokens.tNVDA.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(0n);
    expect(
      await fixture.verifier.isNonceConsumed(
        await fixture.vault.getAddress(),
        strategy.strategyNonce,
      ),
    ).to.equal(false);
  });

  it("rejects an unapproved output asset before the router can move funds", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const ids = fixture.assetIds;
    const plan = await buildPlan(
      fixture,
      initialBalances(fixture),
      {
        [ids.cash]: amount(8_000),
        [ids.tNOPE]: amount(2_000),
      },
      [[ids.cash, ids.tNOPE, amount(2_000)]],
    );
    const { strategy, signature } = await makeSignedStrategy(fixture, plan);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(plan, strategy, signature),
    )
      .to.be.revertedWithCustomError(fixture.vault, "AssetNotAllowed")
      .withArgs(ids.tNOPE);
  });

  it("rejects aggregate issuer concentration across separate assets", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const ids = fixture.assetIds;
    const after = {
      [ids.cash]: amount(1_000),
      [ids.tTB1]: amount(2_000),
      [ids.tTB2]: amount(2_000),
      [ids.tTB3]: amount(1_000),
      [ids.tGOLD]: amount(1_000),
      [ids.tSP500]: amount(1_000),
      [ids.tNVDA]: amount(1_000),
      [ids.tAAPL]: amount(1_000),
    };
    const plan = await buildPlan(
      fixture,
      initialBalances(fixture),
      after,
      Object.entries(after)
        .filter(([id]) => id !== ids.cash)
        .map(
          ([id, value]) => [ids.cash, id, value] as [string, string, bigint],
        ),
    );
    const { strategy, signature } = await makeSignedStrategy(fixture, plan);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(plan, strategy, signature),
    ).to.be.revertedWithCustomError(fixture.vault, "IssuerAllocationExceeded");
  });

  it("rejects a cash-floor violation independently of the frontend", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const ids = fixture.assetIds;
    const after = {
      [ids.cash]: amount(500),
      [ids.tTB1]: amount(2_000),
      [ids.tTB2]: amount(2_000),
      [ids.tTB3]: amount(2_000),
      [ids.tGOLD]: amount(1_500),
      [ids.tSP500]: amount(1_000),
      [ids.tNVDA]: amount(500),
      [ids.tAAPL]: amount(500),
    };
    const plan = await buildPlan(
      fixture,
      initialBalances(fixture),
      after,
      Object.entries(after)
        .filter(([id]) => id !== ids.cash)
        .map(
          ([id, value]) => [ids.cash, id, value] as [string, string, bigint],
        ),
    );
    const { strategy, signature } = await makeSignedStrategy(fixture, plan);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(plan, strategy, signature),
    ).to.be.revertedWithCustomError(fixture.vault, "CashFloorNotMet");
  });

  it("enforces asset-class minimums and policy-bounded slippage", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const ids = fixture.assetIds;
    const classInvalid = {
      [ids.cash]: amount(2_000),
      [ids.tTB1]: amount(2_000),
      [ids.tTB2]: amount(1_000),
      [ids.tTB3]: amount(1_000),
      [ids.tGOLD]: amount(2_000),
      [ids.tSP500]: amount(1_000),
      [ids.tNVDA]: amount(500),
      [ids.tAAPL]: amount(500),
    };
    const invalidPlan = await buildPlan(
      fixture,
      initialBalances(fixture),
      classInvalid,
      Object.entries(classInvalid)
        .filter(([id]) => id !== ids.cash)
        .map(
          ([id, value]) => [ids.cash, id, value] as [string, string, bigint],
        ),
    );
    const invalidSigned = await makeSignedStrategy(fixture, invalidPlan);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(
          invalidPlan,
          invalidSigned.strategy,
          invalidSigned.signature,
        ),
    ).to.be.revertedWithCustomError(
      fixture.vault,
      "ClassAllocationBelowMinimum",
    );

    const slippagePlan = await compliantInitialPlan(fixture);
    slippagePlan.trades[0]!.minimumAmountOut =
      (slippagePlan.trades[0]!.quotedAmountOut * 9_800n) / 10_000n;
    const slippageSigned = await makeSignedStrategy(fixture, slippagePlan);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(
          slippagePlan,
          slippageSigned.strategy,
          slippageSigned.signature,
        ),
    ).to.be.revertedWithCustomError(fixture.vault, "SlippageLimitViolated");
  });

  it("rejects stale router prices even when a proposal remains unexpired", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const plan = await compliantInitialPlan(fixture);
    const { strategy, signature } = await makeSignedStrategy(fixture, plan, {
      expiresAt: (await time.latest()) + 300,
    });
    await time.increase(121);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(plan, strategy, signature),
    ).to.be.revertedWithCustomError(fixture.vault, "PriceDataStale");
  });

  it("rejects expired proposals, wrong signers, wrong policies, and wrong vault bindings", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const plan = await compliantInitialPlan(fixture);
    const expiry = (await time.latest()) + 2;
    const expired = await makeSignedStrategy(fixture, plan, {
      expiresAt: expiry,
    });
    await time.increaseTo(expiry);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(plan, expired.strategy, expired.signature),
    ).to.be.revertedWithCustomError(fixture.verifier, "StrategyExpired");

    await fixture.router.setPrice(await fixture.cash.getAddress(), UNIT);
    const refreshedPlan = await compliantInitialPlan(fixture);
    const wrongSigner = await makeSignedStrategy(
      fixture,
      refreshedPlan,
      {},
      fixture.wrongSigner,
    );
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(
          refreshedPlan,
          wrongSigner.strategy,
          wrongSigner.signature,
        ),
    ).to.be.revertedWithCustomError(fixture.verifier, "WrongSigner");

    const wrongPolicy = await makeSignedStrategy(fixture, refreshedPlan, {
      policyHash: hashLabel("wrong-policy"),
    });
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(
          refreshedPlan,
          wrongPolicy.strategy,
          wrongPolicy.signature,
        ),
    ).to.be.revertedWithCustomError(fixture.verifier, "WrongCommitment");

    const Vault = await ethers.getContractFactory("AliveVault");
    const otherVault: any = await Vault.deploy(
      fixture.user.address,
      fixture.assetIds.cash,
      await fixture.assetRegistry.getAddress(),
      await fixture.policyRegistry.getAddress(),
      await fixture.verifier.getAddress(),
      await fixture.router.getAddress(),
      await fixture.eligibilityRegistry.getAddress(),
    );
    await otherVault.waitForDeployment();
    const wrongVault = await makeSignedStrategy(fixture, refreshedPlan, {
      vault: await otherVault.getAddress(),
    });
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(
          refreshedPlan,
          wrongVault.strategy,
          wrongVault.signature,
        ),
    ).to.be.revertedWithCustomError(fixture.verifier, "WrongVault");
  });

  it("prevents replay and double execution at the verifier nonce boundary", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const plan = await compliantInitialPlan(fixture);
    const { strategy, signature } = await makeSignedStrategy(fixture, plan);
    await fixture.vault
      .connect(fixture.user)
      .executeStrategy(plan, strategy, signature);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(plan, strategy, signature),
    ).to.be.revertedWithCustomError(
      fixture.verifier,
      "StrategyNonceAlreadyConsumed",
    );
  });

  it("executes a deterministic rebalance after NVDA appreciation creates drift", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const initialPlan = await compliantInitialPlan(fixture);
    const initialStrategy = await makeSignedStrategy(fixture, initialPlan);
    await fixture.vault
      .connect(fixture.user)
      .executeStrategy(
        initialPlan,
        initialStrategy.strategy,
        initialStrategy.signature,
      );

    await fixture.router.setPrice(
      await fixture.tokens.tNVDA.getAddress(),
      2n * UNIT,
    );
    const ids = fixture.assetIds;
    const before = compliantBalances(fixture);
    const after = {
      ...before,
      [ids.tNVDA]: amount(300),
      [ids.tTB3]: amount(1_400),
    };
    const rebalance = await buildPlan(fixture, before, after, [
      [ids.tNVDA, ids.cash, amount(200)],
      [ids.cash, ids.tTB3, amount(400)],
    ]);
    const signed = await makeSignedStrategy(fixture, rebalance);
    await expect(
      fixture.vault
        .connect(fixture.user)
        .executeStrategy(rebalance, signed.strategy, signed.signature),
    ).to.emit(fixture.vault, "StrategyExecuted");
    expect(
      await fixture.tokens.tNVDA.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(amount(300));
    expect(
      await fixture.tokens.tTB3.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(amount(1_400));
    expect(
      await fixture.cash.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(amount(1_500));
  });

  it("supports constrained Guarded Auto execution but not arbitrary callers", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    await fixture.policyRegistry.connect(fixture.user).registerPolicy(
      await fixture.vault.getAddress(),
      {
        ...fixture.policyInput,
        policyHash: hashLabel("guarded-policy"),
        approvalMode: 1,
      },
      fixture.classLimits,
      fixture.allowedAssets,
      [],
    );
    await fixture.vault.connect(fixture.user).activatePolicy(2);
    await fixture.vault
      .connect(fixture.user)
      .setGuardedExecutor(fixture.automation.address);
    const plan = await compliantInitialPlan(fixture);
    const signed = await makeSignedStrategy(fixture, plan, {
      policyHash: hashLabel("guarded-policy"),
    });
    await expect(
      fixture.vault
        .connect(fixture.attacker)
        .executeStrategy(plan, signed.strategy, signed.signature),
    ).to.be.revertedWithCustomError(fixture.vault, "GuardedExecutorRequired");
    await expect(
      fixture.vault
        .connect(fixture.automation)
        .executeStrategy(plan, signed.strategy, signed.signature),
    ).to.emit(fixture.vault, "StrategyExecuted");
  });

  it("requires the vault owner to submit every Advisory-mode execution", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    const plan = await compliantInitialPlan(fixture);
    const signed = await makeSignedStrategy(fixture, plan);
    await expect(
      fixture.vault
        .connect(fixture.automation)
        .executeStrategy(plan, signed.strategy, signed.signature),
    ).to.be.revertedWithCustomError(
      fixture.vault,
      "UnauthorizedAdvisoryExecution",
    );
  });

  it("keeps withdrawals owner-only and exact", async function () {
    const fixture = await loadFixture(deployRwaFixture);
    await expect(
      fixture.vault
        .connect(fixture.attacker)
        .withdraw(fixture.assetIds.cash, fixture.attacker.address, amount(1)),
    ).to.be.revertedWithCustomError(
      fixture.vault,
      "OwnableUnauthorizedAccount",
    );
    const before = await fixture.cash.balanceOf(fixture.user.address);
    await fixture.vault
      .connect(fixture.user)
      .withdraw(fixture.assetIds.cash, fixture.user.address, amount(1_000));
    expect(await fixture.cash.balanceOf(fixture.user.address)).to.equal(
      before + amount(1_000),
    );
  });
});

async function deployAdversarialCashVault(tokenName: string) {
  const signers = await ethers.getSigners();
  const deployer = signers[0]!;
  const signer = signers[1]!;
  const user = signers[2]!;
  const Token = await ethers.getContractFactory(tokenName);
  const token: any = await Token.deploy();
  await token.waitForDeployment();
  const AssetRegistry = await ethers.getContractFactory(
    "AliveRwaAssetRegistry",
  );
  const assets: any = await AssetRegistry.deploy(deployer.address);
  await assets.waitForDeployment();
  const cashId = hashLabel(`cash:${tokenName}`);
  await assets.registerAsset(
    cashId,
    await token.getAddress(),
    CLASSES.CASH,
    hashLabel("issuer:test"),
    hashLabel("metadata:test"),
    hashLabel("provenance:test"),
  );
  const Router = await ethers.getContractFactory("MockRwaRouter");
  const router: any = await Router.deploy(
    await token.getAddress(),
    deployer.address,
  );
  await router.waitForDeployment();
  const Verifier = await ethers.getContractFactory("AliveStrategyVerifier");
  const verifier: any = await Verifier.deploy(signer.address, deployer.address);
  await verifier.waitForDeployment();
  const PolicyRegistry = await ethers.getContractFactory("AlivePolicyRegistry");
  const policies: any = await PolicyRegistry.deploy(
    await assets.getAddress(),
    deployer.address,
  );
  await policies.waitForDeployment();
  const EligibilityRegistry = await ethers.getContractFactory(
    "AliveEligibilityRegistry",
  );
  const eligibility: any = await EligibilityRegistry.deploy(
    await assets.getAddress(),
    signer.address,
    deployer.address,
  );
  await eligibility.waitForDeployment();
  const Vault = await ethers.getContractFactory("AliveVault");
  const vault: any = await Vault.deploy(
    user.address,
    cashId,
    await assets.getAddress(),
    await policies.getAddress(),
    await verifier.getAddress(),
    await router.getAddress(),
    await eligibility.getAddress(),
  );
  await vault.waitForDeployment();
  await token.mint(user.address, amount(100));
  return { deployer, user, token, vault, cashId };
}

describe("AliveVault token safety", function () {
  it("rejects fee-on-transfer and false-return deposits atomically", async function () {
    const feeFixture = await deployAdversarialCashVault(
      "RwaFeeOnTransferToken",
    );
    await feeFixture.token
      .connect(feeFixture.user)
      .approve(await feeFixture.vault.getAddress(), amount(10));
    await expect(
      feeFixture.vault.connect(feeFixture.user).depositCash(amount(10)),
    ).to.be.revertedWithCustomError(
      feeFixture.vault,
      "UnsupportedTokenTransfer",
    );
    expect(
      await feeFixture.token.balanceOf(await feeFixture.vault.getAddress()),
    ).to.equal(0n);

    const falseFixture = await deployAdversarialCashVault(
      "RwaFalseReturnToken",
    );
    await falseFixture.token
      .connect(falseFixture.user)
      .approve(await falseFixture.vault.getAddress(), amount(10));
    await falseFixture.token.setFailures(false, true);
    await expect(
      falseFixture.vault.connect(falseFixture.user).depositCash(amount(10)),
    ).to.be.reverted;
    expect(
      await falseFixture.token.balanceOf(await falseFixture.vault.getAddress()),
    ).to.equal(0n);
  });

  it("blocks token callback reentrancy without blocking the outer deposit", async function () {
    const fixture = await deployAdversarialCashVault("RwaReentrantToken");
    await fixture.token
      .connect(fixture.user)
      .approve(await fixture.vault.getAddress(), amount(20));
    await fixture.token.configureHook(
      await fixture.vault.getAddress(),
      fixture.vault.interface.encodeFunctionData("depositCash", [amount(10)]),
    );
    await expect(fixture.vault.connect(fixture.user).depositCash(amount(10)))
      .not.to.be.reverted;
    expect(await fixture.token.lastHookSucceeded()).to.equal(false);
    expect(
      await fixture.token.balanceOf(await fixture.vault.getAddress()),
    ).to.equal(amount(10));
  });
});
