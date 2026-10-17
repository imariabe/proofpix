/**
 * Structural WebP (RIFF container) parser.
 *
 * Reports the chunk inventory, the coding method (lossy VP8, lossless
 * VP8L, extended VP8X), canvas dimensions, alpha/animation flags, and
 * embedded EXIF/ICC/XMP blocks.
 */

export interface RiffChunk {
  id: string;
  offset: number;
  size: number;
}

export interface WebpInfo {
  chunks: RiffChunk[];
  variant: "VP8" | "VP8L" | "VP8X" | null;
  lossy: boolean;
  lossless: boolean;
  width: number | null;
  height: number | null;
  hasAlpha: boolean;
  animated: boolean;
  hasExif: boolean;
  hasXmp: boolean;
  hasIccProfile: boolean;
  trailingBytes: number;
  error: string | null;
}

function ascii(bytes: Uint8Array, from: number, length: number): string {
  let out = "";
  for (let i = 0; i < length && from + i < bytes.length; i++) {
    out += String.fromCharCode(bytes[from + i]);
  }
  return out;
}

function u32le(bytes: Uint8Array, offset: number): number {
  if (bytes.length < offset + 4) return -1;
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

export function parseWebp(bytes: Uint8Array): WebpInfo {
  const info: WebpInfo = {
    chunks: [],
    variant: null,
    lossy: false,
    lossless: false,
    width: null,
    height: null,
    hasAlpha: false,
    animated: false,
    hasExif: false,
    hasXmp: false,
    hasIccProfile: false,
    trailingBytes: 0,
    error: null,
  };

  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    info.error = "The file is not a RIFF/WEBP container.";
    return info;
  }
  const riffSize = u32le(bytes, 4);
  if (riffSize > bytes.length) {
    info.error = "The RIFF header declares a size larger than the file.";
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = u32le(bytes, offset + 4);
    if (size < 0 || offset + 8 + size > bytes.length) {
      info.error = info.error ?? `Chunk ${id} runs past the end of the file.`;
      break;
    }
    info.chunks.push({ id, offset, size });
    const dataStart = offset + 8;

    if (id === "VP8 ") {
      info.variant = info.variant ?? "VP8";
      info.lossy = true;
      // frame tag (3 bytes) + 3-byte sync code; then 14-bit dimensions
      if (size >= 10 && bytes[dataStart + 3] === 0x9d && bytes[dataStart + 4] === 0x01 && bytes[dataStart + 5] === 0x2a) {
        info.width =
          (bytes[dataStart + 6] | (bytes[dataStart + 7] << 8)) & 0x3fff;
        info.height =
          (bytes[dataStart + 8] | (bytes[dataStart + 9] << 8)) & 0x3fff;
      }
    } else if (id === "VP8L") {
      info.variant = info.variant ?? "VP8L";
      info.lossless = true;
      if (size >= 5 && bytes[dataStart] === 0x2f) {
        const bits =
          bytes[dataStart + 1] |
          (bytes[dataStart + 2] << 8) |
          (bytes[dataStart + 3] << 16) |
          (bytes[dataStart + 4] << 24);
        info.width = (bits & 0x3fff) + 1;
        info.height = ((bits >> 14) & 0x3fff) + 1;
        info.hasAlpha = ((bits >> 28) & 0x01) === 1;
      }
    } else if (id === "VP8X") {
      info.variant = "VP8X";
      if (size >= 10) {
        const flags = bytes[dataStart];
        info.hasAlpha = (flags & 0x10) !== 0;
        info.animated = (flags & 0x02) !== 0;
        const w = u32le(bytes, dataStart + 4);
        const h = u32le(bytes, dataStart + 7);
        info.width = (w & 0xffffff) + 1;
        info.height = (h & 0xffffff) + 1;
      }
    } else if (id === "ALPH") {
      info.hasAlpha = true;
    } else if (id === "ANIM" || id === "ANMF") {
      info.animated = true;
    } else if (id === "EXIF") {
      info.hasExif = true;
    } else if (id === "XMP ") {
      info.hasXmp = true;
    } else if (id === "ICCP") {
      info.hasIccProfile = true;
    }

    // Chunks are padded to even sizes
    offset = dataStart + size + (size % 2);
  }

  if (offset < bytes.length) {
    info.trailingBytes = bytes.length - offset;
  }
  if (!info.variant && !info.error) {
    info.error = "No VP8/VP8L image chunk was found in the container.";
  }
  return info;
}