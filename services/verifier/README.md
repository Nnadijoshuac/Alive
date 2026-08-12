# @alive/verifier

Local, evidence-backed ALIVE verification service. It preserves the causal chain from decoded image bytes through derived visual signals, deterministic evidence commitments, a bounded verification result, and an EIP-712 `Attestation` signed by a server-only verifier key.

## Run

From the repository root:

```bash
pnpm install
pnpm --filter @alive/verifier dev
```

The default address is `http://127.0.0.1:4100`. SQLite defaults to `./storage/database/alive.sqlite`; raw evidence defaults to `./storage/evidence`. Both are intentionally ignored by Git.

Signing requires all three server-side values:

```dotenv
ALIVE_VERIFIER_PRIVATE_KEY=0x...
ALIVE_CHAIN_ID=1952
ALIVE_ATTESTATION_REGISTRY_ADDRESS=0x...
```

Never prefix the private key with `NEXT_PUBLIC_`, send it to a browser, log it, or commit it. The signed domain is `Alive Protocol`, version `1`, and the verifying contract must be the deployed `AliveAttestationRegistry` for the selected chain.

Optional local enrichment is opt-in so offline deterministic extraction remains available:

```dotenv
ALIVE_ENABLE_OCR=true
ALIVE_ENABLE_NEURAL_EMBEDDING=true
ALIVE_NEURAL_MODEL=Xenova/clip-vit-base-patch32
```

The first neural run can download model files into the library cache. Model binaries must not be added to Git. OCR and neural failures degrade to spatial/color, gradient, perceptual-hash, quality, motion, freshness, and multi-view signals; neither optional model fabricates a score.

## HTTP workflow

All JSON errors use `{ "error": { "code", "message", "details"? } }`.

1. `GET /api/health`
2. `POST /api/auth/challenge` with `{ action: "CREATE_ASSET", request: { owner, metadata } }`
3. Sign the returned `AliveAuthorization` EIP-712 typed data with `domain` exactly as returned
4. `POST /api/assets` with `{ assetId: authorization.resource, owner, metadata, authorization: { nonce, signature } }`
5. Retain the returned registration capability only in memory
6. Send `Authorization: Bearer <capability.token>` to each registration capture and fingerprint-finalization request
7. `POST /api/auth/challenge` with `{ action: "CREATE_VERIFICATION_SESSION", request: { assetId, wallet, context } }`
8. Sign and submit the exact returned authorization to `POST /api/verifications/session`
9. Send its returned bearer capability to the session GET, capture, analyze, and attestation routes

`context` is explicit. Use zero bytes32 for a standalone inspection. For escrow settlement, use the shared `createEscrowAttestationContext(escrowContractAddress, escrowIdBytes32)` helper. The signed wallet must be the authenticated offchain asset owner, and the exact resource, asset, wallet, context, canonical request hash, audience, chain, expiry, action, and nonce are bound before session creation.

The authorization domain is `ALIVE Verifier Authorization`, version `1`. Configure its canonical audience and chain separately from attestation signing when needed:

```dotenv
ALIVE_AUTH_AUDIENCE=https://verifier.example
ALIVE_AUTH_CHAIN_ID=1952
WALLET_AUTH_TTL_SECONDS=120
REGISTRATION_CAPABILITY_TTL_SECONDS=1800
```

Wallet authorization nonces are stored in SQLite and consumed atomically with resource creation. Follow-up capabilities are random 32-byte bearer values; only their Keccak hashes are stored. Registration capability is revoked when fingerprint finalization succeeds. Session capability expires exactly with its session. Do not put either capability in URLs, logs, durable browser storage, or analytics.

Sessions use cryptographic randomness, expire, require ordered challenges, and atomically transition through analysis to one immutable attestation. Repeating the attestation request returns the same stored signature for safe HTTP retry; it does not sign a second payload.

## Capture body and fixture creation

Capture requests use a base64 payload rather than multipart so browser and mobile clients share one typed contract:

```json
{
  "imageBase64": "...base64 bytes (a data URL is also accepted)...",
  "mimeType": "image/jpeg",
  "capturedAt": "2026-01-01T00:00:00.000Z",
  "view": "FRONT"
}
```

Verification capture replaces `view` with the server-issued `challengeId`.

Do not commit real inspection media. To create local manual fixtures, make a directory outside tracked source (for example `storage/evidence/manual-fixtures`), photograph the same well-lit object from the five required views plus a visibly different object, and base64-encode on demand in the client/test harness. Automated tests synthesize small patterned images in memory with Sharp, so the repository contains no raw asset photos or large binaries.

## Checks

```bash
pnpm --filter @alive/verifier typecheck
pnpm --filter @alive/verifier test
pnpm --filter @alive/verifier build
```

## Security boundary

This MVP surfaces probabilistic scores and machine-readable failure reasons. It does not claim perfect authenticity, financial appraisal, or resistance to sophisticated synchronized displays, deepfake video, compromised cameras, evidence-host compromise, or verifier-key theft. Visual integrity is only observable appearance consistency.

`POST /api/demo/reset` exists only when `DEMO_MODE=true` and additionally requires `DEMO_RESET_TOKEN` in the service environment plus the matching `x-alive-demo-token` request header. There is no demo seed route because it would bypass wallet-authenticated asset creation.
