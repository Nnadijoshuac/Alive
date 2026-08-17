# ALIVE

**AI-powered RWA verification infrastructure on X Layer.**

Tokenization can put an asset onchain. That does not automatically tell another
smart contract whether the information behind that asset is current, or whether
it still meets the rules required for use.

ALIVE ingests RWA information, uses AI to structure the underlying facts,
validates those facts against deterministic eligibility rules, and publishes an
enforceable verdict that ALIVE smart contracts check before capital moves.

```text
AI UNDERSTANDS
   ↓
ALIVE VERIFIES
   ↓
X LAYER ENFORCES
   ↓
CAPITAL MOVES
```

The AI never decides whether capital may move. It proposes candidate facts,
every one of which must cite a supplied source; deterministic code evaluates
those facts against the policy; and the smart contract enforces the result.

## Live on X Layer Testnet

The core protocol is deployed on X Layer Testnet (chain `1952`) and the gateway
is proven with real transactions.

| Contract                   | Address                                      |
| -------------------------- | -------------------------------------------- |
| `AliveRwaAssetRegistry`    | `0xE4B4F15D7d484c14128260d29b9d4D7739677Ce3` |
| `AliveEligibilityRegistry` | `0x5E3584d61710f8FD6076d93a0bDbE96784a4f98d` |
| `AlivePolicyRegistry`      | `0x531E8b545c92C4Ab616a943B41b2Ae817F342E3b` |
| `AliveStrategyVerifier`    | `0xD3B71c5cde87e6cA750920dD4DB7eD8Cf7AE2221` |
| `AliveVaultFactory`        | `0xd2c06F2978De1CF7e589b3e054373C871E594fBc` |
| `AliveVault`               | `0xd998a66A76501a32557B57A21F33c84396490ae0` |

The proven sequence, each step a real testnet transaction:

```text
ELIGIBLE                → gated deposit CONFIRMED   0x547033d6…
NAV goes stale (31h)    → RESTRICTED: NAV_STALE
                        → same deposit REJECTED     AssetNotEligible
NAV restored            → ELIGIBLE
                        → gated deposit CONFIRMED   0x9e2a1a39…
```

Addresses, blocks, transaction hashes, and the exact limits of that proof are
in [docs/X Layer deployment](docs/XLAYER_DEPLOYMENT.md), generated from
verified receipts rather than written by hand.

## What is real, and what is demo

Being precise about this matters more than sounding impressive.

| Component                       | Status                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Core contracts on X Layer       | **Real.** Deployed, receipt- and bytecode-verified on chain 1952.                                        |
| Eligibility enforcement         | **Real.** The vault reverts `AssetNotEligible` from its own logic, not the frontend.                     |
| Ingestion, extraction, rules    | **Real.** Documents are hashed and cited; every extracted fact must reference a supplied source.         |
| AI extraction                   | **Real integration, off by default.** With no model configured it runs a labelled deterministic reader.  |
| RWA assets (tTBILL, tGOLD, …)   | **Demo.** Synthetic tokens under fictional issuers. Not real tokenized securities.                       |
| Market data                     | **Demo by default.** A Chainlink Data Streams adapter exists and is disabled unless configured.          |
| `MockRwaRouter`, `DemoRwaFaucet`| **Demo.** A deterministic price fixture and a test faucet. Not a DEX and not an oracle.                  |
| X Layer Mainnet                 | **Not deployed.** Configuration only; gated behind an explicit acknowledgement.                          |

ALIVE never presents demo data as live. Degraded or synthetic quotes stay
labelled `DEMO` end to end.

### Live today

- Groq AI document extraction (real official Superstate/Invesco USTB
  documents for `ttbill-b`, cited facts, schema-validated)
- Source/citation validation (every extracted fact traces to a supplied
  source; unsupported claims are rejected, not guessed)
- Real Chainlink NAV, Proof-of-Reserve, and AUM feeds (USTB, OpenEden
  TBILL, Kinesis KAU, Cap cUSD) with persistent monitoring
- Deterministic eligibility evaluation, with a real DEMO → LIVE promotion
  once an asset has genuinely been analyzed from real sources
- X Layer Testnet enforcement (`AliveVault.depositEligibleAsset`, proven
  with real transactions)
