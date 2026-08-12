import { keccak256, toBytes, type Hex } from "viem";

function serialize(value: unknown, path: string): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError(`Non-finite number at ${path}`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => serialize(entry, `${path}[${index}]`)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Only plain objects are canonicalizable at ${path}`);
    }
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => {
        if (entry === undefined)
          throw new TypeError(`Undefined value at ${path}.${key}`);
        return `${JSON.stringify(key)}:${serialize(entry, `${path}.${key}`)}`;
      })
      .join(",")}}`;
  }
  throw new TypeError(`Unsupported canonical value at ${path}`);
}

/** Stable JSON: sorted object keys, preserved array order, and no ambiguous values. */
export function canonicalJson(value: unknown): string {
  return serialize(value, "$");
}

export function hashCanonical(value: unknown): Hex {
  return keccak256(toBytes(canonicalJson(value)));
}

export function hashEvidenceBytes(bytes: Uint8Array): Hex {
  return keccak256(bytes);
}

export function createEvidenceCommitment(value: unknown): Hex {
  return hashCanonical({ commitmentVersion: 1, value });
}
