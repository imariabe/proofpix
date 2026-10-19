import { describe, expect, it } from "vitest";
import { compareImages } from "../compare";
import { buildPixelDiffCheck } from "../checks";
import type { DecodedImage } from "../decode";

function solidImage(
  width: number,
  height: number,
  [r, g, b]: [number, number, number],
): DecodedImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function diffBrightnessTotal(image: DecodedImage): number {
  let sum = 0;
  for (let i = 0; i < image.width * image.height; i++) {
    sum += image.data[i * 4];
  }
  return sum;
}

describe("compareImages", () => {
  it("measures pixel-identical files as identical with a zeroed diff", () => {
    const a = solidImage(64, 64, [200, 100, 50]);
    const b = solidImage(64, 64, [200, 100, 50]);
    const result = compareImages(a, b);

    expect(result.metrics.identical).toBe(true);
    expect(result.metrics.mae).toBe(0);
    expect(result.metrics.rmse).toBe(0);
    expect(result.metrics.psnrDb).toBeNull();
    expect(result.metrics.changedOver8Percent).toBe(0);
    expect(result.metrics.changedOver24Percent).toBe(0);
    expect(result.metrics.maxChannelDiff).toBe(0);
    expect(result.metrics.targetWidth).toBe(64);
    expect(result.metrics.targetHeight).toBe(64);
    expect(result.metrics.resampled).toBe(false);

    expect(result.diffImage.width).toBe(64);
    expect(result.diffImage.height).toBe(64);
    expect(diffBrightnessTotal(result.diffImage)).toBe(0);
  });

  it("measures clearly different content with full change coverage", () => {
    const a = solidImage(64, 64, [200, 100, 50]);
    const b = solidImage(64, 64, [10, 20, 220]);
    const result = compareImages(a, b);

    expect(result.metrics.identical).toBe(false);
    expect(result.metrics.mae).toBeGreaterThan(100);
    expect(result.metrics.changedOver8Percent).toBe(100);
    expect(result.metrics.changedOver24Percent).toBe(100);
    expect(result.metrics.maxChannelDiff).toBeGreaterThanOrEqual(150);
    expect(result.metrics.psnrDb).toBeGreaterThan(0);
    expect(diffBrightnessTotal(result.diffImage)).toBeGreaterThan(0);
  });

  it("resamples both sides onto the smaller common canvas", () => {
    const a = solidImage(64, 48, [200, 100, 50]);
    const b = solidImage(32, 24, [10, 20, 220]);
    const result = compareImages(a, b);

    expect(result.metrics.targetWidth).toBe(32);
    expect(result.metrics.targetHeight).toBe(24);
    expect(result.metrics.resampled).toBe(true);
    expect(result.diffImage.width).toBe(32);
    expect(result.aWidth).toBe(64);
    expect(result.bWidth).toBe(32);
    expect(result.aspectRatioDelta).toBeCloseTo(0, 5);
  });
});

describe("buildPixelDiffCheck", () => {
  it("turns measured metrics into a completed check with explicit limits", () => {
    const a = solidImage(32, 32, [200, 100, 50]);
    const b = solidImage(32, 32, [10, 20, 220]);
    const result = compareImages(a, b);

    const check = buildPixelDiffCheck({
      metrics: result.metrics,
      method: result.method,
      formatA: "png",
      formatB: "png",
      nameA: "a.png",
      nameB: "b.png",
    });

    expect(check.type).toBe("pixelDiff");
    expect(check.completed).toBe(true);
    expect(check.status).toBe("flag");
    expect(check.measurements.length).toBeGreaterThan(0);
    expect(check.limitations).toMatch(/Pixel comparison/i);
    expect(check.evidence.length).toBeGreaterThan(0);
    expect(
      check.evidence.every((e) => e.source === "pixelDiff"),
    ).toBe(true);
  });
});
