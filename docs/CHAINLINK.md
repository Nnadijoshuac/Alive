# ALIVE and Chainlink

ALIVE reads live Chainlink data about real tokenized assets, at **$0**, with
no API key and no subscription. This document records exactly what is live,
what is still demo, and why each choice was made.

## The short answer

**Yes — ALIVE gets a genuinely live, RWA-specific Chainlink signal for free.**

Reading a deployed Chainlink Data Feed is a `view` call. Chainlink funds feed
*writers*; it does not bill readers, and it requires credentials only for
Data Streams, which ALIVE deliberately does not use. Cost to date: **$0**.
Nothing was subscribed to or purchased.

## What ALIVE reads

Every wired feed is a fact *about a tokenized asset* — a fund's net asset
value, the reserves backing a token, or a fund's assets under management —
rather than a market price. Verified live on 2026-08-16, each self-verified
by calling `description()` on the contract:

| ALIVE asset | Feed | Product | Value read | Unit | Chain |
| --- | --- | --- | --- | --- | --- |
| `ttbill-a` | Superstate **USTB NAV per Share** | NAVLink | `11.177748` | USD/share | Ethereum |
| `ttbill-b` | Anemoy **JTRSY NAV** | NAVLink | `1.11289` | USD/share | Ethereum |
| `ttbill-c` | OpenEden **TBILL NAV** | NAVLink | `1.15333588` | USD/share | Ethereum |
| `tsp500` | Apollo **ACRED NAV** | NAVLink | `1109.74245` | USD/share | Ethereum |
| `tgold` | Kinesis **KAU Reserves** | Proof of Reserve | `2567133.466` | reserve units | Ethereum |
| `tusdc` | Cap **cUSD AUM** | SmartAUM | `60325117.38590438` | USD AUM | Ethereum |

Addresses live in `packages/market-data/src/chainlink-feeds.ts`. The primary
reference is **Superstate USTB**, `0x289B5036cd942e619E1Ee48670F98d214E745AAC`
— a real tokenized US Treasury fund, and the direct real-world analogue of
ALIVE's demo tokenized-Treasury asset.

Reproduce any of it:

```bash
pnpm --filter @alive/market-data probe:chainlink ustb-nav
```

### Why not ETH/USD or gold spot

Both are readable and were verified live, and both were rejected. `ETH/USD`
is not an RWA at all. `XAU/USD` is a commodity market quote — it says
something about the gold market, not about a tokenized instrument. For the
gold asset ALIVE instead reads **Kinesis KAU Reserves**, the attested reserve
backing a real tokenized gold token, because that is a fact about the token.

`XAU/USD` (`0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6`) is kept in
`CHAINLINK_FALLBACK_PRICE_FEEDS`, documented but unwired, for use only if the
RWA feeds become unavailable. A registry test enforces the rule: every wired
feed must be `NAV_PER_SHARE`, `RESERVE_QUANTITY`, or `AUM`.

## X Layer: the honest architecture

ALIVE publishes verdicts to **X Layer testnet**, and Chainlink has **no feeds
there**. Confirmed empirically, not assumed: calls to the addresses listed in
Chainlink's reference-data directory return `0x` — no contract — on the X
Layer testnet RPC.

- **X Layer testnet (1952):** no Chainlink Data Feeds. None.
- **X Layer mainnet (196):** 26 feeds, all crypto (ETH/USD, OKB/USD, OKX
  reserve feeds). Verified readable. **No NAV, no tokenized-fund data.**
- **Ethereum mainnet:** where every RWA NAV, reserve, and AUM feed lives.

So ALIVE reads Chainlink from Ethereum and publishes its verdict to X Layer:

```text
Chainlink NAVLink feed (Ethereum mainnet)
  -> ALIVE intelligence service reads it offchain
  -> canonical MarketQuote, carrying full source provenance
  -> deterministic eligibility engine
  -> signed ALIVE verdict
  -> AliveEligibilityRegistry on X Layer
```

This is a feature, not something to paper over. ALIVE is an intelligence
bridge: it brings a fact from where that fact exists to the chain that needs
to act on it. **Every quote records its real source chain**, and the UI states
the source network and the verdict network separately. ALIVE never implies a
Chainlink value originated on X Layer.

## Freshness: per-feed, never global

ALIVE never treats "Chainlink returned a value" as "the value is fresh." The
quote's timestamp is the feed's own `updatedAt`, so staleness is always
measured at the source, not at the fetch.

Each feed carries its own bound derived from its documented heartbeat. This
is not a stylistic preference — it is forced by the data. Measured on a
normal day:

- `XAU/USD` was **23 hours** old and perfectly healthy (24h heartbeat).
- The NAV feeds were **1–27 hours** old and perfectly healthy (26.5–27h
  heartbeats).

