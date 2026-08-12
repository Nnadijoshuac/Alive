# ALIVE build status

Last updated: 2026-08-12

This ledger separates implemented source, automated acceptance, browser acceptance, and public-chain state. A file existing is not proof that a camera, signer, wallet, and public chain completed one flow.

## Verification snapshot

- Working branch: `feat/core-mvp`
- Checked source tip before the release commit: `ad900f6`; this ledger and the final browser/deployment hardening form the release commit that is published on this branch and then merged to `main`
- Root gate: `pnpm check` passed in 214.6 seconds
- Unit tests: 107 passed — contracts 31, shared 17, verifier 29, web 30
- Builds: Solidity compile, shared/verifier TypeScript builds, 12-route Next.js production build, and Remotion composition enumeration all passed
- Format and diff gates: `pnpm format:check` and `git diff --check` passed
- Deterministic protocol smoke: `pnpm smoke:local` passed with identity 9,766, liveness 9,704, integrity 9,770 BPS, minimum three-frame burst motion 0.809675, exact payout, consumed session, and final escrow state `Released`
- Browser static QA: five routes at 1,440 by 1,000 and 390 by 844, plus reduced-motion and forced non-WebGL cases, rendered without document-level horizontal overflow or clipped core content
- Browser fake-camera QA: six registration views and fingerprinting succeeded; four randomized three-frame challenges reached analysis; a synthetic replay returned identity 9,950, liveness 6,203, integrity 9,966 BPS and correctly failed with `LIVENESS_BELOW_THRESHOLD`, `REPLAY_RISK_HIGH`, and `MOTION_INSUFFICIENT`
- Browser signer boundary: the unconfigured QA verifier returned 503 at attestation issuance and the UI showed no signature; this is the expected fail-closed result
- Reduced motion and metadata: zero React hydration/runtime exceptions on the fixed production home; `/icon.svg` returned 200 and is referenced from the generated document head
- Real physical webcam QA: not performed; browser acceptance used a generated, non-private Y4M camera feed
- Launch video: final 40.042667-second, 1,920 by 1,080, 30 fps H.264/AAC render succeeded; 4,952,266 bytes; 18-frame contact sheet visually inspected
- X Layer Testnet: partial only — exact-build `AliveAssetRegistry` confirmed at `0x036caD7F90A8A7ecf9B918dc214659aCb3D07Ab9`; no public attestation registry, escrow, or settlement

## Milestone ledger

### Milestone 0: Foundation

- Status: Complete
- Branch: `feat/foundation`, integrated into the final release branch
- Base commit: `eccc7ae`
- Published tag: `v0.1.0-foundation`
- Features: pnpm monorepo, Next.js app, verifier and contract packages, shared types, environment template, local storage boundaries, and root quality scripts
- Checks: superseded by the green final root gate

### Milestone 1: Smart-contract foundation

- Status: Complete locally
- Branch: `feat/core-mvp`
- Base commits: `1937974`, `2e69922`, `6803580`, `16c1606`, and `0d88e99`
- Published tag: `v0.2.0-contracts`
- Features: owner-and-nonce-derived asset IDs, fingerprint-bound EIP-712 registry, verification-gated escrow, six-decimal `tUSDT`, current-owner checks, post-funding proof freshness, exact accounting, recovery states, disputes, replay protection, and adversarial tokens
- Checks: 31 contract tests and compile passed
- Known limits: no external audit, formal verification, pause mechanism, or upgrade path

### Milestone 2: Authenticated registration

- Status: Complete locally and accepted with generated camera media
- Branch: `feat/core-mvp`
- Base commits: `2a2d23b`, `0d88e99`, and `0378ab5`
- Published tag: `v0.3.0-registration`
- Features: eight-stage wizard, six quality-gated views, wallet EIP-712 authorization, owner-bound asset ID, hashed bearer capability, deterministic fingerprint, optional OCR, and onchain registration adapter
- Browser evidence: all six capture requests and fingerprint finalization returned success
- Known limits: no real-camera calibration corpus; local ephemeral ownership remains offchain only

### Milestone 3: AI verification

- Status: Complete locally and accepted with generated camera media
- Branch: `feat/core-mvp`
- Base commits: `8e3f0ba`, `29331d9`, and `42da37e`
- Published tag: `v0.4.0-verification`
- Features: owner-only sessions, cryptographically random ordered challenges, exact three-frame bursts, server-side freshness and quality, spatial and local matching, perceptual replay checks, optional neural/OCR enrichment, transparent scoring, and reason codes
- Checks: shared 17 and verifier 29 tests passed; browser synthetic replay failed closed
- Known limits: no representative accuracy dataset; camera injection and sophisticated presentation attacks remain possible

### Milestone 4: Cryptographic attestations

- Status: Complete locally
- Branch: `feat/core-mvp`
- Published tag: `v0.5.0-attestations`
- Features: exact EIP-712 authorization and attestation schemas, server-only signer, short expiry, signer recovery, exact fingerprint commitment, immutable escrow context, idempotent retry, and global onchain session consumption
- Checks: signature parity, fingerprint mismatch, signer rotation, replay, expiry, and context tests passed
- Known limits: one authorized verifier remains the MVP trust root

