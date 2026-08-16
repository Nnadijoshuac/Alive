import {
  concat,
  encodeAbiParameters,
  keccak256,
  toBytes,
  type Hex,
} from "viem";
import { z } from "zod";
import { AssetIdSchema, DataModeSchema } from "./rwa.js";
import { AddressSchema, IsoDateSchema } from "./schemas.js";

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const MarketStatusSchema = z.enum([
  "OPEN",
  "CLOSED",
  "HALTED",
  "UNKNOWN",
]);

function canonicalDecimal(value: string): string {
  const [integer = "0", fraction] = value.split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  if (fraction === undefined) return normalizedInteger;
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction.length === 0
    ? normalizedInteger
    : `${normalizedInteger}.${normalizedFraction}`;
}

export const FixedDecimalStringSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/, {
    message:
      "Expected a non-negative fixed-decimal string with at most 18 fractional digits",
  })
  .transform(canonicalDecimal);

function decimalParts(value: string): readonly [bigint, number] {
  const [integer = "0", fraction = ""] = value.split(".");
  return [BigInt(`${integer}${fraction}`), fraction.length];
}

export function compareFixedDecimals(left: string, right: string): number {
  const parsedLeft = FixedDecimalStringSchema.parse(left);
  const parsedRight = FixedDecimalStringSchema.parse(right);
  const [leftInteger, leftScale] = decimalParts(parsedLeft);
  const [rightInteger, rightScale] = decimalParts(parsedRight);
  const commonScale = Math.max(leftScale, rightScale);
  const scaledLeft = leftInteger * 10n ** BigInt(commonScale - leftScale);
  const scaledRight = rightInteger * 10n ** BigInt(commonScale - rightScale);
  return scaledLeft < scaledRight ? -1 : scaledLeft > scaledRight ? 1 : 0;
}

/**
 * Provenance for a quote read directly from an onchain oracle contract.
 *
 * ALIVE reads some sources from a chain other than the one it publishes
 * verdicts to, so the source chain is recorded explicitly and is never
 * implied to be the verdict chain. `sourceUpdatedAt` is the oracle's own
 * "this answer was written at" timestamp; `observedAt` is when ALIVE read
 * it. Those are different facts and both are kept: a value can be fetched
 * a second ago and still be a day old at the source.
 */
export const OnchainSourceSchema = z
  .object({
    network: z.string().trim().min(1).max(120),
    chainId: z.number().int().positive(),
    feedAddress: AddressSchema,
    description: z.string().trim().min(1).max(200).optional(),
    decimals: z.number().int().min(0).max(38),
    roundId: z.string().trim().min(1).max(80),
    answeredInRound: z.string().trim().min(1).max(80).optional(),
    /** When the oracle last wrote this answer onchain. */
    sourceUpdatedAt: IsoDateSchema,
    /** When ALIVE read it. */
    observedAt: IsoDateSchema,
    blockNumber: z.number().int().nonnegative(),
  })
  .strict();

export type OnchainSource = z.infer<typeof OnchainSourceSchema>;

const MarketQuoteObjectSchema = z
  .object({
    assetId: AssetIdSchema,
    price: FixedDecimalStringSchema,
    /**
     * The instant this value became true at its source. For an onchain feed
     * this is the oracle's `updatedAt`, not the time ALIVE fetched it, so
     * every downstream freshness check measures staleness at the source.
     */
    timestamp: IsoDateSchema,
    provider: z.string().trim().min(1).max(120),
    status: MarketStatusSchema,
    dataMode: DataModeSchema,
    bid: FixedDecimalStringSchema.optional(),
    ask: FixedDecimalStringSchema.optional(),
    mid: FixedDecimalStringSchema.optional(),
    onchainSource: OnchainSourceSchema.optional(),
  })
  .strict();

export const MarketQuoteSchema = MarketQuoteObjectSchema.superRefine(
  (quote, context) => {
    if (quote.dataMode === "DEMO" && !/demo/i.test(quote.provider)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Demo quotes must identify a demo provider",
        path: ["provider"],
      });
    }
    // A live quote must not look like demo data. Note this is deliberately
    // not "LIVE requires onchainSource": Data Streams reports are genuinely
    // live but are signed offchain rather than read from a contract, so
    // requiring contract provenance would wrongly conflate "live" with
    // "onchain". What must never happen is demo data presenting itself as
    // live, which this and the DEMO rules above and below together prevent.
    if (quote.dataMode === "LIVE" && /demo|fixture|mock/i.test(quote.provider)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A live quote must not be attributed to a demo provider",
        path: ["provider"],
      });
    }
    if (quote.dataMode === "DEMO" && quote.onchainSource !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Demo quotes must not claim onchain source provenance",
        path: ["onchainSource"],
      });
    }
    if (quote.onchainSource !== undefined) {
      // The quote's timestamp is the source's own update time. Allowing them
      // to disagree would let a stale answer be presented as fresh.
      if (quote.onchainSource.sourceUpdatedAt !== quote.timestamp) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Quote timestamp must equal onchainSource.sourceUpdatedAt; a quote is only as fresh as its source",
          path: ["timestamp"],
        });
      }
      if (
        Date.parse(quote.onchainSource.observedAt) <
        Date.parse(quote.onchainSource.sourceUpdatedAt)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A quote cannot be observed before its source wrote it",
          path: ["onchainSource", "observedAt"],
        });
      }
    }
    if (
      quote.bid !== undefined &&
      quote.ask !== undefined &&
      compareFixedDecimals(quote.bid, quote.ask) > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bid cannot exceed ask",
        path: ["bid"],
      });
    }
    if (quote.mid !== undefined && quote.bid !== undefined) {
      if (compareFixedDecimals(quote.mid, quote.bid) < 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mid cannot be below bid",
          path: ["mid"],
        });
      }
    }
    if (quote.mid !== undefined && quote.ask !== undefined) {
      if (compareFixedDecimals(quote.mid, quote.ask) > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mid cannot exceed ask",
          path: ["mid"],
        });
      }
    }
  },
);

