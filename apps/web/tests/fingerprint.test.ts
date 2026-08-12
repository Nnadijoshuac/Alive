import { describe, expect, it } from "vitest";
import { fingerprintLinks, fingerprintPoints } from "@/lib/fingerprint";

describe("deterministic fingerprint", () => {
  it("returns stable points for the same commitment", () => {
    const hash = `0x${"a4".repeat(32)}`;
    expect(fingerprintPoints(hash)).toEqual(fingerprintPoints(hash));
  });

  it("changes the constellation when the commitment changes", () => {
    expect(fingerprintPoints(`0x${"11".repeat(32)}`)).not.toEqual(
      fingerprintPoints(`0x${"12".repeat(32)}`),
    );
  });

  it("only links valid point indexes", () => {
    const points = fingerprintPoints("asset-proof", 24);
    expect(fingerprintLinks(points).every(([left, right]) => left < points.length && right < points.length)).toBe(true);
  });
});
