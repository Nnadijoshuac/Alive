import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SCORE_POLICY,
  createAssetId,
  getAliveAuthorizationTypedData,
  hashCanonical,
  hashEvidenceBytes,
  recoverAliveAttestationSigner,
} from "@alive/shared";
import sharp from "sharp";
import {
  AliveRepository,
  buildApp,
  loadVerifierConfig,
} from "../dist/index.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "../../..");
const contractsRoot = path.join(workspaceRoot, "packages/contracts");

process.env.HARDHAT_CONFIG = path.join(contractsRoot, "hardhat.config.ts");
const requireFromContracts = createRequire(
  path.join(contractsRoot, "package.json"),
);
const hre = requireFromContracts("hardhat");
const { ethers, network } = hre;

const chainId = 31_337;
const authorizationAudience = "http://127.0.0.1:4100";
const mimeType = "image/jpeg";
const views = ["FRONT", "LEFT", "RIGHT", "BACK", "DETAIL", "IDENTIFIER"];
const viewSeeds = {
  FRONT: 2,
  BACK: 3,
  LEFT: 4,
  RIGHT: 5,
  DETAIL: 6,
  IDENTIFIER: 7,
};
const challengeViews = {
  SHOW_FRONT: "FRONT",
  SHOW_BACK: "BACK",
  TURN_LEFT: "LEFT",
  TURN_RIGHT: "RIGHT",
  SHOW_IDENTIFIER: "IDENTIFIER",
  MOVE_CLOSER: "DETAIL",
  MOVE_AWAY: "DETAIL",
};

function normalizeAddress(value) {
  return value.toLowerCase();
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

async function patternedJpeg(seed, shift = 0, quality = 92) {
  const width = 192;
  const height = 192;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const shiftedX = (x + shift) % width;
      const shiftedY = (y + Math.floor(shift / 2)) % height;
      const offset = (y * width + x) * 3;
      const checker =
        ((Math.floor(shiftedX / (11 + (seed % 5))) +
          Math.floor(shiftedY / (13 + (seed % 7)))) %
          2) *
        74;
      pixels[offset] =
        (shiftedX * (3 + (seed % 4)) + shiftedY + checker + seed * 17) % 256;
      pixels[offset + 1] =
        (shiftedY * (4 + (seed % 3)) + shiftedX * 2 + checker + seed * 23) %
        256;
      pixels[offset + 2] = ((shiftedX ^ (shiftedY + seed * 9)) + checker) % 256;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality })
    .toBuffer();
}

function memoryEvidenceStore() {
  const entries = new Map();
  let nextId = 0;
  return {
    async put(namespace, ownerId, bytes) {
      const body = Buffer.from(bytes);
      const storedPath = `memory://${namespace}/${ownerId}/${nextId++}`;
      entries.set(storedPath, body);
      return {
        path: storedPath,
        evidenceHash: hashEvidenceBytes(body),
        byteLength: body.byteLength,
      };
    },
    async read(storedPath) {
      const body = entries.get(storedPath);
      assert.ok(body, `Missing in-memory evidence ${storedPath}`);
      return Buffer.from(body);
    },
    async reset() {
      entries.clear();
    },
  };
}

async function injectJson(app, options, expectedStatus) {
  const response = await app.inject(options);
  assert.equal(
    response.statusCode,
    expectedStatus,
    `${options.method} ${options.url} returned ${response.statusCode}: ${response.body}`,
  );
  return response.json();
}

async function signAuthorization(signer, challenge) {
  const typedData = getAliveAuthorizationTypedData(
    challenge.authorization,
    challenge.domain,
  );
  return signer.signTypedData(
    typedData.domain,
    typedData.types,
    typedData.message,
  );
}

