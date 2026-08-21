# X Layer deployment guide

## Current deployment state

### ALIVE verification gateway — X Layer Testnet (chain 1952) — LIVE

Deployed 2026-08-16 by `0x9f6813f3534f1C01a271482D8d8EAdbEA146F092`.
Authoritative record: [`packages/contracts/deployments/rwa-1952.json`](../packages/contracts/deployments/rwa-1952.json).
Every entry below was written only after its receipt reported success and
`eth_getCode` confirmed runtime bytecode at the address.

| Contract                   | Address                                      | Block      |
| -------------------------- | -------------------------------------------- | ---------- |
| `AliveRwaAssetRegistry`    | `0xE4B4F15D7d484c14128260d29b9d4D7739677Ce3` | 38,432,498 |
| `AlivePolicyRegistry`      | `0x531E8b545c92C4Ab616a943B41b2Ae817F342E3b` | 38,432,595 |
| `AliveStrategyVerifier`    | `0xD3B71c5cde87e6cA750920dD4DB7eD8Cf7AE2221` | 38,432,592 |
| `AliveEligibilityRegistry` | `0x5E3584d61710f8FD6076d93a0bDbE96784a4f98d` | 38,432,600 |
| `AliveVaultFactory`        | `0xd2c06F2978De1CF7e589b3e054373C871E594fBc` | 38,432,604 |
| `AliveVault`               | `0xd998a66A76501a32557B57A21F33c84396490ae0` | 38,432,610 |

Eligibility signer (offchain EIP-712, holds no funds): `0x2E8b26D0664Eeb71ae58f144c53a597E61dD09ad`.

**Demo-only infrastructure.** `MockRwaRouter`, `DemoRwaFaucet`, and eight
`MockRwaToken`s are deployed alongside the protocol and recorded in a separate
`demoOnlyContracts` section of the same file. They are synthetic test
instruments and a deterministic price fixture. They are not a DEX, not an
oracle, and not real tokenized securities, and must never be presented as any
of those.

### Proven gateway sequence on X Layer Testnet

Recorded in [`gateway-proof-1952.json`](../packages/contracts/deployments/gateway-proof-1952.json),
generated from verified receipts by `pnpm --filter @alive/contracts prove:flow 1952`.
Asset: `ttbill-a` (`0xC12D77E4F92B122277E804c24DA12BE51940c261`).

| Step                     | ALIVE verdict          | Onchain result                        | Transaction                                                          |
| ------------------------ | ---------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| Publish eligible verdict | `ELIGIBLE`             | `isEligible = true`                   | `0x378b12c22f19afd7c0c47969397bd49183700e3abc33cd0da31151ee7d9a5750` |
| Gated deposit            | —                      | **CONFIRMED** (block 38,433,124)      | `0x547033d641f40038911584793090df700b3f3fb7d501885334a98a87d20a8f78` |
| NAV ages to 31h          | `RESTRICTED NAV_STALE` | `isEligible = false`                  | `0x8eaae09fd443efe9b3efd4b787d83706a3a0b37aabe3fc4a32f26e00c5e9298a` |
| Same gated deposit       | —                      | **REJECTED** — `AssetNotEligible`     | not broadcast (see note)                                             |
| Restore NAV              | `ELIGIBLE`             | `isEligible = true`                   | `0xdcf75906651df3b2648b67782516da794f1d83bc22427172041aa76523b2580d` |
| Gated deposit again      | —                      | **CONFIRMED** (block 38,433,141)      | `0x9e2a1a39efe2e462b3da25dff6016805767d8d4ac591996f2dca879e81206ab8` |

The vault holds 200 tTBILL: two deposits succeeded and the rejected one moved
nothing.

