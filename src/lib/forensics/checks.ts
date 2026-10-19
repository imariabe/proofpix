/**
 * Check builders and overall assessment.
 *
 * Everything here is pure: parsers feed raw bytes in, these builders turn
 * measured facts into CheckResults with findings, evidence items for the
 * Evidence Breakdown panel, explanations, and explicit limitations. No
 * builder may assert manipulation — only that a measurement was taken.
 */
import type {
  Assessment,
  CheckResult,
  CheckType,
  Measurement,
} from "./types";
import { LIMITATION_NOTES } from "./types";
import type { FileValidation } from "./sniff";
import type { JpegInfo } from "./jpeg";
import type { PngInfo } from "./png";
import type { WebpInfo } from "./webp";
import type { ElaStats } from "./ela";
import type { ComparisonMetrics } from "./compare";

/* ------------------------------------------------------------------ */
/* Evidence items (Evidence Breakdown panel)                           */
/* ------------------------------------------------------------------ */

/**
 * - confirmed: a fact read directly from the file (what the bytes say).
 * - warning:   a heuristic signal that warrants corroboration, not a verdict.
 * - context:   neutral information needed to interpret the rest.
 */
export type EvidenceKind = "confirmed" | "warning" | "context";

export interface EvidenceItem {
  kind: EvidenceKind;
  title: string;
  detail: string;
  source: CheckType;
  measurement?: string;
}

/* ------------------------------------------------------------------ */
/* EXIF summary                                                        */
/* ------------------------------------------------------------------ */

export interface ExifSummary {
  make?: string;
  model?: string;
  software?: string;
  lens?: string;
  dateTimeOriginal?: string;
  modifyDate?: string;
  createDate?: string;
  orientation?: string;
  width?: number;
  height?: number;
  colorSpace?: string;
  gpsPresent: boolean;
  keyCount: number;
  keys: string[];
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString().replace(".000Z", "Z");
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "bigint") return Number(value);
  return undefined;
}

/** Normalise the raw EXIF object exifr returns into a stable summary. */
export function summarizeExif(
  raw: Record<string, unknown> | undefined | null,
): ExifSummary | null {
  if (!raw) return null;
  const keys = Object.keys(raw).filter((k) => raw[k] !== undefined);
  if (keys.length === 0) return null;

  const upper = new Map(keys.map((k) => [k.toUpperCase(), raw[k]]));
  const pick = (name: string) => asString(upper.get(name));

  const gpsPresent =
    upper.has("GPSLATITUDE") ||
    upper.has("GPSLONGITUDE") ||
    keys.some((k) => k.toUpperCase().startsWith("GPS"));

  const orientationRaw = pick("ORIENTATION");
  const orientationLabel = (() => {
    const num = asNumber(upper.get("ORIENTATION"));
    if (num === undefined) return undefined;
    const labels: Record<number, string> = {
      1: "1 — normal",
      2: "2 — mirrored",
      3: "3 — rotated 180°",
      4: "4 — mirrored, rotated 180°",
      5: "5 — rotated 90° CW, mirrored",
      6: "6 — rotated 90° CW",
      7: "7 — rotated 90° CCW, mirrored",
      8: "8 — rotated 90° CCW",
    };
    return labels[num] ?? `${num}`;
  })();

  const summary: ExifSummary = {
    gpsPresent,
    keyCount: keys.length,
    keys: keys.slice(0, 60),
  };
  const make = pick("MAKE");
  const model = pick("MODEL");
  const software = pick("SOFTWARE");
  const lens = pick("LENSMODEL") ?? pick("LENS");
  const dto = pick("DATETIMEORIGINAL") ?? pick("CREATEDATE");
  const createDate = pick("CREATEDATE") ?? pick("DATETIME");
  const modify = pick("DATETIMEMODIFY") ?? pick("MODIFYDATE");
  const width =
    asNumber(upper.get("EXIFIMAGEWIDTH")) ??
    asNumber(upper.get("PIXELXDIMENSION"));
  const height =
    asNumber(upper.get("EXIFIMAGEHEIGHT")) ??
    asNumber(upper.get("PIXELYDIMENSION"));

  if (make) summary.make = make;
  if (model) summary.model = model;
  if (software) summary.software = software;
  if (lens) summary.lens = lens;
  if (dto) summary.dateTimeOriginal = dto;
  if (createDate && createDate !== dto) summary.createDate = createDate;
  if (modify) summary.modifyDate = modify;
  if (orientationLabel ?? orientationRaw) summary.orientation = orientationLabel ?? orientationRaw;
  if (width !== undefined && width > 0) summary.width = width;
  if (height !== undefined && height > 0) summary.height = height;
  const colorSpace = upper.get("COLORSPACE");
  summary.colorSpace = asString(
    typeof colorSpace === "number" && colorSpace === 1
      ? "sRGB"
      : colorSpace,
  );
  return summary;
}

/**
 * Parse an EXIF timestamp. Fields arrive either culture-parsed (Date → ISO via
 * asString) or in the raw EXIF form "2024:05:04 10:11:12".
 */
