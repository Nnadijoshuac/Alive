# ALIVE security model

## Scope

ALIVE is an experimental Proof-of-Physical-State protocol. It produces AI-estimated confidence from observable camera evidence and encodes that result in a short-lived signed attestation. It does not certify legal title, provenance, market value, hidden damage, or absolute authenticity.

The MVP is appropriate for a hackathon demonstration with disposable accounts and test tokens. It has not received an external audit and must not custody valuable assets or funds.

## Assets and trust roots

### Protected outcomes

- A stale, incomplete, or duplicated verification session must not create a second analysis capability.
- An attestation signed by an unexpected key must be rejected.
- Expired, future-issued, overlong, malformed, or already consumed attestations must be rejected.
- A proof for one asset, subject, chain, registry, or escrow must not settle another.
- Escrow must not release a rejected or below-threshold result.
- Funding, release, refund, and cancellation must obey explicit one-way states.
- A token transfer failure or short deposit must not leave escrow falsely funded or settled.
- Raw evidence must not be placed onchain or committed to Git.

### Trusted in the MVP

- the machine running the verifier;
- its environment configuration and signing key;
- its SQLite database and local evidence directory;
- the camera and browser operating environment;
- the contract owner that can rotate the signer and authorize consumers;
- the correctness of the selected vision model and score policy.

X Layer contracts are authoritative for registered commitments, current asset ownership, consumed sessions, escrow state, and token movement. They cannot independently inspect a camera frame or reproduce private inference.

## Threats and current protections

### Static photo replay

The verifier issues four unpredictable ordered challenges. Every challenge requires exactly three frames with strictly increasing timestamps. The server independently decodes, freshness-checks, quality-checks, fingerprints, and stores all three, then evaluates intra-burst motion, cross-challenge change, exact evidence-hash reuse, and high perceptual-hash similarity. A still image repeated through a burst should receive motion or replay failures.

Residual risk: moving a printed image or display can create motion. A responsive screen can attempt each requested viewpoint. The current system is resistance to simple replay, not proof against presentation attacks.

### Prerecorded or generated video

Random session and challenge IDs, shuffled ordering, short expiry, timestamp validation, and one-time analysis make precomputation harder.

Residual risk: synchronized playback, relay, virtual-camera injection, or real-time generation can defeat camera-only checks. There is no trusted depth sensor, camera attestation, watermark challenge, or anti-deepfake model in the MVP.

### Different unit of the same model

ALIVE combines multiple views, spatial appearance, local gradients, normalized identifiers, and observable distinctive marks. Stickers, scratches, finish, edge layout, ports, labels, and wear improve discrimination.

Residual risk: visually uniform objects without a reliable identifier may be indistinguishable at webcam resolution. The repository contains no statistically representative same-model evaluation set and makes no false-accept claim.

### Serial or model-label substitution

When OCR sees text and the registered serial diverges strongly, the default policy emits a critical identifier mismatch. User-supplied registration identifiers also participate in comparison.

Residual risk: OCR is probabilistic, and a forged, covered, or replaced label can mislead a camera-only system. OCR may fail under glare, blur, occlusion, stylized fonts, or unsupported scripts.

### Tampered registration evidence

Asset creation requires a short-lived wallet signature over the exact generated asset ID, owner, strict metadata, audience, action, chain, nonce, and expiry. The asset ID is `keccak256(abi.encode(owner, nonce))`; the registry recomputes it from `msg.sender` and that signed registration nonce, so another caller cannot front-run the authenticated identifier. Follow-up capture writes require a random registration capability, only its Keccak hash is stored, and finalization revokes it. Onchain registration requires a real wallet transaction, and the registry records `msg.sender` as owner.

The signed attestation includes the finalized `fingerprintHash`. `AliveAttestationRegistry` reads the registered asset and rejects any proof whose signed hash differs from the onchain commitment. This closes the offchain-to-onchain commitment substitution path at proof consumption.

