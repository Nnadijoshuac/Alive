# @alive/shared

Canonical protocol types shared by the ALIVE capture client, verifier, and contract integration.

The package exports strict Zod schemas for assets, registration views, visual fingerprints, active-verification sessions, score signals/results, and signed attestations. It also exports deterministic JSON/Keccak commitments, basis-point score conversion and policy evaluation, the EIP-712 type definition, and centralized local/X Layer chain definitions.

## Invariants

- Any score crossing the onchain boundary is an integer from `0` through `10_000`.
- `context` binds an attestation to its intended consumer (normally an escrow ID). The zero `bytes32` value represents an explicitly unbound/generic inspection.
- Raw images are not part of public asset or attestation records.
- Canonical commitments reject `undefined`, non-finite numbers, dates, class instances, and other ambiguous JSON inputs.

## Commands

```bash
pnpm --filter @alive/shared typecheck
pnpm --filter @alive/shared test
pnpm --filter @alive/shared build
```
