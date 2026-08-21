# @alive/policy-engine

Deterministic policy validation and a deliberately limited natural-language
fallback for local development.

The fallback is **not AI**. Every result carries
`mode: "DETERMINISTIC_FALLBACK"` and `isAiGenerated: false`. It recognizes
simple percentage mandates, then passes the candidate through the strict
`@alive/shared` policy schema, semantic validation, normalization, and the
contract-compatible policy hash. It does not call an LLM and must not be shown
as an AI-generated interpretation.

```ts
import { compilePolicyMandateDeterministically } from "@alive/policy-engine";

const result = compilePolicyMandateDeterministically(
  "Keep at least half in Treasuries and keep 10% liquid.",
);
```

The fallback intentionally does not attempt broad financial-language
understanding. Production AI-provider integration belongs in a separate
server-side service; its candidate output must pass the same shared schema.
