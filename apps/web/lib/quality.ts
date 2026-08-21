import type { CaptureQuality } from "./types";

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function assessFrameQuality(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): CaptureQuality {
  if (width < 3 || height < 3 || rgba.length < width * height * 4) {
    throw new Error("Frame dimensions do not match the supplied pixel data.");
  }

  const gray = new Float32Array(width * height);
  let brightnessTotal = 0;
  let clipped = 0;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const luminance =
      (rgba[offset] ?? 0) * 0.2126 +
      (rgba[offset + 1] ?? 0) * 0.7152 +
      (rgba[offset + 2] ?? 0) * 0.0722;
    gray[pixel] = luminance;
    brightnessTotal += luminance;
    if (luminance < 10 || luminance > 245) clipped += 1;
  }

  const brightness = brightnessTotal / (width * height);
  const clippedRatio = clipped / (width * height);
  let laplacianTotal = 0;
  let laplacianSquaredTotal = 0;
  let laplacianSamples = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const laplacian =
        (gray[index - 1] ?? 0) +
        (gray[index + 1] ?? 0) +
        (gray[index - width] ?? 0) +
        (gray[index + width] ?? 0) -
        4 * (gray[index] ?? 0);
      laplacianTotal += laplacian;
      laplacianSquaredTotal += laplacian * laplacian;
      laplacianSamples += 1;
    }
  }

  const laplacianMean = laplacianTotal / Math.max(1, laplacianSamples);
  const variance =
    laplacianSquaredTotal / Math.max(1, laplacianSamples) -
    laplacianMean * laplacianMean;
  const blurScore = clamp(variance / 1_200);
  const midpointPenalty = Math.abs(brightness - 128) / 128;
  const exposureScore = clamp(1 - midpointPenalty * 0.72 - clippedRatio * 1.6);

  return {
    blurScore,
    exposureScore,
    brightness,
    clippedRatio,
    usable: blurScore >= 0.18 && exposureScore >= 0.42,
    width,
    height,
  };
}

export function qualityLabel(quality: CaptureQuality): string {
  if (!quality.usable && quality.blurScore < 0.18)
    return "Hold steady and refocus";
  if (!quality.usable && quality.brightness < 54) return "Add more light";
  if (!quality.usable && quality.brightness > 210) return "Reduce direct light";
  if (!quality.usable) return "Reframe and capture again";
  return "Frame quality accepted";
}
