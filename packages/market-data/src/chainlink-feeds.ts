import type { Address } from "viem";

/**
 * Minimal AggregatorV3Interface. Chainlink Data Feeds, NAVLink feeds, and
 * Proof-of-Reserve feeds all expose this same interface, so one ABI covers
 * every feed ALIVE reads.
 *
 * Reference: https://docs.chain.link/data-feeds/api-reference
 */
export const aggregatorV3Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "description",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "version",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

export type ChainlinkNetwork = {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerAddressUrl: (address: string) => string;
};

/**
 * Networks ALIVE reads Chainlink from.
 *
 * X Layer testnet (where ALIVE publishes verdicts) is deliberately absent:
 * Chainlink has no Data Feeds deployed there. Confirmed empirically -- calls
 * to the addresses listed in Chainlink's reference-data directory for an
 * "xlayer testnet" return 0x (no contract) on the X Layer testnet RPC. X
 * Layer *mainnet* does have 26 feeds, but none are RWA/NAV.
 */
export const CHAINLINK_NETWORKS: Record<number, ChainlinkNetwork> = {
  1: {
    name: "Ethereum",
    chainId: 1,
    rpcUrl:
      process.env.CHAINLINK_ETHEREUM_RPC_URL ??
      "https://ethereum-rpc.publicnode.com",
    explorerAddressUrl: (address) => `https://etherscan.io/address/${address}`,
  },
  196: {
    name: "X Layer",
    chainId: 196,
    rpcUrl:
      process.env.CHAINLINK_XLAYER_RPC_URL ?? "https://rpc.xlayer.tech",
    explorerAddressUrl: (address) =>
      `https://www.okx.com/web3/explorer/xlayer/address/${address}`,
  },
};

export function chainlinkNetwork(chainId: number): ChainlinkNetwork {
  const network = CHAINLINK_NETWORKS[chainId];
  if (!network) {
    throw new Error(`No Chainlink network configured for chain ${chainId}`);
  }
  return network;
}

export type ChainlinkFeedProduct =
  | "NAVLink"
  | "SmartAUM"
  | "Proof of Reserve"
  | "Price";

/**
 * What the feed's `answer` actually represents. Chainlink returns a bare
 * integer for every product, so without this a NAV per share, a fund's total
 * AUM, and a quantity of reserve tokens all look identical downstream. ALIVE
 * labels each one so the passport can never present a reserve quantity as if
 * it were a price.
 */
export type ChainlinkValueKind =
  | "NAV_PER_SHARE"
  | "AUM"
  | "RESERVE_QUANTITY"
  | "PRICE";

export type ChainlinkFeedDefinition = {
  /** ALIVE asset this feed is the reference for. */
  assetId: string;
  label: string;
  /** Exact string the contract's description() returns; used to self-verify. */
  expectedDescription: string;
  product: ChainlinkFeedProduct;
  valueKind: ChainlinkValueKind;
  chainId: number;
  address: Address;
  /** Documented heartbeat from Chainlink's reference-data directory. */
  heartbeatSeconds: number;
  /**
   * ALIVE's own staleness bound. Deliberately per-feed: a single global
   * threshold is wrong, because heartbeats here range from one hour to a
   * week. See the rationale on each entry.
   */
  maxAgeSeconds: number;
  /** Why maxAgeSeconds is what it is, surfaced in docs and the UI. */
  freshnessRationale: string;
  /** What the answer actually means -- these are not all prices. */
  unit: string;
  /** Who issues the underlying real-world asset. */
  issuer: string;
};

const HOUR = 3_600;
const DAY = 24 * HOUR;

/**
 * Feeds ALIVE reads.
 *
 * Every heartbeat below is Chainlink's documented value. Every maxAge is
 * ALIVE's own bound, set from the heartbeat plus a margin sized to how the
 * underlying asset actually updates -- not a generic number. Empirically,
 * a naive one-hour rule would mark real, perfectly healthy feeds stale: the
 * gold feed was 23 hours old and the tokenized-fund NAV feeds were 4-27
 * hours old when first probed, all behaving normally.
 */
