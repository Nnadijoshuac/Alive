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
  "meta-xstock": [
    {
      sourceId: "xstocks-docs-legal-overview-meta-xstock",
      sourceType: "ISSUER_DOCUMENTATION",
      title: "xStocks Product Legal Overview — Backed Assets (JE) Limited",
      uri: "https://docs.xstocks.fi/docs/product-legal-overview",
      expectedTextHash:
        "0x03cc1c2de35ad69d8fe1a6781cb76bd2c875a6d6d2f43495ff336a5d3797df48",
      text: `xStocks Product Legal Overview — Backed Assets (JE) Limited
TOKENIZED COLLATERAL-BACKED TRACKER CERTIFICATES

About xStocks
xStocks are tokenized tracker certificates issued by Backed Assets (JE) Limited, an issuer special purpose vehicle incorporated in Jersey under an approved base prospectus registered in the EEA (Financial Market Authority Liechtenstein - FMA). Each xStock token represents a collateral-backed claim tracking the economic performance of a specific underlying publicly traded equity or ETF.

Product Information: Wrapped Meta xStock (WMETAX)
WMETAX is a tokenized tracker certificate designed to track the economic performance of Meta Platforms, Inc. (NASDAQ: META) Class A common stock. Each WMETAX token is backed 1:1 by real Meta Platforms shares purchased on public secondary markets and held in segregated custody accounts.

Collateral & Custody Architecture
The underlying shares backing WMETAX are held by regulated Swiss banking and custody institutions (including InCore Bank AG and Maerki Baumann & Co. AG) in segregated deposit accounts. The collateral is pledged to an independent Security Agent under a tripartite Account Control Agreement for the exclusive benefit of tokenholders, establishing insolvency remoteness from both Backed Assets (JE) Limited and Backed Finance AG.

Smart Contract Deployments
WMETAX is deployed as an ERC-20 compliant smart contract on OKX X Layer Mainnet at contract address 0xe840946ffebcd66b7c4e95095effafadfa0d0e56. Ownership and peer-to-peer transfers are recorded directly on the blockchain.

Issuer & Governance
Issuer: Backed Assets (JE) Limited
Tokenization Technology & Platform: Backed Finance AG / Kraken-affiliated SPV
Jurisdiction: Jersey / Liechtenstein (EEA Prospectus Regulation)
Governing Law: Swiss Law / Liechtenstein Law
Underlying Asset: Meta Platforms, Inc. (NASDAQ: META) shares, held 1:1 by a regulated custodian

Redemption & Liquidity
Primary market minting and redemption of WMETAX are available to KYC/AML-onboarded Authorized Participants and Qualified Investors through Backed Assets (JE) Limited in exchange for fiat currency (USD/EUR) or compliant stablecoins (USDC/USDT). Secondary market liquidity is provided continuously via decentralized exchanges and supported trading platforms on X Layer. Retail tokenholders may freely transfer or liquidate tokens on secondary markets. Direct retail redemption into physical NASDAQ shares is subject to regulatory transfer restrictions under the EEA Prospectus.

Key Disclosures & Restrictions
WMETAX tokens do not confer shareholder voting rights in Meta Platforms, Inc., nor do they constitute direct equity ownership or shares issued by Meta Platforms, Inc. Meta Platforms, Inc. does not sponsor, endorse, or manage WMETAX.
`,
    },
    {
      sourceId: "xstocks-product-spec-wmetax",
      sourceType: "OFFICIAL_TOKEN_DOCUMENTATION",
      title: "Wrapped Meta xStock (WMETAX) Product Specification | xStocks",
      uri: "https://xstocks.fi/assets/wmetax",
      expectedTextHash:
        "0xad2cb9f90ddbb0e0959e46f4547937600a15b0336e716fbccabe5e178ad3722c",
      text: `xStocks — Wrapped Meta xStock (WMETAX)
OFFICIAL TOKEN SPECIFICATION

Product Overview
Wrapped Meta xStock (WMETAX) is a blockchain-native collateral-backed tracker token tracking the price and corporate actions of Meta Platforms, Inc. (NASDAQ: META) shares on a 1:1 basis.

Specifications
Token Symbol: WMETAX
Product Name: Wrapped Meta xStock
Asset Class: EQUITY
Issuer: Backed Assets (JE) Limited
Underlying Security: Meta Platforms, Inc. (NASDAQ: META)
Network: X Layer Mainnet (Chain ID: 196)
Contract Address: 0xe840946ffebcd66b7c4e95095effafadfa0d0e56
Token Standard: ERC-20
Collateral Backing: 1:1 fully collateralized with underlying equity shares
Custodian: InCore Bank AG, Maerki Baumann & Co. AG (Switzerland)
Transferability: Freely transferable on X Layer
Trading Hours: Continuous 24/7 onchain transfers; underlying price updates during US market hours (9:30 AM - 4:00 PM ET)
Eligible Investors: Open for secondary market transfers to eligible global participants; primary issuance restricted to Authorized Participants
Management Fee: 0% ongoing management fee (issuance and redemption fees apply to Authorized Participants)

Redemption Information
Redemption Supported: true
Redemption Frequency: Daily for Authorized Participants (T+1 settlement); secondary market liquidity for tokenholders
Settlement Period: Same-day to T+1 for Authorized Participants
Redemption Minimum: $10,000 for Authorized Participants

Legal & Compliance
Issued pursuant to the Backed Assets Base Prospectus approved by the FMA Liechtenstein. Tokens are structured as non-equity securities under the EEA Prospectus Regulation.
`,
    },
  ],
  "spyx-xstock": [
    {
      sourceId: "xstocks-docs-legal-overview-spyx-xstock",
      sourceType: "ISSUER_DOCUMENTATION",
      title: "xStocks Product Legal Overview — Backed Assets (JE) Limited",
      uri: "https://docs.xstocks.fi/docs/product-legal-overview",
      expectedTextHash:
        "0xc50ae232df24388e5ade251d499a72c25603f80b4bd9cd7f13093ab928dd723c",
      text: `xStocks Product Legal Overview — Backed Assets (JE) Limited
TOKENIZED COLLATERAL-BACKED TRACKER CERTIFICATES

About xStocks
xStocks are tokenized tracker certificates issued by Backed Assets (JE) Limited, an issuer special purpose vehicle incorporated in Jersey under an approved base prospectus registered in the EEA (Financial Market Authority Liechtenstein - FMA). Each xStock token represents a collateral-backed claim tracking the economic performance of a specific underlying publicly traded equity or ETF.

Product Information: SP500 xStock (SPYX)
SPYX is a tokenized tracker certificate designed to track the performance of the S&P 500 Index through holding shares of the SPDR S&P 500 ETF Trust (NYSE Arca: SPY). Each SPYX token is backed 1:1 by real SPY ETF shares held in segregated custody accounts with regulated Swiss banking custodians.

Collateral & Custody Architecture
The underlying SPDR S&P 500 ETF Trust shares backing SPYX are held by regulated Swiss banking and custody institutions (including InCore Bank AG and Maerki Baumann & Co. AG) in segregated deposit accounts. The collateral is pledged to an independent Security Agent under a tripartite Account Control Agreement for the exclusive benefit of tokenholders, establishing insolvency remoteness from Backed Assets (JE) Limited and Backed Finance AG.

Smart Contract Deployments
SPYX is deployed as an ERC-20 smart contract on OKX X Layer Mainnet at contract address 0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48. Ownership and peer-to-peer transfers are recorded directly on the blockchain.

Issuer & Governance
Issuer: Backed Assets (JE) Limited
Tokenization Platform: Backed Finance AG / Kraken-affiliated SPV
Jurisdiction: Jersey / Liechtenstein (EEA Prospectus Regulation)
Governing Law: Swiss Law / Liechtenstein Law
Underlying Asset: SPDR S&P 500 ETF Trust (NYSE Arca: SPY) shares, held 1:1 by a regulated custodian

Redemption & Liquidity
Primary market minting and redemption of SPYX are available to KYC/AML-onboarded Authorized Participants and Qualified Investors through Backed Assets (JE) Limited in exchange for fiat currency (USD/EUR) or compliant stablecoins (USDC/USDT). Secondary market liquidity is provided continuously via decentralized exchanges and supported trading platforms on X Layer. Retail tokenholders may freely transfer or liquidate tokens on secondary markets. Direct retail redemption into physical SPY shares is subject to regulatory transfer restrictions under the EEA Prospectus.

Key Disclosures & Restrictions
SPYX tokens do not constitute direct shares in the SPDR S&P 500 ETF Trust, nor is SPYX issued, endorsed, or sponsored by State Street Global Advisors or S&P Dow Jones Indices.
`,
    },
    {
      sourceId: "xstocks-product-spec-spyx",
      sourceType: "OFFICIAL_TOKEN_DOCUMENTATION",
      title: "SP500 xStock (SPYX) Product Specification | xStocks",
      uri: "https://xstocks.fi/assets/spyx",
      expectedTextHash:
        "0xcdaf45f9ddcb11a45fe65b4ed2ee970bafc7a5f3a4c01a12f84f335b848223da",
      text: `xStocks — SP500 xStock (SPYX)
OFFICIAL TOKEN SPECIFICATION

Product Overview
SP500 xStock (SPYX) is a blockchain-native collateral-backed tracker token tracking the price and performance of the SPDR S&P 500 ETF Trust (NYSE Arca: SPY) on a 1:1 basis, providing decentralized exposure to the benchmark S&P 500 Index.

Specifications
Token Symbol: SPYX
Product Name: SP500 xStock
Asset Class: ETF
Issuer: Backed Assets (JE) Limited
Underlying Security: SPDR S&P 500 ETF Trust (SPY)
Network: X Layer Mainnet (Chain ID: 196)
Contract Address: 0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48
Token Standard: ERC-20
Collateral Backing: 1:1 fully collateralized with underlying SPY ETF shares
Custodian: InCore Bank AG, Maerki Baumann & Co. AG (Switzerland)
Transferability: Freely transferable on X Layer
Trading Hours: Continuous 24/7 onchain transfers; underlying price updates during US market hours (9:30 AM - 4:00 PM ET)
Eligible Investors: Open for secondary market transfers to eligible global participants; primary issuance restricted to Authorized Participants
Management Fee: 0% ongoing management fee (issuance and redemption fees apply to Authorized Participants)

Redemption Information
Redemption Supported: true
Redemption Frequency: Daily for Authorized Participants (T+1 settlement); secondary market liquidity for tokenholders
Settlement Period: Same-day to T+1 for Authorized Participants
Redemption Minimum: $10,000 for Authorized Participants

Legal & Compliance
Issued pursuant to the Backed Assets Base Prospectus approved by the FMA Liechtenstein. Tokens are structured as non-equity securities under the EEA Prospectus Regulation.
`,
    },
  ],
  "buidl": [
    {
      sourceId: "securitize-buidl-overview-doc",
      sourceType: "ISSUER_DOCUMENTATION",
      title: "BlackRock USD Institutional Digital Liquidity Fund (BUIDL) | Securitize",
      uri: "https://securitize.io/blackrock/buidl",
      expectedTextHash:
        "0x0c15101244350a7c3650772f418f374e1bfd6f7ad8567b73febf4efd43c208fa",
      text: `BlackRock USD Institutional Digital Liquidity Fund (BUIDL)
TOKENIZED PRIVATE LIQUIDITY FUND

About BUIDL
The BlackRock USD Institutional Digital Liquidity Fund, Ltd. ("BUIDL" or the "Fund") is a tokenized private liquidity fund offering Qualified Purchasers access to current income with capital preservation and daily liquidity. The Fund is managed by BlackRock Financial Management, Inc., with Securitize LLC acting as the digital transfer agent and tokenization administrator.

Investment Objective & Holdings
The Fund seeks to maintain a stable token value of $1.00 per share while paying accrued daily dividends directly to tokenholder wallets on a monthly basis. The Fund invests 100% of its total assets in cash, short-duration U.S. Treasury bills, and repurchase agreements, providing institutional yield with minimal duration risk.

Fund Identifiers & Architecture
Investment Manager: BlackRock Financial Management, Inc.
Digital Transfer Agent: Securitize LLC
Custodian: The Bank of New York Mellon (BNY Mellon)
Auditor: PricewaterhouseCoopers LLP
Domicile: British Virgin Islands / United States
Eligible Investors: Qualified Purchasers (as defined under Section 2(a)(51) of the Investment Company Act of 1940)
Minimum Investment: $5,000,000 for initial institutional subscriptions (unless waived)

Smart Contract Deployments
BUIDL is issued as an ERC-20 token on Ethereum Mainnet at contract address 0x7712c34205737192402172409a8f7ccef8aa2aec. Transfers are restricted to allowlisted wallets verified through Securitize ID.

Subscriptions & Redemptions
Subscriptions: Same-day in USD wire or USDC via Securitize.
Redemptions: Same-day. Tokenholders may redeem shares for USD via the transfer agent or swap 24/7/365 into USDC through smart contracts enabled by Circle.
Redemption Supported: true
Redemption Frequency: Daily (24/7 for USDC via Circle contract integration)
Settlement Period: Same-day

Management Fee
Management fee of 0.20% per annum, calculated and accrued daily.

Disclaimers & Restrictions
BUIDL is an unregistered private fund offered under Regulation D / Regulation S. Shares are subject to transfer restrictions and may only be held by verified Qualified Purchasers on the allowlist.
`,
    },
    {
      sourceId: "blackrock-buidl-product-spec-doc",
      sourceType: "OFFICIAL_TOKEN_DOCUMENTATION",
      title: "BUIDL Token Specification & Offering Details | BlackRock",
      uri: "https://www.blackrock.com/us/individual/products/buidl",
      expectedTextHash:
        "0x1e51cc0cc3667fdb29cad24ec1100f6d5cf7db94352d5ce0653c181aca95e757",
      text: `BlackRock — BUIDL Token Specification
OFFICIAL PRODUCT SPECIFICATION

Product Summary
Token Name: BlackRock USD Institutional Digital Liquidity Fund
Token Symbol: BUIDL
Asset Class: FUND
Issuer: BlackRock Financial Management, Inc. (tokenized by Securitize)
Underlying Assets: Cash, US Treasury bills, and repurchase agreements
Blockchain: Ethereum Mainnet (Chain ID: 1)
Smart Contract Address: 0x7712c34205737192402172409a8f7ccef8aa2aec
Token Standard: ERC-20 with transfer restriction hooks (Securitize ID Allowlist)
Custodian: The Bank of New York Mellon
Target NAV: Stable $1.00 per token
Dividend Distribution: Accrues daily, distributes monthly in new BUIDL tokens

Redemption & Liquidity Terms
Redemption Supported: true
Redemption Frequency: Daily / Continuous USDC settlement via Circle partnership
Redemption Settlement Period: Same-day
Minimum Subscription: $5,000,000 (institutional)

Compliance & Restrictions
Transfers restricted to KYC/AML-verified Qualified Purchasers on the Securitize Allowlist. Unapproved wallet transfers revert onchain.
`,
    },
  ],
  "acred": [
    {
      sourceId: "securitize-acred-overview-doc",
      sourceType: "ISSUER_DOCUMENTATION",
      title: "Apollo Diversified Credit Securitize Fund | Securitize",
      uri: "https://securitize.io/primary-market/apollo-diversified-credit-securitize-fund",
      expectedTextHash:
        "0x6e053b11614aa2e93b1681f01c69afc5da987bd811b976db84a95072420a55a1",
      text: `Apollo Diversified Credit Securitize Fund (ACRED)
TOKENIZED PRIVATE CREDIT FUND

About ACRED
The Apollo Diversified Credit Securitize Fund ("ACRED") provides eligible investors access to a diversified portfolio of private credit assets managed by Apollo Global Management. ACRED invests as a feeder fund into the Apollo Diversified Credit Fund, targeting current income and long-term capital appreciation across corporate direct lending, asset-backed lending, and structured credit.

Investment Strategy & Underlying Assets
Underlying Strategy: Private direct corporate lending, senior secured loans, asset-backed finance, and structured credit facilities managed by Apollo's credit platform ($400B+ AUM).
Target Yield: Variable floating-rate yield derived from private credit loan coupons and interest payments.

Fund Structure & Governance
Asset Class: CREDIT
Investment Manager: Apollo Global Management (Apollo Asset Management, Inc.)
Digital Asset Administrator & Transfer Agent: Securitize LLC
Custodian: Regulated institutional custody banks
Domicile: United States (Delaware Statutory Trust feeder structure)
Eligible Investors: Accredited Investors and Qualified Purchasers
Minimum Initial Investment: $25,000 for tokenized shares

Smart Contract Deployment
ACRED is issued as an ERC-20 token on Ethereum Mainnet at contract address 0x17418038ecf73ba4026c4f428547bf099706f27b. Transfer restrictions and allowlist management are enforced onchain via Securitize ID.

Subscriptions & Redemptions
Subscriptions: Monthly or quarterly windows in USD or USDC.
Redemptions: Periodic quarterly liquidity windows subject to fund liquidity limits and gate provisions.
Redemption Supported: true
Redemption Frequency: Quarterly
Settlement Period: Quarterly redemption windows with T+5 to T+15 settlement

Fees & Expenses
Management Fee: 1.50% base management fee per annum with performance fee on excess return above hurdle rate.
`,
    },
    {
      sourceId: "apollo-acred-product-spec-doc",
      sourceType: "OFFICIAL_TOKEN_DOCUMENTATION",
      title: "ACRED Token Specification | Securitize & Apollo",
      uri: "https://securitize.io/assets/acred",
      expectedTextHash:
        "0xa5a8b60cf51e1cb359b216be46e4e9df01fb0e934634e6baa19d8cd70f44bc45",
      text: `Apollo — ACRED Token Specification
OFFICIAL PRODUCT SPECIFICATION

Product Overview
Token Name: Apollo Diversified Credit Securitize Fund
Token Symbol: ACRED
Asset Class: CREDIT
Issuer: Apollo Global Management (tokenized by Securitize)
Underlying: Corporate direct lending, asset-backed lending, and structured credit (via the Apollo Diversified Credit Fund feeder structure)
Blockchain: Ethereum Mainnet (Chain ID: 1)
Smart Contract Address: 0x17418038ecf73ba4026c4f428547bf099706f27b
Token Standard: ERC-20 with Securitize ID allowlist controls
Custodian: Institutional custody banks (State Street / BNY Mellon)
NAV Pricing: Periodic NAV calculation provided by independent fund administrator

Redemption Terms
Redemption Supported: true
Redemption Frequency: Quarterly
Redemption Settlement Period: Quarterly liquidity window
Eligible Investors: Accredited Investors and Qualified Purchasers
Transfer Restrictions: Transfers restricted to allowlisted wallets verified through Securitize ID.
`,
    },
  ],
};

export function officialSourcesForAsset(
  assetId: string,
): OfficialSourceSeed[] | undefined {
  return OFFICIAL_SOURCES_BY_ASSET_ID[assetId];
}

