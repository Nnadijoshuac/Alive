# ALIVE build status

Current audit: **2026-08-15**

Active branch: `feat/rwa-verification-gateway` (checkpointed from `feat/rwa-intelligence-pivot`)

Pre-pivot checkpoint: `v0.8.1-physical-state-archive` at `bf449f6`
RWA policy-vault checkpoint: `v0.9.0-policy-vault-checkpoint` at `85e186f`

## Milestone log

- **2026-08-15 — Milestone 0 (git checkpoint):** the RWA policy-vault pivot
  (contracts, `services/intelligence`, `packages/{market-data,optimizer,policy-engine}`,
  the RWA frontend workspace, demo fixtures, rewritten docs) had been sitting
  entirely uncommitted in the working tree — verified via a full forensic
  audit before this checkpoint. Committed as `85e186f`
  ("chore: checkpoint RWA policy vault before verification gateway pivot"),
  pushed to `origin/feat/rwa-intelligence-pivot`, tagged
  `v0.9.0-policy-vault-checkpoint` (pushed), and branched to
  `feat/rwa-verification-gateway` (pushed, tracked). This corrects the "Pivot
  checkpoint and Git state" table below, which predates the checkpoint and
  still describes the work as uncommitted.
- **2026-08-15 — Milestone 1 (baseline fix):** fixed the one known failing
  contract test (`test/AliveRwaProtocol.test.ts` "MockRwaRouter demo
  freshness" — wrong-case token lookup `tokens.tnvda` vs the fixture's actual
  key `tokens.tNVDA`, and a reference to a nonexistent `fixture.other` signer;
  changed to `tokens.tNVDA` / `fixture.attacker`) and the two real type errors
  in `services/intelligence/src/app.ts` (`saveProposal` was called with a raw
  `policyId` string at the `POST /api/portfolios/optimize` and
  `POST /api/rebalance` handlers, but its third parameter is a
  `ProposalPersistenceContext` object — fixed both call sites). Verified:
  `packages/contracts` 54/54 tests passing, typecheck clean;
  `services/intelligence` typecheck clean, 4/4 tests passing; full
  `pnpm -r typecheck` clean across all 9 workspace projects; full
  `pnpm -r test` green across every workspace **except** `videos/alive-launch`,
  which fails on a pre-existing, unrelated environmental port-3000 collision
  (Remotion's compositions check tried to reach a Remotion dev server on
  `:3000` and instead hit an already-running Next.js dev server bound to that
  port on this machine — confirmed by the error payload containing
  `apps/web`'s `site-shell` markup, not a Remotion project). Not part of the
  RWA stack and not chased further in this pass; free the port and re-run
  `pnpm --filter @alive/launch-video test` to confirm before relying on it.
- **2026-08-15 — Milestone 2 (Asset Passport schema + source ingestion
  pipeline):** the product is pivoting again, from "natural-language mandate
  -> policy vault" toward "AI-powered verification/eligibility gateway for
  tokenized RWAs" (`docs/PIVOT.md` target). This milestone builds the first
  missing link: turning an issuer document into hashed, citable source
  material an extraction step can read from.
  - Extended `@alive/shared`'s existing `RwaAssetSchema` (kept as the Asset
    Passport base per directive, not replaced) with an optional `redemption`
    fact (`supported: boolean | "unknown"`, `frequency`, `settlementPeriod`,
    `minimum` — unknown is represented explicitly, never omitted or
    hallucinated) and optional `extraction` pipeline metadata
    (`pipelineVersion`, `extractedAt`, `model`, `promptVersion`, `confidence`,
    `mode`). Both are additive and backward-compatible with the existing demo
    catalog. `redemption` participates in the schema's existing
    source-provenance parity check; `extraction` deliberately does not, since
    it describes how a passport was produced, not a claimed fact about the
    asset. 4 new tests in `packages/shared/test/rwa.test.ts` (41/41 passing).
    Found and fixed a pre-existing test bug while doing this: `validDemoAsset()`
    reused one shared `coreFields` array by reference across every test,
    so an earlier test's `.push()` silently mutated later tests' input.
  - New `services/intelligence/src/ingestion/` module: `text-normalizer.ts`
    (line-ending/control-character/whitespace normalization — conservative,
    never rewrites words or numbers, since the hash binds to its output),
    `source-hasher.ts` (canonical keccak256 hash of normalized text, reusing
    `@alive/shared`'s `hashCanonical`), `chunker.ts` (paragraph-aware bounded
    splitting), `document-loader.ts` (loads a named fixture from
    `data/source-documents/` with a path-traversal guard modeled on
    `services/verifier/src/storage.ts`'s `FileEvidenceStore`, or accepts
    pasted text directly — deliberately no URL fetching or PDF parsing, per
    directive: "do not spend the hackathon building elaborate web crawling"),
    and `ingestion-service.ts` (orchestrates the above into a `SourceDocument`
    with `sourceType` reusing `AssetSourceSchema`'s existing vocabulary rather
    than inventing a second taxonomy).
  - New `data/source-documents/` demo fixtures: `tusdc.txt`, `ttbill-a.txt`,
    `tgold.txt`, `tsp500.txt` — fictional issuer fact sheets (redemption
    terms, underlying, issuer) for the reduced 4-asset demo set, each ending
    in a labelled "Key Facts" block so both a real LLM and the milestone-3
    deterministic fallback extractor can read them reliably. All carry
    explicit DEMO DATA disclaimers.
  - New DB tables (`services/intelligence/src/repository.ts` migration v3):
    `source_documents` (ingested text + hash, chunk count recomputed
    deterministically on read rather than stored redundantly) and
    `extraction_runs` (scaffolded now, used starting milestone 3).
  - New routes: `POST /api/assets/:assetId/ingest`,
    `GET /api/assets/:assetId/sources`.
  - Tests: 15 new tests in `services/intelligence/test/ingestion.test.ts`
    (normalizer, hasher, chunker, loader path-traversal guard, ingestion
    service) plus one new route-level test in `intelligence.test.ts`.
    `services/intelligence`: 20/20 tests passing, typecheck clean.
    `pnpm --filter {shared,intelligence,contracts,web,verifier} typecheck`
    all clean.

