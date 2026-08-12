# Deployment address exports

`scripts/deploy.ts` writes one JSON file per chain ID here after all contracts
are deployed and `AliveEscrow` is authorized as an attestation consumer. The
script refuses to overwrite an existing export, so a real deployment cannot be
silently replaced.

Only commit verified public-network exports. Local chain `31337.json` files are
ignored. No deployment file should ever contain a private key.