Residual risk: the person controlling the registering wallet and the verifier host are trusted to establish an honest baseline. A compromised verifier can still assign false scores to evidence associated with the committed fingerprint. The registry comparison authenticates commitment identity, not the truth of the original photographs.

### Forged or replayed attestation

The EIP-712 domain binds signatures to `Alive Protocol`, version `1`, one chain ID, and one attestation-registry contract. The signed payload binds asset, fingerprint commitment, random session, subject, context, scores, verdict, evidence hash, issue time, and expiry. The registry recovers the configured signer and consumes each session globally once.

Escrow context is `keccak256(abi.encode(escrowAddress, escrowId))`. The escrow validates this exact value before asking the registry to consume the signature. A proof for a different escrow, even for the same asset and seller, cannot release payment.

### Verifier-key theft

The browser never receives the key, and the service does not log it. The attestation-registry owner can rotate the authorized signer, invalidating old signatures that have not yet been consumed.

Residual risk: a stolen active key can forge results. Production requires hardware-backed or isolated signing, access control, short validity, monitoring, incident response, and preferably multiple independent verifiers.

### Forged wallet claims and capability theft

`CREATE_ASSET` and `CREATE_VERIFICATION_SESSION` each require a one-time `AliveAuthorization` EIP-712 signature. The authorization binds the exact action, wallet, resource ID, context, canonical request hash, configured audience, chain, nonce, issue time, and expiry. Asset resources are owner-and-nonce-derived; session resources are random. Nonces are persisted and consumed atomically. Verification-session creation also requires the signer to equal the authenticated offchain asset owner.

The service returns a random 32-byte registration or session capability after consuming the wallet authorization. Only its Keccak hash is persisted. Registration capabilities expire and are revoked at fingerprint finalization; session capabilities expire with their sessions. Protected routes accept the plaintext value only as an `Authorization: Bearer` header.

Residual risk: a bearer capability grants its scoped authority until revocation or expiry. TLS is required outside loopback, and clients must not put capabilities in URLs, logs, analytics, or durable storage. The browser keeps them only in component memory. Local mode stores an ephemeral EVM private key in `sessionStorage`; that identity is intentionally unable to act as a different connected wallet onchain.

### Cross-origin and network exposure

The verifier binds to `127.0.0.1` and allows browser origins listed in `VERIFIER_ALLOWED_ORIGINS`, defaulting to the two local port-3000 origins. Requests without an `Origin` header remain valid for CLI and service use.

Origin filtering is not authorization. Signed mutation intents and bearer capabilities protect resource changes, but asset reads and authorization-challenge issuance remain available to direct clients. Do not bind the current service to a public interface. Production needs TLS, rate limits, audit logging, read authorization, abuse controls, revocation, and a narrowly managed origin policy.

### Malicious frontend

The browser can mislabel progress or suppress a failure, but it cannot produce the configured verifier signature or bypass contract checks. Final scores and evidence commitments come from the service, and final settlement state comes from the chain.

Residual risk: a malicious client can submit arbitrary base64 images and timestamps within accepted windows after obtaining the owner's scoped capability. Capture provenance is not device-attested. Three server-observed frames establish change in submitted evidence, not trusted camera hardware.

### Asset ownership changes during escrow

The escrow requires the seller to own the asset at creation, funding, and settlement. Transferring the registered asset after escrow creation therefore blocks funding or release to the previous owner.

Residual risk: registry ownership is still a digital claim and does not prove legal title or physical custody.

### Reentrancy and malicious tokens

Escrow uses OpenZeppelin `SafeERC20`, `ReentrancyGuard`, checks-effects-interactions, exact escrow balance-delta funding, exact recipient balance-delta payout, and atomic proof consumption plus payout. Tests include false-return, input-fee, output-fee, failed-payout, and callback attempts.

Residual risk: rebasing and fee-on-transfer tokens are intentionally unsupported. Nonstandard balance behavior beyond tested cases may fail. The demo should use only the labelled test token.

### Refunds, expiry, and disputes

