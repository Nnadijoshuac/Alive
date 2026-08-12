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

  it("quantizes SVG values so Node and browser hydration serialize identically", () => {
    const points = fingerprintPoints(
      "0x714cc16ae18881c9ae606e988b4b87380572d8daee7c5d9a198cd16d06101211",
      58,
    );
    expect(points[18]?.y).toBe(84.39022);
    expect(
      points.every((point) =>
        [point.x, point.y, point.radius, point.opacity].every(
          (value) => value === Number(value.toFixed(6)),
        ),
      ),
    ).toBe(true);
  });

  it("only links valid point indexes", () => {
    const points = fingerprintPoints("asset-proof", 24);
    expect(
      fingerprintLinks(points).every(
        ([left, right]) => left < points.length && right < points.length,
      ),
    ).toBe(true);
  });
});
