import { describe, expect, it } from "vitest";
import { normalizeOcrText, normalizedIdentifierSimilarity } from "../src/vision/ocr.js";

describe("OCR normalization", () => {
  it("normalizes punctuation, case, Unicode width, and common separator noise", () => {
    expect(normalizeOcrText("  serial｜no: mbp-2026/ABC_42  ")).toEqual([
      "SERIAL",
      "NO",
      "MBP",
      "2026",
      "ABC",
      "42",
    ]);
  });

  it("provides fuzzy identifier similarity without treating empty text as a match", () => {
    expect(normalizedIdentifierSimilarity("MBP-2026-ABC42", ["MBP", "2026", "ABC42"])).toBe(1);
    expect(normalizedIdentifierSimilarity("MBP-2026-ABC42", ["MBP", "2026", "ABC4Z"])).toBeGreaterThan(0.9);
    expect(normalizedIdentifierSimilarity("MBP-2026-ABC42", [])).toBe(0);
  });
});