const MarketSnapshotObjectSchema = z
  .object({
    version: z.literal(1),
    dataMode: DataModeSchema,
    capturedAt: IsoDateSchema,
    quotes: z
      .array(MarketQuoteSchema)
      .min(1)
      .superRefine((quotes, context) => {
        const seen = new Set<string>();
        quotes.forEach((quote, index) => {
          if (seen.has(quote.assetId)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate quote for ${quote.assetId}`,
              path: [index, "assetId"],
            });
          }
          seen.add(quote.assetId);
        });
      })
      .transform((quotes) =>
        [...quotes].sort((left, right) =>
          compareCodeUnits(left.assetId, right.assetId),
        ),
      ),
  })
  .strict();

export const MarketSnapshotSchema = MarketSnapshotObjectSchema.superRefine(
  (snapshot, context) => {
    const capturedAtMs = Date.parse(snapshot.capturedAt);
    snapshot.quotes.forEach((quote, index) => {
      if (quote.dataMode !== snapshot.dataMode) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Quote and snapshot data modes must match",
          path: ["quotes", index, "dataMode"],
        });
      }
      if (Date.parse(quote.timestamp) > capturedAtMs) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Quote timestamp cannot be after snapshot capture time",
          path: ["quotes", index, "timestamp"],
        });
      }
    });
  },
);

export type MarketStatus = z.infer<typeof MarketStatusSchema>;
export type MarketQuote = z.infer<typeof MarketQuoteSchema>;
export type MarketSnapshotInput = z.input<typeof MarketSnapshotSchema>;
export type MarketSnapshot = z.output<typeof MarketSnapshotSchema>;

export const MARKET_STATUS_CODE = {
  OPEN: 0,
  CLOSED: 1,
  HALTED: 2,
  UNKNOWN: 3,
} as const;

export const DATA_MODE_CODE = {
  DEMO: 0,
  SNAPSHOT: 1,
  LIVE: 2,
} as const;

export const MARKET_QUOTE_TYPE_STRING =
  "MarketQuote(string assetId,string price,uint64 timestamp,string provider,uint8 status,uint8 dataMode,string bid,string ask,string mid)";
export const MARKET_SNAPSHOT_TYPE_STRING =
  "MarketSnapshot(uint16 version,uint8 dataMode,uint64 capturedAt,bytes32 quotesHash)";
export const MARKET_QUOTE_TYPEHASH = keccak256(
  toBytes(MARKET_QUOTE_TYPE_STRING),
);
export const MARKET_SNAPSHOT_TYPEHASH = keccak256(
  toBytes(MARKET_SNAPSHOT_TYPE_STRING),
);

function timestampToUnixSeconds(timestamp: string): bigint {
  return BigInt(Math.floor(Date.parse(timestamp) / 1_000));
}

function hashQuote(quote: MarketQuote): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint64" },
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint8" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        MARKET_QUOTE_TYPEHASH,
        keccak256(toBytes(quote.assetId)),
        keccak256(toBytes(quote.price)),
        timestampToUnixSeconds(quote.timestamp),
        keccak256(toBytes(quote.provider)),
        MARKET_STATUS_CODE[quote.status],
        DATA_MODE_CODE[quote.dataMode],
        keccak256(toBytes(quote.bid ?? "")),
        keccak256(toBytes(quote.ask ?? "")),
        keccak256(toBytes(quote.mid ?? "")),
      ],
    ),
  );
}

export function hashMarketSnapshot(input: MarketSnapshotInput): Hex {
  const snapshot = MarketSnapshotSchema.parse(input);
  const quoteHashes = snapshot.quotes.map(hashQuote);
  const quotesHash = keccak256(
    quoteHashes.length === 0 ? "0x" : concat(quoteHashes),
  );
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint16" },
        { type: "uint8" },
        { type: "uint64" },
        { type: "bytes32" },
      ],
      [
        MARKET_SNAPSHOT_TYPEHASH,
        snapshot.version,
        DATA_MODE_CODE[snapshot.dataMode],
        timestampToUnixSeconds(snapshot.capturedAt),
        quotesHash,
      ],
    ),
  );
}
