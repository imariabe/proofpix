/**
 * Pixel decoding/encoding used by ELA, consistency checks, and comparison.
 *
 * Pure-JS decoders (jpeg-js, pngjs) keep the analysis pipeline free of native
 * binaries and give us explicit, testable failure modes.
 */
import jpegJs from "jpeg-js";
import { PNG } from "pngjs";
import { MAX_DECODE_PIXELS, type ImageFormat } from "./sniff";

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

export class DecodeFailure extends Error {
  readonly reason: string;
  constructor(message: string) {
    super(message);
    this.name = "DecodeFailure";
    this.reason = message;
  }
}

/** Header-level dimension probe that avoids decoding every pixel. */
export function peekDimensions(
  bytes: Uint8Array,
  format: ImageFormat,
): { width: number; height: number } | null {
  try {
    if (format === "jpeg") {
      // SOF0..SOF15 except DHT(RxC4), JPG(RxC8), DAC(RxCC)
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = bytes[offset + 1];
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
          offset += 2;
          continue;
        }
        const length =
          (bytes[offset + 2] << 8) | bytes[offset + 3];
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
          const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
          return { width, height };
        }
        if (length <= 0) break;
        offset += 2 + length;
      }
      return null;
    }
    if (format === "png") {
      return (
        {
          width: readU32(bytes, 16),
          height: readU32(bytes, 20),
        } satisfies { width: number; height: number }
      );
    }
    return null; // WebP dimensions are handled in the container parser
  } catch {
    return null;
  }
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (bytes.length < offset + 4) return -1;
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/** Decode an image buffer to RGBA, with an explicit pixel budget. */
export function decodeImage(
  bytes: Uint8Array,
  format: ImageFormat,
): DecodedImage {
  const peeked = peekDimensions(bytes, format);
  if (peeked && peeked.width * peeked.height > MAX_DECODE_PIXELS) {
    throw new DecodeFailure(
      `Image is ${peeked.width}×${peeked.height} (${(
        (peeked.width * peeked.height) /
        1_000_000
      ).toFixed(1)} megapixels), above the ${MAX_DECODE_PIXELS / 1_000_000} megapixel limit for pixel-level processing.`,
    );
  }

  try {
    if (format === "jpeg") {
      const frame = jpegJs.decode(bytes, {
        useTArray: true,
        formatAsRGBA: true,
        maxMemoryUsageInMB: 1024,
      });
      if (!frame.width || !frame.height) {
        throw new DecodeFailure("The JPEG frame header declares no pixels.");
      }
      return { width: frame.width, height: frame.height, data: frame.data };
    }
    if (format === "png") {
      const png = PNG.sync.read(Buffer.from(bytes), {
        skipRescale: false,
      });
      return { width: png.width, height: png.height, data: png.data };
    }
    throw new DecodeFailure(
      "Pixel-level decoding for WebP is not available in this pipeline.",
    );
  } catch (error) {
    if (error instanceof DecodeFailure) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new DecodeFailure(`The image could not be decoded: ${message}`);
  }
}

/** Encode RGBA pixels as PNG for artifacts. */
export function encodePng(image: DecodedImage): Uint8Array {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return PNG.sync.write(png);
}