import { describe, expect, it } from "vitest";
import { elaHotspots, runEla, ELA_RECOMPRESS_QUALITY } from "../ela";
import { buildCompressionCheck } from "../checks";
import type { DecodedImage } from "../decode";

function gradientImage(size: number): DecodedImage {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = (x + y) % 256;
      data[i] = v;
      data[i + 1] = (v + 40) % 256;
      data[i + 2] = (v + 80) % 256;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/**
 * A synthetic "ELA stats" image: uniform low background with one clearly
 * hotter grid cell — elaHotspots reads only the R channel per cell.
 */
function statsImageWithHotCell(
  size: number,
  hotValue: number,
): DecodedImage {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 4;
    data[i * 4 + 3] = 255;
  }
  const cell = size / 4;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      data[(y * size + x) * 4] = hotValue;
    }
  }
  return { width: size, height: size, data };
}

describe("runEla", () => {
  it("produces an amplified difference map with self-consistent stats", () => {
    const source = gradientImage(96);
    const ela = runEla(source);

    expect(ela.image.width).toBe(96);
    expect(ela.image.height).toBe(96);
    expect(ela.image.data).toHaveLength(96 * 96 * 4);

    const { stats } = ela;
    expect(stats.max).toBeGreaterThanOrEqual(stats.mean);
    expect(stats.p95).toBeLessThanOrEqual(stats.p99);
    expect(stats.p99).toBeLessThanOrEqual(stats.p999);
    expect(stats.p999).toBeLessThanOrEqual(stats.max);
    expect(stats.hotPercent).toBeGreaterThanOrEqual(0);
    expect(stats.hotPercent).toBeLessThanOrEqual(100);
    expect(stats.mean).toBeGreaterThanOrEqual(0);

    expect(ela.method).toContain(`quality ${ELA_RECOMPRESS_QUALITY}`);
    // Output pixels are opaque greyscale.
    expect(ela.image.data[3]).toBe(255);
    expect(ela.image.data[0]).toBe(ela.image.data[1]);
  });
});

describe("elaHotspots", () => {
  it("reports only the cell that clearly dominates its own image", () => {
    const hot = statsImageWithHotCell(128, 100);
    const result = elaHotspots(hot, 4);

    expect(result.columnCount).toBe(4);
    expect(result.rowCount).toBe(4);
    expect(result.cellular).toBe(true);
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0]).toMatchObject({ col: 0, row: 0, mean: 100 });
    expect(result.cells[0].percentileOfCells).toBeGreaterThan(50);
  });

  it("stays quiet when no cell stands clearly above the median", () => {
    //2× the background is below the 2.5× dominance threshold.
    const mild = statsImageWithHotCell(128, 8);
    const result = elaHotspots(mild, 4);
    expect(result.cells).toHaveLength(0);
    expect(result.cellular).toBe(true);
  });

  it("does not run on images too small to grid", () => {
    const tiny = statsImageWithHotCell(32, 100);
    const result = elaHotspots(tiny, 4);
    expect(result.cellular).toBe(false);
    expect(result.cells).toHaveLength(0);
  });
});

describe("buildCompressionCheck", () => {
  it("records ELA statistics as a completed JPEG check", () => {
    const check = buildCompressionCheck({
      format: "jpeg",
      stats: { mean: 1.4, p95: 5, p99: 9, p999: 14, max: 42, hotPercent: 0.6 },
      method: "Decode → recompress at JPEG quality 90 → amplified difference map (×15).",
      hotspotCells: [{ col: 2, row: 1, mean: 18.5, percentileOfCells: 100 }],
      grid: { columns: 4, rows: 4 },
    });

    expect(check.type).toBe("compression");
    expect(check.completed).toBe(true);
    expect(check.status === "flag" || check.status === "clear" || check.status === "inconclusive").toBe(true);
    expect(check.measurements.length).toBeGreaterThan(0);
    expect(check.findings.join(" ")).toMatch(/region/i);
    expect(check.limitations).toMatch(/heuristic|proof/i);
    expect(check.evidence.length).toBeGreaterThan(0);
  });

  it("marks the check not-applicable instead of faking a result", () => {
    const check = buildCompressionCheck({
      format: "png",
      skipReason: "Error Level Analysis is defined for JPEG inputs.",
    });
    expect(check.status).toBe("skipped");
    expect(check.completed).toBe(false);
    expect(check.findings.join(" ")).toMatch(/JPEG inputs/);
    expect(check.limitations.length).toBeGreaterThan(0);
  });
});
