import { describe, expect, it } from "vitest";
import jpegJs from "jpeg-js";
import { detectFormat } from "../sniff";
import {
  DecodeFailure,
  decodeImage,
  encodePng,
  peekDimensions,
  type DecodedImage,
} from "../decode";
import { parseJpeg } from "../jpeg";
import { parsePng } from "../png";
import { parseWebp } from "../webp";

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

/** Minimal RIFF/WEBP container with a valid VP8 frame header (64×48). */
function webpContainer(): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([22, 0, 0, 0], 4);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x20], 12);
  bytes.set([10, 0, 0, 0], 16);
  bytes.set([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 64, 0, 48, 0], 20);
  return bytes;
}

/** PNG header claiming enormous dimensions (IHDR only, enough to probe). */
function oversizedPngHeader(): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 30000); // width
  view.setUint32(20, 30000); // height
  bytes.set([8, 6, 0, 0, 0], 24); // bit depth, colour type, methods
  return bytes;
}

describe("PNG pipeline", () => {
  it("encodes, sniffs, probes, parses, and decodes losslessly", () => {
    const source = solidImage(64, 48, [200, 100, 50]);
    const pngBytes = encodePng(source);

    expect(detectFormat(pngBytes)).toBe("png");
    expect(peekDimensions(pngBytes, "png")).toEqual({ width: 64, height: 48 });

    const info = parsePng(pngBytes);
    expect(info.hasExif).toBe(false);
    expect(Array.isArray(info.textEntries)).toBe(true);

    const decoded = decodeImage(pngBytes, "png");
    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(48);
    // PNG is lossless: the solid colour must round-trip exactly.
    expect([decoded.data[0], decoded.data[1], decoded.data[2]]).toEqual([
      200, 100, 50,
    ]);
    expect(decoded.data[(24 * 64 + 32) * 4]).toBe(200);
  });

  it("refuses to decode above the pixel budget", () => {
    const header = oversizedPngHeader();
    expect(() => decodeImage(header, "png")).toThrow(DecodeFailure);
    expect(() => decodeImage(header, "png")).toThrow(/megapixel limit/);
  });
});

describe("JPEG pipeline", () => {
  it("encodes, sniffs, probes, parses structurally, and decodes", () => {
    const source = solidImage(64, 48, [200, 100, 50]);
    const encoded = jpegJs.encode(
      { width: 64, height: 48, data: Buffer.from(source.data) },
      85,
    );
    const jpegBytes = new Uint8Array(encoded.data);

    expect(detectFormat(jpegBytes)).toBe("jpeg");
    expect(peekDimensions(jpegBytes, "jpeg")).toEqual({
      width: 64,
      height: 48,
    });

    const info = parseJpeg(jpegBytes);
    expect(info.width).toBe(64);
    expect(info.height).toBe(48);
    expect(info.precision).toBe(8);
    expect(info.components.length).toBeGreaterThan(0);
    expect(info.progressive).toBe(false);
    expect(info.segments.length).toBeGreaterThan(0);
    expect(info.estimatedQuality).toBeGreaterThan(0);
    expect(info.estimatedQuality).toBeLessThanOrEqual(100);

    const decoded = decodeImage(jpegBytes, "jpeg");
    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(48);
    // Lossy: close to the original solid colour at a centre pixel.
    const centre = decoded.data[(24 * 64 + 32) * 4];
    expect(Math.abs(centre - 200)).toBeLessThanOrEqual(12);
  });
});

describe("WebP pipeline", () => {
  it("sniffs and parses the container inventory and frame size", () => {
    const bytes = webpContainer();
    expect(detectFormat(bytes)).toBe("webp");

    const info = parseWebp(bytes);
    expect(info.error).toBeNull();
    expect(info.variant).toBe("VP8");
    expect(info.lossy).toBe(true);
    expect(info.lossless).toBe(false);
    expect(info.width).toBe(64);
    expect(info.height).toBe(48);
    expect(info.chunks).toHaveLength(1);
    expect(info.chunks[0].id).toBe("VP8 ");
    expect(info.trailingBytes).toBe(0);
    expect(info.hasExif).toBe(false);
    expect(info.animated).toBe(false);
  });

  it("reports clearly that WebP has no pixel decoder here", () => {
    expect(() => decodeImage(webpContainer(), "webp")).toThrow(
      /not available/i,
    );
  });

  it("flags a container without an image chunk", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([16, 0, 0, 0], 4);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    bytes.set([0x45, 0x58, 0x49, 0x46], 12); // "EXIF" chunk only
    bytes.set([0, 0, 0, 0], 16);
    const info = parseWebp(bytes);
    expect(info.hasExif).toBe(true);
    expect(info.variant).toBeNull();
    expect(info.error).toMatch(/No VP8\/VP8L image chunk/);
  });
});
