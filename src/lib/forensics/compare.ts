/**
 * Two-image pixel comparison.
 *
 * Both inputs are decoded, resampled onto a common canvas of
 * min(width) × min(height) with nearest-neighbour sampling when their
 * dimensions differ, and then differenced channel by channel. All reported
 * numbers are computed from decoded pixels.
 */
import { decodeImage, DecodeFailure, type DecodedImage } from "./decode";

export interface ComparisonMetrics {
  /** Mean absolute difference across all channels, 0-255 scale. */
  mae: number;
  rmse: number;
  psnrDb: number | null; // null when images are pixel-identical
  identical: boolean;
  /** Pixels where the largest channel difference exceeds 8. */
  changedOver8Percent: number;
  /** Pixels where the largest channel difference exceeds 24. */
  changedOver24Percent: number;
  maxChannelDiff: number;
  targetWidth: number;
  targetHeight: number;
  resampled: boolean;
}

export interface ComparisonResult {
  aWidth: number;
  aHeight: number;
  bWidth: number;
  bHeight: number;
  aspectRatioDelta: number; // relative difference between aspect ratios
  metrics: ComparisonMetrics;
  diffImage: DecodedImage;
  method: string;
}

/** Nearest-neighbour resample onto the target canvas. */
function resample(image: DecodedImage, targetW: number, targetH: number): Uint8Array {
  const out = new Uint8Array(targetW * targetH * 4);
  for (let y = 0; y < targetH; y++) {
    const srcY = Math.min(image.height - 1, Math.floor((y * image.height) / targetH));
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.min(image.width - 1, Math.floor((x * image.width) / targetW));
      const src = (srcY * image.width + srcX) * 4;
      const dst = (y * targetW + x) * 4;
      out[dst] = image.data[src];
      out[dst + 1] = image.data[src + 1];
      out[dst + 2] = image.data[src + 2];
      out[dst + 3] = 255;
    }
  }
  return out;
}

export function compareImages(
  a: DecodedImage,
  b: DecodedImage,
  options: { amplify?: number } = {},
): ComparisonResult {
  const amplify = options.amplify ?? 8;
  const targetW = Math.min(a.width, b.width);
  const targetH = Math.min(a.height, b.height);
  const resampled =
    a.width !== targetW || a.height !== targetH || b.width !== targetW || b.height !== targetH;

  const pixA = resample(a, targetW, targetH);
  const pixB = resample(b, targetW, targetH);
  const diff = new Uint8Array(targetW * targetH * 4);

  const pixelCount = targetW * targetH;
  let sumAbs = 0;
  let sumSq = 0;
  let count8 = 0;
  let count24 = 0;
  let maxChannel = 0;

  for (let i = 0; i < pixelCount; i++) {
    const p = i * 4;
    let pixelMax = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(pixA[p + c] - pixB[p + c]);
      sumAbs += d;
      sumSq += d * d;
      if (d > pixelMax) pixelMax = d;
    }
    if (pixelMax > maxChannel) maxChannel = pixelMax;
    if (pixelMax > 8) count8++;
    if (pixelMax > 24) count24++;

    const amplified = Math.min(255, pixelMax * amplify);
    diff[p] = amplified;
    diff[p + 1] = amplified;
    diff[p + 2] = amplified;
    diff[p + 3] = 255;
  }

  const mae = sumAbs / (pixelCount * 3);
  const mse = sumSq / (pixelCount * 3);
  const rmse = Math.sqrt(mse);
  const psnr = rmse === 0 ? null : 20 * Math.log10(255 / rmse);
  const aspectA = a.width / a.height;
  const aspectB = b.width / b.height;

  return {
    aWidth: a.width,
    aHeight: a.height,
    bWidth: b.width,
    bHeight: b.height,
    aspectRatioDelta:
      Math.abs(aspectA - aspectB) / Math.max(aspectA, aspectB),
    metrics: {
      mae: round2(mae),
      rmse: round2(rmse),
      psnrDb: psnr === null ? null : round2(psnr),
      identical: mse === 0,
      changedOver8Percent: round2((count8 / pixelCount) * 100),
      changedOver24Percent: round2((count24 / pixelCount) * 100),
      maxChannelDiff: maxChannel,
      targetWidth: targetW,
      targetHeight: targetH,
      resampled,
    },
    diffImage: { width: targetW, height: targetH, data: diff },
    method: `Both files decoded, nearest-neighbour resampled to ${targetW}×${targetH}, per-channel difference ${amplify}× amplified for display.`,
  };
}

/** Decode both sides with format-aware errors. */
export function compareBuffers(
  bytesA: Uint8Array,
  formatA: "jpeg" | "png",
  bytesB: Uint8Array,
  formatB: "jpeg" | "png",
  options?: { amplify?: number },
): ComparisonResult {
  const a = decodeImage(bytesA, formatA);
  const b = decodeImage(bytesB, formatB);
  return compareImages(a, b, options);
}

export { DecodeFailure };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}