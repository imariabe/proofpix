import { describe, expect, it } from "vitest";
import {
  assessOverall,
  buildMetadataCheck,
  buildValidationCheck,
  collectEvidence,
  type EvidenceItem,
} from "../checks";
import { validateUpload } from "../sniff";
import { encodePng, type DecodedImage } from "../decode";
import type { CheckResult } from "../types";

function solidPng(width: number, height: number): DecodedImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 120;
    data[i * 4 + 1] = 80;
    data[i * 4 + 2] = 60;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function makeResult(
  partial: Partial<CheckResult> & { type: CheckResult["type"] },
): CheckResult {
  return {
    name: partial.type,
    status: "clear",
    findings: [],
    measurements: [],
    explanation: "",
    limitations: "",
    completed: true,
    ...partial,
  };
}

describe("buildValidationCheck", () => {
  it("confirms a well-formed upload as a clear check", () => {
    const pngBytes = encodePng(solidPng(64, 48));
    const validation = validateUpload(pngBytes, "photo.png", pngBytes.length);
    const check = buildValidationCheck({
      validation,
      sizeBytes: pngBytes.length,
      fileName: "photo.png",
      dimensions: { width: 64, height: 48 },
    });

    expect(check.type).toBe("validation");
    expect(check.status).toBe("clear");
    expect(check.completed).toBe(true);
    expect(check.findings.join(" ")).toMatch(/PNG specification/);
    expect(check.findings.join(" ")).toMatch(/64 × 48/);
    expect(check.evidence).toContainEqual(
      expect.objectContaining({ kind: "confirmed", title: "Valid image container" }),
    );
    expect(check.limitations.length).toBeGreaterThan(0);
  });

  it("turns a content/extension mismatch into an error with warning evidence", () => {
    const pngBytes = encodePng(solidPng(8, 8));
    const validation = validateUpload(pngBytes, "trick.jpg", pngBytes.length);
    expect(validation.ok).toBe(false);

    const check = buildValidationCheck({
      validation,
      sizeBytes: pngBytes.length,
      fileName: "trick.jpg",
      dimensions: null,
    });

    expect(check.status).toBe("error");
    // A rejected file produces no completed reading (completed is only true
    // for clear/flag/inconclusive) — the report shows "unsupported" instead.
    expect(check.completed).toBe(false);
    expect(check.evidence.length).toBeGreaterThan(0);
    expect(check.evidence.every((e) => e.kind === "warning")).toBe(true);
    expect(check.explanation).toMatch(/failed content-based validation/);
  });
});

describe("buildMetadataCheck", () => {
  it("treats missing EXIF as inconclusive context, not a verdict", () => {
    const check = buildMetadataCheck({
      format: "png",
      exif: null,
      containerNotes: ["The PNG contains no eXIf chunk."],
    });

    expect(check.type).toBe("metadata");
    expect(check.status).toBe("inconclusive");
    expect(check.completed).toBe(true);
    expect(check.evidence).toContainEqual(
      expect.objectContaining({ kind: "context", title: "No embedded metadata" }),
    );
    expect(check.limitations).toMatch(/Missing metadata therefore says very little/i);
  });

  it("flags editing software as a warning while naming the innocent causes", () => {
    const check = buildMetadataCheck({
      format: "jpeg",
      exif: {
        software: "Adobe Photoshop 26.0",
        keyCount: 12,
        keys: ["Software", "DateTimeOriginal"],
        gpsPresent: false,
      },
      containerNotes: [],
    });

    expect(check.status).toBe("clear");
    expect(check.completed).toBe(true);
    const warning = check.evidence.find(
      (e) => e.kind === "warning" && /editing application/i.test(e.title),
    );
    expect(warning).toBeDefined();
    expect(warning?.detail).toMatch(/processing, not deception/);
    expect(
      check.evidence.some((e) => e.kind === "confirmed"),
    ).toBe(true);
  });
});

describe("assessOverall", () => {
  it("returns unsupported when validation itself errored", () => {
    expect(
      assessOverall([
        makeResult({ type: "validation", status: "error", completed: false }),
        makeResult({ type: "metadata", status: "clear" }),
      ]),
    ).toBe("unsupported");
  });

  it("returns incomplete when nothing ran", () => {
    expect(assessOverall([])).toBe("incomplete");
  });

  it("returns incomplete when any check failed technically", () => {
    expect(
      assessOverall([
        makeResult({ type: "validation", status: "clear" }),
        makeResult({ type: "structure", status: "error", completed: false }),
      ]),
    ).toBe("incomplete");
  });

  it("returns inconsistencies when a check flagged something", () => {
    expect(
      assessOverall([
        makeResult({ type: "validation", status: "clear" }),
        makeResult({ type: "consistency", status: "flag" }),
        makeResult({ type: "metadata", status: "inconclusive" }),
      ]),
    ).toBe("inconsistencies");
  });

  it("returns inconclusive when evidence exists but no reading is supported", () => {
    expect(
      assessOverall([
        makeResult({ type: "validation", status: "clear" }),
        makeResult({ type: "metadata", status: "inconclusive" }),
      ]),
    ).toBe("inconclusive");
  });

  it("returns no_anomaly only when at least two checks completed with a reading", () => {
    expect(
      assessOverall([
        makeResult({ type: "validation", status: "clear" }),
        makeResult({ type: "structure", status: "clear" }),
        makeResult({ type: "compression", status: "skipped", completed: false }),
      ]),
    ).toBe("no_anomaly");

    expect(
      assessOverall([makeResult({ type: "validation", status: "clear" })]),
    ).toBe("inconclusive");
  });
});

describe("collectEvidence", () => {
  it("merges every check's items and orders warning → confirmed → context", () => {
    const confirmed: EvidenceItem = {
      kind: "confirmed",
      title: "Valid image container",
      detail: "Signature correct.",
      source: "validation",
    };
    const warning: EvidenceItem = {
      kind: "warning",
      title: "Appended data after end-of-image",
      detail: "Bytes follow the EOI marker.",
      source: "structure",
    };
    const context: EvidenceItem = {
      kind: "context",
      title: "No embedded metadata",
      detail: "Normal for screenshots.",
      source: "metadata",
    };

    const items = collectEvidence([
      { ...makeResult({ type: "validation" }), evidence: [confirmed, context] },
      { ...makeResult({ type: "structure" }), evidence: [warning] },
      makeResult({ type: "metadata" }),
    ]);

    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind)).toEqual([
      "warning",
      "confirmed",
      "context",
    ]);
  });

  it("returns an empty list when no check recorded evidence", () => {
    expect(collectEvidence([makeResult({ type: "validation" })])).toEqual([]);
  });
});
