# ALIVE demo runbook

## Presenter objective

Show one causal chain in two to three minutes:

```text
camera -> real visual comparison -> signed attestation -> contract checks -> test-token outcome
```

The audience should understand two things without source-code narration:

1. a blockchain cannot see the physical object by itself;
2. ALIVE makes a bounded AI observation consequential without putting private media onchain.

## Hard rule

Never substitute a seeded score, hardcoded hash, fake explorer link, or prerecorded success screen for a live result. If a camera, verifier, wallet, or chain step fails, show the failure honestly and use the recovery section.

## Recommended physical setup

- one visually distinctive laptop, camera, console, or equipment case as the genuine asset;
- one different object, preferably in the same broad category, for substitution;
- one phone or second screen capable of displaying a registration photo;
- diffuse front lighting and a plain background;
- buyer and seller as separate disposable wallets;
- the local Hardhat network for rehearsal, or X Layer Testnet only after a recorded smoke test;
- enough labelled `tUSDT` in the buyer wallet and native gas in both wallets.

Stable scratches, stickers, ports, and readable labels make the instance-matching concept easier to demonstrate. Do not add identifying marks after registration.

## Technical preflight

1. Install with a normal `pnpm install`; do not omit optional/native dependencies.
2. Run `pnpm check` and `pnpm smoke:local` from the repository root.
3. Load the edited root environment into the current shell as described in the README.
4. Start the chain with `pnpm chain`.
5. Deploy with `pnpm deploy:local`, copy addresses into environment, and reload it.
6. Ensure `ALIVE_VERIFIER_PRIVATE_KEY` is the key for the address authorized during deployment.
7. Start web and verifier with `pnpm dev`.
8. Check `http://127.0.0.1:4100/api/health`:
   - `status` is `ok`;
   - `signingConfigured` is `true`;
   - `verifierAddress` equals the deployed registry's authorized verifier;
   - `walletAuthorization` and `hashedResourceCapabilities` are `true`;
   - OCR and neural capability flags match the intended demo.
9. Open `http://localhost:3000/demo` and connect the buyer wallet to chain `31337`.
10. Grant camera permission and confirm the intended camera device.
11. Make a short rehearsal capture to confirm focus, exposure, API reachability, and transaction confirmation.

For the hackathon AI demonstration, enable both optional local capabilities before starting the verifier:

```dotenv
ALIVE_ENABLE_OCR=true
ALIVE_ENABLE_NEURAL_EMBEDDING=true
ALIVE_NEURAL_MODEL=Xenova/clip-vit-base-patch32
```

Warm the model before the timed presentation because its first run may download and initialize model files. If neural loading fails, do not imply it ran; the health response and result diagnostics show the active capability.

## Reset procedure

The reset controls remove remembered browser presentation state. For a complete verifier reset with `DEMO_MODE=true`, call:

```powershell
$headers = @{ "x-alive-demo-token" = $env:DEMO_RESET_TOKEN }
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4100/api/demo/reset -Headers $headers
```

or:

```bash
curl -X POST -H "x-alive-demo-token: $DEMO_RESET_TOKEN" http://127.0.0.1:4100/api/demo/reset
```

The verifier refuses destructive reset unless `DEMO_RESET_TOKEN` is configured and the request supplies the same secret. Its evidence adapter also refuses to delete a root outside the dedicated workspace `storage` boundary. This removes local demo records and evidence. It cannot revert chain state or clear the browser's ephemeral local signer. Close the tab or clear the app's `sessionStorage` if a new local-mode identity is required.

There is no demo seed endpoint. A new asset always needs a wallet or local ephemeral signature and real registration captures. To reset the chain, restart the Hardhat node, redeploy, archive the stale `packages/contracts/deployments/31337.json` first because deployment refuses to overwrite it, and replace all browser and signer addresses before restarting the app.

## Timed presentation

### 00:00 to 00:20: Frame the problem

Open `/` with the scanner visible.

Say:

> A blockchain can track a token perfectly while knowing absolutely nothing about the object behind it. ALIVE gives smart contracts eyes.

Follow the visual path from physical asset to AI inspection, signed proof, X Layer, and programmable value.

### 00:20 to 00:55: Register a physical baseline

Open `/assets/register` with the seller wallet. Enter a short name and category, then capture front, left, right, back, distinctive detail, and identifier views.

Narrate only the causal facts:

- unusable blur or exposure is rejected;
- the seller signs a short-lived authorization for the exact owner-and-nonce-derived asset ID and metadata;
- raw frames remain in local verifier storage;
- the verifier extracts real image features and identifier evidence;
- a deterministic fingerprint commitment is returned;
- the seller submits that commitment to the asset registry.

Show the asset ID, commitment, and confirmed transaction. Do not say the object is guaranteed authentic. Registration establishes a baseline supplied by this operator.

### 00:55 to 01:20: Lock payment

Switch to the buyer wallet and say:

> I'm going to lock money inside this smart contract and tell it not to pay until it knows I'm holding the right physical object.

Open `/escrow/create`. Select or paste the asset ID, seller, labelled test token, amount, 8,500 identity threshold, 8,000 liveness threshold, and a short expiry. Create escrow, then approve and fund it from `/escrow/[escrowId]`.

