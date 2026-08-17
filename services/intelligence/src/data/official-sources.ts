import type { IngestionSourceType } from "../ingestion/ingestion-service.js";

export type OfficialSourceSeed = {
  sourceId: string;
  sourceType: IngestionSourceType;
  title: string;
  uri: string;
  /** Verbatim rendered page text, not an AI-generated summary. */
  text: string;
  /** Recorded so a change here is visible as a hash diff, not silent drift. */
  expectedTextHash: `0x${string}`;
};

/**
 * ALIVE's own known-good real issuer/product documentation, ingested via
 * `kind: "text"` -- never the filesystem fixture loader
 * (`ingestion/document-loader.ts`'s `kind: "fixture"` path, which reads
 * `data/source-documents/<fixtureId>.txt`). Keyed by ALIVE asset ID so the
 * interactive verify flow (and `scripts/prove-ai-extraction.ts`, which
 * imports this same data) can ask "does this asset have real official
 * sources to ingest?" without depending on any file existing on disk.
 *
 * `ttbill-b` is ALIVE's live Chainlink showcase asset (see
 * `packages/market-data/src/chainlink-feeds.ts`); these are the direct
 * real-world Superstate/Invesco USTB documents, captured 2026-08-17. See
 * docs/AI.md for the full extraction proof this data produced.
 */
export const OFFICIAL_SOURCES_BY_ASSET_ID: Record<string, OfficialSourceSeed[]> = {
  "ttbill-b": [
    {
      sourceId: "superstate-docs-invesco-ustb-2026-08-17",
      sourceType: "ISSUER_DOCUMENTATION",
      title: "Invesco USTB | Superstate (docs.superstate.com)",
      uri: "https://docs.superstate.com/investors/tokenized-funds/available-funds/invesco-ustb",
      expectedTextHash:
        "0x4d4039faca6e6970ef9a58fda804daab28673a9a3eaf3ae3efdc2a6e14eb2e7a",
      text: `Invesco USTB — Invesco Short Duration US Government Securities Fund

The Invesco Short Duration US Government Securities Fund (USTB) invests in short-duration U.S. Treasury Bills. Shares of the Fund are issued as USTB tokens on Ethereum, Solana, and Plume, or held in book-entry by Superstate. USTB is freely transferable between wallet addresses on the Allowlist. Purchases and redemptions are facilitated through USD or USDC, with liquidity each market day.

Fund information
USTB invests in short-duration U.S. Treasury Bills. Return accrues as interest income, reflected in a continuously increasing NAV per share rather than distributions. Its NAV/S started at $10.000000 and updates continuously.

Subscribing
Investors can view subscription instructions in the Superstate portal. Subscriptions can be sent with a USD wire or USDC (on Ethereum, Solana, or Plume). USTB is continuously priced, so a purchase is priced at the NAV/S when funds are received: shares are delivered immediately for orders paid in USDC (including non-business days), or same-day for USD wires received before 5pm ET. Shares are delivered as tokens to an allowlisted address or as book-entry. The minimum initial investment is $100,000 unless waived by Superstate.

Redeeming
Investors can view redemption instructions in the Superstate portal. Proceeds are paid as U.S. Dollars to a bank account, or USDC to an Ethereum, Solana, or Plume address. Proceeds are delivered immediately (including non-business days, subject to available liquidity) for payout requests in USDC, or same-day for USD if received before 1pm ET.

Tokenizing book-entry shares
Investors can convert book-entry USTB shares into tokens on Ethereum, Solana, or Plume. Tokenization works the same across all Superstate funds; only the supported networks differ.

Market days & holidays
On U.S. market holidays, USDC purchases and redemptions may still be made, but no Treasury Bills are bought or sold.

For Disclosures and Risk Factors related to the Invesco Short Duration US Government Securities Fund visit superstate.com/assets/ustb#disclaimers
`,
    },
    {
      sourceId: "superstate-product-page-ustb-2026-08-17",
      sourceType: "OFFICIAL_TOKEN_DOCUMENTATION",
      title: "USTB — Invesco Short Duration US Government Securities Fund (superstate.com)",
      uri: "https://superstate.com/assets/ustb",
      expectedTextHash:
        "0xf3bb20fee94bc44018b353e1772d4769b87c355fa3e60eb37c82764efa77815e",
      text: `Superstate — USTB — Invesco Short Duration US Government Securities Fund
TOKENIZED PRIVATE FUND

About USTB
The Invesco Short Duration US Government Securities Fund (the "Fund") offers Accredited Investors and Qualified Purchasers access to short-duration Treasury Bills. The Fund's investment objective is to seek current income as is consistent with liquidity and stability of principal. Ownership in the Fund is represented by USTB, held either as a token or in book-entry record keeping. Subscriptions and redemptions are facilitated through USD or USDC, with liquidity each market day.

CUSIP: 86851T204
Custodian: The Bank of New York Mellon
Auditor: PricewaterhouseCoopers LLP
NAV calculation agent: NAV Fund Services
Investment manager: Invesco Advisers, Inc.
Transfer agent: Superstate Services LLC
Domicile: United States
Structure: The Fund is a series of a Delaware Statutory Trust
Eligible investors: Accredited Investors and Qualified Purchasers
Subscription timing: Same-day. Shares are delivered immediately for orders paid in USDC (including non-business days), or same-day for USD wires received before 5pm ET.
Redemption timing: Same-day. Proceeds are delivered immediately (including non-business days, subject to available liquidity) for USDC payout requests, or same-day for USD if received before 1pm ET.

Management fee: All investors are subject to a 0.15% management fee, accrued daily. The Investment Manager provides a monthly rebate of 0.10% of the management fee for the average daily holding that is greater than $25 million. USTB is not subject to a performance-based fee or allocation.

Disclaimers
The Invesco Short Duration US Government Securities Fund ("USTB") is limited to investors that meet certain criteria. This Website shall not constitute an offer to buy or sell, which may be made only at the time a qualified offeree receives the USTB offering materials, which will describe the offering and its terms.

Transfer restrictions: Transfers of Shares are subject to consent requirements and, for Tokenized Shares, automated smart contract controls. Tokenized Shares are not listed on any exchange or trading system and may only be transferred through limited peer-to-peer transactions, subject to restrictions.

The Fund is not registered as an investment company under the Investment Company Act and is therefore not subject to the regulatory protections applicable to registered funds, including requirements relating to governance, custody of assets and limitations on affiliated transactions.
`,
    },
  ],
};

export function officialSourcesForAsset(
  assetId: string,
): OfficialSourceSeed[] | undefined {
  return OFFICIAL_SOURCES_BY_ASSET_ID[assetId];
}