**On the rejected step.** The refusal is real contract logic — the vault's own
`AssetNotEligible` custom error, decoded from an `eth_call` against the
deployed contract at that moment. It is deliberately *not* broadcast as a
mined failed transaction: the client simulates first, so a guaranteed revert
surfaces as contract truth instead of burning gas on a transaction that cannot
succeed. There is therefore no mined reverted-transaction hash for that step,
and none is claimed. The onchain restriction is independently verifiable from
`AliveEligibilityRegistry.isEligible` returning `false` at that block, and the
same revert is covered by contract tests in
`packages/contracts/test/AliveRwaProtocol.test.ts`.

### Historical V1 physical-state stack

The earlier physical-state deployment remains partially live and is retained
for history only. `AliveAssetRegistry` (V1) is confirmed at
`0x036caD7F90A8A7ecf9B918dc214659aCb3D07Ab9` in transaction
`0xcf102772641d7a061709295a3679676cf24c90ad2917e6541ebc9accb5574883`.
`AliveAttestationRegistry`, `AliveEscrow`, and `MockUSDT` were never
confirmed; that export records `deploymentState: "PARTIAL"`. It is not part of
the shipping product.

### X Layer Mainnet (chain 196)

Not deployed. Configuration exists and the RPC was verified to report chain
`196`, but no ALIVE contract has been broadcast to mainnet. Mainnet deployment
is gated behind an explicit `ALLOW_MAINNET_DEPLOY=true` acknowledgement and a
separate deployer key.

## Networks

| Environment     | Chain ID | Gas token | RPC                                   | Explorer                                        |
| --------------- | -------: | --------- | ------------------------------------- | ----------------------------------------------- |
| X Layer Testnet |     1952 | test OKB  | `https://testrpc.xlayer.tech/terigon` | `https://www.okx.com/web3/explorer/xlayer-test` |
| X Layer Mainnet |      196 | OKB       | `https://rpc.xlayer.tech`             | `https://www.okx.com/web3/explorer/xlayer`      |

These values are centralized in `packages/shared/src/chains.ts` and `packages/contracts/hardhat.config.ts`. Override the RPC through environment rather than editing components.

## Prerequisites

- a clean, reviewed commit;
- successful relevant compile, type, unit, and build checks;
- a dedicated X Layer Testnet deployer funded with test OKB;
- a separate, unfunded verifier signing key;
- an injected wallet configured for chain `1952`;
- a decision whether the public testnet demo needs the clearly labelled `MockUSDT`.

Do not reuse a personal, exchange, production, or mainnet-funded key.

## 1. Prepare the verifier identity

The attestation registry stores the verifier's public address, while the local service retains its private key. The two must correspond exactly.

One zero-cost way to create a disposable key with the installed viem dependency is:

```bash
pnpm --filter @alive/shared exec node --input-type=module -e "import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts'; const key=generatePrivateKey(); console.log('private='+key); console.log('address='+privateKeyToAccount(key).address)"
```

Move the private value immediately into an uncommitted secret store or local environment. Record the public address as `VERIFIER_ADDRESS`. Clear terminal history if your environment retains sensitive output.

For anything beyond a disposable hackathon testnet, generate and hold the signer in protected hardware or an isolated signing service instead.

## 2. Configure Hardhat

Create `packages/contracts/.env` from its example and replace every placeholder used. A copied placeholder is not a valid key or address.

```dotenv
DEPLOYER_PRIVATE_KEY=0xDEDICATED_TESTNET_DEPLOYER_KEY
VERIFIER_ADDRESS=0xPUBLIC_ADDRESS_DERIVED_FROM_VERIFIER_KEY
X_LAYER_TESTNET_RPC_URL=https://testrpc.xlayer.tech/terigon

# true only for the clearly labelled public test token
DEPLOY_MOCK_USDT=true
```

The deployer pays gas and becomes owner of `AliveAttestationRegistry` and `MockUSDT`. The verifier does not need gas to sign offchain.

## 3. Compile and deploy

From the repository root:

```bash
pnpm --filter @alive/contracts compile
pnpm deploy:testnet
```

