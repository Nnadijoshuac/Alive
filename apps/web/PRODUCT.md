# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: a person deciding whether to move capital into or out of a tokenized
real-world asset (RWA) — treasuries, funds, gold, equities, credit — and who
needs to know, before acting, whether that asset currently passes ALIVE's
sourced eligibility checks. In the immediate term this is a hackathon demo
audience (judges, reviewers) watching a live walkthrough; the designed
experience should read correctly to that audience in under a minute without
narration, while remaining the real product surface for a future allocator
user. Secondary: the presenter/builder running the live demo, who needs the
flow to be self-explanatory enough that they don't have to narrate every
click.

## Product Purpose

ALIVE continuously verifies tokenized real-world assets. It reads the
information behind an asset (issuer documentation via AI extraction, live
market data via Chainlink), evaluates it against deterministic eligibility
rules, and produces a verdict — ELIGIBLE, RESTRICTED, or UNKNOWN — that a
smart contract enforces onchain. Success is a user (or judge) understanding,
within the search → passport → status flow, exactly what was checked, what
the current verdict is, and why — with every claim traceable to a labelled
source.

## Positioning

"AI thinks. Code calculates. Smart contracts enforce." AI never sets a
number, a price, or an eligibility outcome — it only proposes structured,
source-cited facts from documents. A deterministic rules engine decides
eligibility from those facts plus live market data. A smart contract on X
Layer is the only thing that can block or allow the financial action, and it
re-evaluates continuously rather than checking once at issuance — this is
what "continuous verification" means and what a neighboring "AI compliance"
or "one-time KYC-style attestation" product could not truthfully claim.

## Operating Context

- Demo assets today: tUSDC, tTBILL-A (Attack Lab / no AI extraction),
  tGOLD, tSP500, and a live-Chainlink showcase asset (ttbill-b / USTB).
- The real backend pipeline behind every screen: identify asset → ingest
  issuer documentation → AI-extract structured facts with citations → check
  source provenance → evaluate deterministic eligibility rules → (optional)
  sign and publish the verdict onchain.
- A persistent monitoring worker re-checks live Chainlink data and republishes
  verdicts only when they change (see docs/CHAINLINK.md, docs/AI.md).
- The Attack Lab exists separately to demonstrate the verdict flipping to
  RESTRICTED under adversarial conditions (stale data, etc.) and the
  onchain contract rejecting a transaction as a result — that surface stays
  intact but is not part of the primary 3-step flow.
- Broader product also includes a natural-language policy/mandate builder
  (Create), portfolio Rebalance, and a Markets browser — real, functional
  surfaces that remain reachable but are secondary to asset verification for
  this pass.

## Capabilities and Constraints

- Every fact shown must be attributable to one of: AI opinion (document
  extraction), policy rule, market data (provider + timestamp), or onchain
  fact — never blended or unlabelled (see docs/PIVOT.md's four categories).
  Demo/synthetic data must say so; unsupported fields must read UNKNOWN, not
  be guessed.
- Verdicts expire (currently ~15 min validity) and must be re-evaluated, not
  cached indefinitely, before being presented as current.
- Nothing here should read as investment advice; contracts are unaudited
  demo-stage software.
- Tech stack: Next.js/React/TypeScript, existing `rwa-api.ts` client and
  `@alive/shared` types already expose asset, extraction, eligibility, and
  monitor data — the redesign is a presentation-layer change over this real,
  working pipeline, not a new backend.

## Brand Commitments

Name: ALIVE. No existing binding visual identity beyond the current
implementation, which this redesign explicitly treats as anti-reference, not
a constraint to preserve.

## Evidence on Hand

Real, working API endpoints and pipeline (ingest, extract, evaluate, publish)
already implemented in `services/intelligence`. Real demo asset catalog.
Real Chainlink-backed live asset (ttbill-b). No real user research or
testimonials exist — do not fabricate any.

## Product Principles

1. One primary path, always visible: search/choose an asset → verified
   passport → status and sources. Nothing on the primary screen should
   compete with this for attention.
2. Every number and claim on screen must show where it came from (AI,
   deterministic code, market provider, or chain) and when it was true.
3. Honesty over polish: label demo data as demo data, UNKNOWN as UNKNOWN, and
   never simulate a result (per docs/DEMO.md's hard rule) — this applies to
   the redesigned UI's copy and states, not just the backend.
4. Secondary surfaces (Create, Markets, Rebalance, Attack Lab, Protocol,
   Demo) stay fully functional and reachable but visually quiet — they never
   compete with the verify → passport → status path on the main screen.

## Accessibility & Inclusion

No product-specific requirement established beyond standard web accessibility
(existing code uses semantic landmarks, aria labels, and a skip link — retain
that bar).
