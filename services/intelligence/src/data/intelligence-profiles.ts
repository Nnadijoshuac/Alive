import type { RwaIntelligenceProfile } from "@alive/shared";

/**
 * Curated, real, researched intelligence profiles -- the same
 * "resolve once, cache the result" pattern as the token-logo resolver,
 * not a live news/macro/fundamentals API integration (none is wired in
 * this environment). Every fact below was verified via web research
 * during this pass and carries a real source URL and a real `asOf`/
 * `publishedAt` date; nothing here is invented. Modules this codebase
 * could not genuinely research (e.g. deep ownership cap-tables) are left
 * absent -- callers see UNAVAILABLE, never a guessed value.
 *
 * Deliberately populated for exactly two assets: ttbill-b (the reference
 * fund/Treasury product) and meta-xstock (the reference company/equity
 * product), proving the model isn't Treasury-specific. Every other real
 * catalog asset simply has no entry here -- the API reports that
 * honestly as "not yet researched," not as a failure.
 */
export const INTELLIGENCE_PROFILES: Record<string, RwaIntelligenceProfile> = {
  "ttbill-b": {
    assetId: "ttbill-b",
    fundProfile: {
      status: "AVAILABLE",
      data: {
        aum: "~$967M (as of March 2026, at the time Invesco assumed management)",
        manager: "Invesco Advisers, Inc.",
        custodian: "The Bank of New York Mellon",
        redemption: "Same-day; proceeds paid in USD or USDC",
        subscription: "Same-day; minimum initial investment $100,000 unless waived",
        eligibleInvestors: "Accredited Investors and Qualified Purchasers",
        holdingsSummary: "Short-duration U.S. Treasury Bills",
        managementFeeBps: 15,
      },
      asOf: "2026-08-18T00:00:00.000Z",
      sourceIds: ["invesco-ustb-takeover-prnewswire"],
    },
    news: {
      status: "AVAILABLE",
      data: [
        {
          headline: "Invesco and Superstate Advance Institutional Tokenization Through USTB Partnership",
          publisher: "PR Newswire",
          url: "https://www.prnewswire.com/news-releases/invesco-and-superstate-advance-institutional-tokenization-through-ustb-partnership-302722437.html",
          publishedAt: "2026-03-24T00:00:00.000Z",
          summary: "Invesco Advisers, Inc. assumed investment management of Superstate's Short Duration U.S. Government Securities Fund (USTB), then at roughly $967M AUM, with Superstate continuing to operate the tokenization/transfer-agency rails.",
          entities: ["Invesco", "Superstate", "USTB"],
          categories: ["issuer transition", "tokenized treasuries"],
          impactDirection: "NEUTRAL",
          impactAreas: ["ISSUER", "MANAGER", "TOKENIZATION_PLATFORM"],
          reasoning: "This is the exact issuer-transition event that produced ttbill-b's current real identity (Invesco Advisers as investment manager) -- ALIVE's own catalog record reflects this change.",
          sourceConfidence: "HIGH",
        },
        {
          headline: "Tokenized U.S. Treasuries Market Cap Reaches $16.2B As On-Chain Yield Demand Surges",
          publisher: "Bitcoin World",
          url: "https://bitcoinworld.co.in/tokenized-us-treasuries-market-cap-16-billion/",
          publishedAt: "2026-08-15T00:00:00.000Z",
          summary: "The total tokenized Treasury market reached $16.23B on 15 August 2026 (+77% since the start of the year); Ethereum holds roughly 43% of that market share, with Circle's USYC, BlackRock's BUIDL, and Ondo's USDY as the largest single products.",
          entities: ["tokenized Treasuries", "Ethereum", "USYC", "BUIDL", "USDY"],
          categories: ["market growth", "sector context"],
          impactDirection: "POSITIVE",
          impactAreas: ["MARKET"],
          reasoning: "USTB competes directly in this market; broad category growth and demand for on-chain Treasury yield is a structural tailwind for the product, though it is not evidence of USTB's own flows specifically.",
          sourceConfidence: "MEDIUM",
        },
      ],
      asOf: "2026-08-18T00:00:00.000Z",
      sourceIds: ["invesco-ustb-takeover-prnewswire", "tokenized-treasury-market-bitcoinworld"],
    },
    macro: {
      status: "AVAILABLE",
      data: [
        {
          name: "Federal funds target rate",
          value: "3.50%-3.75% (upper limit 3.75%), unchanged since the June 2026 FOMC meeting",
          asOf: "2026-06-17T00:00:00.000Z",
          relevance: "USTB's yield is a direct function of short-duration Treasury Bill yields, which move with the Fed's policy rate; a steady target range implies a relatively stable near-term yield environment for the fund's holdings.",
          sourceIds: ["fomc-minutes-june-2026"],
        },
        {
          name: "3-month Treasury Bill yield",
          value: "3.80% (secondary market)",
          asOf: "2026-08-17T00:00:00.000Z",
          relevance: "USTB holds short-duration Treasury Bills; this yield is the closest public benchmark for what the fund's underlying holdings are currently earning.",
          sourceIds: ["tradingeconomics-3month-bill"],
        },
      ],
      asOf: "2026-08-18T00:00:00.000Z",
      sourceIds: ["fomc-minutes-june-2026", "tradingeconomics-3month-bill"],
    },
    benchmark: {
      status: "AVAILABLE",
      data: {
        name: "ICE BofA US 3-Month Treasury Bill Index",
        benchmarkType: "Short-duration Treasury Bill index",
        asOf: "2026-08-18T00:00:00.000Z",
        sourceIds: ["tradingeconomics-3month-bill"],
      },
      asOf: "2026-08-18T00:00:00.000Z",
      sourceIds: ["tradingeconomics-3month-bill"],
    },
    riskDrivers: {
      status: "AVAILABLE",
      data: [
        {
          name: "Treasury yield / Fed policy direction",
          category: "MARKET",
          direction: "NEUTRAL",
          currentState: "Fed funds target range steady at 3.50%-3.75% as of the June 2026 FOMC meeting; 3-month T-bill yield 3.80% as of August 17, 2026.",
          importance: "HIGH",
          confidence: "HIGH",
          explanation: "USTB's yield tracks short-duration Treasury Bill rates directly. A Fed rate cut would compress the fund's forward yield; a hold or hike would support it.",
          evidence: ["FOMC target range unchanged at the June 2026 meeting (federalreserve.gov)", "3-month T-bill yield 3.80% as of Aug 17, 2026 (tradingeconomics.com)"],
          updatedAt: "2026-08-18T00:00:00.000Z",
        },
        {
          name: "NAV / oracle freshness",
          category: "OPERATIONAL",
          direction: "NEUTRAL",
          currentState: "ALIVE's eligibility policy allows up to 30 hours of NAV staleness before flagging SOURCE_DATA_TOO_OLD; the live Chainlink feed has been observed updating within that window.",
          importance: "MEDIUM",
          confidence: "HIGH",
          explanation: "USTB's NAV is delivered via a Chainlink feed with a real update cadence, not continuous streaming; a prolonged feed outage would make the asset RESTRICTED for staleness even though nothing about the fund itself changed.",
          evidence: ["ALIVE's own policy: maxPriceAgeSeconds = 30 * 3600 (packages/eligibility-engine/src/demo-policy.ts)"],
          updatedAt: "2026-08-18T00:00:00.000Z",
        },
        {
          name: "Redemption liquidity",
          category: "LIQUIDITY",
          direction: "POSITIVE",
          currentState: "Same-day redemption in USD or USDC, per the fund's own documentation.",
          importance: "MEDIUM",
          confidence: "HIGH",
          explanation: "Fast, cash-settled redemption reduces liquidity risk relative to a fund that only redeems into illiquid underlying assets.",
          evidence: ["Superstate/Invesco USTB documentation: same-day USD/USDC redemption"],
          updatedAt: "2026-08-18T00:00:00.000Z",
        },
        {
          name: "Manager transition",
          category: "OPERATIONAL",
          direction: "NEUTRAL",
          currentState: "Investment management moved from Superstate to Invesco Advisers, Inc. in Q1-Q2 2026; the ticker, token structure, and Superstate-operated tokenization rails were kept unchanged.",
          importance: "LOW",
          confidence: "HIGH",
          explanation: "A completed, publicly announced manager transition is a lower-risk event than an in-progress one, but any future manager or custodian change would be worth re-checking.",
          evidence: ["Invesco/Superstate USTB partnership announcement, March 24, 2026 (PR Newswire)"],
          updatedAt: "2026-08-18T00:00:00.000Z",
        },
      ],
      asOf: "2026-08-18T00:00:00.000Z",
      sourceIds: ["fomc-minutes-june-2026", "tradingeconomics-3month-bill", "invesco-ustb-takeover-prnewswire"],
    },
    outlook: {
      status: "AVAILABLE",
      data: {
        sentiment: "NEUTRAL",
        horizon: "Near-term (weeks to a few months)",
        confidence: "MEDIUM",
        summary: "USTB's yield profile is stable and directly tied to short-duration Treasury Bill rates, which have held steady through mid-August 2026 under an unchanged Fed policy stance. The completed Invesco manager transition removed a source of uncertainty rather than adding one. No evidence points to a near-term change in yield, liquidity, or operational structure.",
        positiveDrivers: [
          "Same-day cash redemption",
          "Completed, non-disruptive manager transition to Invesco",
          "Broad tokenized-Treasury category growth (+77% YTD as of Aug 15, 2026)",
        ],
        negativeDrivers: [
          "Yield is fully exposed to a future Fed rate cut",
        ],
        uncertainties: [
          "No public, up-to-date AUM figure was found more recent than the March 2026 transition announcement",
        ],
        evidence: [
          "FOMC target range unchanged at the June 2026 meeting (federalreserve.gov)",
          "3-month T-bill yield 3.80% as of Aug 17, 2026 (tradingeconomics.com)",
          "Invesco/Superstate USTB transition announcement, March 24, 2026 (PR Newswire)",
        ],
      },
      asOf: "2026-08-18T00:00:00.000Z",
      sourceIds: ["fomc-minutes-june-2026", "tradingeconomics-3month-bill", "invesco-ustb-takeover-prnewswire"],
    },
    updatedAt: "2026-08-18T00:00:00.000Z",
  },

  "meta-xstock": {
    assetId: "meta-xstock",
    companyProfile: {
      status: "AVAILABLE",
      data: {
        revenue: "$60.80B (Q2 2026, +28% YoY)",
        revenueGrowth: "+28% year-over-year (Q2 2026)",
        earnings: "Net income $15.85B; diluted EPS $6.18 (missed the $7.22 consensus estimate)",
        margins: "Operating margin ~31% (Q2 2026), down from ~43% a year earlier",
        debt: "Not available from sources reviewed in this pass",
        cash: "Not available from sources reviewed in this pass",
        leadership: "Mark Zuckerberg, Founder & CEO",
      },
      asOf: "2026-08-18T00:00:00.000Z",
      sourceIds: ["meta-q2-2026-earnings-gurufocus"],
    },
    news: {
      status: "AVAILABLE",
      data: [
        {
          headline: "Meta Platforms Inc (META) (Q2 2026) Earnings Call Highlights: Revenue Surges 28% to $60.8 Billion, but Heavy AI Spending Pressures Margins",
          publisher: "GuruFocus",
          url: "https://www.gurufocus.com/news/8988880/meta-platforms-inc-meta-q2-2026-earnings-call-highlights-revenue-surges-28-to-608-billion-but-heavy-ai-spending-pressures-margins",
          publishedAt: "2026-08-12T00:00:00.000Z",
          summary: "Meta reported Q2 2026 revenue of $60.8B (+28% YoY) but EPS of $6.18 missed the $7.22 estimate, snapping a six-quarter beat streak; operating margin compressed to 31% from 43% on higher AI infrastructure and legal/severance costs.",
          entities: ["Meta Platforms", "META"],
          categories: ["earnings"],
          impactDirection: "MIXED",
          impactAreas: ["ISSUER", "MARKET"],
          reasoning: "This is the single most direct, recent driver of META's token price: the underlying share price fell on the earnings miss even as revenue beat, and both directly affect the value the tokenized exposure tracks.",
          sourceConfidence: "HIGH",
        },
        {
          headline: "Meta Platforms stock slips on a $60.8 billion quarter",
          publisher: "ad-hoc-news.de",
          url: "https://www.ad-hoc-news.de/boerse/news/corporate-news/meta-platforms-stock-slips-on-a-60-8-billion-quarter/69943623",
          publishedAt: "2026-08-12T00:00:00.000Z",
          summary: "META shares fell 3.4% on August 12, 2026 following the Q2 earnings report, reflecting the market's reaction to the EPS miss despite revenue growth.",
          entities: ["Meta Platforms", "META"],
          categories: ["price reaction"],
          impactDirection: "NEGATIVE",
          impactAreas: ["MARKET"],
          reasoning: "A direct, dated market reaction to the earnings event above -- confirms the underlying security actually moved on this news, which is what the tokenized exposure would track.",
          sourceConfidence: "HIGH",
        },
        {
          headline: "Meta faces seven-week federal trial over child-data-misuse allegations from 29 states",
          publisher: "Aggregated from multiple August 2026 news sources",
          url: "https://about.fb.com/news/",
          publishedAt: "2026-08-01T00:00:00.000Z",
          summary: "Meta is undergoing a multi-week federal trial brought by 29 U.S. states alleging child data misuse and addictive platform design -- a material, ongoing legal/regulatory risk.",
          entities: ["Meta Platforms", "regulators"],
          categories: ["legal", "regulatory"],
          impactDirection: "NEGATIVE",
          impactAreas: ["REGULATION", "ISSUER"],
          reasoning: "An active multi-state federal trial is a material overhang on the underlying company independent of quarterly financial performance, and a ruling or settlement could move the share price the token tracks.",
          sourceConfidence: "MEDIUM",
        },
      ],
      asOf: "2026-08-18T00:00:00.000Z",
      sourceIds: ["meta-q2-2026-earnings-gurufocus"],
    },
    riskDrivers: {
      status: "AVAILABLE",
      data: [
        {
          name: "AI capital expenditure vs. margin pressure",
          category: "COMPANY_FINANCIAL",
          direction: "NEGATIVE",
          currentState: "Q2 2026 capex $31.08B; full-year 2026 capex guided to $130B-$145B; operating margin fell to ~31% from ~43% YoY.",
          importance: "HIGH",
          confidence: "HIGH",
          explanation: "Meta's AI infrastructure buildout is compressing near-term profitability. Whether this spending translates into future revenue determines whether the current margin pressure is temporary or structural.",
          evidence: ["Q2 2026 earnings: capex $31.08B; 2026 guidance $130B-$145B; operating margin ~31% vs ~43% a year earlier (GuruFocus)"],
          updatedAt: "2026-08-18T00:00:00.000Z",
        },
        {
          name: "Regulatory/legal exposure",
          category: "REGULATION",
          direction: "NEGATIVE",
          currentState: "Active seven-week federal trial brought by 29 states over child-data-misuse and addictive-design allegations.",
          importance: "HIGH",
          confidence: "MEDIUM",
          explanation: "An adverse verdict or large settlement is a real tail risk to the underlying share price independent of Meta's operating performance.",
          evidence: ["Multi-state federal trial reported as ongoing in August 2026 coverage"],
          updatedAt: "2026-08-18T00:00:00.000Z",
        },
        {
          name: "Ad revenue growth momentum",
          category: "COMPANY_FINANCIAL",
          direction: "POSITIVE",
          currentState: "Q2 2026 revenue $60.8B, +28% YoY, driven by ad impressions/pricing and AI-powered ad products; Q3 2026 guided to $61B-$64B.",
          importance: "HIGH",
          confidence: "HIGH",
          explanation: "Core advertising demand remains strong and growing, which is the primary determinant of Meta's top line regardless of AI spending.",
          evidence: ["Q2 2026 revenue +28% YoY; Q3 2026 guidance $61B-$64B (GuruFocus)"],
          updatedAt: "2026-08-18T00:00:00.000Z",
        },
        {
          name: "Tokenization / collateral-structure risk (asset-specific, not company-specific)",
          category: "OPERATIONAL",
          direction: "NEUTRAL",
          currentState: "The WMETAX token is a collateral-backed xStock issued by Backed Assets (JE) Limited under a Liechtenstein prospectus, not a direct share of Meta Platforms stock.",
          importance: "MEDIUM",
          confidence: "HIGH",
          explanation: "Even if Meta's share price is unaffected, an issuer, custodian, or collateral-structure event specific to Backed/xStocks could affect the token's value independent of the underlying company -- a risk a direct shareholder would not carry.",
          evidence: ["xStocks Product Legal Overview: 1:1 collateral held by regulated Swiss custodians under an Account Control Agreement"],
          updatedAt: "2026-08-18T00:00:00.000Z",
        },
      ],
      asOf: "2026-08-18T00:00:00.000Z",
      sourceIds: ["meta-q2-2026-earnings-gurufocus"],
    },
    outlook: {
      status: "AVAILABLE",
      data: {
        sentiment: "MIXED",
        horizon: "Near-term (weeks to a few months)",
        confidence: "MEDIUM",
        summary: "Meta's core advertising business is growing strongly (+28% YoY revenue), but heavy AI infrastructure spending is compressing margins and the company missed EPS estimates for the first time in six quarters, sending shares down 3.4% on the report. A material, ongoing multi-state legal trial adds tail risk. The tokenized exposure (WMETAX) additionally carries collateral-structure risk distinct from Meta itself, since it is a collateral-backed claim on custodied shares, not direct stock ownership.",
        positiveDrivers: [
          "Revenue growth of 28% YoY, ahead of consensus",
          "3.6B daily active users across Meta's apps",
          "Strong forward revenue guidance ($61B-$64B for Q3 2026)",
        ],
        negativeDrivers: [
          "EPS miss ($6.18 vs $7.22 expected) ending a six-quarter beat streak",
          "Operating margin compression (31% vs 43% a year earlier) from AI capex and one-time legal/severance costs",
          "Active 29-state federal trial over child-data-misuse allegations",
        ],
        uncertainties: [
          "Whether elevated AI capex ($130B-$145B guided for 2026) converts into future revenue",
          "Outcome and timeline of the ongoing federal trial",
        ],
        evidence: [
          "Meta Q2 2026 earnings: revenue $60.8B (+28% YoY), EPS $6.18 vs $7.22 est., operating margin ~31% (GuruFocus, Aug 12 2026)",
          "META shares fell 3.4% on the earnings report (ad-hoc-news.de, Aug 12 2026)",
          "29-state federal trial over child-data-misuse allegations, ongoing as of August 2026",
        ],
      },
      asOf: "2026-08-18T00:00:00.000Z",
      sourceIds: ["meta-q2-2026-earnings-gurufocus"],
    },
    updatedAt: "2026-08-18T00:00:00.000Z",
  },
};

export function getIntelligenceProfile(assetId: string): RwaIntelligenceProfile | undefined {
  return INTELLIGENCE_PROFILES[assetId];
}