A generic one-hour threshold would have marked every one of them stale.

| Feed type | Heartbeat | ALIVE bound | Why |
| --- | --- | --- | --- |
| NAVLink | 26.5–27h | **4 days** | Fund NAV is struck on business days only; must survive a holiday weekend without a false alarm |
| Proof of Reserve | 24h | 30h | Daily attestation cycle plus margin |
| SmartAUM | 24h | 30h | Daily cycle plus margin |

Exceeding the bound sets the quote's `status` to `UNKNOWN`, so the
eligibility engine sees a degraded signal rather than a confident one.

## What the provider refuses to do

- **Never presents a failure as data.** An unreachable RPC raises
  `PROVIDER_UNAVAILABLE`; it never resolves to a cached or default value.
- **Never prices the wrong asset.** `description()` is checked against the
  configured feed, so a mistyped or repointed address fails loudly.
- **Never assumes 8 decimals.** Feeds here are 6, 8, and 18 decimals;
  `decimals()` is read per feed. Reading USTB's 6-decimal NAV as 8 would
  silently divide it by 100 and still look plausible.
- **Never renders a reserve as money.** Each feed declares a `valueKind`, so
  a reserve quantity is never labelled as a price.
- **Rejects** incomplete rounds (`updatedAt == 0`, per Chainlink's guidance),
  zero answers, negative answers, and future timestamps.

## Live mode vs the Attack Lab

Two modes, and they cannot contaminate each other.

- **Live mode.** Chainlink-backed assets are read from the real feed and
  labelled `CHAINLINK / LIVE`.
- **Attack Lab.** The controllable demo provider degrades *demo-backed*
  assets, labelled `DEMO MARKET DATA / SIMULATED STALENESS`.

`CompositeMarketDataProvider.degrade()` **throws** if asked to degrade a
Chainlink-backed asset. Real oracle data is never modified to manufacture a
demo failure, and that guarantee is structural rather than a convention a
future change could quietly break.

## Data Streams: not needed

| | Free Data Feeds / SmartData | Data Streams |
| --- | --- | --- |
| Live value | Yes, `latestRoundData()` | Yes, sub-second |
| RWA relevance | **NAV, PoR, AUM for real tokenized funds** | RWA/NAV/tokenized-equity schemas (v8/v9/v10) |
| Update frequency | 24–27h heartbeat + deviation | Sub-second |
| WebSocket | No | Yes |
| Historical | Yes, `getRoundData()` | Yes |
| Credentials | **None** | API key + HMAC secret |
| Cost | **$0** | **From $150/month per feed**, no free tier, no free testnet |
| X Layer | Feeds on mainnet only | Verifier on mainnet + testnet |
| Usable today at $0 | **Yes** | No |

**Decision: OPTION A — free Chainlink integration is enough.**

Data Streams would add sub-second updates and a WebSocket. ALIVE does not
need either: fund NAV changes on a daily business cycle, so polling a feed
with a 26.5-hour heartbeat every few minutes already resolves every change
that can occur. Paying $150/month to observe a value that moves once a day
would buy nothing. It would also not improve the *story*: the free NAVLink
feeds are already real tokenized-Treasury data.

Data Streams becomes worth paying for when ALIVE needs intraday tokenized
equity pricing or market-status transitions (v10), which is a real product
direction — the verifier is already deployed on X Layer, so the upgrade path
is credible — but it is not a hackathon requirement.

## Current limitations

- **The RWA feeds are on Ethereum, not X Layer.** Unavoidable; no RWA feed
  exists on X Layer. Provenance always names the true source chain.
- **`onchainSource` is not part of the market-snapshot hash.** The verdict
  commits to price, timestamp, provider, and status via
  `hashMarketSnapshot`, whose encoding has Solidity parity and was not
  changed. Provenance is recorded and displayed but is not itself
  tamper-evident on chain.
- **Weekend behaviour.** NAV feeds do not update on weekends. The 4-day bound
  accommodates this; a demo run on a Sunday will legitimately show an older
  `updatedAt`.
- **Public RPC dependency.** Reads go through a public Ethereum RPC. Failure
  surfaces honestly as `DATA_UNAVAILABLE` rather than a stale value.
- **Not every demo asset is Chainlink-backed.** Assets without a feed stay on
  the labelled demo provider, and the UI distinguishes them per asset.

## Sources

- Data Feeds API reference — https://docs.chain.link/data-feeds/api-reference
- Staleness guidance — https://docs.chain.link/data-feeds
- SmartData (NAVLink / PoR / SmartAUM) — https://docs.chain.link/data-feeds/smartdata
- Feed addresses — https://docs.chain.link/data-feeds/price-feeds/addresses
- Data Streams pricing / no free tier — https://docs.chain.link/data-streams/sign-up