async function deployProtocol(verifierAddress) {
  const [deployer, seller, buyer] = await ethers.getSigners();
  assert.ok(
    deployer && seller && buyer,
    "Hardhat did not expose three local signers",
  );

  const AssetRegistry = await ethers.getContractFactory(
    "AliveAssetRegistry",
    deployer,
  );
  const assetRegistry = await AssetRegistry.deploy();
  await assetRegistry.waitForDeployment();

  const AttestationRegistry = await ethers.getContractFactory(
    "AliveAttestationRegistry",
    deployer,
  );
  const attestationRegistry = await AttestationRegistry.deploy(
    await assetRegistry.getAddress(),
    verifierAddress,
    deployer.address,
  );
  await attestationRegistry.waitForDeployment();

  const Escrow = await ethers.getContractFactory("AliveEscrow", deployer);
  const escrow = await Escrow.deploy(
    await assetRegistry.getAddress(),
    await attestationRegistry.getAddress(),
  );
  await escrow.waitForDeployment();
  await (
    await attestationRegistry.setAuthorizedConsumer(
      await escrow.getAddress(),
      true,
    )
  ).wait();

  const MockUSDT = await ethers.getContractFactory("MockUSDT", deployer);
  const token = await MockUSDT.deploy(deployer.address);
  await token.waitForDeployment();
  return {
    deployer,
    seller,
    buyer,
    assetRegistry,
    attestationRegistry,
    escrow,
    token,
  };
}

