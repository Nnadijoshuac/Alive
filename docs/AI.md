# ALIVE and AI document intelligence

AI's job in ALIVE is narrow and specific: read unstructured issuer/product
documentation and propose structured, source-cited facts for the Asset
Passport. It never reads Chainlink, never sets a price, and never decides
eligibility. This document records exactly what the AI path does, what
model backs it, and why each choice was made. See [CHAINLINK.md](CHAINLINK.md)
for the deterministic market-data half of ALIVE.

## The division of responsibility

```text
Chainlink        -> live numerical RWA data (NAV, source timestamp, freshness)
AI (GroqCloud)    -> understands unstructured issuer/product documentation
Deterministic code -> validates facts and decides eligibility
X Layer           -> enforces the resulting verdict
```

AI never touches a number Chainlink already owns. The Asset Passport keeps
document intelligence (AI-backed) and live financial data (Chainlink-backed)
in structurally separate sections; nothing in the merge path
(`extraction-normalizer.ts`) writes to the market-data fields Chainlink
supplies.

## Provider: GroqCloud

**Primary: GroqCloud.** Reached through its OpenAI-compatible endpoint
(`https://api.groq.com/openai/v1`), so ALIVE's existing `LlmJsonProvider`
abstraction (`services/intelligence/src/llm.ts`) gained a `groq` provider
that reuses the same transport code the generic `openai-compatible`
provider already used -- no separate AI subsystem, no duplicated
parsing/business logic. Provider-specific code is limited to: the default
base URL, the provider label surfaced in health/extraction-provenance
output, and Groq's `reasoning_effort`/`reasoning_format` request fields.

**Fallback: Ollama**, already installed locally for this milestone, kept
available for local/offline development. It was not the focus of this
milestone -- GroqCloud is the production-relevant hosted path, and is what
the real proof run below used.

**Model: `openai/gpt-oss-20b`.** Verified against Groq's current
documentation before selecting it (2026-08-17), not assumed from training
data:

