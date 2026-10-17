/**
 * Structural PNG chunk parser: signature, chunk walk with CRC verification
 * when the runtime provides one, text/profile chunks, resolution and gamma
 * chunks, and animated-PNG detection.
 */
import * as zlib from "node:zlib";

export interface PngChunk {
  type: string;
  offset: number;
  length: number;
  crcOk: boolean | null;
}

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  chunks: PngChunk[];
  chunkCounts: Record<string, number>;
  ihdrFirst: boolean;
  hasIdat: boolean;
  hasIend: boolean;
  crcFailures: string[];
  orderProblems: string[];
  dpiX: number | null;
  dpiY: number | null;
  gamma: number | null;
  hasIccProfile: boolean;
  hasExif: boolean;
  hasXmp: boolean;
  animated: boolean;
  textEntries: { key: string; value: string }[];
  softwareHints: string[];
  error: string | null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const crc32 =
  typeof (zlib as unknown as { crc32?: (data: Uint8Array) => number }).crc32 ===
  "function"
    ? (zlib as unknown as { crc32: (data: Uint8Array) => number }).crc32
    : null;

function hasSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
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

function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function nulSplit(text: string): { key: string; rest: string } | null {
  const idx = text.indexOf("\0");
  if (idx < 0) return null;
  return { key: text.slice(0, idx), rest: text.slice(idx + 1) };
}

export function parsePng(bytes: Uint8Array): PngInfo {
  const info: PngInfo = {
    width: -1,
    height: -1,
    bitDepth: -1,
    colorType: -1,
    interlace: -1,
    chunks: [],
    chunkCounts: {},
    ihdrFirst: false,
    hasIdat: false,
    hasIend: false,
    crcFailures: [],
    orderProblems: [],
    dpiX: null,
    dpiY: null,
    gamma: null,
    hasIccProfile: false,
    hasExif: false,
    hasXmp: false,
    animated: false,
    textEntries: [],
    softwareHints: [],
    error: null,
  };

  if (!hasSignature(bytes)) {
    info.error = "The PNG signature is missing or damaged.";
    return info;
  }

  let offset = 8;
  let index = 0;
  const seenTypes: string[] = [];

  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    if (length < 0 || length > bytes.length) {
      info.error = `Chunk at byte ${offset} declares an invalid length.`;
      break;
    }
    const type = latin1(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      info.error = `Chunk ${type} at byte ${offset} runs past the end of the file.`;
      break;
    }
    const data = bytes.subarray(dataStart, dataEnd);

    let crcOk: boolean | null = null;
    if (crc32) {
      const crcExpected = readU32(bytes, dataEnd);
      const crcActual = crc32(bytes.subarray(offset + 4, dataEnd)) >>> 0;
      crcOk = crcExpected === crcActual;
      if (!crcOk) info.crcFailures.push(type);
    }

    info.chunks.push({ type, offset, length, crcOk });
    info.chunkCounts[type] = (info.chunkCounts[type] ?? 0) + 1;

    if (index === 0 && type !== "IHDR") {
      info.orderProblems.push("The first chunk is not IHDR.");
    }
    if (type !== "IHDR" && index === 0) info.ihdrFirst = true;
    if (index === 0 && type === "IHDR") info.ihdrFirst = true;
    if (seenTypes.includes(type) && type !== "IDAT") {
      info.orderProblems.push(`Chunk ${type} appears more than once.`);
    }
    seenTypes.push(type);

    switch (type) {
      case "IHDR": {
        if (length >= 13) {
          info.width = readU32(data, 0);
          info.height = readU32(data, 4);
          info.bitDepth = data[8];
          info.colorType = data[9];
          info.interlace = data[12];
        }
        break;
      }
      case "pHYs": {
        if (length >= 9) {
          const ppu = readU32(data, 0);
          const ppuY = readU32(data, 4);
          const unit = data[8];
          if (unit === 1) {
            info.dpiX = Math.round(ppu * 0.0254);
            info.dpiY = Math.round(ppuY * 0.0254);
          } else {
            info.dpiX = ppu;
            info.dpiY = ppuY;
          }
        }
        break;
      }
      case "gAMA": {
        if (length >= 4) info.gamma = readU32(data, 0) / 100000;
        break;
      }
      case "iCCP": {
        info.hasIccProfile = true;
        const parsed = nulSplit(latin1(data));
        if (parsed) info.softwareHints.push("iCCP profile: " + parsed.key.slice(0, 80));
        break;
      }
      case "eXIf":
        info.hasExif = true;
        break;
      case "tEXt": {
        const parsed = nulSplit(latin1(data));
        if (parsed) {
          info.textEntries.push({ key: parsed.key, value: parsed.rest.slice(0, 300) });
        }
        break;
      }
      case "zTXt": {
        try {
          const parsed = nulSplit(latin1(data));
          if (parsed) {
            // rest = compression method byte + deflate data
            const compressed = data.subarray(
              data.length - parsed.rest.length + 1,
            );
            const text = zlib.inflateSync(compressed).toString("latin1");
            info.textEntries.push({ key: parsed.key, value: text.slice(0, 300) });
          }
        } catch {
          info.orderProblems.push("A compressed text chunk could not be decompressed.");
        }
        break;
      }
      case "iTXt": {
        try {
          const keywordEnd = data.indexOf(0);
          if (keywordEnd > 0) {
            const key = latin1(data.subarray(0, keywordEnd));
            const compFlag = data[keywordEnd + 1];
            let langEnd = keywordEnd + 3;
            while (langEnd < data.length && data[langEnd] !== 0) langEnd++;
            let transEnd = langEnd + 1;
            while (transEnd < data.length && data[transEnd] !== 0) transEnd++;
            let textBytes = data.subarray(transEnd + 1);
            if (compFlag === 1) textBytes = zlib.inflateSync(textBytes);
            const text = Buffer.from(textBytes).toString("latin1");
            info.textEntries.push({ key, value: text.slice(0, 300) });
            if (key === "XML:com.adobe.xmp") info.hasXmp = true;
          }
        } catch {
          info.orderProblems.push("An international text chunk could not be read.");
        }
        break;
      }
      case "acTL":
        info.animated = true;
        break;
      case "IDAT":
        info.hasIdat = true;
        break;
      case "IEND":
        info.hasIend = true;
        break;
      default:
        break;
    }

    if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
    index++;
  }

  if (!info.hasIdat) info.orderProblems.push("No image data chunk (IDAT) was found.");
  if (!info.hasIend) info.orderProblems.push("The file ends without an IEND chunk.");

  const softwareKeys = ["Software", "Creation Time", "Author", "Comment"];
  for (const entry of info.textEntries) {
    if (softwareKeys.includes(entry.key) && entry.value) {
      info.softwareHints.push(`${entry.key}: ${entry.value.slice(0, 120)}`);
    }
  }
  info.softwareHints = [...new Set(info.softwareHints)];

  return info;
}