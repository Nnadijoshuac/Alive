# ALIVE security model

Status: **V2 pivot in progress; unaudited; test assets only**

## Scope

ALIVE is experimental financial software for expressing and enforcing policy
over tokenized real-world assets. The V2 system is being rebuilt on
`feat/rwa-intelligence-pivot`; it is not a completed, deployed, or audited vault
system.

ALIVE does not provide investment advice, guarantee returns, certify an issuer,
establish legal ownership of an offchain asset, guarantee redemption, or make a
risk score objectively true. Demo assets and market values may be simulated and
must be labelled as such. Do not custody valuable assets with this code.

## Primary security assumption

```text
THE AI MAY BE WRONG OR COMPROMISED.
```

The system remains safe only if malformed, adversarial, or unreasonable model
output cannot bypass deterministic validation, user authorization, approved
asset/router boundaries, market freshness, or onchain policy.

The intended authority split is:

- AI interprets, extracts, compares, explains, and proposes.
- Deterministic code validates schemas, normalizes policy, calculates
  allocations, simulates execution, and detects violations.
- The user approves policy and retains custody or grants narrowly bounded
  authority.
- Smart contracts enforce the supported policy subset, replay/expiry, and
  execution boundaries.

## Protected outcomes

- A raw LLM response must never become policy, calldata, a signature, or an
  execution instruction without strict deterministic processing.
- An impossible, contradictory, malformed, or unsupported policy must fail
  before approval.
- The onchain policy hash and enforceable fields must correspond to the exact
  user-approved normalized policy.
- Only approved, enabled asset tokens and approved execution routers may be
  used by a vault.
- Allocations must respect encoded class, issuer, single-asset, cash, freshness,
  and slippage limits after actual execution.
- A strategy for one vault, policy, market snapshot, portfolio state, chain, or
  verifier must not authorize another context.
- Expired, future-issued, wrong-signer, stale-data, or replayed strategies must
  fail.
- Advisory mode requires user authorization. Guarded-auto authority, if
  enabled, must remain bounded by the vault policy and must not expose a user's
  private key.
- A failed router call, malicious token transfer, short receipt, or invalid
  post-balance must revert atomically.
- Synthetic values, AI claims, and UI state must not be presented as live market
  data or onchain facts.

## Assets and trust roots

### User assets

The intended V2 trust root is a user-owned vault. The owner controls deposits,
withdrawals, policy approval/versioning, and approval mode. No AI service or
strategy signer should hold the user's wallet key.

### Canonical policy

The approved normalized policy and its deterministic encoding are security
artifacts. Any mismatch between displayed policy, hashed policy, registered
fields, and executed checks is a critical bug.

### RWA registry

The approved-asset registry is authoritative only for the token address,
class/issuer identifiers, enabled state, and metadata/provenance commitments it
stores. It cannot prove that an issuer's offchain statements are true or that a
token remains redeemable or legally accessible to a user.

### Market data

A provider-labelled market snapshot is trusted only within its documented
source, timestamp, status, and freshness boundary. Demo providers are not trust
roots for real value. A future Chainlink adapter still requires correct feed
selection, report verification, decimals, market-status handling, and staleness
checks.

### Strategy signer

The authorized strategy signer is a centralized trust point. Its authority is
intended to be constrained to typed proposals that the vault independently
validates. Signer compromise must not allow arbitrary withdrawals, arbitrary
routers, unsupported assets, stale execution, or policy violations.

### Contract owner and administrators

Registry/verifier administration can affect approved assets and signer trust.
Until roles, rotation delays, monitoring, multisig ownership, and emergency
behavior are finalized, these accounts remain high-impact trust roots.

## Threats and required controls

The status column describes the pivot at the time of this document. `UNDER
REVIEW` means source exists but the final test and integration evidence is not
yet recorded.

