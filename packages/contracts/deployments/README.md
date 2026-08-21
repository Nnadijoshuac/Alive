# Deployment address exports

`scripts/deploy.ts` writes one JSON file per chain ID here after all contracts
are deployed and `AliveEscrow` is authorized as an attestation consumer. The
script refuses to overwrite an existing export, so a complete deployment cannot
be silently replaced.

A manually recorded public export may use `deploymentState: "PARTIAL"` when a
deployment attempt produced at least one confirmed, bytecode-checked contract
but did not finish the protocol. Such an export must list only confirmed
addresses and transaction hashes, name every missing step, and must never be
consumed as the application's complete address set.

Only commit verified public-network exports. Local chain `31337.json` files are
ignored. No deployment file should ever contain a private key.
