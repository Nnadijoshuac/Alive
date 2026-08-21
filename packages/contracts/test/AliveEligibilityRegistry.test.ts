import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

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

const hashLabel = (value: string): string => ethers.id(value);

async function deployFixture() {
  const signers = await ethers.getSigners();
  const deployer = signers[0]!;
  const signer = signers[1]!;
  const wrongSigner = signers[2]!;
  const other = signers[3]!;

  const AssetRegistry = await ethers.getContractFactory("AliveRwaAssetRegistry");
  const assetRegistry: any = await AssetRegistry.deploy(deployer.address);
  await assetRegistry.waitForDeployment();

  const Token = await ethers.getContractFactory("MockRwaToken");
  const token: any = await Token.deploy("Test Treasury", "tTEST", deployer.address);
  await token.waitForDeployment();

  const assetId = hashLabel("ttest");
  await assetRegistry.registerAsset(
    assetId,
    await token.getAddress(),
    hashLabel("TREASURY"),
    hashLabel("issuer"),
    hashLabel("metadata"),
    hashLabel("provenance"),
  );

  const Registry = await ethers.getContractFactory("AliveEligibilityRegistry");
  const registry: any = await Registry.deploy(
    await assetRegistry.getAddress(),
    signer!.address,
    deployer.address,
  );
  await registry.waitForDeployment();

  return { deployer, signer, wrongSigner, other, assetRegistry, token, assetId, registry };
}

let nonceSequence = 0;

async function buildAttestation(
  registryAddress: string,
  signerWallet: { signTypedData: (...args: any[]) => Promise<string> },
  overrides: Partial<EligibilityAttestation> = {},
): Promise<{ attestation: EligibilityAttestation; signature: string }> {
  nonceSequence += 1;
  // Use the chain's own timestamp, not wall-clock Date.now() -- the two can
  // skew under parallel test load, which previously caused flaky
  // AttestationIssuedInFuture reverts.
  const now = await time.latest();
  const attestation: EligibilityAttestation = {
    assetIdHash: hashLabel("ttest"),
    eligible: true,
    reasonHash: hashLabel("reasons-ok"),
    passportHash: hashLabel("passport-v1"),
    marketSnapshotHash: hashLabel("snapshot-v1"),
    policyHash: hashLabel("policy-v1"),
    issuedAt: now,
    validUntil: now + 900,
    nonce: hashLabel(`nonce-${nonceSequence}`),
    ...overrides,
  };
  const network = await ethers.provider.getNetwork();
  const signature = await signerWallet.signTypedData(
    {
      name: "ALIVE Eligibility Gateway",
      version: "1",
      chainId: network.chainId,
      verifyingContract: registryAddress,
    },
    ELIGIBILITY_TYPES,
    attestation,
  );
  return { attestation, signature };
}