### Milestone 5: End-to-end escrow

- Status: Complete in the deterministic local protocol smoke
- Branch: `feat/core-mvp`
- Base commit: `718154e`
- Published tag: `v0.6.0-escrow`
- Features: create, approve, exact fund, context-bound settle, post-funding proof requirement, exact release, seller-authorized or timeout refund, cancel, dispute commitment, and current-owner checks
- Checks: local smoke finished `Released`, paid the exact amount, and consumed the signed session; contract attack cases passed
- Known limits: the product amount input assumes a six-decimal token; no wallet-extension browser settlement receipt was recorded

### Milestone 6: Adversarial demo

- Status: Complete as an interface and tested fail-closed path
- Branch: `feat/core-mvp`
- Published tag: `v0.7.0-attack-lab`
- Features: static-photo, substitution, expiry, and genuine-control guidance using the normal verifier; attack labels never reach the scoring service
- Checks: replay and wrong-context contract tests passed; browser synthetic feed was rejected for liveness/replay reasons
- Known limits: same-model substitution is uncalibrated; the UI does not intentionally resubmit a consumed onchain session

### Milestone 7: Visual experience

- Status: Complete and browser-accepted
- Branch: `feat/core-mvp`
- Base commits: `70b898e`, `12b6515`, and `ad900f6`
- Published tag: `v0.8.0-visual-experience`
- Features: scanner-led landing page, procedural React Three Fiber device, deterministic fingerprint constellation, camera reticles, transaction narrative, passports, protocol view, presentation mode, reduced-motion/non-WebGL paths, responsive layouts, design-system route, and 40-second launch composition
- Checks: production build passed; 12 desktop/mobile/fallback cases passed; reduced-motion hydration regression fixed and tested
- Known limits: performance was inspected functionally, not with a full Core Web Vitals lab profile

### Milestone 8: X Layer Testnet

- Status: Partial; release gate remains closed
- Branch: `feat/core-mvp`
- Public export: `packages/contracts/deployments/1952.json`
- Tag: none; `v0.9.0-testnet` is intentionally not published
- Confirmed: `AliveAssetRegistry` at `0x036caD7F90A8A7ecf9B918dc214659aCb3D07Ab9`, transaction `0xcf102772641d7a061709295a3679676cf24c90ad2917e6541ebc9accb5574883`, runtime bytecode exactly equal to the compiled artifact
- Not confirmed: `AliveAttestationRegistry`, `AliveEscrow`, `MockUSDT`, consumer authorization, public negative case, or public genuine settlement
- Blocker: the OKX Agentic Wallet accepted four later writes but left them pending without hashes; new testnet writes then failed before broadcast with `may_be_out_of_gas`

### Milestone 9: Hackathon release candidate

- Status: Local release candidate complete; public release gate remains closed
- Branch: merged to `main` after the green final gate
- Tag: none; `v1.0.0-hackathon` is intentionally not published
- Features: complete local implementation, docs, API/scoring/security references, deployment guide and partial export, MIT license, demo route, reset boundary, presentation mode, and launch video source
- Known limits: incomplete X Layer protocol deployment, no public settlement, no real physical-camera QA, no public calibration corpus, no hosted demo, and no independent audit

## Capability checklist

- [x] repository structure and shared configuration
- [x] Solidity asset registry, attestation registry, escrow, and test token
- [x] exact fingerprint binding, owner-bound IDs, proof freshness, and exact token accounting
- [x] SQLite migrations and bounded local evidence storage
- [x] wallet-signed resource creation and hashed bearer capabilities
- [x] deterministic visual fingerprinting with optional OCR/neural enrichment
- [x] owner-only random sessions and server-validated three-frame bursts
- [x] transparent basis-point scoring and reason codes
- [x] exact EIP-712 signing and onchain replay protection
- [x] complete product routes, wallet adapters, camera components, Attack Lab, and presentation mode
- [x] architecture, API, scoring, security, demo, assets, decisions, and deployment docs
- [x] green root `pnpm check` and deterministic `pnpm smoke:local`
- [x] desktop/mobile, reduced-motion, non-WebGL, and generated-camera browser QA
- [x] launch MP4 render and visual contact-sheet inspection
- [x] one exact-build X Layer Testnet contract with public transaction and bytecode readback
- [ ] real physical-camera browser QA
- [ ] wallet-extension browser-to-contract settlement receipt
- [ ] complete X Layer Testnet deployment and consumer authorization
- [ ] public testnet negative and genuine settlement flows
- [ ] `v0.9.0-testnet` and `v1.0.0-hackathon`

## Release gate

Do not publish `v0.9.0-testnet` or `v1.0.0-hackathon` until all of these are true:

- attestation registry and escrow addresses have confirmed public transaction hashes;
- signer domain and deployed authorized verifier match;
- the escrow is an authorized contextual consumer;
- browser registration and genuine settlement confirm on X Layer Testnet;
- a static or wrong-object attempt leaves the public escrow unreleased;
- public deployment metadata and explorer links match the tagged commit;
- real-camera QA and the full regression remain green.