function parseExifTime(value: string): number {
  const normalised = value
    .trim()
    .replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3")
    .replace(" ", "T");
  const parsed = Date.parse(normalised);
  if (!Number.isNaN(parsed)) return parsed;
  return Date.parse(value);
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function check(
  type: CheckType,
  name: string,
  status: CheckResult["status"],
  input: {
    findings: string[];
    measurements: Measurement[];
    explanation: string;
    limitations: string;
    evidence?: EvidenceItem[];
  },
): CheckResult & { evidence: EvidenceItem[] } {
  const completed = status === "clear" || status === "flag" || status === "inconclusive";
  return {
    type,
    name,
    status,
    completed,
    findings: input.findings,
    measurements: input.measurements,
    explanation: input.explanation,
    limitations: input.limitations,
    evidence: input.evidence ?? [],
  };
}

export function buildValidationCheck(input: {
  validation: FileValidation;
  sizeBytes: number;
  fileName: string;
  dimensions: { width: number; height: number } | null;
}): CheckResult & { evidence: EvidenceItem[] } {
  const { validation } = input;
  const evidence: EvidenceItem[] = [];
  const findings: string[] = [];
  const measurements: Measurement[] = [
    { label: "File name", value: input.fileName },
    { label: "File size", value: formatBytes(input.sizeBytes) },
    {
      label: "Detected format",
      value: validation.actualFormat.toUpperCase(),
    },
    ...(input.dimensions
      ? [
          {
            label: "Dimensions",
            value: `${input.dimensions.width} × ${input.dimensions.height} px`,
          },
        ]
      : []),
  ];

  if (!validation.ok) {
    for (const problem of validation.problems) {
      findings.push(problem);
      evidence.push({
        kind: "warning",
        title: "File rejected during validation",
        detail: problem,
        source: "validation",
      });
    }
    return check("validation", "File validation", "error", {
      findings,
      measurements,
      explanation:
        "The file's bytes were inspected directly and the upload failed content-based validation, so no further checks were run.",
      limitations:
        "Validation only determines whether the file is a supported, readable image. It is not an authenticity judgement.",
      evidence,
    });
  }

  findings.push(
    `File contents match the ${validation.actualFormat.toUpperCase()} specification (confirmed by magic number, not by the file extension).`,
  );
  if (validation.claimedFormat === validation.actualFormat) {
    findings.push("The file extension agrees with the actual format.");
  }
  if (input.dimensions) {
    findings.push(
      `The header declares ${input.dimensions.width} × ${input.dimensions.height} pixels.`,
    );
    evidence.push({
      kind: "confirmed",
      title: "Valid image container",
      detail:
        "The file starts with a correct signature for its format and parses without structural rejection.",
      source: "validation",
      measurement: `${input.dimensions.width}×${input.dimensions.height} ${validation.actualFormat.toUpperCase()}`,
    });
  }

  return check("validation", "File validation", "clear", {
    findings,
    measurements,
    explanation:
      "Every upload is checked against its own bytes: signature, structure, and header-declared dimensions. Files whose extension disagrees with their contents are rejected.",
    limitations:
      "Passing validation only means the file is a readable, supported image. It says nothing about where the image came from or whether it has been edited.",
    evidence,
  });
}

export function buildMetadataCheck(input: {
  format: string;
  exif: ExifSummary | null;
  containerNotes: string[];
  jpeg?: JpegInfo;
  png?: PngInfo;
  webp?: WebpInfo;
}): CheckResult & { evidence: EvidenceItem[] } {
  const { exif } = input;
  const evidence: EvidenceItem[] = [];
  const findings: string[] = [...input.containerNotes];
  const measurements: Measurement[] = [
    { label: "Container", value: input.format.toUpperCase() },
  ];

  if (!exif) {
    findings.push("No EXIF block was found in this file.");
    evidence.push({
      kind: "context",
      title: "No embedded metadata",
      detail:
        "Messaging apps, social platforms, screenshots, and most re-saving workflows strip EXIF completely, so its absence is normal rather than suspicious.",
      source: "metadata",
    });
    return check("metadata", "Metadata inspection", "inconclusive", {
      findings,
      measurements,
      explanation:
        "No embedded EXIF metadata survived in this file. There is therefore no camera, software, or timestamp metadata to corroborate or contradict. Many platforms remove metadata during upload, download, sharing, or recompression — and screenshots never contain any.",
      limitations: LIMITATION_NOTES.noMetadata,
      evidence,
    });
  }

  const rows: [string, string | number | undefined][] = [
    ["Camera make", exif.make],
    ["Camera model", exif.model],
    ["Software", exif.software],
    ["Lens", exif.lens],
    ["Date taken", exif.dateTimeOriginal],
    ["Created", exif.createDate],
    ["Last modified", exif.modifyDate],
    ["Orientation", exif.orientation],
    ["EXIF image width", exif.width],
    ["EXIF image height", exif.height],
    ["Colour space", exif.colorSpace],
    ["GPS data present", exif.gpsPresent ? "Yes" : "No"],
  ];
  for (const [label, value] of rows) {
    if (value !== undefined && value !== "") {
      measurements.push({ label, value: String(value) });
      findings.push(`${label}: ${value}.`);
    }
  }
  measurements.push({ label: "EXIF fields read", value: String(exif.keyCount) });

  evidence.push({
    kind: "confirmed",
    title: "Embedded camera/software metadata present",
    detail: exif.make
      ? `The EXIF block records ${[exif.make, exif.model].filter(Boolean).join(" ")}${
          exif.dateTimeOriginal ? ` and a capture time of ${exif.dateTimeOriginal}` : ""
        }.`
      : `The file carries ${exif.keyCount} readable EXIF fields including software and time information.`,
    source: "metadata",
    measurement: `${exif.keyCount} fields`,
  });
  if (exif.software) {
    evidence.push({
      kind: "warning",
      title: "Written by an editing application",
      detail: `The software field reads “${exif.software}”. That means the file was last written by that program — exports from editors, converters, and phone post-processing all record this. It confirms processing, not deception.`,
      source: "metadata",
      measurement: `Software = ${exif.software}`,
    });
  }
  if (exif.gpsPresent) {
    evidence.push({
      kind: "context",
      title: "Location data retained",
      detail:
        "The file still contains GPS fields. This describes where the image was captured, if the tags are genuine — it is not verified by this analysis.",
      source: "metadata",
    });
  }

  return check("metadata", "Metadata inspection", "clear", {
    findings,
    measurements,
    explanation:
      "EXIF and container metadata were parsed from the file itself. These fields are copied along with the pixels, so several independent tools should agree on them — disagreement between fields is a stronger signal than any single value.",
    limitations:
      "Metadata can be copied from other files, edited in seconds, or removed entirely. Authentic-looking metadata does not make an image genuine, and its absence does not make an image fake.",
    evidence,
  });
}

export function buildStructureCheck(input: {
  format: string;
  jpeg?: JpegInfo | null;
  png?: PngInfo | null;
  webp?: WebpInfo | null;
  decodeOk: boolean;
  decodeNote?: string;
  /** When the format has no decoder in this pipeline, decode failure is not an anomaly. */
  decodeOptional?: boolean;
  pixelBudgetExceeded?: boolean;
}): CheckResult & { evidence: EvidenceItem[] } {
  const evidence: EvidenceItem[] = [];
  const findings: string[] = [];
  const measurements: Measurement[] = [
    { label: "Format", value: input.format.toUpperCase() },
  ];
  let status: CheckResult["status"] = "clear";

  if (input.jpeg) {
    const segs = Object.entries(input.jpeg.segmentsByMarker)
      .map(([m, n]) => `${m}×${n}`)
      .join(", ");
    measurements.push({ label: "Segments", value: String(input.jpeg.segments.length) });
    measurements.push({ label: "Marker inventory", value: segs || "none" });
    if (input.jpeg.error) {
      status = "flag";
      findings.push(`Structural problem: ${input.jpeg.error}`);
      evidence.push({
        kind: "warning",
        title: "Malformed JPEG structure",
        detail: input.jpeg.error,
        source: "structure",
      });
    } else {
      findings.push("All marker segments parse cleanly, including table and frame headers.");
      evidence.push({
        kind: "confirmed",
        title: "Structurally valid JPEG",
        detail: "Every segment walked in order; frame header and entropy-coded data are intact.",
        source: "structure",
        measurement: `${input.jpeg.segments.length} segments`,
      });
    }
    if (input.jpeg.trailingBytesAfterEoi > 0) {
      status = "flag";
      findings.push(
        `${input.jpeg.trailingBytesAfterEoi} bytes are appended after the end-of-image marker.`,
      );
      evidence.push({
        kind: "warning",
        title: "Data appended after the image",
        detail:
          "Bytes exist after the JPEG end marker. Carriers of hidden payloads and some export/patching tools do this, but so do some download managers and preview generators. Worth confirming against a copy from the original source.",
        source: "structure",
        measurement: `${input.jpeg.trailingBytesAfterEoi} trailing bytes`,
      });
    }
    if (input.jpeg.appMarkerNames.length > 0 || input.jpeg.hasIccProfile) {
      findings.push(
        `Embedded profile/metadata blocks: ${[
          ...(input.jpeg.hasJfif ? ["JFIF"] : []),
          ...(input.jpeg.hasExif ? ["EXIF"] : []),
          ...(input.jpeg.hasIccProfile ? ["ICC"] : []),
          ...(input.jpeg.hasXmp ? ["XMP"] : []),
          ...(input.jpeg.adobeInfo ? ["Adobe APP14"] : []),
          ...(input.jpeg.photoshopIrb ? ["Photoshop IRB"] : []),
        ].join(", ") || input.jpeg.appMarkerNames.join(", ")}.`,
      );
    }
  }

  if (input.png) {
    measurements.push({ label: "Chunk count", value: String(input.png.chunks.length) });
    measurements.push({
      label: "Chunk inventory",
      value: Object.entries(input.png.chunkCounts).map(([t, n]) => `${t}×${n}`).join(", "),
    });
    if (input.png.error) {
      status = "flag";
      findings.push(`Structural problem: ${input.png.error}`);
      evidence.push({
        kind: "warning",
        title: "Malformed PNG structure",
        detail: input.png.error,
        source: "structure",
      });
    } else {
      findings.push("Signature, IHDR, IDAT chain, and IEND all present in order.");
      evidence.push({
        kind: "confirmed",
        title: "Structurally valid PNG",
        detail:
          "The chunk stream parses end to end" +
          (input.png.crcFailures.length ? "" : " and all chunk checksums match."),
        source: "structure",
        measurement: `${input.png.chunks.length} chunks`,
      });
    }
    if (input.png.crcFailures.length > 0) {
      status = "flag";
      findings.push(
        `Checksum mismatch in chunk(s): ${input.png.crcFailures.join(", ")}.`,
      );
      evidence.push({
        kind: "warning",
        title: "Chunk checksum mismatch",
        detail:
          "At least one chunk's CRC does not match its data, meaning the bytes were changed after encoding or the file is damaged.",
        source: "structure",
        measurement: input.png.crcFailures.join(", "),
      });
    }
    for (const problem of input.png.orderProblems) {
      if (status !== "flag") status = "inconclusive";
      findings.push(problem);
      evidence.push({
        kind: "context",
        title: "Unusual chunk layout",
        detail: problem,
        source: "structure",
      });
    }
  }

  if (input.webp) {
    measurements.push({
      label: "Chunks",
      value: input.webp.chunks.map((c) => c.id).join(", ") || "none",
    });
    if (input.webp.error) {
      status = "flag";
      findings.push(`Structural problem: ${input.webp.error}`);
      evidence.push({
        kind: "warning",
        title: "Malformed WebP container",
        detail: input.webp.error,
        source: "structure",
      });
    } else {
      findings.push("RIFF container parses cleanly.");
      evidence.push({
        kind: "confirmed",
        title: "Structurally valid WebP",
        detail: "The RIFF chunk chain parses without truncation or size mismatches.",
        source: "structure",
        measurement: `${input.webp.chunks.length} chunks`,
      });
    }
    if (input.webp.trailingBytes > 0) {
      status = "flag";
      findings.push(`${input.webp.trailingBytes} bytes follow the last RIFF chunk.`);
      evidence.push({
        kind: "warning",
        title: "Data appended after the container",
        detail: "Bytes exist after the final declared WebP chunk.",
        source: "structure",
        measurement: `${input.webp.trailingBytes} trailing bytes`,
      });
    }
  }

  if (input.decodeOk) {
    findings.push("The image decoded to pixels without error.");
    measurements.push({ label: "Pixel decode", value: "successful" });
  } else if (input.pixelBudgetExceeded) {
    findings.push(
      "The image is too large for pixel-level processing and was not decoded; header-level checks still ran.",
    );
    measurements.push({ label: "Pixel decode", value: "skipped (size limit)" });
    if (status === "clear") status = "inconclusive";
    evidence.push({
      kind: "context",
      title: "Pixel checks skipped",
      detail: input.decodeNote ?? "The image exceeds the pixel-processing budget.",
      source: "structure",
    });
  } else if (input.decodeOptional) {
    findings.push(
      input.decodeNote ??
        "Pixel-level decoding is not available for this format in this pipeline; header-level checks completed.",
    );
    measurements.push({ label: "Pixel decode", value: "not available for this format" });
    evidence.push({
      kind: "context",
      title: "Pixel-level checks unavailable",
      detail:
        input.decodeNote ??
        "No pixel decoder for this format is installed in this pipeline, so pixel-level checks (ELA-style analysis) could not run.",
      source: "structure",
    });
  } else {
    status = "flag";
    findings.push(
      input.decodeNote ?? "The image could not be decoded to pixels.",
    );
    measurements.push({ label: "Pixel decode", value: "failed" });
    evidence.push({
      kind: "warning",
      title: "Pixel decode failed",
      detail:
        "Headers are readable but the compressed pixel data did not decode — consistent with truncation, corruption, or deliberate damage to the pixel stream.",
      source: "structure",
    });
  }

  return check("structure", "File structure and encoding", status, {
    findings,
    measurements,
    explanation:
      "The file's own container structure was walked segment by segment (or chunk by chunk), including checksums where the format defines them.",
    limitations: LIMITATION_NOTES.technicalOnly,
    evidence,
  });
}

export function buildEncodingCheck(input: {
  format: string;
  jpeg?: JpegInfo | null;
  png?: PngInfo | null;
  webp?: WebpInfo | null;
}): CheckResult & { evidence: EvidenceItem[] } {
  const evidence: EvidenceItem[] = [];
  const findings: string[] = [];
  const measurements: Measurement[] = [];
  let status: CheckResult["status"] = "clear";

  if (input.jpeg) {
    const j = input.jpeg;
    measurements.push({
      label: "Coding type",
      value: j.progressive ? "Progressive" : "Baseline (sequential)",
    });
    measurements.push({
      label: "Components",
      value: `${j.components.length} (${j.samplingFactors.join(", ")})`,
    });
    measurements.push({
      label: "Estimated quality",
      value:
        j.estimatedQuality !== null
          ? `~${j.estimatedQuality} / 100 (mean deviation ${j.qualityMeanAbsDeviation})`
          : "not_estimable",
    });
    measurements.push({
      label: "Restart interval",
      value: j.restartInterval === null ? "not set" : String(j.restartInterval),
    });
    findings.push(
      j.progressive
        ? "Progressive coding: the file is stored as sequential refinement passes."
        : "Baseline coding: a single sequential scan, the most common phone/web form.",
    );
    findings.push(
      j.estimatedQuality !== null
        ? `Quantization tables fit a reference encoder at approximately quality ${j.estimatedQuality} (fit residual ${j.qualityMeanAbsDeviation}).`
        : "The quantization tables do not fit a standard encoder profile, so no quality estimate is reported.",
    );
    evidence.push({
      kind: "confirmed",
      title: "Compression profile read from the quant tables",
      detail:
        j.estimatedQuality !== null
          ? `The luminance table matches a standard encoder scaled for quality ≈${j.estimatedQuality}. Re-saving tends to create a second, mismatched table — none is visible here at table granularity.`
          : "The quantization tables were customised rather than produced by a standard encoder profile.",
      source: "encoding",
      measurement:
        j.estimatedQuality !== null ? `quality ≈ ${j.estimatedQuality}` : "custom table",
    });
    if (j.photoshopIrb || (j.softwareHints.length > 0 && j.softwareHints.some((h) => /photoshop|gimp|affinity|canva|lightroom|snapseed/i.test(h)))) {
      status = "flag";
      const hints = [
        ...(j.photoshopIrb ? ["Photoshop resource block"] : []),
        ...j.softwareHints,
      ].join(", ");
      findings.push(`Editing-tool signatures in marker blocks: ${hints}.`);
      evidence.push({
        kind: "warning",
        title: "Editing-tool signature in the file",
        detail: `Marker text reads “${hints}”. The JPEG itself records that an editing application wrote it. That confirms processing after capture — normal for crops, colour work, and exports, and also present in fabricated images. Corroborate before drawing conclusions.`,
        source: "encoding",
        measurement: hints,
      });
    } else if (j.softwareHints.length > 0) {
      findings.push(`Device/software strings found in markers: ${j.softwareHints.join(", ")}.`);
      evidence.push({
        kind: "confirmed",
        title: "Device or platform strings in markers",
        detail: `Marker text includes: ${j.softwareHints.join(", ")}.`,
        source: "encoding",
      });
    }
    if (j.adobeInfo) {
      findings.push(`Adobe APP14 marker present (colour transform ${j.adobeInfo.transform}).`);
    }
  }

  if (input.png) {
    const p = input.png;
    const colorNames: Record<number, string> = {
      0: "greyscale",
      2: "truecolour",
      3: "indexed",
      4: "greyscale + alpha",
      6: "truecolour + alpha",
    };
    measurements.push({ label: "Bit depth", value: String(p.bitDepth) });
    measurements.push({ label: "Colour type", value: `${p.colorType} (${colorNames[p.colorType] ?? "unknown"})` });
    measurements.push({ label: "Interlace", value: p.interlace === 0 ? "none" : "Adam7" });
    measurements.push({
      label: "Resolution (pHYs)",
      value: p.dpiX !== null ? `${p.dpiX} × ${p.dpiY} DPI` : "not declared",
    });
    measurements.push({ label: "Colour profile", value: p.hasIccProfile ? "embedded ICC" : "none" });
    findings.push(
      `${p.bitDepth}-bit ${colorNames[p.colorType] ?? "unknown"} PNG, ${p.interlace === 0 ? "uninterlaced" : "interlaced"}.`,
    );
    findings.push(
      p.dpiX !== null
        ? `Resolution declared as ${p.dpiX} × ${p.dpiY} DPI.`
        : "No physical resolution chunk (pHYs) — common in screenshots and edited exports.",
    );
    evidence.push({
      kind: "confirmed",
      title: "PNG encoding profile read",
      detail: `${p.bitDepth}-bit ${colorNames[p.colorType] ?? "unknown"} image with ${p.hasIccProfile ? "an embedded colour profile" : "no embedded colour profile"}${
        p.animated ? " and animation chunks" : ""
      }.`,
      source: "encoding",
      measurement: `bit depth ${p.bitDepth}, type ${p.colorType}`,
    });
    if (p.animated) {
      status = "flag";
      findings.push("Animation chunks (acTL/fcTL) are present: this is an animated PNG.");
      evidence.push({
        kind: "warning",
        title: "Animated PNG content",
        detail:
          "The container declares animation frames, which is rarer than a static screenshot. Where the sender described it as a single still frame, that mismatch is worth confirming.",
        source: "encoding",
        measurement: "acTL present",
      });
    }
    if (p.softwareHints.length > 0) {
      status = "flag";
      findings.push(`Text chunks record: ${p.softwareHints.join("; ")}.`);
      evidence.push({
        kind: "warning",
        title: "Authoring software written into the file",
        detail: `PNG text chunks read “${p.softwareHints.join("; ")}”. This confirms the file was produced or resaved by that tool — processing, not necessarily manipulation.`,
        source: "encoding",
        measurement: p.softwareHints[0],
      });
    }
  }

  if (input.webp) {
    const w = input.webp;
    measurements.push({
      label: "Coding",
      value: w.lossless ? "Lossless (VP8L)" : w.variant === "VP8X" ? "Extended (VP8X)" : "Lossy (VP8)",
    });
    measurements.push({ label: "Alpha channel", value: w.hasAlpha ? "present" : "absent" });
    measurements.push({ label: "Animation", value: w.animated ? "declared" : "no" });
    findings.push(
      w.lossless
        ? "Lossless WebP: no lossy compression stage was applied by the encoder."
        : "Lossy WebP encoding.",
    );
    if (w.animated) {
      status = "flag";
      findings.push("The file declares animation frames.");
      evidence.push({
        kind: "warning",
        title: "Animated WebP content",
        detail: "The container declares more than one frame.",
        source: "encoding",
      });
    }
    evidence.push({
      kind: "confirmed",
      title: "WebP coding method read",
      detail: `${w.variant ?? "unknown"} chunk set${w.hasAlpha ? " with alpha" : ""}. Lossless and lossy files respond differently to re-saving, which affects how other checks should be read.`,
      source: "encoding",
      measurement: w.variant ?? undefined,
    });
  }

  if (findings.length === 0) findings.push("No encoding characteristics could be measured.");
  return check("encoding", "Encoding characteristics", status, {
    findings,
    measurements,
    explanation:
      "Coding type, quantisation tables, profiles, and text blocks were read from the file's headers. These describe how the file was written.",
    limitations: LIMITATION_NOTES.technicalOnly,
    evidence,
  });
}

/* Screenshot-shaped dimensions seen most often in the wild. */
const COMMON_SCREENSHOT_WIDTHS = [
  750, 828, 1080, 1125, 1170, 1206, 1242, 1284, 1290, 1179, 432, 540, 720,
  1440, 1081, 1082, 1320, 1283,
];

export function buildConsistencyCheck(input: {
  format: string;
  dimensions: { width: number; height: number } | null;
  exif: ExifSummary | null;
  jpeg?: JpegInfo | null;
  png?: PngInfo | null;
}): CheckResult & { evidence: EvidenceItem[] } {
  const evidence: EvidenceItem[] = [];
  const findings: string[] = [];
  const measurements: Measurement[] = [];
  let status: CheckResult["status"] = "inconclusive";
  const { dimensions, exif } = input;

  if (dimensions) {
    measurements.push({
      label: "Pixel grid",
      value: `${dimensions.width} × ${dimensions.height} px`,
    });
    const aspect = dimensions.width / dimensions.height;
    measurements.push({ label: "Aspect ratio", value: aspect.toFixed(3) });
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const g = gcd(dimensions.width, dimensions.height);
    measurements.push({
      label: "Aspect (reduced)",
      value: `${dimensions.width / g}:${dimensions.height / g}`,
    });
  }

  // Header dimensions vs EXIF-recorded capture dimensions
  if (dimensions && exif?.width && exif?.height) {
    const match =
      (exif.width === dimensions.width && exif.height === dimensions.height) ||
      (exif.width === dimensions.height && exif.height === dimensions.width);
    measurements.push({
      label: "EXIF vs grid dimensions",
      value: match
        ? "match"
        : `EXIF ${exif.width}×${exif.height} vs grid ${dimensions.width}×${dimensions.height}`,
    });
    if (!match) {
      status = "flag";
      findings.push(
        `The EXIF block records ${exif.width} × ${exif.height} px while the pixel grid is ${dimensions.width} × ${dimensions.height} px.`,
      );
      evidence.push({
        kind: "warning",
        title: "Capture dimensions differ from the file grid",
        detail:
          "The camera's recorded capture size does not match the file's pixel grid. Resizing, cropping, or exporting from a different frame all produce this. Screenshotting a photo is another common innocent cause — confirm with an independently obtained copy.",
        source: "consistency",
        measurement: `EXIF ${exif.width}×${exif.height} ≠ grid ${dimensions.width}×${dimensions.height}`,
      });
    } else {
      status = "clear";
      findings.push("EXIF capture dimensions match the pixel grid exactly (considering orientation).");
      evidence.push({
        kind: "confirmed",
        title: "Dimensions consistent across EXIF and header",
        detail:
          "The recorded capture size agrees with the actual pixel grid — one independent consistency condition holds.",
        source: "consistency",
        measurement: `${dimensions.width}×${dimensions.height}`,
      });
    }
  }

  // Timestamp sanity
  const dates = [exif?.dateTimeOriginal, exif?.createDate, exif?.modifyDate].filter(
    (d): d is string => Boolean(d),
  );
  if (dates.length >= 2) {
    measurements.push({ label: "Timestamps compared", value: String(dates.length) });
    const parsed = dates
      .map((d) => ({ raw: d, time: parseExifTime(d) }))
      .filter((d) => !Number.isNaN(d.time));
    const dtoTime = exif?.dateTimeOriginal
      ? parseExifTime(exif.dateTimeOriginal)
      : NaN;
    const modifyTime = exif?.modifyDate ? parseExifTime(exif.modifyDate) : NaN;
    const backwards =
      !Number.isNaN(dtoTime) &&
      !Number.isNaN(modifyTime) &&
      modifyTime < dtoTime - 1000;
    const future = parsed.filter((d) => d.time > Date.now() + 24 * 3600 * 1000);
    if (future.length > 0) {
      status = "flag";
      findings.push("A timestamp in the file is set in the future.");
      evidence.push({
        kind: "warning",
        title: "Future-dated metadata",
        detail:
          "One or more EXIF timestamps are ahead of the current date, which a misconfigured clock can also cause.",
        source: "consistency",
        measurement: future[0].raw,
      });
    } else if (backwards) {
      status = "flag";
      findings.push(
        "The last-modified timestamp precedes the recorded capture time.",
      );
      evidence.push({
        kind: "warning",
        title: "Edit time precedes capture time",
        detail:
          "The file says it was last modified before the photo was captured — an internal contradiction. A copied metadata block or a camera with an unset clock both produce it, as can timezone mistakes.",
        source: "consistency",
        measurement: `capture ${exif?.dateTimeOriginal}, modified ${exif?.modifyDate}`,
      });
    } else {
      if (status === "inconclusive") status = "clear";
      findings.push("EXIF timestamps are internally consistent and not in the future.");
      evidence.push({
        kind: "confirmed",
        title: "Metadata timestamps are plausible",
        detail:
          "Capture, creation, and modification times parse as plausible dates, do not run ahead of the present, and do not contradict each other.",
        source: "consistency",
        measurement: dates.join(" | "),
      });
    }
  }

  // Screenshot-shaped profile (context only)
  if (input.format === "png" && dimensions && !exif) {
    const looksScreen =
      COMMON_SCREENSHOT_WIDTHS.includes(dimensions.width) ||
      COMMON_SCREENSHOT_WIDTHS.includes(dimensions.height);
    if (looksScreen) {
      evidence.push({
        kind: "context",
        title: "Dimensions match a common screen capture",
        detail: `${dimensions.width} × ${dimensions.height} px at a size typical of phone or desktop screenshots, and the file carries no camera metadata. This is exactly the profile an ordinary screenshot produces — it neither supports nor undermines a screenshot's claimed content.`,
        source: "consistency",
        measurement: `${dimensions.width}×${dimensions.height} PNG, no EXIF`,
      });
      findings.push(
        "The file's dimensions, format, and absent metadata are consistent with an ordinary screen capture.",
      );
    }
  }

  // No-DPI PNG as context
  if (input.png && input.png.dpiX === null) {
    findings.push("No physical resolution is declared in the PNG container.");
  }

  if (findings.length === 0 && !exif) {
    findings.push("There is no metadata or cross-field evidence to compare.");
    status = "inconclusive";
  }

  const explanation =
    "Fields from independent parts of the file — header dimensions, EXIF capture fields, timestamps, format conventions — were compared against each other.";
  const limitations =
    "A consistency check can only confirm that parts of one file agree with each other; agreeing fields can all be forged together, and ordinary pipelines (resize, export, screenshot, platform re-encode) break matching routinely. Agreement is weak support, disagreement is a lead, and neither establishes authenticity.";

  if (status === "inconclusive") {
    evidence.push({
      kind: "context",
      title: "Not enough cross-field evidence",
      detail:
        "This file carries too little independent metadata for its fields to be compared. That is the normal state of screenshots and platform-hosted images, and is not by itself a warning sign.",
      source: "consistency",
    });
  }

  return check("consistency", "Consistency checks", status, {
    findings,
    measurements,
    explanation,
    limitations,
    evidence,
  });
}

export function buildCompressionCheck(input: {
  format: string;
  stats?: ElaStats;
  method?: string;
  /** Cells from elaHotspots() that sit clearly above the image's own median. */
  hotspotCells?: import("./ela").ElaHotspot[];
  grid?: { columns: number; rows: number };
  skipReason?: string;
}): CheckResult & { evidence: EvidenceItem[] } {
  const evidence: EvidenceItem[] = [];

  if (input.format.toLowerCase() !== "jpeg" || !input.stats) {
    return check("compression", "JPEG compression analysis (ELA)", "skipped", {
      findings: [
        input.skipReason ??
          `Error Level Analysis applies to JPEG files only; this file is ${input.format.toUpperCase()}.`,
      ],
      measurements: [{ label: "Technique", value: "Error Level Analysis (JPEG only)" }],
      explanation:
        "ELA works by recompressing a JPEG and reading where the fresh compression bites hardest. Applying it to a PNG or WebP would mean silently converting the file first and then presenting results about the conversion rather than about the original — so it is not done.",
      limitations:
        "This check does not apply to this file type. Converting and then running ELA would produce a comparison against the conversion, not evidence about the uploaded file.",
      evidence: [
        {
          kind: "context",
          title: "ELA not applicable",
          detail: `This analysis is defined for JPEG inputs; the uploaded file is ${input.format.toUpperCase()}.`,
          source: "compression",
        },
      ],
    });
  }

  const s = input.stats;
  const measurements: Measurement[] = [
    { label: "Recompression quality", value: "90 (fixed)" },
    { label: "Amplification", value: "×15" },
    { label: "Mean amplified difference", value: `${s.mean} / 255 (raw)` },
    { label: "95th percentile", value: String(s.p95) },
    { label: "99th percentile", value: String(s.p99) },
    { label: "99.9th percentile", value: String(s.p999) },
    { label: "Maximum difference", value: String(s.max) },
    { label: "Pixels above hot threshold", value: `${s.hotPercent}%` },
  ];
  const findings: string[] = [
    `The file was recompressed at quality 90 and differenced against itself; ${s.hotPercent}% of pixels show an amplified difference above the display threshold.`,
    `Error-level spread: median-95th percentile ${s.p95}, tail 99.9th ${s.p999}, peak ${s.max}.`,
  ];

  const cells = input.hotspotCells ?? [];
  const hasHotspots = cells.length > 0;

  if (hasHotspots && input.grid) {
    const listed = cells
      .slice(0, 4)
      .map(
        (c) =>
          `(col ${c.col + 1}, row ${c.row + 1}) mean ${c.mean}`,
      )
      .join("; ");
    evidence.push({
      kind: "warning",
      title: "Uneven recompression response",
      detail: `${cells.length} of ${input.grid.columns * input.grid.rows} grid cells average far above this image's own median error level — ${listed}. The highlighted overlay marks them. Regions that entered the file at a different compression stage respond differently here. Texture, sharp edges, resizing, and multiple legitimate saves produce the same pattern, so treat this as a lead to inspect, never as proof of an edit.`,
      source: "compression",
      measurement: `${cells.length} of ${input.grid.columns * input.grid.rows} cells elevated`,
    });
    findings.push(
      "Grid regions respond unevenly to recompression — highlighted on the ELA visualization.",
    );
  } else {
    evidence.push({
      kind: "confirmed",
      title: "Recompression response is even",
      detail:
        `No grid cell stands markedly above this image's own median error level; ${s.hotPercent}% of pixels exceed the display threshold. Uniform response is the common case for single-save images — it is weak support, not proof of genuineness.`,
      source: "compression",
      measurement: `${s.hotPercent}% hot pixels`,
    });
  }

  const status = hasHotspots ? "inconclusive" : "clear";

  return check("compression", "JPEG compression analysis (ELA)", status, {
    findings,
    measurements,
    explanation:
      "Error Level Analysis decodes the JPEG, recompresses it at a fixed quality, and amplifies the difference map. Areas written by different processes, or carrying different compression history, respond differently to the fresh save. " +
      (input.method ?? ""),
    limitations: LIMITATION_NOTES.ela,
    evidence,
  });
}

export function buildPixelDiffCheck(input: {
  metrics: ComparisonMetrics;
  method: string;
  formatA: string;
  formatB: string;
  nameA: string;
  nameB: string;
}): CheckResult & { evidence: EvidenceItem[] } {
  const m = input.metrics;
  const measurements: Measurement[] = [
    { label: "File A", value: `${input.nameA} — ${input.formatA.toUpperCase()} ${m.targetWidth}×${m.targetHeight}` },
    { label: "File B", value: `${input.nameB} — ${input.formatB.toUpperCase()}` },
    { label: "Compared on", value: `${m.targetWidth} × ${m.targetHeight} px${m.resampled ? " (resampled)" : ""}` },
    { label: "Mean abs. difference", value: `${m.mae} / 255` },
    { label: "RMSE", value: `${m.rmse} / 255` },
    { label: "PSNR", value: m.psnrDb === null ? "identical pixels" : `${m.psnrDb} dB` },
    { label: "Pixels differing > 8", value: `${m.changedOver8Percent}%` },
    { label: "Pixels differing > 24", value: `${m.changedOver24Percent}%` },
    { label: "Peak channel difference", value: String(m.maxChannelDiff) },
  ];

  const evidence: EvidenceItem[] = [];
  let status: CheckResult["status"] = "clear";
  const findings: string[] = [];

  if (m.identical) {
    findings.push("Both files decode to identical pixels on the compared canvas.");
    evidence.push({
      kind: "confirmed",
      title: "Pixel-identical images",
      detail:
        "Every compared pixel matches, which means the underlying image content is the same even though the files (format, metadata, size) may differ.",
      source: "pixelDiff",
      measurement: "RMSE 0",
    });
    status = "clear";
  } else {
    findings.push(
      `Mean absolute difference ${m.mae}/255; ${m.changedOver8Percent}% of pixels differ by more than 8 levels and ${m.changedOver24Percent}% by more than 24 (peak ${m.maxChannelDiff}).`,
    );
    if (m.resampled) {
      findings.push(
        "The images had different dimensions, so both were resampled to a common canvas by nearest-neighbour sampling before differencing — this adds its own differences at edges.",
      );
    }
    if (m.changedOver8Percent < 5) {
      status = "clear";
      evidence.push({
        kind: "context",
        title: "Small pixel-level differences",
        detail:
          "Only a small share of pixels differ beyond the noise threshold — the profile you get from recompression, resampling, or colour-profile conversion of the same picture.",
        source: "pixelDiff",
        measurement: `${m.changedOver8Percent}% changed`,
      });
    } else if (m.changedOver8Percent < 40) {
      status = "inconclusive";
      evidence.push({
        kind: "warning",
        title: "Substantial pixel differences",
        detail: `${m.changedOver8Percent}% of pixels differ by more than 8 levels. That is far beyond recompression noise, but it comes from resizing, alignment, heavy re-encoding, or genuinely different content — the number alone cannot say which.`,
        source: "pixelDiff",
        measurement: `${m.changedOver8Percent}% changed, PSNR ${m.psnrDb ?? "∞"} dB`,
      });
    } else {
      status = "flag";
      evidence.push({
        kind: "warning",
        title: "The two images depict substantially different pixel content",
        detail: `${m.changedOver8Percent}% of pixels differ beyond the noise threshold (PSNR ${m.psnrDb ?? "∞"} dB). The compared files are not two copies of the same picture. Who produced the difference and why is outside what pixel comparison can establish.`,
        source: "pixelDiff",
        measurement: `${m.changedOver8Percent}% changed`,
      });
      findings.push(
        "The compared canvases diverge well beyond what recompression alone explains.",
      );
    }
    evidence.push({
      kind: "confirmed",
      title: "Comparison measurements computed",
      detail: input.method,
      source: "pixelDiff",
      measurement: `MAE ${m.mae}, RMSE ${m.rmse}`,
    });
  }

  return check("pixelDiff", "Pixel difference analysis", status, {
    findings,
    measurements,
    explanation:
      "Both files were decoded and differenced pixel by pixel on a common canvas. The numbers describe how far apart the two images are in content, nothing more.",
    limitations: LIMITATION_NOTES.pixelDiff,
    evidence,
  });
}

/* ------------------------------------------------------------------ */
/* Overall assessment                                                  */
/* ------------------------------------------------------------------ */

export function assessOverall(results: CheckResult[]): Assessment {
  const validation = results.find((r) => r.type === "validation");
  if (validation && validation.status === "error") return "unsupported";
  if (results.length === 0) return "incomplete";
  if (results.some((r) => r.status === "error")) return "incomplete";
  if (results.some((r) => r.status === "flag")) return "inconsistencies";
  const completedWithValue = results.filter(
    (r) => r.status === "clear" || r.status === "flag" || r.status === "inconclusive",
  );
  if (completedWithValue.some((r) => r.status === "inconclusive")) {
    return "inconclusive";
  }
  if (completedWithValue.length >= 2) return "no_anomaly";
  return "inconclusive";
}

export function collectEvidence(results: (CheckResult & { evidence?: EvidenceItem[] })[]): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  for (const result of results) {
    for (const item of result.evidence ?? []) items.push(item);
  }
  const order: Record<EvidenceKind, number> = { warning: 0, confirmed: 1, context: 2 };
  return items.sort((a, b) => order[a.kind] - order[b.kind]);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}