The script performs these transactions in order:

1. deploy `AliveAssetRegistry`;
2. deploy `AliveAttestationRegistry` with the asset registry, verifier, and owner;
3. deploy `AliveEscrow` with both registries;
4. authorize the escrow as a contextual attestation consumer;
5. optionally deploy `MockUSDT` when explicitly enabled.

After all steps succeed it writes `packages/contracts/deployments/1952.json` with network, chain ID, timestamp, deployer, authorized verifier, addresses, and deployment transaction hashes. The write uses exclusive creation and refuses to replace an existing export.

If deployment stops halfway, inspect every submitted transaction before retrying. Do not delete or replace an address export without archiving and understanding it. The contracts are not proxy-upgradeable; a clean redeployment creates new addresses and a new EIP-712 domain.

## 4. Verify the export

Confirm all of the following before using the addresses:

- every transaction succeeded on the X Layer Testnet explorer;
- `AliveAttestationRegistry.assetRegistry()` equals the new asset registry;
- `AliveAttestationRegistry.authorizedVerifier()` equals `VERIFIER_ADDRESS`;
- `AliveAttestationRegistry.authorizedConsumers(escrow)` is `true`;
- `AliveEscrow.assetRegistry()` and `attestationRegistry()` equal the exported registries;
- `MockUSDT.name()` is `ALIVE Test USDT`, `symbol()` is `tUSDT`, and `decimals()` is `6` if deployed;
- none of the addresses is an EOA or a contract from a previous run.

The repository does not currently automate explorer source verification. Do not write `verified contract` in release material unless the source and compiler settings are actually published and matched on the explorer.

## 5. Configure the verifier

Load these server-only values into the process that starts `@alive/verifier`:

```dotenv
ALIVE_VERIFIER_PRIVATE_KEY=0xDEDICATED_VERIFIER_KEY
ALIVE_CHAIN_ID=1952
ALIVE_ATTESTATION_REGISTRY_ADDRESS=0xDEPLOYED_ATTESTATION_REGISTRY

ALIVE_AUTH_AUDIENCE=http://127.0.0.1:4100
ALIVE_AUTH_CHAIN_ID=1952
WALLET_AUTH_TTL_SECONDS=120
REGISTRATION_CAPABILITY_TTL_SECONDS=1800

VERIFIER_HOST=127.0.0.1
VERIFIER_PORT=4100
VERIFIER_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
DEMO_MODE=true
DEMO_RESET_TOKEN=0xA_DEDICATED_RANDOM_LOCAL_RESET_SECRET
```

`ALIVE_AUTH_AUDIENCE` must be the canonical verifier origin that clients validate, and the authorization chain must be `1952` for wallet prompts in this environment. Start the service and inspect `/api/health`. Its returned `verifierAddress` must equal the registry's `authorizedVerifier`, and its wallet-authorization and hashed-capability flags must be enabled. A signer mismatch will make every onchain attestation fail.

Enabling OCR and neural inference is independent of the chain:

```dotenv
ALIVE_ENABLE_OCR=true
ALIVE_ENABLE_NEURAL_EMBEDDING=true
ALIVE_NEURAL_MODEL=Xenova/clip-vit-base-patch32
```

## 6. Configure the web app

Set public values in the inherited shell environment or `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_VERIFIER_URL=http://127.0.0.1:4100
NEXT_PUBLIC_CHAIN_ENV=xlayer-testnet
NEXT_PUBLIC_RPC_URL=https://testrpc.xlayer.tech/terigon
NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_ATTESTATION_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_ESCROW_ADDRESS=0x...
NEXT_PUBLIC_TEST_TOKEN_ADDRESS=0x...
```

Restart Next.js after any `NEXT_PUBLIC_` change. Public addresses are compiled into the browser bundle and are not secrets.