- Attack Lab (adversarial policy-allocation testing against the
  deterministic policy evaluator)

### Not yet connected

- Macroeconomic intelligence (unemployment, GDP, rate data)
- News / event monitoring
- Equity fundamentals beyond the demo catalog
- Outlook / prediction modeling — the Asset Intelligence page has a UI
  slot for this and always shows "Not evaluated," never a fabricated
  number
- Continuous AI document-change monitoring (re-analysis is triggered
  manually today, not on a schedule)

These are roadmap ideas, not shipped features — do not read the "Live
today" list as complete coverage of ALIVE's eventual product surface.

## Current status

| Product line                    | Status                    | Boundary                                                                                                     |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| V2: RWA verification gateway    | **LIVE ON TESTNET**       | Deployed and proven on chain 1952 with demo RWA assets. Not audited; do not custody value.                    |
| V1: Proof of Physical State     | ARCHIVED, WORKING LOCALLY | The camera/verifier/attestation/escrow MVP passed its local flow. It is no longer the product.                |

The V1 checkpoint is tag `v0.8.1-physical-state-archive` at commit `bf449f6`.
Track exact evidence in [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md) and the
product decision in [docs/PIVOT.md](docs/PIVOT.md).

## Product thesis

As tokenized Treasuries, funds, equities, gold, commodities, and credit products
move onchain, access alone is not enough. Users need to decide what they should
own, how much, which issuers they are exposed to, how liquid the portfolio is,
and what an AI is permitted to do when conditions change.

ALIVE's core differentiator is a user-defined constitution:

```text
USER MANDATE
-> CANDIDATE AI INTERPRETATION
-> STRICT POLICY
-> SOURCED RWA INTELLIGENCE
-> DETERMINISTIC PORTFOLIO
-> SIMULATION
-> USER-OWNED VAULT
-> CONTRACT ENFORCEMENT
-> MONITOR AND REBALANCE
```

A request such as `put 100% into tNVDA` may be interpreted and displayed, but a
vault with a 20% single-asset cap must reject it. The rejection must be a real
contract revert, not a frontend warning.

## Trust model

The product must visibly distinguish:

| Label        | Meaning                                                        |
| ------------ | -------------------------------------------------------------- |
| AI opinion   | A fallible interpretation, summary, comparison, or explanation |
| Policy rule  | A user-approved deterministic constraint                       |
| Market data  | A provider-labelled value with provenance and timestamp        |
| Onchain fact | Contract state, event, receipt, or revert                      |

Demo quotes must say `DEMO DATA - NOT LIVE MARKET DATA`. Missing issuer or
product facts remain `UNKNOWN`. ALIVE does not promise returns, beat the market,
or describe any investment as risk-free.

## RWA intelligence flow

How a tokenized asset goes from raw source documents to an onchain-enforced
verdict:

```mermaid
flowchart LR
    A[Official issuer docs] --> C[Groq AI extraction]
    B[Chainlink NAV / price feed] --> F[Live market snapshot]
    C --> D[Cited facts + schema validation]
    D --> E[Asset Intelligence]
    F --> E
    D --> G[Deterministic eligibility engine]
    F --> G
    G --> H[Signed eligibility verdict]
    H --> E
    H --> I[X Layer eligibility registry]
    I --> J[AliveVault enforcement]
    J --> K[Deposit confirmed or reverted]
```

Every fact on the Asset Intelligence page cites a real source; the AI never
decides eligibility — it only proposes facts. A deterministic engine checks
those facts (plus live price/NAV) against policy and signs a verdict, and the
vault contract enforces that verdict onchain, independent of the frontend.

## V2 architecture

