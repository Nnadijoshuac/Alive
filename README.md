# ALIVE

## Give smart contracts eyes.

ALIVE is a Proof-of-Physical-State protocol. It uses active local AI inspection to compare a physical asset with its registered visual fingerprint, then signs a short-lived attestation that an X Layer smart contract can consume.

The demonstrable path is:

**Physical object -> AI verification -> cryptographic attestation -> X Layer -> escrow released or withheld**

This repository is under active implementation. The authoritative progress ledger is [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md); architecture and trust boundaries are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local prerequisites

- Node.js 22 or newer
- pnpm 11
- An injected EVM wallet for browser transactions
- A webcam for registration and active verification

Copy `.env.example` to `.env.local`, add development-only signing keys, then run:

```bash
pnpm install
pnpm chain
pnpm deploy:local
pnpm dev
```

Never use a funded mainnet key for the verifier or deployer.

## X Layer

The checked-in defaults target X Layer Testnet, chain ID `1952`, with OKB as gas. RPC and explorer values are centralized in environment configuration so the same build can target a local chain, testnet, or mainnet.

## Product honesty

ALIVE reports AI-estimated visual match confidence and active verification signals. The MVP resists simple replay, substitution, stale-session, and signed-attestation replay attacks. It is not a guarantee of legal authenticity, certified condition, or perfect liveness.

## License

Copyright 2026 ALIVE contributors. A release license will be selected before the public hackathon release.