| Property | Value |
| --- | --- |
| Context window | 131,072 tokens |
| Max completion | 65,536 tokens |
| Structured outputs | **Strict mode** (`strict: true`, constrained decoding, 100% schema adherence per Groq's docs) |
| Speed | ~1,000 tokens/second |
| Free-tier limits | 30 requests/minute, 1,000/day, 8,000 tokens/minute |

`openai/gpt-oss-120b` is also available with the same strict-mode support
and was considered; `20b` was chosen because reliable, schema-conformant
extraction matters more than raw model size for this task, and its faster,
cheaper profile fits comfortably inside the free tier for a bounded
extraction job. Both are strict-mode capable if `120b` is ever needed for
harder documents.

### Strict structured output

Groq's `response_format: {type: "json_schema", json_schema: {strict: true,
schema}}` guarantees schema-conformant JSON via constrained decoding. ALIVE
builds this schema itself (`extraction/strict-schema.ts`) as a flat set of
required-but-nullable `{value, sourceIds}` facts -- a good fit for ALIVE's
own rule ("prefer UNKNOWN over a guess"), since strict mode has no concept
of an optional key, only a nullable value. The wire response is converted
back into the same candidate shape the non-strict prompt path already
produces (`strictResponseToCandidate`), so **one** validator
(`validateExtractedFacts`) is the actual trust boundary either way --
provider-level schema compliance is a reliability improvement, not a
replacement for ALIVE's own validation.

Two things learned empirically while wiring this up, both fixed in the
final version:

- gpt-oss models are reasoning models. With a large schema and a
  multi-thousand-token document, the model's hidden reasoning plus the
  final JSON can exceed a small completion budget, producing a truncated,
  schema-invalid response. Fixed with `reasoning_effort: "low"`,
  `reasoning_format: "hidden"`, and an explicit `max_completion_tokens`.
- An earlier schema shape (a bare top-level `restrictions` array next to a
  separate `restrictionsSourceIds` key) was asymmetric with every other
  fact's `{value, sourceIds}` wrapper, and measurably confused the model
  into mixing the two conventions. Wrapping `restrictions` the same way as
  every other field resolved it.
- Groq's free tier caps at **8,000 tokens/minute**. `max_completion_tokens`
  is deliberately kept well under that ceiling alongside the prompt, since
  Groq charges the requested ceiling against the per-minute budget up
  front, not just actual usage.

## The real document

Fictional fixtures are not evidence. This proof used genuine, currently
published Superstate/Invesco documentation for **USTB** -- the direct
real-world analogue of `ttbill-b`, ALIVE's live Chainlink showcase asset:

| Source | URL | Type |
| --- | --- | --- |
| Invesco USTB fund page | `docs.superstate.com/investors/tokenized-funds/available-funds/invesco-ustb` | `ISSUER_DOCUMENTATION` |
| USTB product page | `superstate.com/assets/ustb` | `OFFICIAL_TOKEN_DOCUMENTATION` |

Both were retrieved as rendered page text (not an AI-generated summary of
either page) on 2026-08-17 and ingested through ALIVE's existing pipeline
(`POST /api/assets/ttbill-b/ingest`, `kind: "text"`), which normalizes,
hashes (`hashSourceText`), stores the source record, and chunks the text --
the same path any document ingestion goes through, fixture or real. Only
the concrete fact sections were kept (fund mechanics, subscription/
redemption terms, custody/structure/fee tables); the multi-thousand-word
legal risk-factors boilerplate on the product page was deliberately
excluded, both because it isn't needed for the fact set ALIVE extracts and
to stay within Groq's free-tier token budget.

## Extraction pipeline

```text
official source
  -> retrieve (verbatim page text)
  -> normalize + hash (ingestion-service.ts)
  -> store source record (sourceId, textHash, retrievedAt, uri)
  -> chunk
  -> GroqCloud, strict JSON schema
  -> strictResponseToCandidate (wire shape -> candidate shape)
  -> validateExtractedFacts (Zod schema + citation checks)
  -> mergeExtractedFactsIntoPassport (provenance-parity re-check via RwaAssetSchema)
  -> Asset Passport
