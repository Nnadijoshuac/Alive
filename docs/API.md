# Verifier HTTP API

## Scope

`@alive/verifier` is the authoritative local service for offchain asset records, capture evidence, visual fingerprints, active verification sessions, scoring, and EIP-712 signing. It listens on `http://127.0.0.1:4100` by default.

All request and response data is JSON. Images are sent as base64 strings; a full `data:image/jpeg;base64,...` URL is also accepted. Asset and session creation require one-time wallet authorization. Resource mutations then require a scoped bearer capability.

## Error envelope

Validation and protocol failures use one shape:

```json
{
  "error": {
    "code": "CAPTURE_QUALITY_LOW",
    "message": "Image is too blurred or poorly exposed",
    "details": {}
  }
}
```

Clients must branch on `error.code`, not English text. A missing `details` field is valid.

## Health

### `GET /api/health`

Returns service time, signer availability, verifier address when configured, and enabled protocol and vision capabilities.

```json
{
  "status": "ok",
  "service": "@alive/verifier",
  "time": "2026-08-12T12:00:00.000Z",
  "signingConfigured": true,
  "verifierAddress": "0x...",
  "capabilities": {
    "walletAuthorization": true,
    "hashedResourceCapabilities": true,
    "deterministicVisualFallback": true,
    "ocrEnabled": true,
    "neuralEmbeddingEnabled": true
  }
}
```

`GET /health` is an equivalent alias.

## Authorization protocol

### `POST /api/auth/challenge`

Requests a short-lived EIP-712 authorization for one of two resource-creation actions. For asset creation, the challenge generates a registration nonce and derives `resource = keccak256(abi.encode(owner, nonce))`. For verification, it generates a random session resource and nonce. This prevents another onchain caller from claiming the authenticated asset ID.

Asset intent:

```json
{
  "action": "CREATE_ASSET",
  "request": {
    "owner": "0x0000000000000000000000000000000000000001",
    "metadata": {
      "name": "Inspection laptop",
      "category": "COMPUTER",
      "manufacturer": "Example",
      "model": "Model 14",
      "serialNumber": "SERIAL-123",
      "description": "Optional public-facing description"
    }
  }
}
```

Verification-session intent:

```json
{
  "action": "CREATE_VERIFICATION_SESSION",
  "request": {
    "assetId": "0x...32 bytes...",
    "wallet": "0x0000000000000000000000000000000000000001",
    "context": "0x...32 bytes..."
  }
}
```

The verification wallet must equal the authenticated offchain asset owner, and the asset must already have a finalized fingerprint. A legacy database record created before wallet authorization returns `ASSET_REAUTHORIZATION_REQUIRED` and must be registered again through the signed flow. Use zero bytes32 context for a standalone inspection. Escrow verification must use the exact value returned by `AliveEscrow.escrowContext(escrowId)`.

Response `201`:

```json
{
  "authorization": {
    "audience": "http://127.0.0.1:4100",
    "action": "CREATE_ASSET",
    "wallet": "0x0000000000000000000000000000000000000001",
    "resource": "0x...owner-bound asset ID or random session ID...",
    "context": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "payloadHash": "0x...canonical request hash...",
    "nonce": "0x...random nonce...",
    "issuedAt": 1786536000,
    "expiresAt": 1786536120
  },
  "domain": {
    "name": "ALIVE Verifier Authorization",
    "version": "1",
    "chainId": 31337
  }
}
```

The exact primary type is:

```text
AliveAuthorization(
  string audience,
  string action,
  address wallet,
  bytes32 resource,
  bytes32 context,
  bytes32 payloadHash,
  bytes32 nonce,
  uint64 issuedAt,
  uint64 expiresAt
)
```

The client must validate the returned action, wallet, resource, context, audience, domain, and locally recomputed payload hash before signing. For `CREATE_ASSET`, it must also retain the signed nonce in memory and pass it as `registrationNonce` to `AliveAssetRegistry.registerAsset`. The verifier stores each challenge nonce and consumes it atomically with resource creation. Expired, changed, unissued, or reused authorizations fail.

## Bearer capabilities

Successful asset or session creation returns a random 32-byte capability:

```json
{
  "token": "0x...32 random bytes...",
  "expiresAt": "2026-08-12T12:30:00.000Z"
}
```

Send it only in the protected request header:

```http
Authorization: Bearer 0x...
```

The verifier stores only the token's Keccak hash. A registration capability is scoped to one asset, expires according to `REGISTRATION_CAPABILITY_TTL_SECONDS`, and is revoked when fingerprint finalization succeeds. A session capability is scoped to one session and expires exactly with that session. Do not put capabilities in URLs, logs, analytics, `localStorage`, or other durable client state.

## Asset registration

### `POST /api/assets`

Consumes a signed `CREATE_ASSET` authorization. `assetId` must equal the challenge's `authorization.resource`; `owner` must be its recovered signer; metadata must match the signed payload hash exactly.

