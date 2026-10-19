/**
 * Error Level Analysis.
 *
 * The file is decoded, recompressed at a fixed quality, decoded again, and the
 * per-pixel difference is amplified for display. Regions written by different
 * processes tend to react differently to a fresh compression step — that is
 * the lead this produces. It is a heuristic for guiding review, never proof of
 * alteration (see LIMITATION_NOTES.ela).
 */
import type { DecodedImage } from "./decode";
import jpegJs from "jpeg-js";

export const ELA_RECOMPRESS_QUALITY = 90;
export const ELA_AMPLIFICATION = 15;

export interface ElaStats {
  mean: number;
  p95: number;
  p99: number;
  p999: number;
  max: number;
  /** Percentage of pixels whose amplified difference exceeds 16 (0-255 scale). */
  hotPercent: number;
}

export interface ElaResult {
  image: DecodedImage;
  stats: ElaStats;
  method: string;
}

export function runEla(
  source: DecodedImage,
  options: { quality?: number; amplify?: number } = {},
): ElaResult {
  const quality = options.quality ?? ELA_RECOMPRESS_QUALITY;
  const amplify = options.amplify ?? ELA_AMPLIFICATION;

  const rgba = Buffer.from(source.data);
  const recompressed = jpegJs.encode(
    { width: source.width, height: source.height, data: rgba },
    quality,
  );
  const again = jpegJs.decode(recompressed.data, {
    useTArray: true,
    formatAsRGBA: true,
    maxMemoryUsageInMB: 1024,
  });

  const out = new Uint8Array(source.width * source.height * 4);
  const diffs = new Uint32Array(source.width * source.height);
  let sum = 0;
  let max = 0;
  let hot = 0;
  const pixelCount = source.width * source.height;

  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    const dR = Math.abs(source.data[base] - again.data[base]);
    const dG = Math.abs(source.data[base + 1] - again.data[base + 1]);
    const dB = Math.abs(source.data[base + 2] - again.data[base + 2]);
    const delta = Math.max(dR, dG, dB);
    diffs[i] = delta;
    sum += delta;
    if (delta > max) max = delta;
    const amplified = Math.min(255, delta * amplify);
    if (amplified > 16) hot++;
    out[base] = amplified;
    out[base + 1] = amplified;
    out[base + 2] = amplified;
    out[base + 3] = 255;
  }

  const sorted = Array.from(diffs).sort((a, b) => a - b);
  const pct = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

  const stats: ElaStats = {
    mean: round2(sum / Math.max(1, pixelCount)),
    p95: pct(0.95),
    p99: pct(0.99),
    p999: pct(0.999),
    max,
    hotPercent: round2((hot / Math.max(1, pixelCount)) * 100),
  };

  return {
    image: { width: source.width, height: source.height, data: out },
    stats,
    method: `Decode → recompress at JPEG quality ${quality} → amplified difference map (×${amplify}).`,
  };
}

/**
 * Divides the ELA map into a coarse grid and reports cells whose mean
 * amplified level is far above the image's own median cell. Returns measured
 * cell coordinates the report can overlay — explicitly labelled as areas that
 * respond differently to recompression, not as detected edits.
 */
export interface ElaHotspot {
  col: number;
  row: number;
  mean: number;
  percentileOfCells: number;
}

export function elaHotspots(
  statsImage: DecodedImage,
  grid = 4,
): { columnCount: number; rowCount: number; cells: ElaHotspot[]; cellular: boolean } {
  const { width, height, data } = statsImage;
  const columnCount = grid;
  const rowCount = grid;
  const cellW = Math.max(1, Math.floor(width / columnCount));
  const cellH = Math.max(1, Math.floor(height / rowCount));
  const cells: ElaHotspot[] = [];

  if (width < 64 || height < 64) {
    return { columnCount, rowCount, cells: [], cellular: false };
  }

  const means: number[] = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < columnCount; c++) {
      let sum = 0;
      let count = 0;
      for (let y = r * cellH; y < Math.min(height, (r + 1) * cellH); y += 2) {
        for (let x = c * cellW; x < Math.min(width, (c + 1) * cellW); x += 2) {
          sum += data[(y * width + x) * 4];
          count++;
        }
      }
      means.push(count ? sum / count : 0);
    }
  }

  const ranked = [...means].sort((a, b) => a - b);
  const median = ranked[Math.floor(ranked.length / 2)];
  const maxCell = ranked[ranked.length - 1];

  means.forEach((mean, index) => {
    // Only surface cells that clearly dominate the rest of their own image.
    if (
      maxCell > 0 &&
      median > 0 &&
      mean >= median * 2.5 &&
      mean >= maxCell * 0.4
    ) {
      cells.push({
        col: index % columnCount,
        row: Math.floor(index / columnCount),
        mean: round2(mean),
        percentileOfCells: round2(
          (ranked.filter((v) => v <= mean).length / ranked.length) * 100,
        ),
      });
    }
  });

  return { columnCount, rowCount, cells, cellular: true };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}