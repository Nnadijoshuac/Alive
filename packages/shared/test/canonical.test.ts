import { describe, expect, it } from "vitest";
import { canonicalJson, createEvidenceCommitment } from "../src/index.js";

describe("canonical JSON", () => {
  it("sorts nested object keys while preserving array order", () => {
    const left = { z: 1, nested: { beta: true, alpha: "a" }, list: [3, 2, 1] };
    const right = { list: [3, 2, 1], nested: { alpha: "a", beta: true }, z: 1 };

    expect(canonicalJson(left)).toBe(
      '{"list":[3,2,1],"nested":{"alpha":"a","beta":true},"z":1}',
    );
    expect(createEvidenceCommitment(left)).toBe(
      createEvidenceCommitment(right),
    );
    expect(createEvidenceCommitment({ ...right, list: [1, 2, 3] })).not.toBe(
      createEvidenceCommitment(left),
    );
  });

  it("rejects ambiguous JSON values", () => {
    expect(() => canonicalJson({ omitted: undefined })).toThrow(/Undefined/);
    expect(() => canonicalJson({ invalid: Number.NaN })).toThrow(/Non-finite/);
    expect(() => canonicalJson(new Date())).toThrow(/plain objects/);
  });
});