```json
{
  "assetId": "0x...authorization.resource...",
  "owner": "0x0000000000000000000000000000000000000001",
  "metadata": {
    "name": "Inspection laptop",
    "category": "COMPUTER",
    "manufacturer": "Example",
    "model": "Model 14",
    "serialNumber": "SERIAL-123"
  },
  "authorization": {
    "nonce": "0x...authorization.nonce...",
    "signature": "0x...65-byte wallet signature..."
  }
}
```

Only `name` and `category` are required in metadata.

Response `201`:

```json
{
  "asset": {
    "assetId": "0x...",
    "owner": "0x...",
    "metadata": {},
    "createdAt": "2026-08-12T12:00:00.000Z",
    "fingerprintHash": null,
    "registrationViewCount": 0
  },
  "capability": {
    "token": "0x...",
    "expiresAt": "2026-08-12T12:30:00.000Z"
  }
}
```

### `GET /api/assets/:assetId`

Returns the current offchain `AssetRecord`. It does not return raw media, feature vectors, authorization records, or capability hashes.

### `GET /api/assets?owner=0x...`

Returns `{ "assets": AssetRecord[] }`, newest first. The optional owner query is validated as an EVM address and compared case-insensitively. Omitting it lists every asset in the local verifier database. This read endpoint is intended for the loopback MVP and needs access control and pagination before public exposure.

### `POST /api/assets/:assetId/captures`

Requires that asset's registration bearer capability. It accepts one registration frame per unique view before finalization.

```json
{
  "view": "FRONT",
  "imageBase64": "/9j/4AAQSk...",
  "mimeType": "image/jpeg",
  "capturedAt": "2026-08-12T12:00:00.000Z"
}
```

Supported views are `FRONT`, `LEFT`, `RIGHT`, `BACK`, `DETAIL`, and `IDENTIFIER`. The service requires the first five before fingerprinting; the product wizard captures all six. A duplicate view returns `REGISTRATION_VIEW_EXISTS`. An unusable frame returns `CAPTURE_QUALITY_LOW` and is not added to the evidence set.

Response `201` includes `captureId`, `view`, the raw file's `evidenceHash`, and measured `quality`.

### `POST /api/assets/:assetId/fingerprint`

Requires the registration bearer capability and no request body. It finalizes registration exactly once, stores the private `AssetFingerprint`, returns its deterministic Keccak commitment, and revokes the registration capability in the same state transition.

Response `201`:

```json
{
  "assetId": "0x...",
  "fingerprintHash": "0x...",
  "fingerprintVersion": 1,
  "registrationViews": [
    "FRONT",
    "LEFT",
    "RIGHT",
    "BACK",
    "DETAIL",
    "IDENTIFIER"
  ],
  "identifiers": {
    "manufacturer": "Example",
    "model": "Model 14",
    "serial": "SERIAL-123",
    "normalizedText": ["EXAMPLE", "MODEL", "14", "SERIAL", "123"],
    "source": "COMBINED"
  },
  "createdAt": "2026-08-12T12:01:00.000Z"
}
```

The canonical commitment uses sorted-key JSON and `keccak256`; array order is preserved. Re-finalization returns `FINGERPRINT_EXISTS`.

## Active verification

### `POST /api/verifications/session`

Consumes a signed `CREATE_VERIFICATION_SESSION` authorization. The exact generated session ID, completed asset, authenticated owner wallet, and immutable context must match the issued challenge.

```json
{
  "sessionId": "0x...authorization.resource...",
  "assetId": "0x...",
  "wallet": "0x0000000000000000000000000000000000000001",
  "context": "0x...32 bytes...",
  "authorization": {
    "nonce": "0x...authorization.nonce...",
    "signature": "0x...65-byte owner signature..."
  }
}
```

Response `201`:

```json
{
  "session": {
    "sessionId": "0x...",
    "assetId": "0x...",
    "wallet": "0x...",
    "nonce": "0x...",
    "context": "0x...",
    "createdAt": "2026-08-12T12:02:00.000Z",
    "expiresAt": "2026-08-12T12:07:00.000Z",
    "status": "PENDING",
    "challenges": [
      {
        "id": "0x...",
        "sequence": 0,
        "type": "TURN_LEFT",
        "prompt": "Rotate the physical asset to its left side.",
        "completedAt": null
      }
    ]
  },
  "capability": {
    "token": "0x...",
    "expiresAt": "2026-08-12T12:07:00.000Z"
  }
}
```

Four challenges are selected with cryptographic randomness from front, back, left, right, and identifier when one is available. They must be completed in the returned order.

### `POST /api/verifications/:sessionId/capture`

Requires the session bearer capability and submits exactly three ordered frames for the next server-issued challenge.

```json
{
  "challengeId": "0x...",
  "frames": [
    {
      "imageBase64": "/9j/4AAQSk...",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-08-12T12:02:20.000Z"
    },
    {
      "imageBase64": "/9j/4AAQSl...",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-08-12T12:02:20.120Z"
    },
    {
      "imageBase64": "/9j/4AAQSm...",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-08-12T12:02:20.240Z"
    }
  ]
}
```