If no test token was deployed, leave `NEXT_PUBLIC_TEST_TOKEN_ADDRESS` unset and provide a supported six-decimal test ERC-20 address manually in escrow creation. The current UI submits amounts with six decimals.

## 7. Mint labelled test funds

When the deployment includes `MockUSDT`, the deployer can mint to the buyer through the Hardhat console:

```bash
pnpm --filter @alive/contracts exec hardhat console --network xlayerTestnet
```

```javascript
const token = await ethers.getContractAt("MockUSDT", "0xTOKEN_ADDRESS");
await (await token.mint("0xBUYER_ADDRESS", 10000n * 10n ** 6n)).wait();
```

The token also exposes one `10,000 tUSDT` faucet claim per address, but the current product does not include a faucet button. Never call or label this token real USDT.

## 8. End-to-end smoke test

Use disposable buyer and seller wallets and record every public transaction hash.

### Registration

1. Connect seller on chain `1952`.
2. Confirm the seller signs a `CREATE_ASSET` authorization whose asset ID is derived from that seller and the returned registration nonce, and whose payload commits to the exact metadata.
3. Register six real views through the app.
4. Confirm the fingerprint hash is nonzero and the registration capability is no longer usable after finalization.
5. Submit `registerAsset(assetId, registrationNonce, fingerprintHash, metadataHash, metadataURI)` from that same seller and wait for success.
6. Read `getAsset(assetId)` and compare owner and fingerprint commitment.

### Escrow funding

1. Connect buyer.
2. Create escrow for the asset's current seller.
3. Confirm emitted escrow ID and context.
4. Approve exactly the escrow amount.
5. Fund and confirm `AwaitingVerification`.

### Negative case

1. Create a fresh context-bound session.
2. Present a static photo or different object.
3. Record the computed rejection and reason codes.
4. Confirm escrow remains `AwaitingVerification` and tokens remain held.

### Positive case

1. Connect the recorded seller and start a new session using `escrowContext(escrowId)`.
2. Confirm the seller signs `CREATE_VERIFICATION_SESSION` for the exact asset, generated session ID, wallet, and escrow context.
3. Present the registered object and complete each challenge's three-frame burst in order.
4. Confirm signer, domain chain ID, registry address, fingerprint hash, context, subject, expiry, and score thresholds.
5. Confirm attestation `issuedAt` is at or after `fundedAt(escrowId)`.
6. Submit `settleWithAttestation` before expiry.
7. Confirm `AssetVerified` and `EscrowReleased`, the seller received the exact amount, and state is `Released`.
8. Attempt to reuse the same session and record the expected replay rejection.

### Ownership-transfer case

Create an escrow, transfer the registry asset to another owner, then confirm funding or settlement for the former seller reverts. This validates the ownership recheck added at all consequential escrow boundaries.

## 9. Publish deployment metadata

Only after the smoke test:

1. inspect `packages/contracts/deployments/1952.json` for secrets and correct hashes;
2. commit the public export;
3. add an address table and explorer links to the root README;
4. update `docs/BUILD_STATUS.md` with exact branch, commit, checks, known issues, and date;
5. create `v0.9.0-testnet` only if the complete public flow works from the tagged commit.

Do not create `v1.0.0-hackathon` until the broader regression, demo, documentation, and launch render are also complete.

## Mainnet boundary

Chain `196` is configured only to make future migration explicit. Before mainnet:

- obtain independent contract and oracle security audits;
- protect public read and challenge endpoints with rate limits, access policy, and audit logging;
- add explicit capability revocation and protected transport beyond loopback;
- protect owner and verifier keys;
- add encrypted evidence governance;
- calibrate by asset class;
- define incident, pause, rotation, and redeployment procedures;
- decide whether single-verifier trust is acceptable;
- remove or isolate every demo-only mutation;
- complete legal and privacy review.

`pnpm --filter @alive/contracts deploy:mainnet` existing as a script is not authorization to use it.
