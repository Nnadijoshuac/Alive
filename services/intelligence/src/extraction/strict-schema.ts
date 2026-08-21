import { AssetClassSchema } from "@alive/shared";

/**
 * Groq's strict structured-output mode (response_format: json_schema,
 * strict: true) guarantees 100% schema adherence via constrained decoding,
 * but requires every property to be `required` -- there is no "optional
 * key" concept in strict mode, only a nullable value. That is actually a
 * good fit for ALIVE's own rule ("prefer UNKNOWN over a guess"): every fact
 * is a required-but-nullable slot, paired with a required (possibly empty)
 * sourceIds array. This file only defines the wire shape used for that one
 * strict request/response; `strictResponseToCandidate` converts it back to
 * the same candidate shape the non-strict prompt path already produces, so
 * `validateExtractedFacts` is the single validation boundary either way.
 */

const SCALAR_FACT_FIELDS = [
  "productName",
  "assetClass",
  "issuerName",
  "underlying",
  "jurisdiction",
  "eligibleInvestors",
  "custody",
  "documentEffectiveDate",
  "redemptionSupported",
  "redemptionFrequency",
  "redemptionSettlementPeriod",
  "redemptionMinimum",
  "managementFeeBps",
  "redemptionFeeBps",
  "marketHoursType",
] as const;
type ScalarFactField = (typeof SCALAR_FACT_FIELDS)[number];

/** Maps onto RwaRedemptionSchema.minimum (z.number().nonnegative()) -- any
 * non-negative number, not necessarily an integer. */
const GENERIC_NUMBER_FIELDS = new Set<ScalarFactField>(["redemptionMinimum"]);
/** Maps onto BasisPointsSchema (z.number().int().min(0).max(10_000)) --
 * requesting an integer with bounds up front reduces (not replaces) the
 * chance Groq emits a value the Zod schema will reject. */
const BPS_FIELDS = new Set<ScalarFactField>(["managementFeeBps", "redemptionFeeBps"]);

function scalarValueSchema(field: ScalarFactField): Record<string, unknown> {
  if (BPS_FIELDS.has(field)) {
    return { type: ["integer", "null"], minimum: 0, maximum: 10_000 };
  }
  if (GENERIC_NUMBER_FIELDS.has(field)) return { type: ["number", "null"] };
  if (field === "assetClass") {
    return { type: ["string", "null"], enum: [...AssetClassSchema.options, null] };
  }
  if (field === "redemptionSupported") {
    return { type: ["string", "null"], enum: ["true", "false", "unknown", null] };
  }
  if (field === "marketHoursType") {
    return {
      type: ["string", "null"],
      enum: ["ALWAYS_OPEN", "TRADITIONAL_MARKET", "ISSUER_DEFINED", null],
    };
  }
  return { type: ["string", "null"] };
}

export const PASSPORT_EXTRACTION_SCHEMA_NAME = "alive_passport_extraction";

/**
 * Every fact is `{value, sourceIds}`, both required. `value: null` +
 * `sourceIds: []` is how the model represents "not supported by the
 * sources" under strict mode -- the JSON-schema equivalent of omitting the
 * field in the non-strict prompt path.
 */
export function buildStrictExtractionJsonSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    // Wrapped exactly like every scalar fact below (value/sourceIds), rather
    // than as two standalone top-level keys -- an earlier asymmetric shape
    // (a bare "restrictions" array alongside a separate "restrictionsSourceIds"
    // key) measurably confused the model into mixing the two conventions.
    restrictions: {
      type: "object",
      additionalProperties: false,
      required: ["value", "sourceIds"],
      properties: {
        value: { type: ["array", "null"], items: { type: "string" } },
        sourceIds: { type: "array", items: { type: "string" } },
      },
    },
  };
  for (const field of SCALAR_FACT_FIELDS) {
    properties[field] = {
      type: "object",
      additionalProperties: false,
      required: ["value", "sourceIds"],
      properties: {
        value: scalarValueSchema(field),
        sourceIds: { type: "array", items: { type: "string" } },
      },
    };
  }
  return {
    type: "object",
    additionalProperties: false,
    required: [...SCALAR_FACT_FIELDS, "restrictions"],
    properties,
  };
}

type StrictWireResponse = Record<string, unknown>;

function scalar(
  wire: StrictWireResponse,
  field: ScalarFactField,
): { value: unknown; sourceIds: string[] } | undefined {
  const entry = wire[field];
  if (!entry || typeof entry !== "object") return undefined;
  const value = (entry as Record<string, unknown>).value;
  const sourceIdsRaw = (entry as Record<string, unknown>).sourceIds;
  const sourceIds = Array.isArray(sourceIdsRaw)
    ? sourceIdsRaw.filter((id): id is string => typeof id === "string")
    : [];
  if (value === null || value === undefined) return undefined;
  return { value, sourceIds };
}