async function main() {
  await network.provider.send("hardhat_reset");
  const verifierWallet = ethers.Wallet.createRandom();
  const protocol = await deployProtocol(verifierWallet.address);
  const { seller, buyer, assetRegistry, attestationRegistry, escrow, token } =
    protocol;

  const initialBlock = await ethers.provider.getBlock("latest");
  assert.ok(initialBlock, "Hardhat did not return the latest block");
  let serverNowMs = Number(initialBlock.timestamp) * 1_000;
  const repository = new AliveRepository(":memory:");
  const config = {
    ...loadVerifierConfig({
      ALIVE_AUTH_AUDIENCE: authorizationAudience,
      ALIVE_AUTH_CHAIN_ID: String(chainId),
      ALIVE_CHAIN_ID: String(chainId),
      ALIVE_ATTESTATION_REGISTRY_ADDRESS:
        await attestationRegistry.getAddress(),
      ALIVE_VERIFIER_PRIVATE_KEY: verifierWallet.privateKey,
    }),
    databasePath: ":memory:",
    evidencePath: ".",
    authorizationAudience,
    authorizationChainId: chainId,
    chainId,
    verifyingContract: await attestationRegistry.getAddress(),
    enableOcr: false,
    enableNeuralEmbedding: false,
  };
  const app = await buildApp(config, {
    repository,
    evidenceStore: memoryEvidenceStore(),
    now: () => new Date(serverNowMs),
  });

  try {
    const metadata = {
      name: "ALIVE deterministic inspection target",
      category: "COMPUTER",
      description:
        "Runtime-generated visual fixture for the complete local protocol smoke test.",
    };
    const assetChallenge = await injectJson(
      app,
      {
        method: "POST",
        url: "/api/auth/challenge",
        payload: {
          action: "CREATE_ASSET",
          request: { owner: seller.address, metadata },
        },
      },
      201,
    );
    assert.equal(assetChallenge.authorization.action, "CREATE_ASSET");
    assert.equal(
      assetChallenge.authorization.resource,
      createAssetId(seller.address, assetChallenge.authorization.nonce),
      "Verifier asset ID was not owner-and-nonce bound",
    );
    const assetSignature = await signAuthorization(seller, assetChallenge);
    const createdAsset = await injectJson(
      app,
      {
        method: "POST",
        url: "/api/assets",
        payload: {
          assetId: assetChallenge.authorization.resource,
          owner: seller.address,
          metadata,
          authorization: {
            nonce: assetChallenge.authorization.nonce,
            signature: assetSignature,
          },
        },
      },
      201,
    );
    const assetId = createdAsset.asset.assetId;
    const registrationToken = createdAsset.capability.token;
    const registrationEvidenceHashes = [];
    for (const [index, view] of views.entries()) {
      const image = await patternedJpeg(viewSeeds[view], 0, 92);
      const capture = await injectJson(
        app,
        {
          method: "POST",
          url: `/api/assets/${assetId}/captures`,
          headers: bearer(registrationToken),
          payload: {
            view,
            imageBase64: image.toString("base64"),
            mimeType,
            capturedAt: new Date(serverNowMs - 1_000 + index).toISOString(),
          },
        },
        201,
      );
      assert.equal(
        capture.quality.usable,
        true,
        `${view} registration capture was not usable`,
      );
      registrationEvidenceHashes.push(capture.evidenceHash);
    }
    assert.equal(
      new Set(registrationEvidenceHashes).size,
      views.length,
      "Registration views were not visually distinct",
    );

    const fingerprint = await injectJson(
      app,
      {
        method: "POST",
        url: `/api/assets/${assetId}/fingerprint`,
        headers: bearer(registrationToken),
      },
      201,
    );
    assert.equal(fingerprint.registrationViews.length, views.length);

    const metadataHash = hashCanonical({ metadataVersion: 1, metadata });
    await (
      await assetRegistry
        .connect(seller)
        .registerAsset(
          assetId,
          assetChallenge.authorization.nonce,
          fingerprint.fingerprintHash,
          metadataHash,
          "",
        )
    ).wait();
    const onchainAsset = await assetRegistry.getAsset(assetId);
    assert.equal(
      normalizeAddress(onchainAsset.owner),
      normalizeAddress(seller.address),
    );
    assert.equal(onchainAsset.fingerprintHash, fingerprint.fingerprintHash);
    assert.equal(
      await assetRegistry.deriveAssetId(
        seller.address,
        assetChallenge.authorization.nonce,
      ),
      assetId,
    );

    await (await token.connect(buyer).faucet()).wait();
    const amount = ethers.parseUnits("125", 6);
    const latestBeforeEscrow = await ethers.provider.getBlock("latest");
    assert.ok(latestBeforeEscrow);
    const escrowExpiresAt = BigInt(latestBeforeEscrow.timestamp + 3_600);
    const createArguments = [
      assetId,
      seller.address,
      await token.getAddress(),
      amount,
      8_500,
      8_000,
      escrowExpiresAt,
    ];
    const escrowId = await escrow
      .connect(buyer)
      .createEscrow.staticCall(...createArguments);
    await (await escrow.connect(buyer).createEscrow(...createArguments)).wait();
    await (
      await token.connect(buyer).approve(await escrow.getAddress(), amount)
    ).wait();
    await (await escrow.connect(buyer).fundEscrow(escrowId)).wait();
    const fundedAt = await escrow.fundedAt(escrowId);
    assert.ok(fundedAt > 0n, "Escrow did not record its funding time");
    assert.equal(
      (await escrow.getEscrow(escrowId)).status,
      2n,
      "Escrow did not enter AwaitingVerification",
    );
    assert.equal(
      await token.balanceOf(await escrow.getAddress()),
      amount,
      "Escrow did not receive the exact amount",
    );

    serverNowMs = Number(fundedAt + 1n) * 1_000;
    const context = await escrow.escrowContext(escrowId);
    const sessionChallenge = await injectJson(
      app,
      {
        method: "POST",
        url: "/api/auth/challenge",
        payload: {
          action: "CREATE_VERIFICATION_SESSION",
          request: { assetId, wallet: seller.address, context },
        },
      },
      201,
    );
    const sessionSignature = await signAuthorization(seller, sessionChallenge);
    const createdSession = await injectJson(
      app,
      {
        method: "POST",
        url: "/api/verifications/session",
        payload: {
          sessionId: sessionChallenge.authorization.resource,
          assetId,
          wallet: seller.address,
          context,
          authorization: {
            nonce: sessionChallenge.authorization.nonce,
            signature: sessionSignature,
          },
        },
      },
      201,
    );
    const sessionId = createdSession.session.sessionId;
    const sessionToken = createdSession.capability.token;
    assert.equal(
      createdSession.session.challenges.length,
      4,
      "Unexpected local challenge count",
    );

    const verificationEvidenceHashes = [];
    const observedMotion = [];
    for (const challenge of createdSession.session.challenges) {
      const view = challengeViews[challenge.type];
      assert.ok(view, `No registration-view mapping for ${challenge.type}`);
      const burstImages = await Promise.all(
        [2, 7, 12].map((shift) => patternedJpeg(viewSeeds[view], shift, 88)),
      );
      const frames = burstImages.map((image, index) => ({
        imageBase64: image.toString("base64"),
        mimeType,
        capturedAt: new Date(serverNowMs - 300 + index * 100).toISOString(),
      }));
      const captured = await injectJson(
        app,
        {
          method: "POST",
          url: `/api/verifications/${sessionId}/capture`,
          headers: bearer(sessionToken),
          payload: { challengeId: challenge.id, frames },
        },
        201,
      );
      assert.equal(captured.qualities.length, 3);
      assert.ok(
        captured.qualities.every((quality) => quality.usable),
        `${challenge.type} burst contained an unusable frame`,
      );
      assert.ok(
        captured.intraChallengeMotion >= 0.25,
        `${challenge.type} did not produce sufficient derived motion`,
      );
      verificationEvidenceHashes.push(...captured.evidenceHashes);
      observedMotion.push(captured.intraChallengeMotion);
    }
    assert.equal(
      new Set(verificationEvidenceHashes).size,
      createdSession.session.challenges.length * 3,
      "Verification burst frames did not have unique evidence hashes",
    );

    const result = await injectJson(
      app,
      {
        method: "POST",
        url: `/api/verifications/${sessionId}/analyze`,
        headers: bearer(sessionToken),
      },
      200,
    );
    assert.equal(
      result.verified,
      true,
      `Real scoring rejected the smoke capture: ${result.reasonCodes.join(", ")}`,
    );
    assert.deepEqual(result.reasonCodes, []);
    assert.ok(
      result.identityScoreBps >= DEFAULT_SCORE_POLICY.thresholds.identity,
    );
    assert.ok(
      result.livenessScoreBps >= DEFAULT_SCORE_POLICY.thresholds.liveness,
    );
    assert.ok(
      result.integrityScoreBps >= DEFAULT_SCORE_POLICY.thresholds.integrity,
    );
    assert.ok(
      result.signals.motionConsistency * 10_000 >=
        DEFAULT_SCORE_POLICY.thresholds.minimumMotion,
    );

    const signed = await injectJson(
      app,
      {
        method: "POST",
        url: `/api/verifications/${sessionId}/attestation`,
        headers: bearer(sessionToken),
      },
      201,
    );
    assert.equal(signed.attestation.assetId, assetId);
    assert.equal(
      signed.attestation.fingerprintHash,
      fingerprint.fingerprintHash,
    );
    assert.equal(signed.attestation.sessionId, sessionId);
    assert.equal(
      normalizeAddress(signed.attestation.subject),
      normalizeAddress(seller.address),
    );
    assert.equal(signed.attestation.context, context);
    assert.equal(signed.attestation.verified, true);
    assert.equal(signed.domain.chainId, chainId);
    assert.equal(
      normalizeAddress(signed.domain.verifyingContract),
      normalizeAddress(await attestationRegistry.getAddress()),
    );
    assert.equal(
      normalizeAddress(
        await recoverAliveAttestationSigner(
          signed.attestation,
          signed.domain,
          signed.signature,
        ),
      ),
      normalizeAddress(verifierWallet.address),
    );
    assert.equal(
      await attestationRegistry.hashAttestation(signed.attestation),
      signed.digest,
    );

    await network.provider.send("evm_setNextBlockTimestamp", [
      Number(fundedAt + 1n),
    ]);
    const sellerBalanceBefore = await token.balanceOf(seller.address);
    await (
      await escrow
        .connect(buyer)
        .settleWithAttestation(escrowId, signed.attestation, signed.signature)
    ).wait();
    const sellerBalanceAfter = await token.balanceOf(seller.address);
    assert.equal(
      sellerBalanceAfter - sellerBalanceBefore,
      amount,
      "Seller did not receive the exact escrow amount",
    );
    assert.equal(
      (await escrow.getEscrow(escrowId)).status,
      3n,
      "Escrow was not released",
    );
    assert.equal(
      await token.balanceOf(await escrow.getAddress()),
      0n,
      "Escrow retained funds after release",
    );
    assert.equal(
      await attestationRegistry.isSessionConsumed(sessionId),
      true,
      "Attestation session was not consumed",
    );
    assert.equal(await attestationRegistry.verificationCount(assetId), 1n);
    const onchainVerification =
      await attestationRegistry.latestVerification(assetId);
    assert.equal(onchainVerification.digest, signed.digest);
    assert.equal(onchainVerification.evidenceHash, result.evidenceHash);

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "passed",
          assetId,
          sessionId,
          escrowId,
          scores: {
            identity: result.identityScoreBps,
            liveness: result.livenessScoreBps,
            integrity: result.integrityScoreBps,
          },
          minimumBurstMotion: Math.min(...observedMotion),
          attestationDigest: signed.digest,
          outcome: "Released",
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await app.close();
  }
}

await main();