export const CHAINLINK_FEEDS = {
  /**
   * PRIMARY. Superstate Short Duration US Government Securities Fund --
   * a real tokenized US Treasury fund. This is NAV per share: the most
   * RWA-specific free signal Chainlink publishes, and the direct real-world
   * analogue of ALIVE's demo tokenized-Treasury asset. Chosen over any
   * crypto or spot-commodity price precisely because it is a tokenized
   * fund's own net asset value rather than a market quote.
   */
  "ustb-nav": {
    // Mapped to ttbill-b, not ttbill-a, on purpose. ttbill-a is deliberately
    // left demo-backed so the Attack Lab has a tokenized-Treasury asset it is
    // allowed to degrade -- ALIVE never doctors real oracle data to
    // manufacture a failure. Keeping ttbill-a on demo also preserves the
    // already-proven X Layer testnet run and its recorded transaction
    // hashes, which used ttbill-a.
    assetId: "ttbill-b",
    label: "Superstate USTB - NAV per Share",
    expectedDescription: "USTB NAV per Share",
    product: "NAVLink",
    valueKind: "NAV_PER_SHARE",
    chainId: 1,
    address: "0x289B5036cd942e619E1Ee48670F98d214E745AAC",
    heartbeatSeconds: 95_400,
    // Heartbeat is 26.5h, but fund NAV is struck on business days only, so a
    // healthy feed can legitimately go a long weekend without an update.
    // 4 days covers Fri->Tue plus a public holiday without false alarms,
    // while still catching a genuinely abandoned feed.
    maxAgeSeconds: 4 * DAY,
    freshnessRationale:
      "26.5h documented heartbeat, widened to 4 days because fund NAV is struck on business days only and must survive a holiday weekend without a false stale reading.",
    unit: "USD per share",
    issuer: "Superstate",
  },
  /**
   * Anemoy/Centrifuge tokenized US Treasury fund NAV. Not wired to an ALIVE
   * asset: ttbill-a is reserved as the Attack Lab's demo-backed asset, so
   * this feed is kept configured and probeable but unassigned.
   */
  "jtrsy-nav": {
    assetId: "__unassigned:jtrsy",
    label: "Anemoy JTRSY - NAV",
    expectedDescription: "JTRSY NAV",
    product: "NAVLink",
    valueKind: "NAV_PER_SHARE",
    chainId: 1,
    address: "0x0C2e4Df738e99e8db80012f5bb2a303f3f48Ca74",
    heartbeatSeconds: 97_200,
    maxAgeSeconds: 4 * DAY,
    freshnessRationale:
      "27h documented heartbeat, widened to 4 days for the same business-day NAV cycle as USTB.",
    unit: "USD per share",
    issuer: "Anemoy / Centrifuge",
  },
  /** OpenEden tokenized T-Bill fund NAV. */
  "tbill-nav": {
    assetId: "ttbill-c",
    label: "OpenEden TBILL - NAV",
    expectedDescription: "TBILL NAV",
    product: "NAVLink",
    valueKind: "NAV_PER_SHARE",
    chainId: 1,
    address: "0xAbE7a3643615Ed32d3431e11E0Ee5A486Cb27d48",
    heartbeatSeconds: 97_200,
    maxAgeSeconds: 4 * DAY,
    freshnessRationale:
      "27h documented heartbeat, widened to 4 days for the business-day NAV cycle.",
    unit: "USD per share",
    issuer: "OpenEden",
  },
  /**
   * Kinesis tokenized gold, as Proof of Reserve. Chosen over the XAU/USD
   * spot price feed on purpose: this is the reserve actually backing a
   * tokenized gold instrument, which is an RWA fact about a token, whereas
   * XAU/USD is only a commodity market quote. The answer is a quantity of
   * reserve units, not a price -- hence valueKind RESERVE_QUANTITY, so
   * nothing downstream renders it as money.
   */
  "kau-reserves": {
    assetId: "tgold",
    label: "Kinesis KAU - Gold Reserves",
    expectedDescription: "KAU Reserves",
    product: "Proof of Reserve",
    valueKind: "RESERVE_QUANTITY",
    chainId: 1,
    address: "0xaB5Dd7DD7669072a1Ef27c0ba241120A27A1aeC3",
    heartbeatSeconds: DAY,
    maxAgeSeconds: 30 * HOUR,
    freshnessRationale:
      "24h documented heartbeat plus a 6h margin; reserve attestations update on a daily cycle.",
    unit: "KAU reserve units",
    issuer: "Kinesis",
  },
  /**
   * Total assets under management of the Cap cUSD stablecoin -- the only
   * free SmartAUM proxy on Ethereum mainnet. An AUM figure, not a price.
   */
  "cusd-aum": {
    assetId: "tusdc",
    label: "Cap cUSD - Assets Under Management",
    expectedDescription: "cUSD AUM",
    product: "SmartAUM",
    valueKind: "AUM",
    chainId: 1,
    address: "0x16caE6d6ffb4AE01e206b928de925Ac0C8C8116A",
    heartbeatSeconds: DAY,
    maxAgeSeconds: 30 * HOUR,
    freshnessRationale:
      "24h documented heartbeat plus a 6h margin.",
    unit: "USD under management",
    issuer: "Cap",
  },
  /**
   * Apollo Diversified Credit fund NAV -- a tokenized private-credit fund.
   * Deliberately left unassigned: ALIVE's catalog has no asset representing
   * ACRED, and the only free slot at authoring time (tsp500, "Test Broad
   * Equity Index") is a demo EQUITY identity with no relationship to a
   * private-credit fund. Wiring a real feed to an unrelated demo identity
   * would present ACRED's live NAV as if it were S&P 500 data -- exactly
   * the kind of identity/feed mismatch ALIVE's provenance model exists to
   * prevent. Kept configured and probeable, like jtrsy-nav below, until a
   * genuine ACRED asset identity exists in the catalog.
   */
  "acred-nav": {
    assetId: "__unassigned:acred",
    label: "Apollo ACRED - NAV",
    expectedDescription: "ACRED NAV",
    product: "NAVLink",
    valueKind: "NAV_PER_SHARE",
    chainId: 1,
    address: "0x35DDfB90011E686CCf837a6819562705076207EB",
    heartbeatSeconds: 97_200,
    maxAgeSeconds: 4 * DAY,
    freshnessRationale:
      "27h documented heartbeat, widened to 4 days for the business-day NAV cycle.",
    unit: "USD per share",
    issuer: "Apollo / Securitize",
  },
} as const satisfies Record<string, ChainlinkFeedDefinition>;

