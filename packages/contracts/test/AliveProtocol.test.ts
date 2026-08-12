import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

type Attestation = {
  assetId: string;
  sessionId: string;
  subject: string;
  context: string;
  identityScore: number;
  livenessScore: number;
  integrityScore: number;
  verified: boolean;
  evidenceHash: string;
  issuedAt: number;
  expiresAt: number;
};

const ATTESTATION_TYPES = {
  Attestation: [
    { name: "assetId", type: "bytes32" },
    { name: "sessionId", type: "bytes32" },
    { name: "subject", type: "address" },
    { name: "context", type: "bytes32" },
    { name: "identityScore", type: "uint16" },
    { name: "livenessScore", type: "uint16" },
    { name: "integrityScore", type: "uint16" },
    { name: "verified", type: "bool" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
};

const hashLabel = (label: string): string =>
  ethers.keccak256(ethers.toUtf8Bytes(label));

const ASSET_ID = hashLabel("alive-asset-0001");
const FINGERPRINT_HASH = hashLabel("private-fingerprint-commitment");
const METADATA_HASH = hashLabel("asset-metadata");
const EVIDENCE_HASH = hashLabel("inspection-evidence");
const PAYMENT = 250n * 10n ** 6n;

let nextSession = 0;

async function deployProtocolFixture() {
  const signers = await ethers.getSigners();
  const deployer = signers[0]!;
  const verifier = signers[1]!;
  const seller = signers[2]!;
  const buyer = signers[3]!;
  const attacker = signers[4]!;
  const replacementVerifier = signers[5]!;

  const AssetRegistry = await ethers.getContractFactory(
    "AliveAssetRegistry",
  );
  const assetRegistry: any = await AssetRegistry.deploy();
  await assetRegistry.waitForDeployment();

  await assetRegistry
    .connect(seller)
    .registerAsset(
      ASSET_ID,
      FINGERPRINT_HASH,
      METADATA_HASH,
      "ipfs://public-metadata-only",
    );

  const AttestationRegistry = await ethers.getContractFactory(
    "AliveAttestationRegistry",
  );
  const attestationRegistry: any = await AttestationRegistry.deploy(
    await assetRegistry.getAddress(),
    verifier.address,
    deployer.address,
  );
  await attestationRegistry.waitForDeployment();

  const Escrow = await ethers.getContractFactory("AliveEscrow");
  const escrow: any = await Escrow.deploy(
    await assetRegistry.getAddress(),
    await attestationRegistry.getAddress(),
  );
  await escrow.waitForDeployment();
  await attestationRegistry.setAuthorizedConsumer(
    await escrow.getAddress(),
    true,
  );

  const TestToken = await ethers.getContractFactory("MockUSDT");
  const token: any = await TestToken.deploy(deployer.address);
  await token.waitForDeployment();
  await token.mint(buyer.address, 10_000n * 10n ** 6n);

  return {
    deployer,
    verifier,
    seller,
    buyer,
    attacker,
    replacementVerifier,
    assetRegistry,
    attestationRegistry,
    escrow,
    token,
  };
}

async function attestationDomain(registry: any) {
  const network = await ethers.provider.getNetwork();
  return {
    name: "Alive Protocol",
    version: "1",
    chainId: network.chainId,
    verifyingContract: await registry.getAddress(),
  };
}

async function signAttestation(
  fixture: Awaited<ReturnType<typeof deployProtocolFixture>>,
  attestation: Attestation,
  signer = fixture.verifier,
): Promise<string> {
  return signer.signTypedData(
    await attestationDomain(fixture.attestationRegistry),
    ATTESTATION_TYPES,
    attestation,
  );
}

async function makeAttestation(
  fixture: Awaited<ReturnType<typeof deployProtocolFixture>>,
  overrides: Partial<Attestation> = {},
): Promise<Attestation> {
  const now = await time.latest();
  nextSession += 1;
  return {
    assetId: ASSET_ID,
    sessionId: hashLabel(`session-${nextSession}`),
    subject: fixture.seller.address,
    context: ethers.ZeroHash,
    identityScore: 9_200,
    livenessScore: 8_900,
    integrityScore: 8_700,
    verified: true,
    evidenceHash: EVIDENCE_HASH,
    issuedAt: now,
    expiresAt: now + 600,
    ...overrides,
  };
}

async function createEscrow(
  fixture: Awaited<ReturnType<typeof deployProtocolFixture>>,
  options: {
    token?: any;
    assetId?: string;
    amount?: bigint;
    identityThreshold?: number;
    livenessThreshold?: number;
    expiresAt?: number;
  } = {},
): Promise<string> {
  const token = options.token ?? fixture.token;
  const assetId = options.assetId ?? ASSET_ID;
  const amount = options.amount ?? PAYMENT;
  const expiresAt = options.expiresAt ?? (await time.latest()) + 3_600;
  const args = [
    assetId,
    fixture.seller.address,
    await token.getAddress(),
    amount,
    options.identityThreshold ?? 8_500,
    options.livenessThreshold ?? 8_000,
    expiresAt,
  ] as const;
  const escrowId = await fixture.escrow
    .connect(fixture.buyer)
    .createEscrow.staticCall(...args);
  await fixture.escrow.connect(fixture.buyer).createEscrow(...args);
  return escrowId;
}

async function fundEscrow(
  fixture: Awaited<ReturnType<typeof deployProtocolFixture>>,
  escrowId: string,
  token: any = fixture.token,
  amount: bigint = PAYMENT,
): Promise<void> {
  await token
    .connect(fixture.buyer)
    .approve(await fixture.escrow.getAddress(), amount);
  await fixture.escrow.connect(fixture.buyer).fundEscrow(escrowId);
}

describe("AliveAssetRegistry", function () {
  it("registers a compact offchain commitment and emits its owner", async function () {
    const { assetRegistry, seller } = await loadFixture(deployProtocolFixture);
    const asset = await assetRegistry.getAsset(ASSET_ID);

    expect(asset.owner).to.equal(seller.address);
    expect(asset.fingerprintHash).to.equal(FINGERPRINT_HASH);
    expect(asset.metadataHash).to.equal(METADATA_HASH);
    expect(asset.metadataURI).to.equal("ipfs://public-metadata-only");
    expect(asset.registeredAt).to.be.greaterThan(0n);
    expect(await assetRegistry.assetExists(ASSET_ID)).to.equal(true);
  });

  it("rejects duplicate IDs and invalid commitments", async function () {
    const { assetRegistry, seller } = await loadFixture(deployProtocolFixture);

    await expect(
      assetRegistry
        .connect(seller)
        .registerAsset(
          ASSET_ID,
          hashLabel("new"),
          METADATA_HASH,
          "ipfs://other",
        ),
    )
      .to.be.revertedWithCustomError(
        assetRegistry,
        "AssetAlreadyRegistered",
      )
      .withArgs(ASSET_ID);

    await expect(
      assetRegistry
        .connect(seller)
        .registerAsset(
          hashLabel("new-id"),
          ethers.ZeroHash,
          METADATA_HASH,
          "",
        ),
    ).to.be.revertedWithCustomError(assetRegistry, "InvalidCommitment");
  });

  it("allows only the current owner to transfer an asset", async function () {
    const { assetRegistry, seller, attacker, buyer } =
      await loadFixture(deployProtocolFixture);

    await expect(
      assetRegistry.connect(attacker).transferAsset(ASSET_ID, buyer.address),
    ).to.be.revertedWithCustomError(assetRegistry, "NotAssetOwner");

    await expect(
      assetRegistry.connect(seller).transferAsset(ASSET_ID, buyer.address),
    )
      .to.emit(assetRegistry, "AssetOwnershipTransferred")
      .withArgs(ASSET_ID, seller.address, buyer.address);
    expect(await assetRegistry.assetOwner(ASSET_ID)).to.equal(buyer.address);
  });
});

describe("AliveAttestationRegistry", function () {
  it("matches the offchain EIP-712 digest and records a valid inspection", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const attestation = await makeAttestation(fixture);
    const signature = await signAttestation(fixture, attestation);
    const expectedDigest = ethers.TypedDataEncoder.hash(
      await attestationDomain(fixture.attestationRegistry),
      ATTESTATION_TYPES,
      attestation,
    );

    expect(
      await fixture.attestationRegistry.hashAttestation(attestation),
    ).to.equal(expectedDigest);
    await expect(
      fixture.attestationRegistry
        .connect(fixture.seller)
        .submitAttestation(attestation, signature),
    )
      .to.emit(fixture.attestationRegistry, "AssetVerified")
      .withArgs(
        ASSET_ID,
        attestation.sessionId,
        fixture.seller.address,
        ethers.ZeroHash,
        9_200,
        8_900,
        8_700,
        true,
        EVIDENCE_HASH,
        attestation.issuedAt,
        attestation.expiresAt,
        expectedDigest,
      );

    const record =
      await fixture.attestationRegistry.latestVerification(ASSET_ID);
    expect(record.digest).to.equal(expectedDigest);
    expect(record.identityScore).to.equal(9_200n);
    expect(
      await fixture.attestationRegistry.isSessionConsumed(
        attestation.sessionId,
      ),
    ).to.equal(true);
    expect(
      await fixture.attestationRegistry.verificationCount(ASSET_ID),
    ).to.equal(1n);
  });

  it("rejects the wrong signer and malformed signatures", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const attestation = await makeAttestation(fixture);
    const wrongSignature = await signAttestation(
      fixture,
      attestation,
      fixture.attacker,
    );

    await expect(
      fixture.attestationRegistry
        .connect(fixture.seller)
        .submitAttestation(attestation, wrongSignature),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "WrongSigner",
    );
    await expect(
      fixture.attestationRegistry
        .connect(fixture.seller)
        .submitAttestation(attestation, "0x1234"),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "InvalidSignature",
    );
  });

  it("rejects expired, future-issued, and overlong attestations", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const now = await time.latest();
    const expired = await makeAttestation(fixture, {
      issuedAt: now - 120,
      expiresAt: now - 1,
    });
    await expect(
      fixture.attestationRegistry
        .connect(fixture.seller)
        .submitAttestation(expired, await signAttestation(fixture, expired)),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "AttestationExpired",
    );

    const future = await makeAttestation(fixture, {
      issuedAt: now + 30,
      expiresAt: now + 300,
    });
    await expect(
      fixture.attestationRegistry
        .connect(fixture.seller)
        .submitAttestation(future, await signAttestation(fixture, future)),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "AttestationIssuedInFuture",
    );

    const overlong = await makeAttestation(fixture, {
      issuedAt: now,
      expiresAt: now + 86_401,
    });
    await expect(
      fixture.attestationRegistry
        .connect(fixture.seller)
        .submitAttestation(overlong, await signAttestation(fixture, overlong)),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "AttestationLifetimeTooLong",
    );
  });

  it("enforces global single-use session IDs", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const attestation = await makeAttestation(fixture);
    const signature = await signAttestation(fixture, attestation);
    await fixture.attestationRegistry
      .connect(fixture.seller)
      .submitAttestation(attestation, signature);

    await expect(
      fixture.attestationRegistry
        .connect(fixture.seller)
        .submitAttestation(attestation, signature),
    )
      .to.be.revertedWithCustomError(
        fixture.attestationRegistry,
        "SessionAlreadyConsumed",
      )
      .withArgs(attestation.sessionId);
  });

  it("bounds every score at 10,000 basis points", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    for (const field of [
      "identityScore",
      "livenessScore",
      "integrityScore",
    ] as const) {
      const attestation = await makeAttestation(fixture, { [field]: 10_001 });
      await expect(
        fixture.attestationRegistry
          .connect(fixture.seller)
          .submitAttestation(
            attestation,
            await signAttestation(fixture, attestation),
          ),
      )
        .to.be.revertedWithCustomError(
          fixture.attestationRegistry,
          "InvalidScore",
        )
        .withArgs(ethers.encodeBytes32String(field), 10_001);
    }
  });

  it("rejects unregistered assets and contextual proofs on the direct path", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const unknown = await makeAttestation(fixture, {
      assetId: hashLabel("not-registered"),
    });
    await expect(
      fixture.attestationRegistry
        .connect(fixture.seller)
        .submitAttestation(unknown, await signAttestation(fixture, unknown)),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "AssetNotRegistered",
    );

    const contextual = await makeAttestation(fixture, {
      context: hashLabel("some-context"),
    });
    await expect(
      fixture.attestationRegistry
        .connect(fixture.seller)
        .submitAttestation(
          contextual,
          await signAttestation(fixture, contextual),
        ),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "ContextConsumerRequired",
    );
  });

  it("prevents third-party pre-consumption and restricts consumer access", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const direct = await makeAttestation(fixture);
    await expect(
      fixture.attestationRegistry
        .connect(fixture.attacker)
        .submitAttestation(direct, await signAttestation(fixture, direct)),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "UnauthorizedSubject",
    );

    const contextual = await makeAttestation(fixture, {
      context: hashLabel("protected-context"),
    });
    await expect(
      fixture.attestationRegistry
        .connect(fixture.attacker)
        .consumeAttestation(
          contextual,
          await signAttestation(fixture, contextual),
        ),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "UnauthorizedConsumer",
    );
  });

  it("rotates the verifier under owner control", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    await expect(
      fixture.attestationRegistry
        .connect(fixture.attacker)
        .setAuthorizedVerifier(fixture.replacementVerifier.address),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "OwnableUnauthorizedAccount",
    );
    await fixture.attestationRegistry.setAuthorizedVerifier(
      fixture.replacementVerifier.address,
    );

    const attestation = await makeAttestation(fixture);
    const signature = await signAttestation(
      fixture,
      attestation,
      fixture.replacementVerifier,
    );
    await expect(
      fixture.attestationRegistry
        .connect(fixture.seller)
        .submitAttestation(attestation, signature),
    ).not.to.be.reverted;
  });
});

