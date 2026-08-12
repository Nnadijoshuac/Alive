import sharp from "sharp";
import { hashEvidenceBytes, type CaptureQuality, type RegistrationView, type ViewFingerprint } from "@alive/shared";
import { extractNeuralEmbedding } from "./neural.js";
import { extractOcrText } from "./ocr.js";
import { clamp01, normalizeVector } from "./math.js";

export interface FeatureOptions {
  view: RegistrationView;
  capturedAt: string;
  enableOcr: boolean;
  enableNeuralEmbedding: boolean;
  neuralModel: string;
}

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

async function decode(image: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(image, { failOn: "error" })
    .rotate()
    .removeAlpha()
    .resize(192, 192, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels < 3) throw new Error("Decoded capture does not have RGB channels");
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function luminance(raw: RawImage): Float32Array {
  const result = new Float32Array(raw.width * raw.height);
  for (let pixel = 0; pixel < result.length; pixel += 1) {
    const offset = pixel * raw.channels;
    result[pixel] =
      0.2126 * (raw.data[offset] ?? 0) +
      0.7152 * (raw.data[offset + 1] ?? 0) +
      0.0722 * (raw.data[offset + 2] ?? 0);
  }
  return result;
}

function qualityMetrics(raw: RawImage, gray: Float32Array): CaptureQuality {
  let laplacianSum = 0;
  let laplacianSquares = 0;
  let samples = 0;
  let clipped = 0;
  let brightness = 0;
  for (const value of gray) {
    brightness += value;
    if (value < 8 || value > 247) clipped += 1;
  }
  for (let y = 1; y < raw.height - 1; y += 1) {
    for (let x = 1; x < raw.width - 1; x += 1) {
      const index = y * raw.width + x;
      const value =
        (gray[index - raw.width] ?? 0) +
        (gray[index + raw.width] ?? 0) +
        (gray[index - 1] ?? 0) +
        (gray[index + 1] ?? 0) -
        4 * (gray[index] ?? 0);
      laplacianSum += value;
      laplacianSquares += value * value;
      samples += 1;
    }
  }
  const laplacianMean = samples === 0 ? 0 : laplacianSum / samples;
  const variance = samples === 0 ? 0 : laplacianSquares / samples - laplacianMean * laplacianMean;
  const blurScore = clamp01(Math.log1p(Math.max(0, variance)) / Math.log(1 + 2_500));
  const meanBrightness = gray.length === 0 ? 0 : brightness / gray.length;
  const centerExposure = 1 - Math.abs(meanBrightness - 127.5) / 127.5;
  const exposureScore = clamp01(centerExposure * (1 - clipped / Math.max(1, gray.length)));
  return {
    blurScore,
    exposureScore,
    usable: blurScore >= 0.12 && exposureScore >= 0.12,
    width: raw.width,
    height: raw.height,
  };
}

function spatialColorEmbedding(raw: RawImage): number[] {
  const grid = 4;
  const bins = 8;
  const histogram = new Array<number>(grid * grid * 3 * bins).fill(0);
  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const cellX = Math.min(grid - 1, Math.floor((x * grid) / raw.width));
      const cellY = Math.min(grid - 1, Math.floor((y * grid) / raw.height));
      const cell = cellY * grid + cellX;
      const pixel = (y * raw.width + x) * raw.channels;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = raw.data[pixel + channel] ?? 0;
        const bin = Math.min(bins - 1, Math.floor((value * bins) / 256));
        const index = (cell * 3 + channel) * bins + bin;
        histogram[index] = (histogram[index] ?? 0) + 1;
      }
    }
  }
  return normalizeVector(histogram);
}

function gradientDescriptor(raw: RawImage, gray: Float32Array): number[] {
  const grid = 6;
  const orientationBins = 8;
  const histogram = new Array<number>(grid * grid * orientationBins).fill(0);
  for (let y = 1; y < raw.height - 1; y += 1) {
    for (let x = 1; x < raw.width - 1; x += 1) {
      const index = y * raw.width + x;
      const dx = (gray[index + 1] ?? 0) - (gray[index - 1] ?? 0);
      const dy = (gray[index + raw.width] ?? 0) - (gray[index - raw.width] ?? 0);
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
      const orientation = Math.min(orientationBins - 1, Math.floor(angle * orientationBins));
      const cellX = Math.min(grid - 1, Math.floor((x * grid) / raw.width));
      const cellY = Math.min(grid - 1, Math.floor((y * grid) / raw.height));
      const descriptorIndex = (cellY * grid + cellX) * orientationBins + orientation;
      histogram[descriptorIndex] = (histogram[descriptorIndex] ?? 0) + magnitude;
    }
  }
  return normalizeVector(histogram);
}

async function perceptualHash(image: Buffer): Promise<string> {
  const pixels = await sharp(image, { failOn: "error" })
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: "fill", kernel: sharp.kernel.cubic })
    .raw()
    .toBuffer();
  let value = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = pixels[y * 9 + x] ?? 0;
      const right = pixels[y * 9 + x + 1] ?? 0;
      value = (value << 1n) | (left > right ? 1n : 0n);
    }
  }
  return value.toString(16).padStart(16, "0");
}

export async function extractViewFingerprint(image: Buffer, options: FeatureOptions): Promise<ViewFingerprint> {
  const [raw, hash, ocrText, neuralEmbedding] = await Promise.all([
    decode(image),
    perceptualHash(image),
    extractOcrText(image, options.enableOcr),
    extractNeuralEmbedding(image, {
      enabled: options.enableNeuralEmbedding,
      model: options.neuralModel,
    }),
  ]);
  const gray = luminance(raw);
  return {
    view: options.view,
    evidenceHash: hashEvidenceBytes(image),
    spatialColorEmbedding: spatialColorEmbedding(raw),
    gradientDescriptor: gradientDescriptor(raw, gray),
    ...(neuralEmbedding === undefined ? {} : { neuralEmbedding }),
    perceptualHash: hash,
    quality: qualityMetrics(raw, gray),
    ocrText,
    capturedAt: options.capturedAt,
  };
}
