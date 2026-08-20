# ALIVE product pivot

Pivot date: **2026-08-14**

Archive checkpoint: tag `v0.8.1-physical-state-archive` at commit `bf449f6`

Active rebuild branch: `feat/rwa-intelligence-pivot`

## Why ALIVE changed

### Old thesis

ALIVE V1 was a Proof-of-Physical-State protocol. It combined camera capture,
visual instance matching, short-lived EIP-712 attestations, contract validation,
and conditional test-token escrow settlement.

The engineering was real and locally testable, but the product depended on
creating demand for tokenized machinery and equipment while also solving a hard
camera-authenticity problem. That is no longer the primary market thesis.

### Market learning

The product decision is to build around RWA categories that already have active
market demand: tokenized Treasuries and money-market products, tokenized funds,
equities, gold and commodities, and practical credit products.

This is a strategic product judgment, not a claim that physical-state research
was technically worthless or that every listed RWA category is equally liquid,
available, or legally accessible on every network.

### New thesis

ALIVE is an AI-native intelligence and policy layer for tokenized real-world
assets.

> Tell ALIVE what you want your money to do.

ALIVE should translate a natural-language mandate into a strict policy,
evaluate eligible assets using sourced data, calculate a compliant allocation,
and let a user-owned vault enforce the approved rules.

The governing design is:

```text
AI THINKS.
CODE CALCULATES.
SMART CONTRACTS ENFORCE.
```

AI output is advisory input to the system. It is never policy truth, portfolio
arithmetic, arbitrary calldata, or unrestricted custody authority.

## New causal chain

```text
user mandate
-> AI candidate interpretation
-> strict schema and semantic validation
-> normalized canonical policy and policy hash
-> sourced, freshness-bounded market snapshot
-> deterministic optimization and simulation
-> explicit user approval or bounded signer authorization
-> vault policy enforcement
-> execution result
-> drift monitoring and compliant rebalance proposal
```

A screen or explanation is not proof of policy enforcement. The defining demo
must include a real contract rejection for an invalid allocation and a real
contract execution for a valid one.

## Product truth categories

Every product surface should distinguish these four categories:

| Category     | Meaning                                                         |
| ------------ | --------------------------------------------------------------- |
| AI opinion   | Interpretation, comparison, summary, or explanation             |
| Policy rule  | User-approved deterministic constraint                          |
| Market data  | Provider-labelled observation with provenance and timestamp     |
| Onchain fact | Contract state, receipt, event, or verified transaction outcome |

Synthetic or dated snapshot values must say `DEMO DATA - NOT LIVE MARKET DATA`.
Missing externally sourced facts must remain `UNKNOWN`.

## Reuse and retirement map

| Existing capability                         | Decision | Pivot treatment                                                                  |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| Next.js, React, TypeScript, pnpm monorepo   | Reuse    | Keep the application and quality infrastructure.                                 |
| wagmi, viem, wallet and transaction UX      | Reuse    | Bind to policy/vault actions and X Layer configuration.                          |
| Shared Zod and canonical hashing patterns   | Adapt    | Define RWA, market, policy, portfolio, and strategy formats.                     |
| EIP-712 signing and replay protection       | Adapt    | Bind signed strategies to vault, policy, market snapshot, nonce, and expiry.     |
| Contract test and deployment infrastructure | Reuse    | Extend for policy registry, RWA registry, strategy verifier, vault, and mocks.   |
| MockUSDT                                    | Adapt    | Retain only as clearly labelled test liquidity where useful.                     |
| Three.js, motion, responsive fallbacks      | Adapt    | Visualize capital flow, asset nodes, policy boundaries, and rejection.           |
| Dashboard, status, protocol, demo patterns  | Adapt    | Replace physical-state content with RWA policy state and provenance.             |
| Remotion project                            | Adapt    | Replace the physical-camera story after the core policy path works.              |
| Camera registration and object matching     | Retire   | Historical V1 only; not a primary route or current product investment.           |
| OCR/CLIP physical verifier                  | Retire   | Preserve at the archive tag; do not describe it as V2 RWA intelligence.          |
| Physical liveness and replay challenges     | Retire   | Replace the product Attack Lab with policy, freshness, signer, and replay cases. |
| Physical-state escrow                       | Replace  | Superseded by a user-owned RWA policy vault and bounded execution.               |

No repository move is required merely for aesthetic symmetry. The tag is the
stable preservation boundary; live source should be moved only when that makes
ownership and build behavior clearer.

## Milestone ledger

Status vocabulary: `COMPLETE`, `PARTIAL`, `IN PROGRESS`, `NOT STARTED`, or `BLOCKED`.
Source presence alone is not completion.

| Milestone | Scope                                            | Status      | Evidence / remaining gate                                                                                      |
| --------- | ------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------- |
| P1        | Pivot architecture and archive old product       | IN PROGRESS | Archive tag and branch exist; docs and active product separation are underway.                                 |
| P2        | Policy compiler, schema, validation, hash, UI    | PARTIAL     | Schema/hash and labelled fallback pass tests; real-LLM/UI approval flow not proven.                            |
| P3        | RWA catalog, provenance, intelligence, passports | PARTIAL     | Eight-asset demo catalog/provenance exists; extraction and passport UI are absent.                             |
| P4        | Deterministic optimizer and risk engine          | PARTIAL     | Allocation, drift, and rebalance logic pass five tests; complete risk methodology and app/onchain flow remain. |
| P5        | Policy contracts and user-owned vault            | PARTIAL     | Four V2 contracts compile and pass 20 focused tests; no app/public/audit evidence.                             |
| P6        | Mock RWA execution                               | PARTIAL     | Test tokens/router deploy and execute locally; no integrated/public demo flow.                                 |
| P7        | Policy Attack Lab                                | NOT STARTED | UI and automated contract-backed scenarios are not complete.                                                   |
| P8        | X Layer Testnet end to end                       | NOT STARTED | No V2 contract address or transaction is recorded.                                                             |
| P9        | RWA frontend, Three.js, and Remotion rebuild     | NOT STARTED | Do not count archived V1 presentation assets as the new narrative.                                             |
| P10       | Hackathon release                                | NOT STARTED | Requires a complete public evidence chain and green CI.                                                        |

Do not create `v0.9.0-rwa-pivot` until P1 is stable and verified. Do not create
`v1.0.0-hackathon` until the acceptance chain is publicly reproducible.

## MVP acceptance chain

The pivot MVP is complete only when one reproducible flow demonstrates:

```text
mandate
-> validated canonical policy
-> deterministic feasible portfolio
-> approved policy committed onchain
-> test funds deposited
-> invalid concentration attempt rejected by the contract
-> valid allocation executed
-> market-driven drift detected
-> compliant rebalance executed
```

The demo must identify whether each value comes from AI, deterministic code,
demo market data, or the chain. It must not invent live prices, yields,
transactions, addresses, or rejection outcomes.

## Product and legal boundary

ALIVE is experimental financial software. It is not investment advice. Demo
assets may be simulated, and yield/risk metrics are informational estimates.
The repository has not received an external smart-contract, financial-model,
or application security audit. Do not use the pivot build with valuable assets.

## Historical record

The V1 source checkpoint is `v0.8.1-physical-state-archive`. The factual V1
audit remains in [BUILD_STATUS.md](BUILD_STATUS.md#historical-v1-physical-state-audit).
The legacy HTTP and scoring references remain in [API.md](API.md) and
[SCORING.md](SCORING.md) until their code is removed from the active tree.
