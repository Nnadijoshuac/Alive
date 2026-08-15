# ADR 002: EIP-712 verifier attestations

Status: **Accepted for historical V1; adapted, not reused verbatim, for V2.**
The pivot uses bounded EIP-712 strategy proposals rather than physical-state
attestations. See [the architecture](../ARCHITECTURE.md).

## Context

Escrow needs a compact physical-state result that can be authenticated and replay-protected on an EVM chain.

## Decision

Sign canonical typed attestation data with a dedicated verifier key. Include asset ID, the exact finalized fingerprint commitment, session ID, subject, operation context, basis-point scores, verdict, evidence hash, issue time, and expiry. The domain binds chain ID and the deployed attestation-registry address.

## Why

Typed data is inspectable, deterministic, and efficiently recoverable in Solidity. Session IDs and expiries provide bounded replay protection. The registry checks the signed `fingerprintHash` against the asset registry before consumption. Escrow context is `keccak256(abi.encode(escrowAddress, escrowId))`, preventing a proof for one escrow from settling another, while `AliveEscrow` also requires `issuedAt >= fundedAt(escrowId)` so a pre-funding proof cannot release newly locked value.

## Alternatives considered

- Opaque message signing: rejected because domain and field intent are less explicit.
- Raw oracle transactions: rejected because the escrow should validate a portable result rather than trust an unrestricted withdrawal actor.
- Full evidence onchain: rejected for privacy and cost.

## Consequences

Verifier-key security is a central MVP trust assumption. The current registry supports owner-controlled signer rotation, exact registered-fingerprint binding, and global session consumption. A separate `ALIVE Verifier Authorization` EIP-712 domain authenticates wallet control for HTTP resource creation; it is intentionally not interchangeable with the onchain attestation domain. Production evolution can add hardware-backed signing and multi-verifier consensus.