describe("AliveEscrow", function () {
  it("creates, funds, and releases payment with a matching proof", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const escrowId = await createEscrow(fixture);

    await expect(
      fixture.token
        .connect(fixture.buyer)
        .approve(await fixture.escrow.getAddress(), PAYMENT),
    ).not.to.be.reverted;
    await expect(
      fixture.escrow.connect(fixture.buyer).fundEscrow(escrowId),
    )
      .to.emit(fixture.escrow, "EscrowFunded")
      .withArgs(escrowId, fixture.buyer.address, PAYMENT);
    expect(
      await fixture.token.balanceOf(await fixture.escrow.getAddress()),
    ).to.equal(PAYMENT);

    const context = await fixture.escrow.escrowContext(escrowId);
    const attestation = await makeAttestation(fixture, { context });
    const signature = await signAttestation(fixture, attestation);
    const digest = await fixture.attestationRegistry.hashAttestation(
      attestation,
    );
    const sellerBefore = await fixture.token.balanceOf(fixture.seller.address);

    await expect(
      fixture.escrow
        .connect(fixture.attacker)
        .settleWithAttestation(escrowId, attestation, signature),
    )
      .to.emit(fixture.escrow, "EscrowReleased")
      .withArgs(escrowId, fixture.seller.address, PAYMENT, digest);

    expect(await fixture.token.balanceOf(fixture.seller.address)).to.equal(
      sellerBefore + PAYMENT,
    );
    expect((await fixture.escrow.getEscrow(escrowId)).status).to.equal(3n);
    expect(
      await fixture.attestationRegistry.isSessionConsumed(
        attestation.sessionId,
      ),
    ).to.equal(true);
  });

  it("keeps funds locked for low scores or a rejected verification", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const escrowId = await createEscrow(fixture);
    await fundEscrow(fixture, escrowId);
    const context = await fixture.escrow.escrowContext(escrowId);

    const lowScore = await makeAttestation(fixture, {
      context,
      identityScore: 8_499,
    });
    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        lowScore,
        await signAttestation(fixture, lowScore),
      ),
    ).to.be.revertedWithCustomError(fixture.escrow, "ThresholdNotMet");
    expect(
      await fixture.attestationRegistry.isSessionConsumed(lowScore.sessionId),
    ).to.equal(false);

    const rejected = await makeAttestation(fixture, {
      context,
      verified: false,
    });
    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        rejected,
        await signAttestation(fixture, rejected),
      ),
    ).to.be.revertedWithCustomError(fixture.escrow, "VerificationRejected");
    expect((await fixture.escrow.getEscrow(escrowId)).status).to.equal(2n);
    expect(
      await fixture.token.balanceOf(await fixture.escrow.getAddress()),
    ).to.equal(PAYMENT);
  });

  it("rejects a proof for another asset", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const secondAsset = hashLabel("alive-asset-0002");
    await fixture.assetRegistry
      .connect(fixture.seller)
      .registerAsset(
        secondAsset,
        hashLabel("fp-2"),
        hashLabel("metadata-2"),
        "",
      );
    const escrowId = await createEscrow(fixture);
    await fundEscrow(fixture, escrowId);
    const attestation = await makeAttestation(fixture, {
      assetId: secondAsset,
      context: await fixture.escrow.escrowContext(escrowId),
    });

    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        attestation,
        await signAttestation(fixture, attestation),
      ),
    ).to.be.revertedWithCustomError(
      fixture.escrow,
      "WrongAttestationAsset",
    );
  });

  it("binds proofs to one exact escrow context", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const firstEscrow = await createEscrow(fixture);
    const secondEscrow = await createEscrow(fixture);
    await fundEscrow(fixture, firstEscrow);
    await fundEscrow(fixture, secondEscrow);

    const attestation = await makeAttestation(fixture, {
      context: await fixture.escrow.escrowContext(secondEscrow),
    });
    const signature = await signAttestation(fixture, attestation);
    await expect(
      fixture.escrow.settleWithAttestation(
        firstEscrow,
        attestation,
        signature,
      ),
    ).to.be.revertedWithCustomError(
      fixture.escrow,
      "WrongAttestationContext",
    );
    expect(
      await fixture.attestationRegistry.isSessionConsumed(
        attestation.sessionId,
      ),
    ).to.equal(false);

    await expect(
      fixture.escrow.settleWithAttestation(
        secondEscrow,
        attestation,
        signature,
      ),
    ).not.to.be.reverted;
  });

  it("requires the registered seller to be the attestation subject", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const escrowId = await createEscrow(fixture);
    await fundEscrow(fixture, escrowId);
    const attestation = await makeAttestation(fixture, {
      subject: fixture.attacker.address,
      context: await fixture.escrow.escrowContext(escrowId),
    });
    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        attestation,
        await signAttestation(fixture, attestation),
      ),
    ).to.be.revertedWithCustomError(
      fixture.escrow,
      "WrongAttestationSubject",
    );
  });

  it("refuses funding or settlement after asset ownership changes", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const escrowId = await createEscrow(fixture);
    await fixture.assetRegistry
      .connect(fixture.seller)
      .transferAsset(ASSET_ID, fixture.attacker.address);

    await fixture.token
      .connect(fixture.buyer)
      .approve(await fixture.escrow.getAddress(), PAYMENT);
    await expect(
      fixture.escrow.connect(fixture.buyer).fundEscrow(escrowId),
    )
      .to.be.revertedWithCustomError(fixture.escrow, "SellerNotAssetOwner")
      .withArgs(fixture.seller.address, fixture.attacker.address);

    await fixture.assetRegistry
      .connect(fixture.attacker)
      .transferAsset(ASSET_ID, fixture.seller.address);
    await fundEscrow(fixture, escrowId);
    await fixture.assetRegistry
      .connect(fixture.seller)
      .transferAsset(ASSET_ID, fixture.attacker.address);

    const attestation = await makeAttestation(fixture, {
      context: await fixture.escrow.escrowContext(escrowId),
    });
    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        attestation,
        await signAttestation(fixture, attestation),
      ),
    )
      .to.be.revertedWithCustomError(fixture.escrow, "SellerNotAssetOwner")
      .withArgs(fixture.seller.address, fixture.attacker.address);
    expect(
      await fixture.attestationRegistry.isSessionConsumed(
        attestation.sessionId,
      ),
    ).to.equal(false);
  });

  it("requires verification evidence issued after escrow funding", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const escrowId = await createEscrow(fixture);
    const context = await fixture.escrow.escrowContext(escrowId);
    const attestation = await makeAttestation(fixture, { context });
    const signature = await signAttestation(fixture, attestation);
    await time.increase(2);
    await fundEscrow(fixture, escrowId);

    const fundingTimestamp = await fixture.escrow.fundedAt(escrowId);
    expect(fundingTimestamp).to.be.greaterThan(attestation.issuedAt);
    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        attestation,
        signature,
      ),
    )
      .to.be.revertedWithCustomError(
        fixture.escrow,
        "AttestationPredatesFunding",
      )
      .withArgs(attestation.issuedAt, fundingTimestamp);
    expect(
      await fixture.attestationRegistry.isSessionConsumed(
        attestation.sessionId,
      ),
    ).to.equal(false);
  });

  it("rejects expired attestations and settlement after escrow expiry", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const escrowId = await createEscrow(fixture);
    await fundEscrow(fixture, escrowId);
    const now = await time.latest();
    const attestation = await makeAttestation(fixture, {
      context: await fixture.escrow.escrowContext(escrowId),
      issuedAt: now,
      expiresAt: now + 10,
    });
    const signature = await signAttestation(fixture, attestation);
    await time.increaseTo(attestation.expiresAt);
    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        attestation,
        signature,
      ),
    ).to.be.revertedWithCustomError(
      fixture.attestationRegistry,
      "AttestationExpired",
    );

    const shortDeadline = (await time.latest()) + 20;
    const secondEscrow = await createEscrow(fixture, {
      expiresAt: shortDeadline,
    });
    await fundEscrow(fixture, secondEscrow);
    const fresh = await makeAttestation(fixture, {
      context: await fixture.escrow.escrowContext(secondEscrow),
    });
    await time.increaseTo(shortDeadline);
    await expect(
      fixture.escrow.settleWithAttestation(
        secondEscrow,
        fresh,
        await signAttestation(fixture, fresh),
      ),
    ).to.be.revertedWithCustomError(fixture.escrow, "EscrowExpired");
  });

  it("prevents double settlement", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const escrowId = await createEscrow(fixture);
    await fundEscrow(fixture, escrowId);
    const attestation = await makeAttestation(fixture, {
      context: await fixture.escrow.escrowContext(escrowId),
    });
    const signature = await signAttestation(fixture, attestation);
    await fixture.escrow.settleWithAttestation(
      escrowId,
      attestation,
      signature,
    );

    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        attestation,
        signature,
      ),
    ).to.be.revertedWithCustomError(
      fixture.escrow,
      "InvalidEscrowStatus",
    );
  });

  it("records disputes without creating a payment veto or privileged withdrawal", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const escrowId = await createEscrow(fixture);
    await fundEscrow(fixture, escrowId);
    const reasonHash = hashLabel("offchain-dispute-record");

    await expect(
      fixture.escrow
        .connect(fixture.attacker)
        .raiseDispute(escrowId, reasonHash),
    ).to.be.revertedWithCustomError(fixture.escrow, "NotEscrowParty");
    await expect(
      fixture.escrow
        .connect(fixture.buyer)
        .raiseDispute(escrowId, reasonHash),
    )
      .to.emit(fixture.escrow, "EscrowDisputed")
      .withArgs(escrowId, fixture.buyer.address, reasonHash);
    expect((await fixture.escrow.getEscrow(escrowId)).status).to.equal(7n);
    expect(await fixture.escrow.disputeReasonHash(escrowId)).to.equal(
      reasonHash,
    );

    const attestation = await makeAttestation(fixture, {
      context: await fixture.escrow.escrowContext(escrowId),
    });
    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        attestation,
        await signAttestation(fixture, attestation),
      ),
    )
      .to.emit(fixture.escrow, "DisputeResolved")
      .withArgs(escrowId, 3, anyValue);

    const expiry = (await time.latest()) + 30;
    const refundEscrowId = await createEscrow(fixture, { expiresAt: expiry });
    await fundEscrow(fixture, refundEscrowId);
    await fixture.escrow
      .connect(fixture.seller)
      .raiseDispute(refundEscrowId, hashLabel("seller-dispute"));
    await time.increaseTo(expiry);
    await expect(
      fixture.escrow.connect(fixture.buyer).refundEscrow(refundEscrowId),
    )
      .to.emit(fixture.escrow, "DisputeResolved")
      .withArgs(refundEscrowId, 4, fixture.buyer.address);
  });

  it("allows seller-authorized refunds and buyer timeout refunds only", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const escrowId = await createEscrow(fixture);
    await fundEscrow(fixture, escrowId);

    await expect(
      fixture.escrow.connect(fixture.attacker).refundEscrow(escrowId),
    ).to.be.revertedWithCustomError(
      fixture.escrow,
      "NotRefundAuthorized",
    );
    await expect(
      fixture.escrow.connect(fixture.buyer).refundEscrow(escrowId),
    ).to.be.revertedWithCustomError(fixture.escrow, "EscrowNotExpired");
    const buyerBefore = await fixture.token.balanceOf(fixture.buyer.address);
    await expect(
      fixture.escrow.connect(fixture.seller).refundEscrow(escrowId),
    )
      .to.emit(fixture.escrow, "EscrowRefunded")
      .withArgs(
        escrowId,
        fixture.buyer.address,
        PAYMENT,
        fixture.seller.address,
      );
    expect(await fixture.token.balanceOf(fixture.buyer.address)).to.equal(
      buyerBefore + PAYMENT,
    );

    const expiry = (await time.latest()) + 30;
    const timedEscrow = await createEscrow(fixture, { expiresAt: expiry });
    await fundEscrow(fixture, timedEscrow);
    await time.increaseTo(expiry);
    await expect(
      fixture.escrow.connect(fixture.buyer).refundEscrow(timedEscrow),
    ).not.to.be.reverted;
  });

  it("allows only the buyer to cancel an unfunded escrow", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const escrowId = await createEscrow(fixture);
    await expect(
      fixture.escrow.connect(fixture.attacker).cancelEscrow(escrowId),
    ).to.be.revertedWithCustomError(fixture.escrow, "NotBuyer");
    await fixture.escrow.connect(fixture.buyer).cancelEscrow(escrowId);
    await expect(
      fixture.escrow.connect(fixture.buyer).fundEscrow(escrowId),
    ).to.be.revertedWithCustomError(
      fixture.escrow,
      "InvalidEscrowStatus",
    );
  });

  it("rejects false-return and fee-on-transfer deposits atomically", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const FailureToken = await ethers.getContractFactory(
      "ConfigurableFailureToken",
    );
    const failureToken: any = await FailureToken.deploy(
      fixture.buyer.address,
      PAYMENT,
    );
    const falseEscrow = await createEscrow(fixture, { token: failureToken });
    await failureToken
      .connect(fixture.buyer)
      .approve(await fixture.escrow.getAddress(), PAYMENT);
    await failureToken.setFailures(false, true);
    await expect(
      fixture.escrow.connect(fixture.buyer).fundEscrow(falseEscrow),
    ).to.be.reverted;
    expect((await fixture.escrow.getEscrow(falseEscrow)).status).to.equal(1n);

    const FeeToken = await ethers.getContractFactory("FeeOnTransferToken");
    const feeToken: any = await FeeToken.deploy(
      fixture.buyer.address,
      PAYMENT,
    );
    const feeEscrow = await createEscrow(fixture, { token: feeToken });
    await feeToken
      .connect(fixture.buyer)
      .approve(await fixture.escrow.getAddress(), PAYMENT);
    await expect(
      fixture.escrow.connect(fixture.buyer).fundEscrow(feeEscrow),
    ).to.be.revertedWithCustomError(
      fixture.escrow,
      "UnsupportedTokenTransfer",
    );
    expect((await fixture.escrow.getEscrow(feeEscrow)).status).to.equal(1n);
  });

  it("rolls back attestation consumption if payout transfer fails", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const FailureToken = await ethers.getContractFactory(
      "ConfigurableFailureToken",
    );
    const token: any = await FailureToken.deploy(
      fixture.buyer.address,
      PAYMENT,
    );
    const escrowId = await createEscrow(fixture, { token });
    await fundEscrow(fixture, escrowId, token);
    const attestation = await makeAttestation(fixture, {
      context: await fixture.escrow.escrowContext(escrowId),
    });
    const signature = await signAttestation(fixture, attestation);

    await token.setFailures(true, false);
    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        attestation,
        signature,
      ),
    ).to.be.reverted;
    expect((await fixture.escrow.getEscrow(escrowId)).status).to.equal(2n);
    expect(
      await fixture.attestationRegistry.isSessionConsumed(
        attestation.sessionId,
      ),
    ).to.equal(false);

    await token.setFailures(false, false);
    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        attestation,
        signature,
      ),
    ).not.to.be.reverted;
  });

  it("rejects a taxed payout without consuming the attestation", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const OutputFeeToken = await ethers.getContractFactory("OutputFeeToken");
    const token: any = await OutputFeeToken.deploy(
      fixture.buyer.address,
      PAYMENT,
    );
    const escrowId = await createEscrow(fixture, { token });
    await fundEscrow(fixture, escrowId, token);
    await token.setFeeSender(await fixture.escrow.getAddress());
    const attestation = await makeAttestation(fixture, {
      context: await fixture.escrow.escrowContext(escrowId),
    });
    const signature = await signAttestation(fixture, attestation);

    await expect(
      fixture.escrow.settleWithAttestation(
        escrowId,
        attestation,
        signature,
      ),
    ).to.be.revertedWithCustomError(
      fixture.escrow,
      "UnsupportedTokenTransfer",
    );
    expect((await fixture.escrow.getEscrow(escrowId)).status).to.equal(2n);
    expect(
      await fixture.attestationRegistry.isSessionConsumed(
        attestation.sessionId,
      ),
    ).to.equal(false);
  });

  it("blocks a token callback from reentering funding", async function () {
    const fixture = await loadFixture(deployProtocolFixture);
    const ReentrantToken = await ethers.getContractFactory("ReentrantToken");
    const token: any = await ReentrantToken.deploy(
      fixture.buyer.address,
      PAYMENT,
    );
    const escrowId = await createEscrow(fixture, { token });
    await token
      .connect(fixture.buyer)
      .approve(await fixture.escrow.getAddress(), PAYMENT);
    await token.configureHook(
      await fixture.escrow.getAddress(),
      fixture.escrow.interface.encodeFunctionData("fundEscrow", [escrowId]),
    );

    await expect(
      fixture.escrow.connect(fixture.buyer).fundEscrow(escrowId),
    ).not.to.be.reverted;
    expect(await token.lastHookSucceeded()).to.equal(false);
    expect((await fixture.escrow.getEscrow(escrowId)).status).to.equal(2n);
    expect(await token.balanceOf(await fixture.escrow.getAddress())).to.equal(
      PAYMENT,
    );
  });
});

describe("MockUSDT (test token only)", function () {
  it("uses six decimals and permits one faucet claim per address", async function () {
    const { token, attacker } = await loadFixture(deployProtocolFixture);
    expect(await token.name()).to.equal("ALIVE Test USDT");
    expect(await token.symbol()).to.equal("tUSDT");
    expect(await token.decimals()).to.equal(6n);
    await token.connect(attacker).faucet();
    expect(await token.balanceOf(attacker.address)).to.equal(
      10_000n * 10n ** 6n,
    );
    await expect(token.connect(attacker).faucet()).to.be.revertedWithCustomError(
      token,
      "FaucetAlreadyUsed",
    );
  });
});