```mermaid
flowchart LR
    A[User mandate] --> B[LLM candidate JSON]
    B --> C[Strict schema and semantic validator]
    C --> D[Canonical policy and hash]
    E[RWA catalog and provenance] --> F[Timestamped market snapshot]
    D --> G[Deterministic optimizer]
    F --> G
    G --> H[Simulation and policy checks]
    H --> I[User approval or bounded EIP-712 strategy]
    I --> J[AliveVault]
    K[Asset registry] --> J
    L[Policy registry] --> J
    M[Strategy verifier] --> J
    J --> N[Approved router]
    N --> O[Execution or atomic rejection]
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for target boundaries and
[docs/SECURITY.md](docs/SECURITY.md) for the security model.

## Repository map

| Path                     | Responsibility and current state                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `apps/web`               | Next.js, wagmi/viem, visualization, and transaction UX. RWA intelligence terminal (Overview/Explore/Watchlist/Activity/Asset Intelligence) rebuilt; legacy policy-compiler pages retained under Advanced nav. |
| `packages/shared`        | Runtime schemas, canonical encoding, policy/RWA/market/strategy types, and shared chain configuration.  |
| `packages/policy-engine` | Strict policy validation and clearly labelled deterministic mandate fallback.                           |
| `packages/market-data`   | Tested demo provider plus a fail-closed, server-side Chainlink Data Streams adapter.                    |
| `packages/optimizer`     | Tested deterministic allocation, drift detection, and rebalance proposal logic.                         |
| `packages/contracts`     | V1 contracts plus locally tested V2 registry, strategy verifier, user-owned vault, and labelled mocks.  |
| `services/intelligence`  | Tested Fastify policy, catalog, market, optimizer, policy-check, and rebalance API with SQLite storage. |
| `services/verifier`      | Legacy V1 physical-image verifier; retained for archive/regression, not V2 RWA intelligence.            |
| `videos/alive-launch`    | Legacy V1 Remotion composition. A V2 video will follow the working core.                                |
| `docs`                   | Pivot, architecture, security, build ledger, legacy references, and deployment guidance.                |

The repository is not being reorganized merely to match a diagram. Working
infrastructure is reused where it has a clear V2 responsibility.

## Prerequisites

- Node.js 22 or newer
- pnpm 11.1.2
- an EVM wallet for contract interactions
- a local Hardhat node for deterministic contract work
- Ollama only when the local `ollama` provider mode is enabled
- test OKB only for an explicitly approved X Layer Testnet deployment

No paid AI API, database, or market-data subscription is required for the
zero-cost demo path.

## Install

```bash
corepack enable
pnpm install --frozen-lockfile
```

The workspace explicitly allows install scripts only for the reviewed native
dependencies in `pnpm-workspace.yaml`. Do not bypass that allowlist to make CI
green.

## Environment

Use the committed templates; never commit filled secrets:

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item packages/contracts/.env.example packages/contracts/.env
```

The root file is a template, not an implicit monorepo-wide loader. Load values
into the shell that starts a process, or use the package-local file that process
supports.

Near-zero-cost V2 defaults are intended to be:

```dotenv
LLM_PROVIDER=disabled
LLM_MODEL=
LLM_BASE_URL=http://127.0.0.1:11434
LLM_API_KEY=

MARKET_DATA_PROVIDER=demo
DEMO_MARKET_DATA_ENABLED=true

CHAINLINK_DATA_STREAMS_ENABLED=false
CHAINLINK_DATA_STREAMS_USERNAME=
CHAINLINK_DATA_STREAMS_PASSWORD=
CHAINLINK_DATA_STREAMS_ENDPOINT=
```

`LLM_PROVIDER=disabled` must produce an honest `AI COMPILER OFFLINE` state.
Chainlink and LLM credentials stay server-side and never receive a
`NEXT_PUBLIC_` prefix.

Legacy V1 verifier/signing settings remain in the templates during the archive
transition. They do not configure the new RWA policy product.

## Development

Run the web app alone:

```bash
pnpm dev:web
```

Run the V2 intelligence service (defaults to the non-AI fallback and demo
market data unless environment variables select another provider):

```bash
pnpm --filter @alive/intelligence dev
```

Run the current compatibility development stack:

```bash
pnpm dev
```

`pnpm dev` still starts the legacy physical verifier alongside the web app
during the transition. That is a compatibility path, not proof that a V2 AI or
market-data service is running.

For contracts:

```bash
pnpm chain
pnpm test:contracts
pnpm --filter @alive/contracts deploy:rwa:local
```

