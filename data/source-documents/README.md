# ALIVE demo source documents

DEMO DATA — NOT LIVE MARKET DATA. These fixture files are synthetic issuer
documentation written for ALIVE's demo/hackathon RWA assets
(`tusdc`, `ttbill-a`, `tgold`, `tsp500`) and are ingested by
`services/intelligence`'s ingestion pipeline
(`services/intelligence/src/ingestion/`). They describe fictional products
under fictional issuer names (e.g. "ALIVE Demo Treasury Issuer A") and carry
no claim on any real financial product, issuer, or instrument.

Each `<fixtureId>.txt` file is plain text, loaded by
`document-loader.ts#loadDocument({kind: "fixture", fixtureId})`, normalized,
hashed, and chunked before being handed to the extraction pipeline
(`services/intelligence/src/extraction/`). The extraction pipeline may run in
`AI` mode (a configured LLM reads this text) or `DEMO_FIXTURE` mode
(a deterministic extractor reads the same text using fixed field markers) —
either way, every fact in the resulting Asset Passport must cite one of
these documents by `sourceId`.

File naming: `<fixtureId>.txt` where `fixtureId` matches the demo
`AliveEligibilityRegistry`/`RwaAssetSchema` asset ID it documents.
