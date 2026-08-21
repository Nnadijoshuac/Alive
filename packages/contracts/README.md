# ALIVE contracts

The active contract direction is **ALIVE RWA Policy Vault V1**:

`user mandate -> canonical policy -> signed bounded plan -> vault enforcement -> RWA allocation`

The earlier physical-state registry, attestation registry, and escrow remain in
this package temporarily for compatibility and historical tests. The two stacks
have distinct contract names and do not share mutable state.

## RWA Policy Vault V1

- `AliveRwaAssetRegistry.sol` is the owner-administered allowlist of unique
  six-decimal tokens. Each record commits to an asset class, issuer, metadata,
  provenance, and enabled state; it does not claim the demo token is a real RWA.
- `AlivePolicyRegistry.sol` stores immutable, versioned policies bound to the
  current owner of one vault. Its enforceable subset includes asset and issuer
  caps, class min/max ranges, a cash floor, price freshness, slippage, allow and
  block lists, and `Advisory` or `GuardedAuto` approval mode.
- `AliveStrategyVerifier.sol` consumes vault-only EIP-712 capabilities bound to
  policy, before/after portfolios, a market snapshot, an execution plan, a
  nonce, and issue/expiry times. Nonces are single-use per vault.
- `AliveVault.sol` holds user assets, gives only the owner withdrawal authority,
  executes no arbitrary calldata, checks exact token deltas, and validates the
  resulting onchain balances against the active policy.
- `test/MockRwaToken.sol` and `test/MockRwaRouter.sol` are explicitly synthetic,
  controlled-price demo infrastructure. They are not securities or a DEX.

The RWA strategy signing domain is:

```text
name: ALIVE RWA Strategy
version: 1
chainId: current chain ID
verifyingContract: deployed AliveStrategyVerifier address
```

The exact primary type is:

```text
Strategy(
  address vault,
  bytes32 policyHash,
  bytes32 portfolioBeforeHash,
  bytes32 portfolioAfterHash,
  bytes32 marketSnapshotHash,
  bytes32 executionPlanHash,
  bytes32 strategyNonce,
  uint64 marketTimestamp,
  uint64 issuedAt,
  uint64 expiresAt
)
```

Portfolio, quote, trade, and execution-plan hashes should be obtained from the
vault's `hashPortfolio`, `hashMarketSnapshot`, `hashTrades`, and
`hashExecutionPlan` functions until an equivalent canonical encoder is shared
with clients. All allocation constraints use integer basis points.

Run the isolated demo deployment against a local Hardhat node with:

```bash
pnpm --filter @alive/contracts deploy:rwa:local
```

It exports `deployments/rwa-31337.json` locally (ignored by Git) and refuses to
overwrite it. A public testnet demo requires `RWA_STRATEGY_SIGNER`,
`DEPLOY_RWA_MOCKS=true`, and the additional explicit safety acknowledgement
`ALLOW_PUBLIC_DEMO_DEPLOYMENT=true`. This repository change does not deploy to a
public network.

## Archived physical-state contracts

Solidity contracts for ALIVE's complete MVP settlement chain:

`physical capture -> visual analysis -> signed attestation -> contract validation -> payment outcome`

Raw captures, embeddings, OCR output, and model artifacts do not belong here.
The asset registry stores commitments only, the attestation registry verifies a
short-lived signed result, and escrow releases an ERC-20 payment only when that
result is valid for the exact escrow.

## Contracts

- `AliveAssetRegistry.sol` registers an owner-bound `bytes32` asset ID derived as
  `keccak256(abi.encode(owner, registrationNonce))`, plus its fingerprint
  commitment, metadata commitment, public metadata URI, and timestamp. It never
  stores raw inspection media.
- `AliveAttestationRegistry.sol` validates the authorized verifier's EIP-712
  signature, registered asset, score bounds, issuance/expiry window, and globally
  single-use session ID. Standalone proofs can be submitted only by their subject.
  Contextual proofs can be consumed only by owner-approved protocol contracts.
- `AliveEscrow.sol` binds a proof to the registered seller, asset, and exact escrow,
  enforces buyer-selected basis-point thresholds, and uses `SafeERC20`, exact
  deposit accounting, checks-effects-interactions, and `ReentrancyGuard`. Its
  lifecycle includes `Created`, a transaction-local `Funded` checkpoint,
  `AwaitingVerification`, `Disputed`, `Released`, `Refunded`, and `Cancelled`.
- `test/MockUSDT.sol` is a six-decimal **test token only** with an owner mint and
  one-use faucet. It is not USDT and has no value or backing.

## EIP-712 compatibility contract

