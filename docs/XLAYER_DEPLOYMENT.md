# X Layer deployment guide

## Current deployment state

X Layer Testnet is partially deployed. `AliveAssetRegistry` is confirmed at `0x036caD7F90A8A7ecf9B918dc214659aCb3D07Ab9` in transaction `0xcf102772641d7a061709295a3679676cf24c90ad2917e6541ebc9accb5574883`. Direct RPC readback found 2,123 runtime bytes and an exact match with the compiled artifact.

`AliveAttestationRegistry`, `AliveEscrow`, `MockUSDT`, and consumer authorization are not confirmed. The OKX Agentic Wallet accepted those calls but left them pending without transaction hashes; later writes failed before broadcast with `may_be_out_of_gas`. The public export therefore records `deploymentState: "PARTIAL"`, and this state must not be tagged or described as a complete testnet deployment.

Only update [BUILD_STATUS.md](BUILD_STATUS.md), the root README, or a release tag after the exact commit has completed the public-network smoke test below.

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