| Threat                                                  | Required control                                                                                                    | Pivot status                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Prompt injection asks the model to ignore policy        | Treat model output as candidate JSON; strict schema and semantic checks; contract policy remains final              | Foundation in progress; end-to-end proof pending                                  |
| Hallucinated or unsupported asset                       | Resolve only canonical catalog IDs; require enabled registry entry and provenance; use `UNKNOWN` for missing fields | Foundation in progress                                                            |
| Contradictory mandate                                   | Validate BPS ranges and feasibility before approval; return reason codes                                            | Shared/policy validation tests pass; UI approval remains                          |
| Model chooses arbitrary weights                         | Deterministic optimizer owns all allocation arithmetic and rounding                                                 | Five focused optimizer tests pass; independent review remains                     |
| Explanation differs from calculation                    | Generate explanation from deterministic result fields and test referenced values                                    | Not yet proven end to end                                                         |
| Forged or ambiguous policy hash                         | Versioned canonical encoding, strict types, cross-language test vectors                                             | TypeScript and Solidity tuple-hash parity test passes; independent review remains |
| User approves a different policy from the one shown     | Show normalized policy and hash before wallet action; bind owner/vault/version onchain                              | UI integration not complete                                                       |
| Stale or fabricated quote                               | Provider, observation time, status, provenance, max-age checks; label demo mode                                     | Demo provider under review; production adapter not complete                       |
| Oracle/feed substitution                                | Bind asset/feed identity and market snapshot hash into strategy; registry allowlist                                 | Design defined; public proof pending                                              |
| Rounding or overflow changes limits                     | Integer BPS, fixed token decimals, checked math, exact-sum tests, post-balance validation                           | Unit/contract review in progress                                                  |
| Single-asset or issuer concentration                    | Deterministic precheck plus direct vault enforcement of supported fields                                            | Contract implementation under review                                              |
| Unapproved or blocked token                             | Registry enabled check and policy allow/block lists on every execution                                              | Contract implementation under review                                              |
| Arbitrary calldata or malicious router                  | Fixed typed execution plan and approved router interface; no LLM calldata                                           | Contract implementation under review                                              |
| Fee-on-transfer, rebasing, callback, or malicious token | Approved-token model, exact balance deltas, checks-effects-interactions, reentrancy guard, adversarial tests        | Contract tests pending final report                                               |
| Wrong strategy signer                                   | EIP-712 recovery against authorized signer with domain/context binding                                              | Contract implementation under review                                              |
| Cross-vault or cross-policy replay                      | Bind vault, policy hash/version, portfolio hashes, snapshot hash, nonce, chain, and verifier                        | Contract implementation under review                                              |
| Expired or future strategy                              | Bounded `issuedAt`/`expiresAt`, freshness checks, one-time nonce consumption                                        | Contract implementation under review                                              |
| Front-running changes the portfolio before execution    | Bind pre-portfolio hash and verify current state before router call                                                 | Contract implementation under review                                              |
| Router produces a different result                      | Bound plan hash/slippage plus actual post-balance policy validation                                                 | Contract implementation under review                                              |
| Unsolicited token transfer changes vault holdings       | Recompute the complete bounded portfolio; include the token in the next snapshot or fail explicitly                 | Contract behavior under review; transfers cannot be prevented                     |
| Compromised vault owner                                 | Treat owner as custody root; owner withdrawal is intentionally not blocked by allocation policy                     | By design; wallet security remains critical                                       |
| Compromised signer                                      | Vault-enforced limits, signer rotation, least-privilege host, short expiry, monitoring                              | Enforcement under review; operations incomplete                                   |
| Compromised frontend                                    | Wallet displays exact typed data/transactions; contract rejects unauthorized or invalid state                       | Wallet/browser verification pending                                               |
| Fake success in demo UI                                 | Derive onchain facts from receipts/state and expose reverts; never hardcode hashes or pass scores                   | V2 UI not complete                                                                |

## Policy compiler boundary

The expected pipeline is:

```text
untrusted user text
-> untrusted model response
-> strict JSON/schema parse
-> semantic validation
-> normalization
-> feasibility checks
-> canonical encoding and hash
-> user-visible review
-> explicit approval
```

The parser must reject unknown fields when they could broaden authority. Default
values must be conservative and visible. Policy updates create explicit
versions; they do not mutate history silently.

An `LLM_PROVIDER=disabled` state is valid. An offline compiler must not be hidden
behind deterministic example output labelled as AI.

## Market-data boundary

Every quote or report used in a strategy must identify:

- canonical asset ID;
- provider and provider-specific identity where applicable;
- price and documented decimals;
- observation timestamp;
- retrieval timestamp or calculable age;
- market status, if the provider supplies it;
- demo/live status;
- source/provenance reference.

Application and contract checks should reject data older than the approved
policy allows. Clock skew, chain timestamp assumptions, feed outages, closed
markets, and stale-but-signed reports require explicit behavior.

Chainlink credentials, when used, are server-only. They must never use a
`NEXT_PUBLIC_` name or enter browser bundles, logs, fixtures, or Git history.

## Strategy and EIP-712 boundary

A strategy proposal should bind at least:

```text
vault
policy hash/version
portfolio before hash
portfolio after hash
market snapshot hash
execution plan hash
strategy nonce
issuedAt
expiresAt
```