The verifier and client must use this exact domain:

```text
name: Alive Protocol
version: 1
chainId: current chain ID
verifyingContract: deployed AliveAttestationRegistry address
```

The primary type and exact field order are:

```text
Attestation(
  bytes32 assetId,
  bytes32 fingerprintHash,
  bytes32 sessionId,
  address subject,
  bytes32 context,
  uint16 identityScore,
  uint16 livenessScore,
  uint16 integrityScore,
  bool verified,
  bytes32 evidenceHash,
  uint64 issuedAt,
  uint64 expiresAt
)
```

Scores are integer basis points from `0` through `10000`. An attestation must be
issued no later than the current block, expire in the future, and have a validity
window no longer than 24 hours. In practice the verifier should issue much shorter
sessions (for example five minutes).

For escrow `E`, the verifier must sign:

```solidity
context = keccak256(abi.encode(aliveEscrowAddress, E));
subject = escrow.seller;
assetId = escrow.assetId;
fingerprintHash = assetRegistry.getAsset(assetId).fingerprintHash;
```

Call `AliveEscrow.escrowContext(E)` instead of reproducing this encoding in a UI.
`bytes32(0)` is reserved for standalone, non-settlement inspections. A proof for
one escrow cannot release a different escrow, even when both escrows reference the
same asset.

## Install and test

From the repository root:

```bash
pnpm install
pnpm --filter @alive/contracts compile
pnpm --filter @alive/contracts test
pnpm --filter @alive/contracts typecheck
```

Or from this directory:

```bash
pnpm install --ignore-workspace
pnpm test
pnpm typecheck
```

The Hardhat suite covers registration and duplicates; EIP-712 signer validation;
malformed signatures; expiry, future issuance, maximum lifetime, replay, and score
bounds; wrong asset, seller, and escrow context; release and rejected/low scores;
refund authorization and cancellation; double settlement; false-return,
fee-on-transfer, failed-payout tokens; and a reentrant token callback.

A Foundry-compatible `foundry.toml` and source layout are included for teams that
have Forge installed, while Hardhat is the supported Windows toolchain here.

## Local deployment

Copy `.env.example` to `.env` only when needed. `.env` is ignored.

Terminal 1:

```bash
pnpm --filter @alive/contracts node
```

Terminal 2:

```bash
pnpm --filter @alive/contracts deploy:local
```

Local deployment uses Hardhat account 0 as owner/deployer and account 1 as the
verifier unless `VERIFIER_ADDRESS` is set. It also deploys `MockUSDT`. Addresses
are exported to `deployments/31337.json`, which is ignored and never overwritten
implicitly.

## X Layer Testnet deployment (chain ID 1952)

Fund a dedicated testnet deployer with test OKB, then set these values in an
uncommitted `.env`:

```dotenv
DEPLOYER_PRIVATE_KEY=0x...
VERIFIER_ADDRESS=0x...
X_LAYER_TESTNET_RPC_URL=https://testrpc.xlayer.tech/terigon
DEPLOY_MOCK_USDT=false
```

Deploy and export public addresses:

```bash
pnpm --filter @alive/contracts deploy:testnet
```

Set `DEPLOY_MOCK_USDT=true` only for a clearly labelled public-testnet demo token.
The script writes `deployments/1952.json` after deploying the registries and
escrow and authorizing that escrow as the sole contextual attestation consumer.
It refuses to overwrite an existing export. No transaction hash, address, or
explorer link is hardcoded.

X Layer Mainnet (chain ID 196) is configured centrally but should be used only
after independent audit and operational key-management review.

## Security boundaries

- The authorized verifier is an oracle trust assumption. Owner-controlled signer
  rotation invalidates signatures from the previous signer that were not consumed.
- `verified` and scores communicate model output with uncertainty; they are not a
  guarantee of authenticity, liveness, condition, or financial value.
- Session IDs must be unpredictable and unique. They are consumed globally once.
- An authorized consumer must validate its signed context before asking the
  registry to consume a proof. `AliveEscrow` does so before the external call.
- Fee-on-transfer and rebasing-style short-deposit tokens are intentionally
  unsupported. Exact funding protects escrow solvency.
- There is no privileged verifier withdrawal or admin settlement path. Before the
  deadline, only the seller can authorize refund; after it, the buyer can recover.
- Either escrow party may record a nonzero hash committing to an offchain dispute
  reason. Dispute status cannot veto a valid signed proof and adds no admin payout
  path: proof can still release, while seller consent or buyer timeout can refund.
- Production deployment requires an independent audit, protected owner and
  verifier keys, monitoring, and empirical verifier-threshold calibration.