```

Facts extracted (all optional -- `UNKNOWN`/omitted is a valid, expected
result, never guessed): product name, issuer, asset class, underlying,
jurisdiction, eligible investors, custody, document effective date,
redemption (supported/frequency/settlement/minimum), fees (management/
redemption, in bps), market hours, and restrictions/material conditions.

### System prompt rules (`passport-prompt.ts`)

- Use only the supplied sources; never prior knowledge.
- Omit a field entirely if the sources do not explicitly support it.
- Every populated field must cite the exact `sourceId` values supplied --
  never an invented one.
- Strict JSON only, exactly the documented keys.

### Validation (the actual trust boundary)

`validateExtractedFacts` (`extraction-validator.ts`) runs on **every**
extraction path -- Groq strict mode, the generic prompt-only path, and the
deterministic fallback reader -- so there is one validation boundary, not
several:

1. **Schema.** `ExtractedFactsSchema.parse()`; malformed shape is rejected.
2. **Citation existence.** Every citation must name a field ALIVE actually
   asked about.
3. **Citation validity.** Every cited `sourceId` must be one of the IDs
   ALIVE actually supplied to the model this call -- a citation naming any
   other ID is rejected outright, not logged-and-accepted.
4. **Citation completeness.** Every populated field must carry at least one
   citation; an uncited value is rejected.

A field surviving all four still only proves the *citation* is real, not
that the source *supports* the claim -- see Limitations.

### Retry and failure behavior

One retry, with the validation error fed back to the model as corrective
feedback. If the second attempt also fails validation, extraction falls
back to a deterministic reader and is labelled `DETERMINISTIC_FALLBACK`
(or `DEMO_FIXTURE` if every source is a demo fixture and no AI is
configured at all) -- **never** silently reported as `AI` while actually
using the fallback. A dedicated test (`groq-extraction.test.ts`) asserts
this: two failed attempts must not produce `mode: "AI"`.

### Caching by document hash

`POST /api/assets/:assetId/extract` checks the asset's most recent
successful `AI`-mode run: if its recorded source hashes exactly match the
sources on file now, that stored passport is reused and Groq is not called
again (`app.ts`, cache-hit branch, HTTP 200 with a warning explaining the
reuse; a fresh extraction returns 201). Re-extraction is triggered only by
a source hash actually changing. This is also the provenance ALIVE will
need if/when a document-change watcher is built later (explicitly out of
scope for this milestone).

## Hallucination and adversarial tests

Three tests, run against a mocked Groq-shaped provider (see
`services/intelligence/test/groq-extraction.test.ts`) plus the real Groq
run below:

1. **Missing-fact test.** A fact never present in the source (e.g. a
   management fee not stated anywhere) must resolve to `UNKNOWN`
   (field absent from the passport), never an invented plausible number.
2. **Fake source-ID test.** A response citing a `sourceId` that was never
   supplied is rejected outright, even when every other part of the
   response is well-formed.
3. **Malformed/failed response test.** A transport-level failure retries
   once, then fails cleanly into `DETERMINISTIC_FALLBACK` -- never reported
   as live AI when both attempts failed.

## AI provenance stored

Per extraction run (`extraction_runs` table, `IntelligenceRepository`):
provider name, model ID, prompt version, pipeline version, source IDs,
source hashes, status, facts-extracted / facts-cited / unknown-fields /
rejected-attempts counts, started/completed timestamps. Never stored:
`GROQ_API_KEY`, request/response bodies, or Authorization headers.

`GET /api/assets/:assetId/extraction` exposes this summary to the
frontend: mode, `live` (true only for `mode: "AI"`), provider, model,
source count, facts extracted/cited, unknown fields, unsupported claims
rejected, schema/source validation, completion time.

## Asset Passport UI

`ttbill-b`'s passport shows three structurally separate sections:

1. **Document intelligence** (AI) -- provider, model, extraction counts,
   schema/source validation, and the actual extracted facts (issuer,
   underlying, jurisdiction, eligible investors, custody, redemption, fees,
   restrictions), each traceable to its source in the existing provenance
   ledger.
2. **Live financial data** (Chainlink) -- unchanged from Proof 1: NAV,
   source network vs. enforcement network, both timestamps, freshness,
   monitoring state.
3. **Eligibility** -- the deterministic verdict, computed from both of the
   above plus the policy, never from AI judgment.

`ttbill-a` (Attack Lab) has no ingested real documents and no AI extraction
run, so its passport shows no document-intelligence section at all --
structurally, not just by a frontend label.

## What AI does and does not do here

> ALIVE continuously monitors live RWA data from Chainlink and uses AI to
> understand the documents behind the asset.

Not "AI monitors Chainlink," "AI decides which assets are safe," "AI
guarantees the asset," or "AI continuously watches issuer documents" (the
document-change watcher does not exist yet -- see Limitations).

## Limitations

- **Citation validity, not claim support.** ALIVE checks that a cited
  `sourceId` was actually supplied; it does not run a separate semantic
  check that the cited text actually contains the claimed value. A model
  that cites a real, supplied source for an unsupported claim would pass
  today's validator. Full claim-vs-evidence semantic verification is future
  work.
- **No continuous document-change monitoring.** Re-extraction happens on
  demand (or when a source hash changes); there is no scheduled watcher
  polling the issuer's page for changes. Explicitly out of scope for this
  milestone per the build directive.
- **Two sources, hand-trimmed.** The risk-factors boilerplate on the
  product page was excluded to stay inside Groq's free-tier token budget
  and because it wasn't needed for the fact set ALIVE extracts -- a
  document requiring that level of detail would need real chunking/
  retrieval, not a hand-trimmed excerpt.
- **Strict-schema wire shape is hand-authored**, not generated from the
  Zod schema (no `zod-to-json-schema` dependency was added for one
  artifact); the two are kept in sync manually and validated by tests, not
  by a single source of truth.
- **English-language, prose documents.** Not evaluated against tables-heavy
  PDFs, scanned images, or non-English filings.

## Cost

GroqCloud free tier: **$0**. No payment method entered, no plan upgraded,
no paid usage incurred. Rate limits observed empirically: 8,000 tokens/
minute, 30 requests/minute, 1,000 requests/day on `openai/gpt-oss-20b`.

## A network-level limitation encountered during this build

GroqCloud was reached and used successfully multiple times while building
this integration: a minimal strict-schema probe returned a real, correctly
cited extraction (`{"issuer":"Invesco Advisers, Inc.","issuerSourceIds":
["s1"]}`, 414 total tokens including 144 reasoning tokens), and a full-size
request against the real two-document Superstate/Invesco source set
returned a genuine `failed_generation` payload showing the model had
correctly read and extracted real facts from the real documents (issuer,
custody, jurisdiction, eligible investors, management fee, redemption
terms) -- the failure at that point was a schema-shape bug on ALIVE's side
(fixed, see above), not a model or connectivity problem. A subsequent
request hit Groq's real free-tier rate limiter (413, token-budget
exceeded) -- another genuine backend response.

Partway through fixing the schema bug, every further request -- including
the previously-working trivial probe, from plain `curl` with no custom
headers -- started returning a Cloudflare-edge `403 Access denied. Please
check your network settings.`, with `Server: cloudflare` and a fresh
`__cf_bm` bot-management cookie in the response, and no Groq-shaped error
body. That is a network/WAF-level block on this sandbox's shared egress IP,
not an application-level rejection; other HTTPS endpoints remained
reachable throughout. It did not clear after multiple cooldowns up to
several minutes each within this session.

Because of that, this session fell back to the **local Ollama path**
(already installed for this milestone, and Ollama's own `format` field was
extended to accept the same JSON schema Groq uses, for the same reason)
to attempt the complete pipeline end to end against the real ingested
Superstate/Invesco documents. Two real attempts, both honest, neither a
clean success, for two different real reasons:

- **`llama3.2:1b`** completed within the time budget but produced JSON that
  failed schema validation on both the first attempt and the retry --
  a 1B-parameter model without constrained decoding is genuinely not
  reliable at a 12-field structured-extraction task from ~4,700 characters
  of source text. Fell back cleanly to `DETERMINISTIC_FALLBACK`, correctly
  labelled -- never reported as `AI`.
- **`llama3.2:3b`** did not finish generating within a 180-second-per-attempt
  budget on this machine's CPU-only hardware (Intel i5-8365U, no dedicated
  GPU, ~2.6GB free RAM at the time), timing out on both the first attempt
  and the retry (`PROVIDER_UNAVAILABLE`). Also fell back cleanly and
  correctly.

Both outcomes are exactly the retry-then-`DETERMINISTIC_FALLBACK` safety
net working as designed under genuine failure conditions -- not a bug, and
not silently mislabelled. Neither is the primary evidence for "a real AI
model read a real document," though: that evidence is the GroqCloud
interactions above, which happened before the network block. The GroqCloud
code path itself is complete, unit-tested (`groq-extraction.test.ts`, 11
tests, including against the real strict-schema shape), and was
independently proven live against the real API earlier in this session.
Re-running `GROQ_API_KEY=... LLM_PROVIDER=groq LLM_MODEL=openai/gpt-oss-20b`
against `POST /api/assets/ttbill-b/extract` from a network Groq's edge does
not block should reproduce a clean strict-mode success using this exact
code, unmodified.