The domain must bind the active chain and verifying contract. The verifier must
recover the authorized signer, reject malformed signatures, and consume a
nonce exactly once. The vault must independently check its owner/mode, current
policy, current portfolio, freshness, approved assets/router, and post-state.

Signing a proposal is not authorization to withdraw to the signer. The vault's
withdrawal destination remains owner-controlled.

## Contract security expectations

- Solidity compiler, optimizer, EVM target, and deployment configuration stay
  pinned and documented.
- All external token/router interaction follows checks-effects-interactions and
  uses reentrancy protection where state/value flow requires it.
- Deposits and withdrawals use actual balance deltas and documented token
  decimal assumptions.
- Strategy consumption and state transitions are atomic with execution.
- Policy versions are owner-bound and immutable once registered.
- Owner withdrawals intentionally bypass allocation policy so policy cannot
  trap funds; this is not a protection against owner-key compromise.
- Direct token transfers cannot be prevented and must be visible in the next
  full portfolio snapshot rather than silently omitted.
- Plan positions are bounded, but registry/position scan gas requires a
  production scalability review.
- Administrative changes emit events and require explicit authority.
- Test mocks are named and labelled as mocks; they are not production venues or
  securities.
- Unit tests do not substitute for an external audit, fuzzing, invariant tests,
  formal review, or public adversarial testing.

## Data handling

### Onchain

Store only the minimum required enforcement and audit data: hashes, identifiers,
token addresses, bounded policy fields, timestamps/nonces, ownership, state,
and events. Do not put user mandates, model prompts, source documents, API
credentials, private portfolio notes, or large metadata onchain.

### Offchain

The planned local data model may contain catalog sources, quotes, policies,
proposals, holdings, and execution/risk snapshots. Local SQLite is not encrypted
by default and has no production retention policy. Do not commit it.

Source documents may have licensing or personal-data restrictions. Cache only
what the product is allowed to retain, record provenance, and keep restricted
documents out of Git.

### Secrets

Never commit or expose:

- wallet, deployer, verifier, or strategy-signer private keys;
- Chainlink or other provider credentials;
- LLM provider keys;
- database files, wallet exports, or mnemonic phrases;
- model binaries, captured media, or rendered videos.

The browser may receive public RPC URLs, chain IDs, contract addresses, and
non-secret feature flags only.

## Operational controls still required

- independent contract and application security review;
- production role design, multisig ownership, signer rotation, and emergency
  response;
- hardware-backed or isolated strategy-signing keys;
- authenticated APIs, rate limits, abuse controls, audit logs, and TLS;
- market-provider health monitoring and failover behavior;
- reproducible deployments and source verification;
- alerting for registry, policy, signer, withdrawal, and failed-execution events;
- backup, recovery, migration, retention, and privacy procedures;
- jurisdiction/product eligibility and appropriate legal review before real RWA
  access.

## Release security gate

Do not call V2 testnet-ready until automated tests and public evidence cover:

1. valid policy registration and owner-only versioning;
2. invalid/unknown/blocked assets;
3. asset, class, issuer, cash, risk/freshness, and slippage violations;
4. wrong vault, policy, market snapshot, signer, and portfolio state;
5. stale, expired, future-issued, and replayed strategies;
6. malicious token/router and reentrancy behavior;
7. successful deposit, allocation, drift detection, and minimum-turnover
   rebalance;
8. real contract rejection for the policy Attack Lab;
9. exact transaction hashes, receipts, addresses, deployer, bytecode/source
   verification, and current official X Layer network configuration;
10. green frozen install, lint, typecheck, tests, contract tests, and production
    build in GitHub Actions.

## Historical V1 physical-state security

V1 used camera evidence, resource-scoped bearer capabilities, wallet-bound
authorization, short-lived fingerprint-bound attestations, and physical escrow.
Its residual risks included camera injection, replay/video presentation,
uncalibrated matching, a centralized verifier key, unencrypted local evidence,
and incomplete public deployment.

That source is preserved at tag `v0.8.1-physical-state-archive` (`bf449f6`). The
full factual V1 audit remains in
[BUILD_STATUS.md](BUILD_STATUS.md#historical-v1-physical-state-audit). V1
controls should be reused as engineering patterns where appropriate, but they
must not be represented as V2 portfolio-policy protection.

## Reporting

Do not include funded keys, credentials, private source documents, user
financial data, exploit payloads against a live deployment, or raw legacy
capture media in a public report. Record affected commit, chain, contract,
transaction, policy version, market snapshot, expected invariant, actual
result, and a minimal safe reproduction.