Before expiry, only the seller can authorize refund. After expiry, the buyer can recover funds. Either party may commit a nonzero offchain dispute-reason hash. A dispute adds no privileged payout path and does not override a valid signed proof.

This is deliberate for the MVP, not a complete commercial dispute-resolution system.

### Proof freshness relative to funding

`AliveEscrow` records `fundedAt` when the exact deposit succeeds and rejects an attestation whose `issuedAt` is smaller. This prevents an older proof from being carried into a later-funded escrow.

Residual risk: both values use EVM-second precision, so an attestation issued earlier within the same timestamp second satisfies `issuedAt >= fundedAt`. Production policy that requires strict wall-clock ordering should bind a post-funding nonce or block reference into the signed context.

## Smart-contract controls

- custom errors and explicit lifecycle checks;
- asset existence and current ownership checks;
- score bounds from 0 through 10,000;
- signature recovery against one rotatable verifier;
- exact signed `fingerprintHash` equality with the registered asset commitment;
- maximum 24-hour attestation lifetime, with shorter five-minute service default;
- globally consumed session IDs;
- subject-gated standalone proofs;
- owner-authorized contextual consumers;
- exact escrow context, asset, seller, verdict, and thresholds;
- attestation `issuedAt` at or after the escrow's recorded `fundedAt`;
- exact token deposit and recipient-payout accounting;
- no verifier-controlled withdrawal or admin settlement function;
- single-execution release, refund, and cancellation.

The contract test suite covers these cases, but a test suite is not an audit or formal proof.

## Data handling

### Onchain

- asset ID and current owner;
- fingerprint and metadata commitments;
- optional public metadata URI;
- basis-point scores and verdict;
- evidence hash, subject, context, timestamps, and digest;
- consumed-session state;
- escrow parties, token, amount, policy, expiry, status, and events.

### Offchain

- raw camera frames;
- spatial, local, perceptual, neural, and quality features;
- OCR intermediates and normalized identifiers;
- challenge captures and timing;
- wallet-authorization nonces, payload bindings, and consumed timestamps;
- Keccak hashes and expiries for resource capabilities;
- full private fingerprint;
- HTTP and SQLite operational state.

Local files are unencrypted and demo reset deletes them. Reset is disabled without a configured `DEMO_RESET_TOKEN`, requires the matching `x-alive-demo-token` header, and refuses to delete an evidence root unless it is a dedicated descendant of the workspace `storage` boundary. These safeguards reduce accidental deletion; they are not encryption, backup, or access governance. Do not use personal or sensitive capture media without an explicit retention and access policy. Do not commit `storage/evidence`, SQLite files, model caches, or exported keys.

## Deployment risks

- Only `AliveAssetRegistry` is currently recorded on X Layer Testnet. The attestation registry, escrow, test token, consumer authorization, and public end-to-end smoke test are still absent.
- Solidity source has not received an external audit.
- Contract source verification on the explorer is not automated.
- The configured owner and verifier are single-key operational dependencies.
- Public RPC availability and reorganization handling have not been production-tested.
- Frontend deployment must use the same chain ID and addresses as the signer domain.

Do not describe mainnet as supported merely because chain `196` is configured.

## Production roadmap

1. Hardware-backed keys, protected owner, automated rotation, and monitoring.
2. Encrypted evidence storage, access control, deletion receipts, and retention policy.
3. Authenticated and paginated read APIs, rate limits, audit trails, and capability revocation.
4. Signed native capture applications with device and camera attestation.
5. Depth, challenge watermark, display detection, and stronger anti-deepfake liveness.
6. Independent verifier quorum with economic accountability.
7. Per-asset-class calibration and a public evaluation methodology.
8. Independent contract audit, invariant testing, and formal review of settlement properties.
9. Privacy-preserving evidence proofs where technically and economically justified.

## Reporting

Do not put private evidence, signing material, wallet secrets, or exploitable user data in a public issue. Contact the maintainers privately with the affected component, reproducible steps using synthetic evidence where possible, impact, and a suggested mitigation.
