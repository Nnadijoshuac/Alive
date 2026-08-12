# ALIVE architecture

## Objective

ALIVE converts observable physical state into a signed, machine-readable statement that smart contracts can validate. The architecture keeps sensitive evidence offchain and puts only commitments, scores, timestamps, and settlement-relevant state onchain.

## System map

```text
Camera capture
    |
    v
Web capture client
    | quality checks, guided views, randomized challenges
    v
Verifier service
    | neural image embedding when available
    | spatial/color embedding and gradient descriptors
    | perceptual replay checks and OCR normalization
    | multi-view and motion/liveness scoring
    v
Evidence package + deterministic commitment
    |                         |
    | raw evidence local      | EIP-712 result signed by verifier
    v                         v
SQLite/filesystem        AliveAttestationRegistry
                              |
                              v
                         AliveEscrow
                              |
                              v
                    test token released or withheld
```

## Monorepo boundaries

- `apps/web`: Next.js product, camera workflow, wallet integration, demo, attack lab, and protocol visualization.
- `services/verifier`: typed HTTP service, SQLite index, local evidence adapter, visual feature extraction, liveness sessions, scoring, and EIP-712 signing.
- `packages/shared`: canonical schemas, reason codes, scoring policy, chain definitions, and attestation types.
- `packages/contracts`: asset registry, attestation registry, escrow, mock token, deployment scripts, and security tests.
- `videos`: launch composition built from the same brand tokens and visual primitives.
- `storage`: ignored local evidence and database directories.

## Registration sequence

1. The owner connects a wallet and enters asset metadata.
2. The camera client rejects frames with poor exposure or low sharpness.
3. Six guided views are captured and resized for inference.
4. The verifier builds per-view embeddings, local gradient descriptors, perceptual hashes, and normalized identifier data.
5. A canonical fingerprint is serialized and hashed.
6. Raw media and feature data stay offchain. The asset ID and commitment are registered onchain.

## Verification sequence

1. The verifier creates a random, expiring, single-use session.
2. The presenter completes ordered physical challenges with sequential frames.
3. The verifier compares current and registered multi-view evidence.
4. Identity, liveness, and visual-integrity scores are computed from observable signals and configurable thresholds.
5. The result and evidence commitment are encoded as EIP-712 data and signed by the dedicated verifier key.
6. The attestation registry validates signer, asset, score bounds, expiry, and session replay protection.
7. Escrow checks its own asset and threshold requirements before releasing test funds.

## Trust boundaries

- The browser is untrusted for final scores and signing.
- The local verifier is trusted for the MVP and holds the verifier key outside client bundles.
- Registration media can be tampered with if the local host is compromised.
- X Layer contracts are authoritative for asset commitments, consumed sessions, escrow status, and payment.
- The MVP does not claim resistance to sophisticated synchronized displays, deepfake video, compromised cameras, or verifier-key theft.

## Network configuration

Chain selection is centralized and supports local development, X Layer Testnet (`1952`), and X Layer Mainnet (`196`). Public RPC and explorer defaults may be overridden through environment variables.

## Contract toolchain decision

The source remains portable Solidity. The primary checked CI runner uses Hardhat because this Windows workspace does not have Foundry installed. A `foundry.toml` compatibility file and Solidity layout are retained so Foundry can be used on supported environments without rewriting contracts.