The tuple length must be exactly three. Timestamps must be strictly increasing and the total burst span must not exceed five seconds. The server independently decodes, size-checks, freshness-checks, quality-checks, fingerprints, and stores all three frames. It rejects the whole request for an out-of-order or duplicate challenge, an expired session, stale or future timing, an invalid burst, or any unusable frame. Invalid ordering or span returns `CAPTURE_SEQUENCE_INVALID`.

Response `201` exposes the stored `captureId`, `challengeId`, ordered `evidenceHashes`, ordered `qualities`, derived `intraChallengeMotion`, `completedChallenges`, and `totalChallenges`. The client cannot submit a precomputed motion value.

### `POST /api/verifications/:sessionId/analyze`

Requires the session bearer capability and no request body. It atomically moves a fully captured session through analysis. The response is computed from stored evidence:

```json
{
  "assetId": "0x...",
  "sessionId": "0x...",
  "identityScore": 0.91,
  "livenessScore": 0.86,
  "integrityScore": 0.88,
  "identityScoreBps": 9100,
  "livenessScoreBps": 8600,
  "integrityScoreBps": 8800,
  "verified": true,
  "signals": {
    "embeddingSimilarity": 0.9,
    "localFeatureSimilarity": 0.89,
    "identifierSimilarity": 0.95,
    "identifierExpected": true,
    "identifierCriticalMismatch": false,
    "multiViewConsistency": 1,
    "challengeCompletion": 1,
    "motionConsistency": 0.82,
    "captureFreshness": 0.99,
    "replayRisk": 0.03,
    "imageQuality": 0.84,
    "visualIntegrity": 0.89
  },
  "reasonCodes": [],
  "evidenceHash": "0x...",
  "timestamp": "2026-08-12T12:03:00.000Z"
}
```

The numbers above illustrate the schema only. They are not seeded values, fixtures, or expected accuracy claims. `motionConsistency` is 85% mean intra-burst motion plus 15% of the smaller of intra-burst and cross-challenge motion, so moving only between challenges cannot rescue static bursts.

### `POST /api/verifications/:sessionId/attestation`

Requires the session bearer capability and no request body. It signs the immutable analysis result. Signing requires all of:

```dotenv
ALIVE_VERIFIER_PRIVATE_KEY=0x...
ALIVE_CHAIN_ID=1952
ALIVE_ATTESTATION_REGISTRY_ADDRESS=0x...
```

Response `201`:

```json
{
  "attestation": {
    "assetId": "0x...",
    "fingerprintHash": "0x...exact finalized registration commitment...",
    "sessionId": "0x...",
    "subject": "0x...",
    "context": "0x...",
    "identityScore": 9100,
    "livenessScore": 8600,
    "integrityScore": 8800,
    "verified": true,
    "evidenceHash": "0x...",
    "issuedAt": 1786536180,
    "expiresAt": 1786536480
  },
  "domain": {
    "chainId": 1952,
    "verifyingContract": "0x..."
  },
  "signature": "0x...65 bytes...",
  "digest": "0x...",
  "signer": "0x..."
}
```

`AliveAttestationRegistry` compares the signed `fingerprintHash` with the registered asset commitment before consuming the session. The signer may encode a rejected result with `verified: false`; `AliveEscrow` refuses to settle it. Repeating this HTTP request returns the same stored attestation for retry safety rather than issuing a new signature.

### `GET /api/verifications/:sessionId`

Requires the session bearer capability. It returns `{ session, result?, attestation? }`. An expired pending session is returned with `status: "EXPIRED"`; later capture, analysis, or signing attempts fail with `SESSION_EXPIRED`.

## Demo-only mutation

`POST /api/demo/reset` exists only when `DEMO_MODE=true`. It clears verifier demo records and local evidence only when `DEMO_RESET_TOKEN` is configured and the request includes the matching `x-alive-demo-token` header. Without a configured token, destructive reset is disabled. The evidence adapter also refuses reset unless its root is a dedicated descendant of the workspace `storage` boundary.

There is no demo seed endpoint. Asset creation always requires a wallet or ephemeral local signer and real registration captures.

## Limits and transport assumptions

- Default decoded image limit: 8 MiB per frame.
- Verification capture: exactly three ordered frames per challenge.
- Default wallet-authorization TTL: 120 seconds.
- Default registration-capability TTL: 1,800 seconds.
- Default session and session-capability TTL: 300 seconds.
- Default attestation TTL: 300 seconds.
- Browser CORS defaults to `http://127.0.0.1:3000` and `http://localhost:3000`; set `VERIFIER_ALLOWED_ORIGINS` explicitly for another frontend origin.
- Public asset reads and authorization-challenge issuance are local-MVP interfaces, not production-grade authenticated APIs.
- Evidence is local and unencrypted by default.
- The service trusts the host and camera presentation; the contract verifies commitment equality and signatures, not the truth of private pixels.

Those constraints are trust assumptions, not production guarantees. See [SECURITY.md](SECURITY.md).
