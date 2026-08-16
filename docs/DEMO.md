# ALIVE demo runbook — verification gateway on X Layer Testnet

> The archived physical-state runbook is preserved at
> [DEMO-v1-physical-state.md](DEMO-v1-physical-state.md). It describes a
> product ALIVE no longer ships.

## What the audience must understand

One causal chain, in under two minutes:

```text
RWA token
  -> ALIVE reads the information behind it
  -> AI structures it into an Asset Passport
  -> deterministic rules evaluate it
  -> a signed verdict goes onchain
  -> X Layer permits or refuses the financial action
```

The point is the refusal. Anyone can show a transaction succeeding. ALIVE is
interesting because when the information behind an asset degrades, **the smart
contract stops the transaction**, and no amount of frontend intent can push it
through.

## Hard rule

Never substitute a seeded verdict, hardcoded hash, fake explorer link, or
prerecorded screen for a live result. If the chain, service, or wallet fails,
show the failure and use the recovery section. The demo is only worth
presenting because it is real.

## Prerequisites

- X Layer Testnet (chain `1952`) contracts deployed and recorded in
  `packages/contracts/deployments/rwa-1952.json`.
- A deployer/demo wallet holding testnet OKB for gas.
- The intelligence service running with `DEMO_MODE=true` and an eligibility
  signer whose address matches the deployed registry's `authorizedSigner`.

```bash
pnpm --filter @alive/contracts check:xlayer:testnet
```

That prints the chain ID the RPC actually reports, the block height, and the
deployer balance. If it says `DEPLOYER IS UNFUNDED`, stop and fund the wallet
before presenting.

## Running the whole proof headlessly

If you have 60 seconds and want the sequence to speak for itself:

```bash
pnpm --filter @alive/contracts prove:flow 1952
```

This drives the real service and real contracts, prints every transaction
hash, and writes `deployments/gateway-proof-1952.json` from verified receipts.
It is the same sequence the UI walks through, without the narration.

## The live walkthrough

### 1. Verify the asset

Open `/verify`, select **tTBILL — Demo Tokenized Treasury**, and run it. The
stages correspond to real backend work: the issuer document is ingested and
hashed, facts are extracted and each one must cite a supplied source, market
data is checked for freshness, redemption status is read, and the
deterministic rules run.

Result:

```text
ALIVE STATUS
ELIGIBLE
```

Open the Asset Passport and show that every fact names the source it came
from, and that the demo document and demo market data are both labelled as
such. Say plainly: *this is a synthetic asset with a fictional issuer.*

### 2. Move capital

Use the asset on X Layer. The vault checks
`AliveEligibilityRegistry.isEligible` before accepting the deposit.

```text
STATUS     CONFIRMED
TX         0x547033d6...
```

### 3. Break the data

In the Attack Lab, run **MAKE NAV STALE** — 31 hours against a 24-hour policy
bound. ALIVE re-evaluates:

```text
ALIVE STATUS
RESTRICTED

REASON
NAV_DATA_STALE
```

Publish that verdict. The registry now reports `isEligible = false`.

### 4. Try the same transaction anyway

This is the moment that matters. Attempt the identical deposit:

```text
BLOCKED ON X LAYER
CONTRACT RESULT   AssetNotEligible
```

Make the distinction explicit: **ALIVE's verdict** is the offchain judgement,
**the contract result** is the enforcement. The frontend is not refusing this;
the vault is.

### 5. Restore and retry

Restore valid NAV data, re-evaluate, publish, and deposit again:

```text
ALIVE STATUS   ELIGIBLE
STATUS         CONFIRMED
TX             0x9e2a1a39...
```

## Honest framing to use out loud

- "These are demo RWA assets with fictional issuers, not real tokenized
  securities."
- "Market data is a labelled demo provider. A Chainlink Data Streams adapter
  exists but is not driving this."
- "The eligibility signer is a single key today. That is a real
  centralization assumption and it is deliberate for this stage."
- "The contracts are unaudited. Nothing here should custody value."

What you can claim without hedging: the contracts are deployed on X Layer
Testnet, the enforcement is genuine contract logic, and the rejection is not
simulated.

## Two things that will bite you live

**Verdicts expire.** The demo policy issues verdicts valid for 15 minutes. If
you set the demo up and then talk for twenty minutes, the asset will read as
ineligible before you start. Re-run the verification immediately before
presenting, or let step 1 do it live.

**The rejected step has no mined transaction.** The client simulates before
broadcasting, so a guaranteed revert is caught as contract truth rather than
burning gas on a transaction that cannot succeed. If a judge asks for the
failed transaction hash, the correct answer is that there deliberately is not
one — then show `isEligible` returning `false` onchain, plus the contract test
that exercises the same revert. Do not invent a hash.

## Recovery

| Failure                   | Response                                                                  |
| ------------------------- | ------------------------------------------------------------------------- |
| Asset already ineligible  | Re-run `/verify`; it publishes a fresh verdict.                            |
| Publish reverts           | Verdicts must be strictly newer than the stored one; wait a second, retry. |
| RPC read looks stale      | A load-balanced node may lag a block. Re-read; do not assume failure.      |
| Service offline           | Show the honest `INTELLIGENCE OFFLINE` state; do not fake a passport.      |
| Wallet on the wrong chain | Switch to chain 1952. The UI states which network it is bound to.          |
