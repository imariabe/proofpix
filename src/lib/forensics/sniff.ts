/**
 * File-format identification from actual bytes.
 *
 * Extensions are attacker-controlled and are never trusted: the analysis
 * pipeline sniffs the magic number of the stored bytes and compares it with
 * what the filename claims.
 */

export type ImageFormat = "jpeg" | "png" | "webp";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB, enforced on client + server
export const MAX_DECODE_PIXELS = 16_000_000; // decode safety cap

function startsWith(bytes: Uint8Array, sig: number[], at = 0): boolean {
  if (bytes.length < at + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[at + i] !== sig[i]) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, from: number, length: number): string {
  if (bytes.length < from + length) return "";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[from + i]);
  }
  return out;
}

/** Detect the real container format from the file's magic number. */
export function detectFormat(bytes: Uint8Array): ImageFormat | "unknown" {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "png";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
  return "unknown";
}

/** Format implied by the file name, used only to report mismatches. */
export function extensionFormat(
  fileName: string,
): ImageFormat | "unknown" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpeg";
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".webp")) return "webp";
  return "unknown";
}

/** Reads little-endian / big-endian integers from a byte range. */
export function readUint16BE(bytes: Uint8Array, offset: number): number {
  if (bytes.length < offset + 2) return -1;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

export function readUint32BE(bytes: Uint8Array, offset: number): number {
  if (bytes.length < offset + 4) return -1;
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

export function readUint32LE(bytes: Uint8Array, offset: number): number {
  if (bytes.length < offset + 4) return -1;
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

export interface FileValidation {
  ok: boolean;
  actualFormat: ImageFormat | "unknown";
  claimedFormat: ImageFormat | "unknown";
  problems: string[];
  /** Formats we can compare byte-for-byte with. */
  analysisSupported: boolean;
}

/**
 * Base validation every upload passes through: Non-empty, under the size cap,
 * a recognisable image container, and consistent with the file name.
 */
export function validateUpload(
  bytes: Uint8Array,
  fileName: string,
  sizeBytes: number,
): FileValidation {
  const actualFormat = detectFormat(bytes);
  const claimedFormat = extensionFormat(fileName);
  const problems: string[] = [];

  if (sizeBytes <= 0 || bytes.length === 0) {
    problems.push("The file is empty.");
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    problems.push(
      `The file is larger than the ${Math.round(
        MAX_UPLOAD_BYTES / (1024 * 1024),
      )} MB limit.`,
    );
  }
  if (actualFormat === "unknown") {
    problems.push(
      "The file contents are not a JPEG, PNG, or WebP image. The extension alone is not accepted as proof of the format.",
    );
  }
  if (
    claimedFormat !== "unknown" &&
    actualFormat !== "unknown" &&
    claimedFormat !== actualFormat
  ) {
    problems.push(
      `The file extension claims ${claimedFormat.toUpperCase()} but the contents are ${actualFormat.toUpperCase()}.`,
    );
  }

  return {
    ok: problems.length === 0,
    actualFormat,
    claimedFormat,
    problems,
    analysisSupported: actualFormat !== "unknown",
  };
}