/**
 * Documented but deliberately NOT wired to an ALIVE asset.
 *
 * XAU/USD (`0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6`, Ethereum, 8dp,
 * 24h heartbeat) and ETH/USD (`0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`)
 * are both readable and were verified live, but they are ordinary market
 * quotes rather than facts about a tokenized asset. ALIVE prefers NAV,
 * reserve, and AUM feeds, which say something about the RWA itself. These
 * remain the fallback only if the RWA feeds above become unavailable.
 */
export const CHAINLINK_FALLBACK_PRICE_FEEDS = {
  "xau-usd": {
    label: "Gold - XAU/USD",
    expectedDescription: "XAU / USD",
    chainId: 1,
    address: "0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6" as Address,
    heartbeatSeconds: DAY,
  },
} as const;

export type ChainlinkFeedKey = keyof typeof CHAINLINK_FEEDS;

/** Feed serving a given ALIVE asset, if one is configured. */
export function feedForAsset(
  assetId: string,
): (ChainlinkFeedDefinition & { key: ChainlinkFeedKey }) | undefined {
  for (const [key, feed] of Object.entries(CHAINLINK_FEEDS)) {
    if (feed.assetId === assetId) {
      return { ...feed, key: key as ChainlinkFeedKey };
    }
  }
  return undefined;
}
