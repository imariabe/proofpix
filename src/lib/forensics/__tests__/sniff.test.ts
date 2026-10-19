import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  detectFormat,
  extensionFormat,
  validateUpload,
} from "../sniff";

const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** Minimal RIFF/WEBP container with a 10-byte VP8 payload (64×48 frame). */
function webpContainer(): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([22, 0, 0, 0], 4); // riff size = total - 8
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  bytes.set([10, 0, 0, 0], 16); // chunk size
  bytes.set([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 64, 0, 48, 0], 20);
  return bytes;
}

describe("detectFormat", () => {
  it("identifies JPEG by its magic number", () => {
    expect(detectFormat(JPEG_MAGIC)).toBe("jpeg");
  });

  it("identifies PNG by its magic number", () => {
    expect(detectFormat(PNG_MAGIC)).toBe("png");
  });

  it("identifies WebP by RIFF/WEBP positions", () => {
    expect(detectFormat(webpContainer())).toBe("webp");
  });

  it("rejects content that is not a supported image", () => {
    const text = new TextEncoder().encode("<html>hello</html>");
    expect(detectFormat(text)).toBe("unknown");
  });

  it("does not trust a RIFF header with the wrong form type", () => {
    const wav = new Uint8Array(16);
    wav.set([0x52, 0x49, 0x46, 0x46], 0);
    wav.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
    expect(detectFormat(wav)).toBe("unknown");
  });
});

describe("extensionFormat", () => {
  it("maps common extensions, case-insensitively", () => {
    expect(extensionFormat("photo.jpg")).toBe("jpeg");
    expect(extensionFormat("PHOTO.JPEG")).toBe("jpeg");
    expect(extensionFormat("shot.png")).toBe("png");
    expect(extensionFormat("graphic.WebP")).toBe("webp");
    expect(extensionFormat("notes.pdf")).toBe("unknown");
  });
});

describe("validateUpload", () => {
  it("accepts a file whose bytes match its extension", () => {
    const result = validateUpload(PNG_MAGIC, "photo.png", PNG_MAGIC.length);
    expect(result.ok).toBe(true);
    expect(result.actualFormat).toBe("png");
    expect(result.claimedFormat).toBe("png");
    expect(result.analysisSupported).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("rejects an extension that disagrees with the contents", () => {
    const result = validateUpload(PNG_MAGIC, "trick.jpg", PNG_MAGIC.length);
    expect(result.ok).toBe(false);
    expect(result.actualFormat).toBe("png");
    expect(result.claimedFormat).toBe("jpeg");
    expect(result.problems.join(" ")).toMatch(/claims JPEG but the contents are PNG/);
  });

  it("rejects non-image content regardless of its name", () => {
    const text = new TextEncoder().encode("definitely not an image");
    const result = validateUpload(text, "image.png", text.length);
    expect(result.ok).toBe(false);
    expect(result.analysisSupported).toBe(false);
    expect(result.problems.join(" ")).toMatch(/not a JPEG, PNG, or WebP/);
  });

  it("rejects empty files", () => {
    const result = validateUpload(new Uint8Array(0), "empty.png", 0);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/empty/);
  });

  it("rejects files above the size limit", () => {
    const result = validateUpload(
      PNG_MAGIC,
      "huge.png",
      MAX_UPLOAD_BYTES + 1,
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/larger than the .* MB limit/);
  });
});
