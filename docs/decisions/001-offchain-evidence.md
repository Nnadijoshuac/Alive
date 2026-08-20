# ADR 001: Keep raw evidence offchain

Status: **Accepted for historical V1; superseded as the primary product
architecture by [the RWA pivot](../PIVOT.md).** The privacy principle remains
applicable to restricted source documents and user financial data.

## Context

Camera evidence and feature vectors are sensitive, large, and unsuitable for public permanent storage.

## Decision

Store raw captures, derived descriptors, and OCR intermediates through a local storage abstraction. Commit a deterministic hash of the canonical fingerprint onchain.

## Why

This keeps costs low, avoids publishing private media, and gives contracts a stable reference without storing oversized data.

## Alternatives considered

- Onchain images and vectors: rejected for privacy and cost.
- Mandatory IPFS: rejected for the local, near-zero-cost MVP.
- Browser-only localStorage: rejected because sessions and signing require authoritative backend state.

## Consequences

The verifier and evidence host are trusted in the MVP. The verifier includes the finalized fingerprint commitment in every attestation, and the attestation registry requires exact equality with the asset registry before consumption; this detects commitment substitution but does not make private evidence independently reproducible. Production deployments need encrypted durable storage, key management, retention governance, and stronger capture provenance controls.