The RWA deployment script creates only a synthetic demo stack. Do not deploy V2
contracts to a public network until the local contract suite,
deployment export, frontend configuration, and security checklist are aligned.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts
pnpm build
pnpm check
```

The GitHub workflow contains explicit install, lint, typecheck, workspace test,
contract test, and production-build gates. Historical public runs are red at
the frozen install step; the pivot includes a source correction to the pnpm 11
build allowlist. Do not call CI green until a new pushed workflow run passes.

The retained `pnpm smoke:local` command proves the archived V1 generated-media
settlement chain. It is useful as a regression but does not count as V2 RWA
acceptance.

## Target product routes

The V2 information architecture is:

- `/` — new product story
- `/create` — mandate entry and policy compilation
- `/policy/[policyId]` — approved normalized policy and versions
- `/markets` — provenance-aware RWA discovery
- `/assets/[assetId]` — RWA asset passport
- `/dashboard` — holdings, policy health, issuer exposure, and freshness
- `/vault/[vaultAddress]` — custody, policy, and execution state
- `/rebalance` — drift diagnosis, simulation, and corrective proposal
- `/attack-lab` — real policy/freshness/replay rejection scenarios
- `/protocol` — system and trust boundaries
- `/demo` — describe, compile, build, attack, and rebalance presentation flow
- `/dev/design-system` — development-only visual inventory

Legacy `/assets/register`, `/verify/[assetId]`, and physical `/escrow/*` routes
must leave primary navigation and must not be confused with the new product.

## X Layer state

| Network         | Chain ID | V2 status                                                             |
| --------------- | -------: | --------------------------------------------------------------------- |
| Local Hardhat   |    31337 | Target for deterministic V2 tests; complete V2 flow not yet recorded  |
| X Layer Testnet |     1952 | No V2 deployment or V2 transaction evidence                           |
| X Layer Mainnet |      196 | Configuration only; prohibited before audit and operational hardening |

The previously confirmed X Layer Testnet `AliveAssetRegistry` deployment belongs
to V1. It is preserved in the historical audit and must not be described as a
V2 policy-vault deployment.

Before any future X Layer deployment, verify current RPC and explorer details
against official X Layer documentation, use a dedicated testnet deployer,
record every address and receipt, and verify deployed bytecode/source.

## V1 archive

V1 implemented this local chain:

```text
authenticated camera registration
-> deterministic physical fingerprint
-> onchain asset commitment
-> funded physical-state escrow
-> ordered three-frame challenges
-> computed confidence and reason codes
-> short-lived EIP-712 attestation
-> contract validation
-> exact test-token payout
```

The 2026-08-12 audit recorded 108 passing tests and one complete
runtime-generated local positive path, alongside honest limitations: no reliable
real-world wrong-object benchmark, no complete public X Layer settlement, a
central verifier, and camera-only presentation risks.

Check out the preserved source without rewriting history:

```bash
git switch --detach v0.8.1-physical-state-archive
```

Return to the pivot branch with:

```bash
git switch feat/rwa-intelligence-pivot
```

Read the retained
[historical physical-state audit](docs/BUILD_STATUS.md#historical-v1-physical-state-audit)
before making any V1 claims.

## Security and product honesty

ALIVE can enforce only the rules actually encoded and tested. It cannot prove
that an issuer will honor redemption, that a source document is correct, that a
market feed captures fair value, or that a risk model predicts losses.

The V2 source is unaudited and not suitable for valuable assets. A compromised
model, signer, frontend, provider, router, token, administrator, or user device
must be considered. Read [docs/SECURITY.md](docs/SECURITY.md) before running any
contract deployment.

## Milestones

1. P1 — pivot architecture and archive
2. P2 — policy compiler, schema, hash, and approval UI
3. P3 — RWA catalog, provenance, intelligence, and passports
4. P4 — deterministic optimizer and risk engine
5. P5 — policy registry, strategy verifier, and user-owned vault
6. P6 — clearly labelled mock RWA execution
7. P7 — contract-backed policy Attack Lab
8. P8 — complete X Layer Testnet evidence chain
9. P9 — V2 frontend, Three.js, and Remotion rebuild
10. P10 — hackathon release

Only tag a milestone after its tests, runtime evidence, documentation, and Git
state agree.

## License

The repository is available under the [MIT License](LICENSE).
