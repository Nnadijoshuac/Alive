# ADR 001: Keep raw evidence offchain

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

The verifier and evidence host are trusted in the MVP. Production deployments need encrypted durable storage, key management, and stronger provenance controls.