## Pivot status

ALIVE is being rebuilt from a Proof-of-Physical-State protocol into an
AI-native intelligence and policy layer for tokenized real-world assets.

The V2 target chain is:

```text
user mandate
-> candidate AI interpretation
-> strict deterministic validation
-> canonical policy hash
-> sourced market snapshot
-> deterministic portfolio proposal and simulation
-> user approval or bounded signer authorization
-> smart-contract policy enforcement
-> execution or rejection
-> drift monitoring and compliant rebalance
```

This pivot is **not complete**. There is no complete V2 browser-to-contract
flow, no V2 X Layer deployment, no public V2 transaction evidence, and no claim
that the current frontend, AI compiler, optimizer, market data, contracts, or
Attack Lab satisfy the full acceptance criteria.

The stable V1 implementation remains reproducible from the archive tag. Its
factual audit is retained unchanged under
[Historical V1 physical-state audit](#historical-v1-physical-state-audit).

## Pivot checkpoint and Git state

| Item           | Current evidence                                                              |
| -------------- | ----------------------------------------------------------------------------- |
| Pivot date     | 2026-08-14                                                                    |
| Old thesis     | Camera-derived Proof of Physical State for conditional settlement             |
| New thesis     | Natural-language RWA mandates compiled into deterministic, enforceable policy |
| Archive tag    | `v0.8.1-physical-state-archive` -> `bf449f6`                                  |
| Active branch  | `feat/rwa-intelligence-pivot`                                                 |
| Branch point   | `bf449f6` (`chore: archive physical-state product experience`)                |
| V2 release tag | None; `v0.9.0-rwa-pivot` must remain absent until P1 is stable                |
| V2 deployment  | None recorded locally as a stable export or on X Layer Testnet                |

The branch and archive tag already existed before this documentation/CI update.
Current pivot work is uncommitted and shared across parallel implementation
tasks. Scoped passing checks are recorded below; integrations without runtime
evidence remain `PARTIAL`, `IN PROGRESS`, or `NOT STARTED`.

## Reused, adapted, and retired components

| Component                                        | Pivot treatment              | Current boundary                                                        |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------- |
| Next.js/TypeScript/pnpm monorepo                 | Reused                       | Active foundation; V2 route acceptance pending                          |
| wagmi, viem, wallet transaction UX               | Reused                       | Must be rebound to policy/vault state                                   |
| Shared Zod/canonical hashing                     | Adapted                      | V2 schemas/hashes pass 37 shared tests; app integration remains         |
| EIP-712/replay patterns                          | Adapted                      | V2 bounded strategies pass focused TypeScript/Solidity tests            |
| Hardhat tests/deployment scripts                 | Reused                       | V2 contracts compile, pass 20 tests, and deploy to ephemeral local EVM  |
| Three.js, motion, responsive fallbacks           | Adapted                      | V2 capital/policy narrative not yet accepted                            |
| Remotion foundation                              | Adapted later                | Existing composition is V1 narrative only                               |
| Camera registration, physical matching, OCR/CLIP | Retired from primary product | Preserved at archive tag; legacy source still present during transition |
| Physical liveness Attack Lab                     | Retired from primary product | Must be replaced by policy/freshness/replay attacks                     |
| Physical escrow                                  | Replaced                     | V2 user-owned policy vault works locally; app/public integration absent |

## V2 capability ledger

Status vocabulary is evidence-based: `WORKING`, `PARTIAL`, `IN PROGRESS`, `NOT
STARTED`, or `BLOCKED`.

| Capability                                              | Status          | Evidence and missing gate                                                                                                                   |
| ------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical RWA and provenance schemas                    | WORKING LOCALLY | Shared build/typecheck and 37 tests pass; the eight assets remain synthetic demo data and UI is incomplete                                  |
| Policy schema, semantic validation, normalization, hash | WORKING LOCALLY | Shared hash/validation plus five policy-engine tests pass; approval UI/onchain parity integration remains                                   |
| Deterministic mandate fallback                          | WORKING LOCALLY | Bounded parser passes five tests and labels itself non-AI; it is not general language understanding                                         |
| LLM provider abstraction                                | PARTIAL         | Ollama, OpenAI-compatible, and disabled modes compile and the strict candidate boundary is tested; no live-model acceptance run is recorded |
| Asset-passport extraction with citations                | NOT STARTED     | V1 physical passport is not V2 asset intelligence                                                                                           |
| Demo market-data provider                               | WORKING LOCALLY | Typecheck/build and eight package tests pass; values remain synthetic demo data and frontend integration is pending                         |
| Chainlink Data Streams adapter                          | PARTIAL         | Normalization, configuration, and fail-closed credential paths are tested with fixtures; no live feed call is recorded                      |
| Deterministic portfolio optimizer                       | WORKING LOCALLY | Typecheck/build and five tests pass for feasible, infeasible, exclusion, drift, and rebalance cases; no contract execution proof            |
| Deterministic risk methodology                          | NOT STARTED     | RWA risk decomposition and published methodology are not complete                                                                           |
| Drift detection and rebalance proposal                  | WORKING LOCALLY | Optimizer and Fastify integration tests exercise drift/rebalance logic; browser, wallet, and onchain execution remain absent                |
| AliveRwaAssetRegistry                                   | WORKING LOCALLY | Owner-reviewed approved RWA records and status pass focused tests; unaudited/not deployed                                                   |
| AlivePolicyRegistry                                     | WORKING LOCALLY | Immutable owner/vault policy versions and enforceable V1 fields pass focused tests; not deployed                                            |
| AliveStrategyVerifier                                   | WORKING LOCALLY | EIP-712 binding, expiry/freshness, signer, nonce, and replay checks pass focused tests; not deployed                                        |
| AliveVault                                              | WORKING LOCALLY | Custody, bounded router execution, and post-balance policy checks pass focused tests; not deployed                                          |
| MockRwaToken and MockRwaRouter                          | WORKING LOCALLY | Test-only six-decimal tokens and admin-priced synthetic router; not a DEX or oracle                                                         |
| V2 web routes and primary navigation                    | NOT STARTED     | Existing active routes still primarily describe V1                                                                                          |
| Policy Attack Lab                                       | NOT STARTED     | No contract-backed V2 attack UI or underlying scenario suite is accepted                                                                    |
| V2 Three.js policy universe                             | NOT STARTED     | Existing physical-device scene does not count                                                                                               |
| V2 Remotion launch composition                          | NOT STARTED     | Existing physical-state composition does not count                                                                                          |
| X Layer V2 deployment                                   | NOT STARTED     | No V2 address or transaction hash exists                                                                                                    |
| Complete mandate-to-rebalance demo                      | NOT STARTED     | No complete local or public evidence chain exists                                                                                           |

## CI status and frozen-install correction

GitHub Actions is still **red** as of the latest public runs inspected on
2026-08-14:

- push run `31845477007` at `bf449f6` failed during
  `pnpm install --frozen-lockfile`;
- pull-request run `31845479653` at the same source failed at the same gate;
- subsequent lint, typecheck, tests, build, and smoke steps were skipped.

The public run metadata exposes the failed step and exit code, but not the pnpm
stderr; downloading the log requires repository administration rights.
Therefore the exact historical failure mechanism is **not conclusively
proven** from public evidence.

The strongest source-level configuration defect found was that reviewed native
builders were split between pnpm 11's `allowBuilds`, a deprecated root
`onlyBuiltDependencies` list, and a package-local `onlyBuiltDependencies`
list. That creates an ambiguous strict-install policy and leaves several
builders outside the root `allowBuilds` map. The minimal configuration
correction consolidates all reviewed builders in one root map and removes the
two legacy lists.

The pivot changes consolidate all eight reviewed builders into one map:

```yaml
allowBuilds:
  better-sqlite3: true
  esbuild: true
  keccak: true
  onnxruntime-node: true
  protobufjs: true
  secp256k1: true
  sharp: true
  tesseract.js: true
```

An existing-tree Windows run of `pnpm install --frozen-lockfile` and a later
`CI=true pnpm install --frozen-lockfile --lockfile-only` run passed with pnpm
`11.1.2`. The pre-pivot snapshot's lockfile-only install also passes when
scripts are disabled, so the lifecycle cleanup must not be presented as a
proven explanation for the historical failure. None of these checks proves a
fresh GitHub Linux install is fixed. CI remains red until this change is pushed
and a new Actions run reaches every gate.

The workflow now names and runs install, lint, typecheck, workspace tests, an
explicit contract-test release gate, production build, and the retained V1
integration regression. It also runs on direct pushes to the pivot branch. No
workflow result exists for these uncommitted changes yet.

## Fresh V2 policy-foundation results

The following scoped checks completed on 2026-08-14:

| Package                | Result                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| `@alive/shared`        | Typecheck passed; build passed; 37/37 tests across 10 files passed |
| `@alive/policy-engine` | Typecheck passed; build passed; 5/5 tests passed                   |
| `@alive/optimizer`     | Typecheck passed; build passed; 5/5 tests passed                   |
| `@alive/market-data`   | Typecheck passed; build passed; 8/8 tests passed                   |
| `@alive/intelligence`  | Typecheck passed; build passed; 4/4 tests passed                   |

The shared artifacts include strict RWA/provenance, policy, market-snapshot, and
strategy schemas/hashes; an eight-asset synthetic catalog; an eight-quote demo
snapshot; and a policy-hash parity fixture. The intelligence service includes
Ollama, OpenAI-compatible, and disabled provider modes plus a 12-table SQLite
V1 migration. Its integration test runs compile, optimize, a rejected 100%
single-asset allocation, and rebalance through real Fastify application logic.
The catalog has no real token addresses, the quotes are not live, the test does
not submit a contract transaction, and the fallback parser is explicitly
non-AI.

## Fresh V2 contract results

Contract verification completed on 2026-08-14:

| Check                                      | Result                                                 |
| ------------------------------------------ | ------------------------------------------------------ |
| `pnpm --filter @alive/contracts compile`   | Passed; nothing remained to compile on the final rerun |
| `pnpm --filter @alive/contracts typecheck` | Passed                                                 |
| RWA-focused Hardhat file                   | 20/20 passed in 28 seconds with `--no-compile`         |
| Preserved V1 Hardhat file                  | 31/31 passed in 23 seconds with `--no-compile`         |
| Current contract-test inventory            | 51 passing across the two completed file-level runs    |
| Local `deploy-rwa.ts` smoke                | Passed; ephemeral chain-31337 export was not retained  |
| Public V2 deployment                       | None                                                   |

The latest combined wrapper did not finish within its 300-second limit while
other workspace checks were contending for CPU. It produced no test failure.
The 51 figure is the sum of the two separately completed Hardhat file runs, not
a claim that a final one-command combined run completed after the last parity
case was added.

Production bytecode sizes from the compiled artifacts were 2,352 bytes for
`AliveRwaAssetRegistry`, 6,740 for `AlivePolicyRegistry`, 4,720 for
`AliveStrategyVerifier`, and 13,537 for `AliveVault`. The test-only mock router
was 3,208 bytes. These sizes are below EIP-170 but are not an audit or gas
scalability result.

## Pivot milestone ledger

| Milestone | Scope                                        | Status      | Release gate                                                                               |
| --------- | -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| P1        | Pivot architecture and archive               | IN PROGRESS | Docs/CI/current app separation verified; then `v0.9.0-rwa-pivot` may be considered         |
| P2        | Policy compiler, schema, hash, UI            | PARTIAL     | Schema/hash/fallback tests pass; real-model acceptance and approval UI remain              |
| P3        | Catalog, provenance, intelligence, passports | PARTIAL     | Strict eight-asset demo catalog exists; extraction/passport UI remain                      |
| P4        | Optimizer and risk engine                    | PARTIAL     | Five optimizer tests pass; complete published risk methodology and app/onchain flow remain |
| P5        | Policy contracts and vault                   | PARTIAL     | 20 V2 tests and local deploy pass; app integration, audit, and public evidence remain      |
| P6        | Mock RWA execution                           | PARTIAL     | Mock tokens/router work locally; complete application execution flow remains               |
| P7        | Policy Attack Lab                            | NOT STARTED | Every UI attack backed by a real automated rejection test                                  |
| P8        | X Layer Testnet end to end                   | NOT STARTED | Verified addresses and positive/negative/rebalance receipts                                |
| P9        | Frontend, Three.js, Remotion rebuild         | NOT STARTED | Accepted V2 routes, fallbacks, performance, and new video                                  |
| P10       | Hackathon release                            | NOT STARTED | Public causal chain, green CI, matching docs/deployment/tag                                |

See [PIVOT.md](PIVOT.md) for the product decision and detailed reuse map,
[ARCHITECTURE.md](ARCHITECTURE.md) for target boundaries, and
[SECURITY.md](SECURITY.md) for the new threat model.

---

# Historical V1 physical-state audit

Last audited: 2026-08-12

Audited source tip: `346f06f` on `main`. This ledger update is documentation-only and may appear at a later commit.

This document separates implemented source, fresh local automation, prior browser acceptance, current process state, and public-chain state. A file existing is not proof that a physical camera, verifier, wallet, and public chain completed one flow.

## Executive status

ALIVE has a real local positive-path implementation:

```text
authenticated registration
-> six image captures
-> deterministic fingerprint
-> local onchain registration
-> escrow funding
-> four ordered three-frame challenges
-> computed scores
-> EIP-712 attestation
-> contract validation
-> exact token payout
```

The fresh deterministic smoke passed this chain and ended in `Released`. That smoke uses runtime-generated patterned JPEGs, Fastify `app.inject`, in-memory persistence, and an in-process Hardhat chain. It does not prove physical-webcam capture, OCR, CLIP inference, wrong-object rejection, wallet-extension settlement, or X Layer settlement.

The public protocol is incomplete. Only `AliveAssetRegistry` is confirmed on X Layer Testnet. No public Attestation Registry, Escrow, test token, consumer authorization, negative case, or settlement exists.

At audit time:

- ports `3000`, `4100`, and `8545` were not listening;
- no active root `.env`, `apps/web/.env.local`, or `packages/contracts/.env` existed;
- the local `31337.json` export and SQLite files existed only as ignored, stale local state;
- `main` matched `origin/main` and the worktree was clean before this documentation update.

Therefore ALIVE is implemented and locally testable, but it is not currently running or configured as a live demo.

## Fresh acceptance results

### Local repository gate

`pnpm check` passed on 2026-08-12 in 764.7 seconds.

| Check                            | Fresh result                                                    |
| -------------------------------- | --------------------------------------------------------------- |
| Lint                             | Passed for shared, video, web, and verifier packages            |
| Typecheck                        | Passed for contracts, shared, video, web, and verifier packages |
| Contract tests                   | 31/31 passed                                                    |
| Shared tests                     | 17/17 passed                                                    |
| Verifier tests                   | 29/29 passed                                                    |
| Web tests                        | 31/31 passed                                                    |
| Total unit/integration tests     | 108 passed                                                      |
| Solidity build                   | Passed; nothing remained to compile after the test compile      |
| Shared/verifier builds           | Passed                                                          |
| Remotion composition enumeration | Passed; `AliveLaunch`, 1,200 frames, 30 fps, 1,920 by 1,080     |
| Next.js production build         | Passed; 12 routes generated                                     |

The Next.js build reported a 115 kB first-load bundle for `/`; wallet-heavy routes were 229-266 kB. Production compilation took 79 seconds in this Windows workspace.

### Local protocol smoke

`pnpm smoke:local` passed in 67.6 seconds with:

- identity: `9,766` BPS;
- liveness: `9,704` BPS;
- integrity: `9,770` BPS;
- minimum three-frame burst motion: `0.8096751814469945`;
- attestation digest: `0x024c88c9c021ffcdedb7f4c923c4549ff71d6bca2bc8a0d111759f0f15f7d94b`;
- exact seller payout;
- globally consumed session;
- final escrow state: `Released`.

This is genuine integration evidence for the generated-media local positive path, not an accuracy or physical-authenticity claim.

### Browser evidence at the audited source tip

Earlier clean-browser acceptance for `346f06f` found:

- no hydration, React runtime, Wagmi-provider, or console errors on `/` and `/assets/register`;
- byte-for-byte identical server/client fingerprint coordinates;
- no desktop horizontal overflow;
- route-local wallet controls on `/dashboard` and `/escrow/create`;
- a generated Y4M camera completing six registration captures and fingerprinting;
- a generated replay reaching analysis and failing closed at identity `9,950`, liveness `6,203`, and integrity `9,966` BPS with `LIVENESS_BELOW_THRESHOLD`, `REPLAY_RISK_HIGH`, and `MOTION_INSUFFICIENT`;
- an unconfigured signer returning `503`, with the UI honestly withholding an attestation.

No tracked Playwright or Cypress harness reproduces this browser acceptance. No real physical webcam was used.

### GitHub Actions

Current GitHub Actions are red even though the local gate is green:

- push run `31591448734` failed at `pnpm install --frozen-lockfile`;
- pull-request run `31591452741` failed at the same step;
- lint, typecheck, tests, build, and smoke were skipped in both runs;
- the unauthenticated GitHub API exposes only exit code 1, so the exact Linux installer error is not verified;
- `CI=true pnpm install --frozen-lockfile --lockfile-only` passes locally.

Do not describe CI as green until the Linux install failure is reproduced and fixed.

## Implemented feature ledger

All feature work below is integrated into `main`. Historical feature commits were developed on `feat/core-mvp` unless noted.

| Feature                                   | Status                                                    | Primary files                                                                                                           | Semantic commits                | Current tests/evidence                                                          |
| ----------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| Monorepo and shared protocol types        | Working                                                   | `package.json`, `pnpm-workspace.yaml`, `packages/shared`                                                                | `eccc7ae`                       | 17 shared tests; root lint/typecheck/build                                      |
| Owner-bound asset registry                | Working locally; public registry only                     | `packages/contracts/contracts/AliveAssetRegistry.sol`, `packages/shared/src/asset-id.ts`                                | `1937974`, `0d88e99`            | 5 contract tests plus shared/Solidity parity vector                             |
| Attestation registry                      | Working locally; not public                               | `packages/contracts/contracts/AliveAttestationRegistry.sol`, `packages/shared/src/attestation.ts`                       | `1937974`, `16c1606`            | 9 contract tests plus shared signature test                                     |
| Escrow and recovery states                | Working locally; not public                               | `packages/contracts/contracts/AliveEscrow.sol`                                                                          | `1937974`, `2e69922`, `6803580` | 16 contract tests and positive local smoke                                      |
| Six-decimal test token                    | Working locally; not public                               | `packages/contracts/contracts/test/MockUSDT.sol`                                                                        | `1937974`                       | 1 contract test; test-only faucet and owner mint                                |
| Deterministic visual features and scoring | Working but uncalibrated                                  | `services/verifier/src/vision`, `packages/shared/src/scoring.ts`                                                        | `8e3f0ba`                       | 4 image tests, 2 OCR utility tests, 3 scoring tests                             |
| Wallet-authenticated verifier resources   | Working                                                   | `services/verifier/src/auth.ts`, `services/verifier/src/db`, `packages/shared/src/authorization.ts`                     | `2a2d23b`, `0d88e99`            | 9 verifier authorization tests, 4 shared authorization tests, web adapter tests |
| Three-frame active sessions               | Working heuristically                                     | `services/verifier/src/random.ts`, `services/verifier/src/vision/matching.ts`, `apps/web/components/camera-capture.tsx` | `29331d9`, `0378ab5`            | 6 session tests, image-motion tests, generated-camera acceptance                |
| Server-only EIP-712 signing               | Working when configured                                   | `services/verifier/src/signer.ts`, `packages/shared/src/attestation.ts`                                                 | `8e3f0ba`, `16c1606`            | signer recovery, exact field parity, expiry/context/fingerprint/replay tests    |
| Local generated-media settlement pipeline | Working                                                   | `services/verifier/scripts/local-protocol-smoke.mjs`                                                                    | `718154e`                       | fresh `pnpm smoke:local` pass                                                   |
| Next.js product surface                   | Working as UI; contract actions require configuration     | `apps/web/app`, `apps/web/components`, `apps/web/lib`                                                                   | `70b898e`, `0378ab5`            | 31 web tests, production build, prior browser acceptance                        |
| Attack Lab                                | Working as manual guidance; attack outcome not guaranteed | `apps/web/app/attack-lab`, `apps/web/components/attack-lab-workspace.tsx`                                               | `70b898e`, `0378ab5`            | generated replay rejection; contract negative tests                             |
| Three.js visual system                    | Working only in production and as decoration              | `apps/web/components/device-scene.tsx`, `apps/web/components/hero-device.tsx`                                           | `70b898e`, `346f06f`            | production build, non-WebGL/reduced-motion paths, no Canvas automation          |
| Presentation console                      | Partial                                                   | `apps/web/app/demo`, `apps/web/components/demo-console.tsx`                                                             | `70b898e`                       | browser-local state only; settlement readiness remains fixed `false`            |
| Launch video                              | Working source and local render                           | `videos/alive-launch`                                                                                                   | `12b6515`, `ad900f6`            | composition enumeration passed; local ignored MP4 verified with `ffprobe`       |
| Hydration and startup hardening           | Working                                                   | `apps/web/lib/fingerprint.ts`, route provider layouts, local Geist fonts                                                | `1d89510`, `346f06f`            | hydration regressions, clean browser acceptance, build/lint/typecheck           |

## Frontend capability status

| Surface                      | Status                             | Current boundary                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` landing page             | Working                            | Complete scanner-led story and deterministic evidence visualization. The 3D scene is replaced by a static still in development.                                                                          |
| Three.js                     | Partial                            | Procedural laptop, point cloud, scan plane, lighting, reduced-motion/non-WebGL fallback. Decorative and not driven by captured asset data. Production-only lazy load.                                    |
| Camera flow                  | Partial                            | Real `getUserMedia`, camera switching, JPEG capture, focus/exposure checks, exact three-frame bursts. Generated-camera acceptance only; no real-webcam QA or automated camera harness.                   |
| `/assets/register`           | Partial overall                    | Eight-stage, six-view authenticated offchain registration works when services run. Onchain submission works locally when all public addresses are configured; it is disabled in the current environment. |
| `/assets/[assetId]` passport | Partial                            | Verifier record plus browser-local transaction/history fallback. It does not read a durable onchain inspection timeline.                                                                                 |
| `/verify/[assetId]`          | Working locally when configured    | Owner authorization, random challenges, analysis, signed-proof validation, and optional settlement are wired. No current running verifier or signer.                                                     |
| `/escrow/create`             | Partial/currently disabled         | Real wallet transaction and event decoding. Assumes six token decimals for arbitrary token input.                                                                                                        |
| `/escrow/[escrowId]`         | Partial/currently disabled         | Reads state; approves, funds, cancels, refunds, disputes, verifies, and settles. No recorded wallet-extension settlement receipt.                                                                        |
| `/attack-lab`                | Partial                            | Reuses the real verifier; labels are not sent to scoring. Replay/substitution/expiry are presenter procedures, not deterministic automated attacks.                                                      |
| `/protocol`                  | Working visualization              | Seven-node explanatory trust map; static content, not live telemetry.                                                                                                                                    |
| `/dashboard`                 | Partial                            | Merges verifier assets with browser `localStorage`; verification history is not durable or protocol-wide.                                                                                                |
| `/demo`                      | Partial                            | Five-beat presentation shell and links to real routes. It does not seed fake results; settlement readiness is not chain-derived.                                                                         |
| `/dev/design-system`         | Working                            | Visual inventory is included in production unless access is constrained externally.                                                                                                                      |
| Mobile responsiveness        | Working layout; partial validation | 900 px/640 px breakpoints and prior 390 by 844 QA. No current device matrix or screenshot regression suite.                                                                                              |

No committed application screenshots exist. The tracked forensic laptop is illustrative marketing art, not evidence. The local launch render and contact sheets are ignored by Git.

## AI and computer-vision status

| Capability               | Status                       | Actual implementation and limitation                                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image capture            | **WORKING**                  | Browser `getUserMedia`, client framing/quality, server Sharp decode and independent quality checks. Physical-camera acceptance remains unperformed.                                                                                                                                      |
| Deterministic embeddings | **WORKING**                  | Sharp normalizes to 192 by 192; a 4 by 4 spatial RGB histogram is L2-normalized and compared with cosine similarity.                                                                                                                                                                     |
| Neural embeddings        | **PARTIAL**                  | Optional `@huggingface/transformers` CPU `image-feature-extraction`, default `Xenova/clip-vit-base-patch32`. Disabled by default, fail-soft, no actual-inference test, no pinned model revision/readiness probe.                                                                         |
| Instance matching        | **PARTIAL**                  | Requested-view spatial and gradient similarity is real. No representative physical or same-model calibration proves the default threshold.                                                                                                                                               |
| Local feature matching   | **PARTIAL**                  | A real 6 by 6 by 8 gradient-orientation grid descriptor is used. It is not ORB/AKAZE/SIFT keypoint matching, descriptor correspondence, or geometric verification.                                                                                                                       |
| OCR                      | **PARTIAL**                  | Optional `tesseract.js` English recognition, Unicode normalization, and fuzzy identifier comparison. Disabled by default; recognition itself is not tested; unavailable OCR is reweighted, not failed.                                                                                   |
| Perceptual hashing       | **WORKING**                  | Sharp 64-bit difference hash and Hamming similarity detect exact/near registration-image replay.                                                                                                                                                                                         |
| Multi-view comparison    | **WORKING**                  | Six registration views and four randomized requested-view challenges. `MOVE_CLOSER`/`MOVE_AWAY` are defined but not generated; multi-view consistency is a coarse distinct-view count.                                                                                                   |
| Liveness/challenges      | **PARTIAL**                  | Random IDs/order, expiry, exact three-frame bursts, strict timestamps, quality, freshness, and server-derived motion. No device attestation, depth, watermark, screen detector, gesture proof, or anti-deepfake model.                                                                   |
| Replay detection         | **PARTIAL**                  | Exact evidence reuse, pHash proximity, motion, freshness, order, and onchain session consumption. No cross-session visual-replay database; moving displays, relay, camera injection, and generated video remain viable attacks.                                                          |
| Scoring                  | **WORKING but uncalibrated** | Transparent weighted ratios/BPS and reason codes. Defaults: identity 8,500, liveness 8,000, integrity 6,000 BPS. No false-accept/false-reject corpus.                                                                                                                                    |
| Wrong-object rejection   | **PARTIAL**                  | Engine can reject below-threshold identity. Tests prove only that a generated same-pattern input scores at least 0.05 above a generated different pattern; they do not prove the substitution is rejected. Prior browser evidence proves static replay failure, not object substitution. |

Installed verifier stack at audit time: Sharp `0.34.5`, optional Transformers.js `3.8.1`, optional Tesseract.js `6.0.1`, better-sqlite3 `12.11.1`, Fastify `5.11.3`, viem `2.55.13`, and Zod `3.25.76`.

There is no OpenCV, ORB, AKAZE, SIFT, MediaPipe, object segmentation, depth processing, 3D reconstruction, or anti-deepfake model.

## Blockchain status

### Local contracts

- `AliveAssetRegistry`: working locally.
- `AliveAttestationRegistry`: working locally.
- `AliveEscrow`: working locally.
- `MockUSDT`: working locally and explicitly test-only.
- EIP-712 domain: `Alive Protocol`, version `1`, chain ID and verifying-contract bound.
- Replay protection: global single-use session IDs, expiry, exact fingerprint binding, authorized contextual consumers, escrow context, and post-funding issuance checks.
- Local deployment script: working and refuses to overwrite an existing export.
- Local persistent runtime: not running now.

An ignored `packages/contracts/deployments/31337.json` records a prior ephemeral Hardhat deployment:

- Asset Registry: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- Attestation Registry: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
- Escrow: `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`
- MockUSDT: `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9`

These addresses are not live without the original Hardhat process and must not be treated as a current deployment.

### X Layer

Configuration exists for:

- local chain `31337`;
- X Layer Testnet `1952`;
- X Layer Mainnet `196`.

Confirmed on X Layer Testnet:

- contract: `AliveAssetRegistry`;
- address: `0x036caD7F90A8A7ecf9B918dc214659aCb3D07Ab9`;
- transaction: `0xcf102772641d7a061709295a3679676cf24c90ad2917e6541ebc9accb5574883`;
- block: `38,051,745`;
- timestamp: `2026-08-12T04:56:22Z`;
- receipt status: success;
- runtime bytecode: 2,123 bytes, exact current artifact match.

Missing publicly:

- `AliveAttestationRegistry`;
- `AliveEscrow`;
- `MockUSDT`;
- escrow consumer authorization;
- verifier-domain/signing acceptance;
- negative verification transaction evidence;
- positive settlement transaction evidence;
- X Layer Mainnet deployment.

Because the web considers the protocol configured only when Asset Registry, Attestation Registry, and Escrow addresses are all present, the partial public registry cannot currently be used through the normal registration wizard.

## Exact demo-flow matrix

| Requested step              | Status                             | Evidence and break                                                                                                               |
| --------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Register physical object    | **PARTIAL**                        | Real camera implementation exists; only generated-camera browser acceptance is recorded. Services/configuration are stopped now. |
| Create fingerprint          | **YES locally**                    | Six captures finalize into a deterministic fingerprint commitment.                                                               |
| Register onchain            | **YES locally / PARTIAL publicly** | Local smoke succeeds. Public Asset Registry exists, but the normal UI is gated by missing protocol addresses.                    |
| Fund escrow                 | **YES locally / NO publicly**      | Local smoke creates, approves, and funds exactly. No public Escrow exists.                                                       |
| Attempt wrong object        | **YES as a manual UI path**        | Attack Lab can collect the attempt; deterministic smoke does not contain it.                                                     |
| Reject wrong object         | **PARTIAL**                        | Policy can reject; reliable physical substitution rejection is not demonstrated.                                                 |
| Present correct object      | **PARTIAL**                        | Generated patterned-object positive path passes; real physical-object positive acceptance is not recorded.                       |
| Generate signed attestation | **YES locally when configured**    | Fresh smoke recovers the configured signer and matches the registry digest.                                                      |
| Submit onchain              | **YES locally / NO on X Layer**    | Hardhat settlement succeeds. Public Attestation Registry and Escrow are absent.                                                  |
| Release escrow              | **YES locally / NO on X Layer**    | Exact local payout reaches `Released`; no public settlement exists.                                                              |

Operationally, the exact flow breaks at the first step right now because no web, verifier, chain, or environment configuration is active.

After documented local setup, the first unproven functional link is reliable wrong-object rejection. The generated-media positive path is proven.

On X Layer, the normal UI breaks at onchain registration because the complete address set is absent; even a manual registry call cannot continue to escrow because no public Escrow exists.

## Git and GitHub status

- Current branch at audit start: `main`.
- Source HEAD: `346f06f973cc76f40a8774af96aae794fb5c790d`.
- Local/remote branches:
  - `main` / `origin/main`: `346f06f`;
  - `feat/core-mvp` / `origin/feat/core-mvp`: `5360b09`;
  - `feat/foundation` / `origin/feat/foundation`: `eccc7ae`.
- Annotated remote tags:
  - `v0.1.0-foundation` -> `eccc7ae`;
  - `v0.2.0-contracts` -> `0d88e99`;
  - `v0.3.0-registration` -> `0d88e99`;
  - `v0.4.0-verification` -> `42da37e`;
  - `v0.5.0-attestations` -> `42da37e`;
  - `v0.6.0-escrow` -> `718154e`;
  - `v0.7.0-attack-lab` -> `0378ab5`;
  - `v0.8.0-visual-experience` -> `5360b09`.
- `v0.9.0-testnet` and `v1.0.0-hackathon` do not exist and must remain absent.
- No GitHub Releases exist; only Git tags are published.
- GitHub's default branch is incorrectly still `feat/foundation`, so the repository landing page presents the foundation snapshot rather than `main`.
- Stale PRs remain open: `main -> feat/foundation` and `feat/core-mvp -> feat/foundation`.
- All important source and the eight tags were pushed at audit time.

## Current problems and technical debt

### Demo and integration

- No currently running or configured full runtime.
- No complete public X Layer protocol or public settlement.
- No one-run browser evidence combining wrong-object failure, genuine physical success, wallet-extension proof submission, and settlement.
- No real physical-webcam QA.
- No reliable wrong-object rejection threshold evidence.
- No hosted demo URL.
- Current GitHub Actions fail at frozen install.
- GitHub's default branch and two open PRs are stale.

### Vision and liveness

- No calibration corpus, false-accept rate, false-reject rate, or same-model substitution benchmark.
- Optional CLIP and OCR are disabled by default and absent from the full smoke.
- Actual CLIP inference and Tesseract recognition are not tested.
- Whole-frame histograms and grid gradients can overfit background/framing.
- Images are distorted to 192 by 192 with no object segmentation or source-resolution minimum.
- Registration itself has no liveness requirement; an operator can establish an arbitrary photographic baseline.
- Challenge semantics are inferred from visual similarity, not physically proven.
- Replay history covers registration evidence, not prior verification sessions.
- Camera injection, relay, moving displays, generated video, and deepfakes remain plausible.

### Security and protocol

- Single verifier key and single contract owner are central trust points; no multisig, HSM, quorum, or hardware-backed key.
- No external audit, formal verification, invariant suite, or current coverage report.
- No emergency pause or upgrade path.
- No per-attestation revocation before consumption beyond global verifier rotation.
- `issuedAt >= fundedAt` uses whole EVM seconds, leaving a same-second freshness edge.
- Disputes have no arbitrator; a valid proof may still release, seller consent may refund, or buyer waits for expiry.
- Asset ownership transfer is not synchronized into the verifier's authenticated offchain owner record.
- Raw evidence and SQLite state are unencrypted local files with no retention or access-control service.
- No production TLS termination, rate limits, authenticated read API, audit logging, abuse controls, or capability revocation service.
- No explorer source-verification automation.

### Frontend and presentation

- No committed browser E2E or screenshot-regression suite.
- Dashboard, passport history, and presentation state depend partly on browser `localStorage`.
- Demo settlement readiness is fixed `false`, not chain-derived.
- Escrow amount entry assumes six token decimals for any supplied token.
- Three.js is decorative and intentionally absent in `pnpm dev`.
- The priority-loaded hero PNG is approximately 1.3 MB; no fresh Core Web Vitals trace exists.
- Wallet-heavy routes remain 229-266 kB first-load JavaScript.
- Six registration images stay in React memory until finalization, which may pressure mobile devices.
- `https://alive.local` remains the metadata base placeholder.
- The design-system route is not production-protected.
- Video success/release scenes are illustrative authored narrative, not captured protocol evidence.

### Tooling and release

- Contract testing is Hardhat-only; `foundry.toml` exists but there are no Forge tests in this repository.
- Remotion composition enumeration is resource-heavy and was slow under concurrent runs.
- A stale ignored `31337.json` must be archived or removed explicitly before another persistent local deployment.
- Ignored SQLite/WAL files and rendered media remain on the local workstation.

## Remaining work by priority

### CRITICAL - needed for a working demo

1. Build a reproducible real-camera/browser E2E harness and record a full wallet-driven local flow.
2. Create a representative genuine-versus-wrong-object fixture set; require wrong objects to return `verified=false` at the selected operating threshold.
3. Run and document a real physical webcam registration, replay failure, substitution failure, genuine success, and local settlement.
4. Complete the X Layer Testnet deployment: Attestation Registry, Escrow, optional clearly labelled token, consumer authorization, verifier configuration, and frontend addresses.
5. Run public negative and positive flows and record transaction hashes, receipt states, exact balances, and explorer links.
6. Reproduce and fix GitHub Actions' Linux frozen-install failure.
7. Change GitHub's default branch to `main` and close or retarget the stale PRs.

### IMPORTANT - needed for a strong hackathon submission

1. Calibrate thresholds per asset class and publish false-accept/false-reject results, including same-model substitutions.
2. Add real ORB/AKAZE-style keypoint matching or another local-correspondence method with geometric consistency.
3. Test and operationalize OCR/CLIP with pinned model revisions, warmup/readiness, timeouts, and honest capability reporting.
4. Strengthen presentation-attack resistance with device-bound provenance, screen/display signals, watermark/gesture challenges, and cross-session replay history.
5. Replace browser-local dashboard/passport history with authenticated, paginated durable reads.
6. Derive demo settlement readiness from chain state and make reset/rehearsal a one-command, safe workflow.
7. Add wallet/browser automation for registration, funding, rejection, signing, settlement, network switching, and mobile camera behavior.
8. Add a hosted demo and committed, privacy-safe screenshots or a clearly labelled demo recording.
9. Add public source verification, deployment provenance, and release notes before creating `v0.9.0-testnet` or `v1.0.0-hackathon`.

### POLISH - desirable but nonessential

1. Optimize the hero still and measure Core Web Vitals on representative desktop/mobile hardware.
2. Further reduce wallet-route JavaScript and registration-image memory use.
3. Drive the Three.js visualization from actual scan/fingerprint state where useful.
4. Protect or omit `/dev/design-system` in production.
5. Improve demo reset status, cross-device continuity, and captured settlement presentation.
6. Publish the rendered launch video or a downloadable release asset rather than source only.

## Release gate

Do not publish `v0.9.0-testnet` or `v1.0.0-hackathon` until all of these are true:

- the complete X Layer protocol and consumer authorization have confirmed transaction hashes;
- signer domain, chain, verifying contract, and authorized verifier match;
- public wrong-object/static evidence leaves escrow unreleased;
- public genuine evidence produces a valid signature and exact released payout;
- a real physical-camera flow is recorded and repeatable;
- threshold calibration supports the claims made in the demo;
- GitHub Actions are green on `main`;
- GitHub defaults to `main` and stale release PRs are resolved;
- deployment metadata, explorer links, screenshots/video, README, and tag all refer to the same audited commit.

## Completion assessment

These percentages measure working capability, not file count:

- Overall completion: **68%**
- Core MVP completion: **80%**
- Hackathon demo readiness: **58%**
- Frontend/presentation readiness: **86%**
