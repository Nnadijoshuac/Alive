# ALIVE contributor guide

ALIVE is an AI-native intelligence and policy layer for tokenized real-world
assets. Preserve the complete causal chain:

user mandate -> candidate interpretation -> strict validation -> canonical
policy -> sourced market snapshot -> deterministic portfolio calculation ->
user or bounded signer authorization -> smart-contract enforcement ->
execution outcome.

The AI may interpret, research, compare, explain, and propose. It may not bypass
deterministic policy validation, approved-asset rules, allocation constraints,
freshness checks, user authorization, or contract enforcement.

## Engineering rules

- Keep raw inspection media, source documents with restricted rights, and user
  financial data offchain and out of Git.
- Never hardcode successful policy checks, market values, yields, risk scores,
  transaction hashes, contract addresses, or explorer links.
- Label synthetic and dated snapshot data. Never present demo data as live.
- Record provenance for externally derived RWA metadata. Missing facts remain
  `UNKNOWN`; they are never inferred silently.
- Use integer basis points for allocations, percentages, scores, fees, and
  slippage that cross a deterministic or onchain boundary.
- Treat market snapshots, strategy proposals, signatures, verification
  sessions, and attestations as expiring and single-use where applicable.
- Keep X Layer configuration centralized.
- Surface uncertainty, data freshness, and reason codes. Clearly distinguish
  AI opinion, policy rule, market data, and onchain fact.
- Do not let an LLM generate arbitrary calldata, sign transactions, or become
  the source of truth for portfolio arithmetic.
- Add or update tests whenever protocol behavior changes.
- Do not commit private keys, local databases, model binaries, capture media, or rendered videos.

The physical-state implementation is historical V1 work. Preserve it through
the `v0.8.1-physical-state-archive` tag and clearly marked legacy documentation;
do not restore camera verification as the primary product.

## Quality commands

Run the narrowest relevant check while developing, then run `pnpm check` before
a stable merge. Contract and legacy verifier checks are also available through
`pnpm test:contracts` and `pnpm test:verifier`.

## Visual language

The product is technical, financial, and high-trust. Use the shared near-black
palette and one scanner-green accent. Motion must explain mandate compilation,
capital flow, policy boundaries, rejection, or rebalancing. Reduced-motion and
non-WebGL paths are required.
