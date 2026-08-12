# ALIVE contributor guide

ALIVE is a Proof-of-Physical-State protocol. Preserve the complete causal chain:

physical capture -> real visual analysis -> signed attestation -> contract validation -> payment outcome.

## Engineering rules

- Keep raw inspection media offchain and out of Git.
- Never hardcode successful verification scores, transaction hashes, contract addresses, or explorer links.
- Use integer basis points for scores that cross the onchain boundary.
- Treat verification sessions and attestations as expiring, single-use capabilities.
- Keep X Layer configuration centralized.
- Surface uncertainty and reason codes. Do not claim perfect authenticity or liveness.
- Add or update tests whenever protocol behavior changes.
- Do not commit private keys, local databases, model binaries, capture media, or rendered videos.

## Quality commands

Run the narrowest relevant check while developing, then run `pnpm check` before a stable merge. Contract and verifier checks are also available through `pnpm test:contracts` and `pnpm test:verifier`.

## Visual language

The product is forensic, technical, financial, and high-trust. Use the shared near-black palette and one scanner-green accent. Motion must explain system state. Reduced-motion and non-WebGL paths are required.
