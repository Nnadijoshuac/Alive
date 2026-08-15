# @alive/shared

Canonical protocol types shared by ALIVE applications, deterministic engines,
and contract integration. The original physical-state exports remain available;
the RWA pivot adds strict policy, asset-passport, market-snapshot, and strategy
commitment schemas alongside them.

The package exports strict Zod schemas for assets, registration views, visual fingerprints, active-verification sessions, score signals/results, and signed attestations. It also exports deterministic JSON/Keccak commitments, basis-point score conversion and policy evaluation, the EIP-712 type definition, and centralized local/X Layer chain definitions.

## Invariants

- Any score crossing the onchain boundary is an integer from `0` through `10_000`.
- `context` binds an attestation to its intended consumer (normally an escrow ID). The zero `bytes32` value represents an explicitly unbound/generic inspection.
- Raw images are not part of public asset or attestation records.
- Canonical commitments reject `undefined`, non-finite numbers, dates, class instances, and other ambiguous JSON inputs.
- RWA asset metadata is field-provenanced. Optional unknown facts are omitted;
  the literal `UNKNOWN` is not valid metadata.
- Market prices are canonical decimal strings, never JavaScript numbers.
- Policy percentages are integer BPS. Parsed policies reject duplicate or
  contradictory constraints and normalize identifier arrays with code-unit
  ordering.
- `hashPortfolioPolicy` is an EIP-712-style struct hash over ABI-encoded fixed
  fields and Keccak-hashed dynamic arrays. Its frozen parity vector is
  `data/fixtures/policy-hash-parity.json`.
- Strategy signing uses the contract-frozen `ALIVE RWA Strategy` EIP-712 domain
  and binds policy, before/after portfolios, market snapshot, execution plan,
  nonce, freshness timestamp, issuance, and expiry.

## Commands

```bash
pnpm --filter @alive/shared typecheck
pnpm --filter @alive/shared test
pnpm --filter @alive/shared build
```
