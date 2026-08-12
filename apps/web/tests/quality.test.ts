import { describe, expect, it } from "vitest";
import { assessFrameQuality } from "@/lib/quality";

function frame(
  width: number,
  height: number,
  value: (x: number, y: number) => number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const channel = value(x, y);
      pixels[offset] = channel;
      pixels[offset + 1] = channel;
      pixels[offset + 2] = channel;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

describe("capture quality", () => {
  it("rejects a flat frame as unfocused", () => {
    const result = assessFrameQuality(
      frame(12, 12, () => 128),
      12,
      12,
    );
    expect(result.blurScore).toBe(0);
    expect(result.usable).toBe(false);
  });

  it("detects detail in a balanced checkerboard", () => {
    const result = assessFrameQuality(
      frame(12, 12, (x, y) => ((x + y) % 2 ? 72 : 184)),
      12,
      12,
    );
    expect(result.blurScore).toBeGreaterThan(0.8);
    expect(result.exposureScore).toBeGreaterThan(0.8);
    expect(result.usable).toBe(true);
  });

  it("rejects mismatched image dimensions", () => {
    expect(() => assessFrameQuality(new Uint8ClampedArray(4), 8, 8)).toThrow(
      /dimensions/,
    );
  });
});
