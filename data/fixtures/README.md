# Deterministic ALIVE fixtures

- `market-snapshot.demo.json` is synthetic and explicitly marked `DEMO`. It is
  not live market data.
- `policy-hash-parity.json` freezes the contract-compatible Policy V1 hashing
  inputs and component hashes. Contract implementations should reproduce the
  same final `policyHash` before the fixture is changed.
- `killer-demo-policy.json` binds the documented zero-cost demo mandate to the
  exact normalized policy and hash consumed by the local RWA deployment.

Prices are decimal strings. Code must not parse them through JavaScript
floating-point arithmetic when constructing execution amounts or commitments.