/**
 * IsoDateSchema (`@alive/shared`) requires a full ISO 8601 datetime with an
 * offset (e.g. "2026-08-17T00:00:00Z"), but a document's own "effective
 * date" is naturally expressed as a bare calendar date. Normalizes a bare
 * date to midnight UTC; leaves an already-full datetime as-is; anything
 * else is treated as unparseable and the field is dropped -- UNKNOWN, per
 * ALIVE's own rule, rather than a guessed or malformed value reaching Zod.
 */
function normalizeIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) return `${trimmed}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/u.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

/**
 * Reassembles the flat, strict-mode wire response into the same candidate
 * shape (`{productName?, redemption?, fees?, ..., citations}`) the
 * non-strict prompt path produces, so both paths converge on one
 * `validateExtractedFacts` call.
 */
export function strictResponseToCandidate(wire: unknown): unknown {
  if (!wire || typeof wire !== "object") return wire;
  const w = wire as StrictWireResponse;
  const candidate: Record<string, unknown> = {};
  const citations: Record<string, string[]> = {};

  const direct: Array<[ScalarFactField, string]> = [
    ["productName", "productName"],
    ["assetClass", "assetClass"],
    ["issuerName", "issuerName"],
    ["underlying", "underlying"],
    ["jurisdiction", "jurisdiction"],
    ["eligibleInvestors", "eligibleInvestors"],
    ["custody", "custody"],
  ];
  for (const [wireField, candidateField] of direct) {
    const fact = scalar(w, wireField);
    if (fact) {
      candidate[candidateField] = fact.value;
      citations[candidateField] = fact.sourceIds;
    }
  }

  const documentEffectiveDate = scalar(w, "documentEffectiveDate");
  if (documentEffectiveDate) {
    const normalized = normalizeIsoDate(documentEffectiveDate.value);
    if (normalized) {
      candidate.documentEffectiveDate = normalized;
      citations.documentEffectiveDate = documentEffectiveDate.sourceIds;
    }
    // Unparseable -> silently omitted (UNKNOWN), never handed to Zod as a
    // guess dressed up as a real date.
  }

  const supported = scalar(w, "redemptionSupported");
  const frequency = scalar(w, "redemptionFrequency");
  const settlementPeriod = scalar(w, "redemptionSettlementPeriod");
  const minimum = scalar(w, "redemptionMinimum");
  if (supported) {
    // RwaRedemptionSchema.supported is boolean | "unknown" -- the wire value
    // is always one of the literal strings "true"/"false"/"unknown" (see
    // scalarValueSchema's enum for this field), never a JSON boolean, so it
    // must be converted here rather than passed through as a string.
    const supportedValue =
      supported.value === "true" ? true : supported.value === "false" ? false : "unknown";
    const redemption: Record<string, unknown> = { supported: supportedValue };
    if (frequency) redemption.frequency = frequency.value;
    if (settlementPeriod) redemption.settlementPeriod = settlementPeriod.value;
    if (minimum) redemption.minimum = minimum.value;
    candidate.redemption = redemption;
    citations.redemption = [
      ...new Set([
        ...supported.sourceIds,
        ...(frequency?.sourceIds ?? []),
        ...(settlementPeriod?.sourceIds ?? []),
        ...(minimum?.sourceIds ?? []),
      ]),
    ];
  }

  const managementFeeBps = scalar(w, "managementFeeBps");
  const redemptionFeeBps = scalar(w, "redemptionFeeBps");
  if (managementFeeBps || redemptionFeeBps) {
    const fees: Record<string, unknown> = {};
    if (managementFeeBps) fees.managementFeeBps = managementFeeBps.value;
    if (redemptionFeeBps) fees.redemptionFeeBps = redemptionFeeBps.value;
    candidate.fees = fees;
    citations.fees = [
      ...new Set([
        ...(managementFeeBps?.sourceIds ?? []),
        ...(redemptionFeeBps?.sourceIds ?? []),
      ]),
    ];
  }

  const marketHoursType = scalar(w, "marketHoursType");
  if (marketHoursType) {
    candidate.marketHours = { type: marketHoursType.value };
    citations.marketHours = marketHoursType.sourceIds;
  }

  const restrictionsEntry = w.restrictions;
  if (restrictionsEntry && typeof restrictionsEntry === "object") {
    const value = (restrictionsEntry as Record<string, unknown>).value;
    const sourceIdsRaw = (restrictionsEntry as Record<string, unknown>).sourceIds;
    if (Array.isArray(value) && value.length > 0) {
      candidate.restrictions = value.filter(
        (item): item is string => typeof item === "string",
      );
      citations.restrictions = Array.isArray(sourceIdsRaw)
        ? sourceIdsRaw.filter((id): id is string => typeof id === "string")
        : [];
    }
  }

  candidate.citations = citations;
  return candidate;
}
