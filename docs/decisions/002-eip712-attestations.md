# ADR 002: EIP-712 verifier attestations

## Context

Escrow needs a compact physical-state result that can be authenticated and replay-protected on an EVM chain.

## Decision

Sign canonical typed attestation data with a dedicated verifier key. Include asset ID, session ID, subject, basis-point scores, verdict, evidence hash, issue time, and expiry.

## Why

Typed data is inspectable, deterministic, and efficiently recoverable in Solidity. Session IDs and expiries provide bounded replay protection.

## Alternatives considered

- Opaque message signing: rejected because domain and field intent are less explicit.
- Raw oracle transactions: rejected because the escrow should validate a portable result rather than trust an unrestricted withdrawal actor.
- Full evidence onchain: rejected for privacy and cost.

## Consequences

Verifier-key security is a central MVP trust assumption. Production evolution can introduce key rotation, hardware-backed signing, and multi-verifier consensus.