Point to contract-derived `AWAITING VERIFICATION`, the exact seller, the score policy, and the escrow context.

### 01:20 to 01:50: Attempt an attack

Open `/attack-lab`, select `Static photo replay`, and present the phone or screen. Follow the returned challenges as far as the presentation allows.

Show the actual reason codes and signal values. A useful expected failure is motion, replay, multi-view, identity, or liveness below policy. The exact code depends on the evidence; do not promise one in advance.

If time allows, run `Object substitution` with the second object. Then return to escrow and show that its status and token balance did not change. A rejected offchain result does not itself submit a reverting settlement transaction.

### 01:50 to 02:35: Genuine verification and settlement

Open the funded escrow with the seller wallet. Start its context-bound verification and complete each randomized instruction with the registered object.

The verifier requires the same authenticated offchain owner that registered the asset. The seller first signs the exact session ID, asset, wallet, and escrow context. Each challenge then records a three-frame burst; the server checks every frame and derives intra-burst motion rather than trusting a client-supplied liveness score.

Keep the technical result visible:

- spatial and local match;
- identifier result when available;
- multi-view consistency;
- intra-burst and cross-challenge motion, freshness, replay risk, and image quality;
- identity, liveness, and visual-integrity basis points;
- evidence hash;
- EIP-712 digest, signer, issue time, and expiry.

If accepted, submit `settleWithAttestation`. The contract requires the signed fingerprint commitment to equal the registered one and the proof to have been issued no earlier than the escrow's `fundedAt`. Show the sequence:

```text
SIGNED -> TRANSACTION PENDING -> CONFIRMED -> PAYMENT RELEASED
```

Open the explorer only for a real public-network transaction. For local rehearsal, show the confirmed local receipt and contract-derived `Released` state without calling it an X Layer Testnet transaction.

Close with:

> AI verified reality. The contract moved the money.

Use `X Layer moved the money` only during a real X Layer Testnet run.

## Attack Lab modes

| Mode                | Presenter action                | Signals expected to matter                            |
| ------------------- | ------------------------------- | ----------------------------------------------------- |
| Static photo replay | Show paper or a screen image    | motion, ordered views, exact/near replay risk         |
| Object substitution | Present a different object      | spatial match, local features, identifier, multi-view |
| Expired capability  | Wait past the returned deadline | session validity and capture freshness                |
| Genuine control     | Present the registered object   | all configured signals                                |

The mode label is local presentation guidance and is not sent to the verifier. The verifier therefore cannot predetermine the result from the selected experiment.

Onchain signed-session replay is exercised by contract tests rather than a browser mode: submitting the same session twice must revert at the attestation registry.

## Recovery

### Camera denied or unavailable

- reopen browser site settings and allow camera;
- select another camera in the capture control;
- retry the current step without restarting the whole wizard;
- use `localhost` or HTTPS because browser camera access requires a secure context, with localhost treated specially.

### Low-quality frame

- add diffuse light;
- avoid bright windows or reflective glare;
- hold the object steady and fill the reticle;
- retry only that view. Rejected frames are not submitted.

### Session expired

Start a new verification session. Never alter timestamps or reuse the old nonce.

### Authorization or capability rejected

- sign only the typed data returned by the current verifier challenge;
- confirm the wallet is the authenticated offchain asset owner;
- confirm `ALIVE_AUTH_AUDIENCE` and `ALIVE_AUTH_CHAIN_ID` match the client expectation;
- request a new challenge after authorization expiry;
- restart the registration or verification flow if its in-memory bearer capability was lost;
- never recover a capability from logs or put it into a URL.

### Verifier unavailable

Check `/api/health`, the port, and `VERIFIER_ALLOWED_ORIGINS`. Verify that the SQLite and evidence paths are writable.

### Signer not configured

Confirm the private key, chain ID, and attestation-registry address are in the verifier process. Compare the health response address with `authorizedVerifier()` on the deployed registry.

### Wallet wrong network or rejected request

Use the in-app network switch, confirm the configured RPC and chain ID, and retry the transaction. Do not rerun visual analysis if the stored attestation is still unexpired; the signing endpoint returns the same stored proof on retry.

### Contract revert

Read the actual custom error. Common causes include wrong seller, asset ownership changed, escrow not funded, proof issued before funding, expired escrow or proof, fingerprint mismatch, below-threshold scores, wrong context, wrong signer domain, unsupported token balance behavior, or already consumed session.

## Recording checklist

- 16:9 browser window with zoom at 100%;
- large result values and status visible;
- no seed phrase, private key, local file path, or personal serial exposed;
- notification popups disabled;
- optional launch render generated from `videos/alive-launch` but not committed;
- a backup recording of a genuine flow clearly labelled as backup, never silently substituted for the live demo.

## Honest judging language

Use:

- AI-estimated visual match confidence;
- active verification;
- visual integrity or observable change;
- signed Proof-of-Physical-State attestation;
- simple replay resistance.

Avoid:

- guaranteed authentic;
- impossible to spoof;
- bank-grade liveness;
- certified condition;
- legally verified;
- 100% fraud-proof.