describe("AliveEligibilityRegistry", function () {
  it("is ineligible by default before any attestation is published", async function () {
    const fixture = await loadFixture(deployFixture);
    expect(await fixture.registry.isEligible(fixture.assetId)).to.equal(false);
    const record = await fixture.registry.getRecord(fixture.assetId);
    expect(record.version).to.equal(0n);
  });

  it("accepts a validly signed attestation and makes the asset eligible", async function () {
    const fixture = await loadFixture(deployFixture);
    const { attestation, signature } = await buildAttestation(
      await fixture.registry.getAddress(),
      fixture.signer,
    );
    await expect(fixture.registry.publishEligibility(attestation, signature))
      .to.emit(fixture.registry, "EligibilityUpdated")
      .withArgs(
        fixture.assetId,
        true,
        attestation.reasonHash,
        attestation.validUntil,
        1n,
      );
    expect(await fixture.registry.isEligible(fixture.assetId)).to.equal(true);
    const record = await fixture.registry.getRecord(fixture.assetId);
    expect(record.version).to.equal(1n);
    expect(record.eligible).to.equal(true);
  });

  it("rejects a signature from anyone other than the authorized signer", async function () {
    const fixture = await loadFixture(deployFixture);
    const { attestation, signature } = await buildAttestation(
      await fixture.registry.getAddress(),
      fixture.wrongSigner,
    );
    await expect(
      fixture.registry.publishEligibility(attestation, signature),
    ).to.be.revertedWithCustomError(fixture.registry, "WrongSigner");
  });

  it("rejects an attestation for an asset that is not registered", async function () {
    const fixture = await loadFixture(deployFixture);
    const { attestation, signature } = await buildAttestation(
      await fixture.registry.getAddress(),
      fixture.signer,
      { assetIdHash: hashLabel("does-not-exist") },
    );
    await expect(
      fixture.registry.publishEligibility(attestation, signature),
    ).to.be.revertedWithCustomError(fixture.registry, "AssetNotRegistered");
  });

  it("rejects a zero nonce and zero commitment hashes", async function () {
    const fixture = await loadFixture(deployFixture);
    const zero = `0x${"00".repeat(32)}`;
    const registryAddress = await fixture.registry.getAddress();

    const withZeroNonce = await buildAttestation(registryAddress, fixture.signer, {
      nonce: zero,
    });
    await expect(
      fixture.registry.publishEligibility(
        withZeroNonce.attestation,
        withZeroNonce.signature,
      ),
    ).to.be.revertedWithCustomError(fixture.registry, "EmptyAttestationField");

    const withZeroReason = await buildAttestation(registryAddress, fixture.signer, {
      reasonHash: zero,
    });
    await expect(
      fixture.registry.publishEligibility(
        withZeroReason.attestation,
        withZeroReason.signature,
      ),
    ).to.be.revertedWithCustomError(fixture.registry, "EmptyAttestationField");
  });

  it("rejects a lifetime longer than 24 hours", async function () {
    const fixture = await loadFixture(deployFixture);
    const now = Math.floor(Date.now() / 1_000);
    const { attestation, signature } = await buildAttestation(
      await fixture.registry.getAddress(),
      fixture.signer,
      { issuedAt: now, validUntil: now + 86_401 },
    );
    await expect(
      fixture.registry.publishEligibility(attestation, signature),
    ).to.be.revertedWithCustomError(fixture.registry, "AttestationLifetimeTooLong");
  });

  it("rejects an attestation issued in the future", async function () {
    const fixture = await loadFixture(deployFixture);
    const future = Math.floor(Date.now() / 1_000) + 10_000;
    const { attestation, signature } = await buildAttestation(
      await fixture.registry.getAddress(),
      fixture.signer,
      { issuedAt: future, validUntil: future + 900 },
    );
    await expect(
      fixture.registry.publishEligibility(attestation, signature),
    ).to.be.revertedWithCustomError(
      fixture.registry,
      "AttestationIssuedInFuture",
    );
  });

  it("prevents an old ELIGIBLE attestation from resurrecting status after a newer RESTRICTED one", async function () {
    const fixture = await loadFixture(deployFixture);
    const registryAddress = await fixture.registry.getAddress();
    const eligibleFirst = await buildAttestation(registryAddress, fixture.signer, {
      eligible: true,
    });
    await fixture.registry.publishEligibility(
      eligibleFirst.attestation,
      eligibleFirst.signature,
    );
    expect(await fixture.registry.isEligible(fixture.assetId)).to.equal(true);

    await time.increase(30);
    const restrictedSecond = await buildAttestation(
      registryAddress,
      fixture.signer,
      {
        eligible: false,
        reasonHash: hashLabel("nav-stale"),
        issuedAt: eligibleFirst.attestation.issuedAt + 5,
        validUntil: eligibleFirst.attestation.issuedAt + 905,
      },
    );
    await fixture.registry.publishEligibility(
      restrictedSecond.attestation,
      restrictedSecond.signature,
    );
    expect(await fixture.registry.isEligible(fixture.assetId)).to.equal(false);

    // Replaying the original (older, still time-valid) ELIGIBLE attestation
    // must not be able to override the newer RESTRICTED verdict.
    await expect(
      fixture.registry.publishEligibility(
        eligibleFirst.attestation,
        eligibleFirst.signature,
      ),
    ).to.be.revertedWithCustomError(
      fixture.registry,
      "AttestationNotNewerThanRecord",
    );
    expect(await fixture.registry.isEligible(fixture.assetId)).to.equal(false);
  });

  it("rejects reusing a nonce across two different attestations", async function () {
    const fixture = await loadFixture(deployFixture);
    const registryAddress = await fixture.registry.getAddress();
    const sharedNonce = hashLabel("shared-nonce");

    const first = await buildAttestation(registryAddress, fixture.signer, {
      nonce: sharedNonce,
    });
    await fixture.registry.publishEligibility(first.attestation, first.signature);

    await time.increase(5);
    const second = await buildAttestation(registryAddress, fixture.signer, {
      nonce: sharedNonce,
      issuedAt: first.attestation.issuedAt + 5,
      validUntil: first.attestation.validUntil + 5,
    });
    await expect(
      fixture.registry.publishEligibility(second.attestation, second.signature),
    ).to.be.revertedWithCustomError(fixture.registry, "NonceAlreadyConsumed");
  });

  it("expires eligibility once validUntil passes without a fresh attestation", async function () {
    const fixture = await loadFixture(deployFixture);
    const chainNow = await time.latest();
    const { attestation, signature } = await buildAttestation(
      await fixture.registry.getAddress(),
      fixture.signer,
      { issuedAt: chainNow, validUntil: chainNow + 30 },
    );
    await fixture.registry.publishEligibility(attestation, signature);
    expect(await fixture.registry.isEligible(fixture.assetId)).to.equal(true);
    await time.increase(31);
    expect(await fixture.registry.isEligible(fixture.assetId)).to.equal(false);
  });

  it("treats a disabled registry asset as ineligible even with a valid record", async function () {
    const fixture = await loadFixture(deployFixture);
    const { attestation, signature } = await buildAttestation(
      await fixture.registry.getAddress(),
      fixture.signer,
    );
    await fixture.registry.publishEligibility(attestation, signature);
    expect(await fixture.registry.isEligible(fixture.assetId)).to.equal(true);

    await fixture.assetRegistry.setAssetEnabled(fixture.assetId, false);
    expect(await fixture.registry.isEligible(fixture.assetId)).to.equal(false);
  });

  it("lets the owner rotate the authorized signer, invalidating the old signer's signatures", async function () {
    const fixture = await loadFixture(deployFixture);
    await expect(fixture.registry.setAuthorizedSigner(fixture.other.address))
      .to.emit(fixture.registry, "AuthorizedSignerUpdated")
      .withArgs(fixture.signer.address, fixture.other.address);

    const { attestation, signature } = await buildAttestation(
      await fixture.registry.getAddress(),
      fixture.signer,
    );
    await expect(
      fixture.registry.publishEligibility(attestation, signature),
    ).to.be.revertedWithCustomError(fixture.registry, "WrongSigner");
  });
});
