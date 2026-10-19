"use node";

/**
 * ProofPix analysis pipeline.
 *
 * Each step is a separate Node action the client invokes in order, so the
 * progress list on the client only ever marks a step complete when that
 * operation has genuinely finished. Every action re-checks ownership against
 * the signed-in user, and every result written here was measured from the
 * uploaded bytes by the pure functions in src/lib/forensics.
 */
import exifr from "exifr";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

import {
  detectFormat,
  extensionFormat,
  validateUpload,
  MAX_UPLOAD_BYTES,
} from "../lib/forensics/sniff";
import {
  DecodeFailure,
  decodeImage,
  encodePng,
  peekDimensions,
  type DecodedImage,
} from "../lib/forensics/decode";
import { parseJpeg, type JpegInfo } from "../lib/forensics/jpeg";
import { parsePng, type PngInfo } from "../lib/forensics/png";
import { parseWebp, type WebpInfo } from "../lib/forensics/webp";
import { runEla, elaHotspots, type ElaResult } from "../lib/forensics/ela";
import { compareImages, type ComparisonResult } from "../lib/forensics/compare";
import {
  assessOverall,
  buildCompressionCheck,
  buildConsistencyCheck,
  buildEncodingCheck,
  buildMetadataCheck,
  buildPixelDiffCheck,
  buildStructureCheck,
  buildValidationCheck,
  collectEvidence,
  summarizeExif,
  type EvidenceItem,
} from "../lib/forensics/checks";
import { buildRecommendations } from "../lib/forensics/recommend";
import type { CheckResult } from "../lib/forensics/types";

const ANALYSIS_ANALYSIS_VERSION = "proofpix-checks-v1";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

async function loadBytes(
  ctx: ActionCtx,
  storageId: Doc<"analyses">["imageStorageId"],
): Promise<Uint8Array> {
  const blob = await ctx.storage.get(storageId!);
  if (!blob) throw new Error("The stored file is no longer available.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Fetch the analysis and assert the signed-in user owns it. */
async function ownedAnalysis(
  ctx: ActionCtx,
  analysisId: Doc<"analyses">["_id"],
): Promise<Doc<"analyses">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated.");
  const analysis = await ctx.runQuery(internal.analyses.getAnalysis, {
    analysisId,
  });
  if (!analysis || analysis.userId !== userId) {
    throw new Error("Not authorized for this analysis.");
  }
  return analysis;
}

async function recordCheck(
  ctx: ActionCtx,
  analysisId: Doc<"analyses">["_id"],
  check: CheckResult & { evidence?: EvidenceItem[] },
) {
  await ctx.runMutation(internal.analyses.saveResult, {
    analysisId,
    type: check.type,
    name: check.name,
    status: check.status,
    findings: check.findings,
    measurements: check.measurements,
    explanation: check.explanation,
    limitations: check.limitations,
    completed: check.completed,
    evidence: check.evidence ?? [],
  });
}

async function markStep(
  ctx: ActionCtx,
  analysisId: Doc<"analyses">["_id"],
  step: string,
  patch: Record<string, unknown> = {},
  stepMeta?: Record<string, unknown>,
) {
  const metaPatch: Record<string, unknown> = { ...patch };
  if (stepMeta !== undefined) metaPatch.stepMeta = JSON.stringify(stepMeta);
  await ctx.runMutation(internal.analyses.appendStep, {
    analysisId,
    step,
    patch: metaPatch,
  });
}

/** EXIF parsing shared by metadata and consistency steps. */
async function extractExif(bytes: Uint8Array, format: string) {
  try {
    if (format === "webp") {
      // Locate the EXIF chunk inside the RIFF container.
      const info = parseWebp(bytes);
      const exifChunk = info.chunks.find((c) => c.id === "EXIF");
      if (!exifChunk) return null;
      const start = exifChunk.offset + 8;
      let payload = bytes.subarray(start, start + exifChunk.size);
      // Strip a leading "Exif\0\0" header if present.
      if (
        payload.length > 6 &&
        payload[0] === 0x45 &&
        payload[1] === 0x78 &&
        payload[2] === 0x69
      ) {
        payload = payload.subarray(6);
      }
      const raw = await exifr.parse(payload, {
        tiff: true,
        ifd0: {},
        exif: true,
        mergeOutput: true,
      });
      return summarizeExif(raw as Record<string, unknown> | undefined);
    }
    const raw = await exifr.parse(bytes, {
      tiff: true,
      ifd0: {},
      exif: true,
      gps: true,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false,
      translateKeys: true,
      reviveValues: true,
      sanitize: true,
      mergeOutput: true,
    });
    return summarizeExif(raw as Record<string, unknown> | undefined);
  } catch {
    return null;
  }
}

function decodeForAnalysis(
  bytes: Uint8Array,
  format: string,
):
  | { ok: true; image: DecodedImage }
  | { ok: false; budget: boolean; note: string } {
  if (format !== "jpeg" && format !== "png") {
    return {
      ok: false,
      budget: false,
      note:
        "No pixel decoder for WebP is installed in this pipeline, so pixel-level checks did not run for this file. Header-level checks completed normally.",
    };
  }
  try {
    return { ok: true, image: decodeImage(bytes, format as "jpeg" | "png") };
  } catch (error) {
    const budget =
      error instanceof DecodeFailure && error.message.includes("above the");
    return {
      ok: false,
      budget,
      note:
        error instanceof Error
          ? error.message
          : "The image could not be decoded.",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Step 1 — validation                                                 */
/* ------------------------------------------------------------------ */

export const validateStep = action({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await ownedAnalysis(ctx, args.analysisId);
    if (!analysis.imageStorageId) throw new Error("No file is attached.");
    const bytes = await loadBytes(ctx, analysis.imageStorageId);

    const validation = validateUpload(
      bytes,
      analysis.fileName,
      analysis.sizeBytes,
    );
    const actualFormat =
      validation.actualFormat !== "unknown"
        ? validation.actualFormat
        : extensionFormat(analysis.fileName);
    const dims =
      actualFormat === "webp"
        ? (() => {
            const info = parseWebp(bytes);
            return info.width && info.height
              ? { width: info.width, height: info.height }
              : null;
          })()
        : actualFormat !== "unknown"
          ? peekDimensions(bytes, actualFormat)
          : null;

    const validationCheck = buildValidationCheck({
      validation,
      sizeBytes: analysis.sizeBytes,
      fileName: analysis.fileName,
      dimensions: dims,
    });
    await recordCheck(ctx, args.analysisId, validationCheck);

    // Second file for comparisons.
    if (analysis.kind === "comparison") {
      if (!analysis.imageStorageIdB || !analysis.fileNameB) {
        await ctx.runMutation(internal.analyses.finish, {
          analysisId: args.analysisId,
          status: "failed",
          assessment: "unsupported",
          patch: {
            error: "A comparison needs two uploaded files.",
          },
        });
        return { ok: false as const, error: "A comparison needs two uploaded files." };
      }
      const bytesB = await loadBytes(ctx, analysis.imageStorageIdB);
      const validationB = validateUpload(
        bytesB,
        analysis.fileNameB,
        analysis.sizeBytesB ?? 0,
      );
      if (!validation.ok || !validationB.ok) {
        const problems = [...validation.problems, ...validationB.problems];
        await cleanupInvalidFiles(ctx, analysis);
        await ctx.runMutation(internal.analyses.finish, {
          analysisId: args.analysisId,
          status: "failed",
          assessment: "unsupported",
          patch: { error: problems.join(" ") },
        });
        return { ok: false as const, error: problems.join(" ") };
      }
      await markStep(ctx, args.analysisId, "validate", {
        format: validation.actualFormat,
        formatB: validationB.actualFormat,
        ...(dims ?? {}),
        width: dims?.width ?? undefined,
        height: dims?.height ?? undefined,
      });
      return {
        ok: true as const,
        kind: "comparison" as const,
        format: validation.actualFormat,
        formatB: validationB.actualFormat,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      };
    }

    if (!validation.ok) {
      const problemText = validation.problems.join(" ");
      // Malformed uploads are deleted immediately — nothing to retain.
      await cleanupInvalidFiles(ctx, analysis);
      await ctx.runMutation(internal.analyses.finish, {
        analysisId: args.analysisId,
        status: "failed",
        assessment: "unsupported",
        patch: { error: problemText },
      });
      return { ok: false as const, error: problemText };
    }

    await markStep(ctx, args.analysisId, "validate", {
      format: validation.actualFormat,
      width: dims?.width,
      height: dims?.height,
    });
    return {
      ok: true as const,
      kind: "image" as const,
      format: validation.actualFormat,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    };
  },
});

async function cleanupInvalidFiles(
  ctx: ActionCtx,
  analysis: Doc<"analyses">,
) {
  if (analysis.imageStorageId) {
    try {
      await ctx.storage.delete(analysis.imageStorageId);
    } catch {
      /* already gone */
    }
  }
  if (analysis.imageStorageIdB) {
    try {
      await ctx.storage.delete(analysis.imageStorageIdB);
    } catch {
      /* already gone */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Step 2 — metadata                                                   */
/* ------------------------------------------------------------------ */

export const metadataStep = action({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await ownedAnalysis(ctx, args.analysisId);
    const format = analysis.format ?? detectFormat(
      await loadBytes(ctx, analysis.imageStorageId!),
    );
    const bytes = await loadBytes(ctx, analysis.imageStorageId!);

    const exif = await extractExif(bytes, format);
    const containerNotes: string[] = [];
    let jpegInfo: JpegInfo | null = null;
    let pngInfo: PngInfo | null = null;
    let webpInfo: WebpInfo | null = null;

    if (format === "jpeg") {
      jpegInfo = parseJpeg(bytes);
      containerNotes.push(
        `JPEG marker blocks: ${[
          jpegInfo.hasJfif ? "JFIF" : null,
          jpegInfo.hasExif ? "EXIF" : null,
          jpegInfo.hasIccProfile ? "ICC profile" : null,
          jpegInfo.hasXmp ? "XMP" : null,
        ]
          .filter(Boolean)
          .join(", ") || "none"}.`,
      );
    } else if (format === "png") {
      pngInfo = parsePng(bytes);
      containerNotes.push(
        pngInfo.hasExif
          ? "The PNG contains an eXIf chunk."
          : "The PNG contains no eXIf chunk.",
      );
      if (pngInfo.textEntries.length > 0) {
        containerNotes.push(
          `PNG text chunks: ${pngInfo.textEntries
            .map((t) => t.key)
            .join(", ")}.`,
        );
      }
    } else if (format === "webp") {
      webpInfo = parseWebp(bytes);
      containerNotes.push(
        `WebP container blocks: ${[
          webpInfo.hasExif ? "EXIF" : null,
          webpInfo.hasXmp ? "XMP" : null,
          webpInfo.hasIccProfile ? "ICC" : null,
        ]
          .filter(Boolean)
          .join(", ") || "none"}.`,
      );
    }

    const check = buildMetadataCheck({
      format,
      exif,
      containerNotes,
      jpeg: jpegInfo ?? undefined,
      png: pngInfo ?? undefined,
      webp: webpInfo ?? undefined,
    });
    await recordCheck(ctx, args.analysisId, check);
    await markStep(ctx, args.analysisId, "metadata");
    return { ok: true as const };
  },
});

/* ------------------------------------------------------------------ */
/* Step 3 — structure                                                  */
/* ------------------------------------------------------------------ */

export const structureStep = action({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await ownedAnalysis(ctx, args.analysisId);
    const bytes = await loadBytes(ctx, analysis.imageStorageId!);
    const format = analysis.format ?? "unknown";

    const jpegInfo = format === "jpeg" ? parseJpeg(bytes) : null;
    const pngInfo = format === "png" ? parsePng(bytes) : null;
    const webpInfo = format === "webp" ? parseWebp(bytes) : null;

    const decode = decodeForAnalysis(bytes, format);
    const check = buildStructureCheck({
      format,
      jpeg: jpegInfo,
      png: pngInfo,
      webp: webpInfo,
      decodeOk: decode.ok,
      decodeNote: decode.ok ? undefined : decode.note,
      pixelBudgetExceeded: decode.ok ? false : decode.budget,
    });
    await recordCheck(ctx, args.analysisId, check);
    await markStep(
      ctx,
      args.analysisId,
      "structure",
      {},
      {
        decodeOk: decode.ok,
        budget: decode.ok ? false : decode.budget,
      },
    );
    return { ok: true as const, decodeOk: decode.ok };
  },
});

/* ------------------------------------------------------------------ */
/* Step 4 — encoding + consistency                                     */
/* ------------------------------------------------------------------ */

export const consistencyStep = action({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await ownedAnalysis(ctx, args.analysisId);
    const bytes = await loadBytes(ctx, analysis.imageStorageId!);
    const format = analysis.format ?? "unknown";
    const dims =
      analysis.width && analysis.height
        ? { width: analysis.width, height: analysis.height }
        : null;

    const jpegInfo = format === "jpeg" ? parseJpeg(bytes) : null;
    const pngInfo = format === "png" ? parsePng(bytes) : null;
    const exif = await extractExif(bytes, format);

    await recordCheck(
      ctx,
      args.analysisId,
      buildEncodingCheck({
        format,
        jpeg: jpegInfo,
        png: pngInfo,
        webp: format === "webp" ? parseWebp(bytes) : null,
      }),
    );
    await recordCheck(
      ctx,
      args.analysisId,
      buildConsistencyCheck({
        format,
        dimensions: dims,
        exif,
        jpeg: jpegInfo,
        png: pngInfo,
      }),
    );
    await markStep(ctx, args.analysisId, "consistency");
    return { ok: true as const };
  },
});

/* ------------------------------------------------------------------ */
/* Step 5 — JPEG compression analysis (ELA)                            */
/* ------------------------------------------------------------------ */

export const compressionStep = action({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await ownedAnalysis(ctx, args.analysisId);
    const format = analysis.format ?? "";
    const bytes = await loadBytes(ctx, analysis.imageStorageId!);

    if (format !== "jpeg") {
      await recordCheck(
        ctx,
        args.analysisId,
        buildCompressionCheck({
          format,
          skipReason: `Error Level Analysis is defined for JPEG inputs; this file is ${format.toUpperCase()}. Converting first would measure the conversion rather than the uploaded file, so the check was not run.`,
        }),
      );
      await markStep(ctx, args.analysisId, "compression");
      return { ok: true as const, ran: false };
    }

    const decode = decodeForAnalysis(bytes, format);
    if (!decode.ok) {
      await recordCheck(
        ctx,
        args.analysisId,
        buildCompressionCheck({
          format,
          skipReason: `The JPEG could not be decoded for recompression analysis: ${decode.note}`,
        }),
      );
      await markStep(ctx, args.analysisId, "compression");
      return { ok: true as const, ran: false };
    }

    const ela: ElaResult = runEla(decode.image);
    const hotspots = elaHotspots(ela.image, 4);

    // Store the ELA visualization.
    const pngBytes = encodePng(ela.image);
    const storageId = await ctx.storage.store(
      new Blob([pngBytes as unknown as BlobPart], { type: "image/png" }),
    );
    await ctx.runMutation(internal.analyses.saveArtifact, {
      analysisId: args.analysisId,
      kind: "ela",
      storageId,
      label: "Error Level Analysis",
      description: `Amplified recompression difference map. ${ela.method}`,
      meta: JSON.stringify({
        columns: hotspots.columnCount,
        rows: hotspots.rowCount,
        cells: hotspots.cells,
        cellular: hotspots.cellular,
      }),
    });

    const firstCell = hotspots.cells[0];
    const check = buildCompressionCheck({
      format,
      stats: ela.stats,
      method: ela.method,
      hotspotCells: hotspots.cells,
      grid: { columns: hotspots.columnCount, rows: hotspots.rowCount },
    });
    await recordCheck(ctx, args.analysisId, check);
    void firstCell;
    await markStep(ctx, args.analysisId, "compression");
    return { ok: true as const, ran: true };
  },
});

/* ------------------------------------------------------------------ */
/* Step 6 — finalisation                                               */
/* ------------------------------------------------------------------ */

export const finalizeStep = action({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await ownedAnalysis(ctx, args.analysisId);
    const results = (await ctx.runQuery(internal.analyses.getResults, {
      analysisId: args.analysisId,
    })) as unknown as (CheckResult & { evidence?: EvidenceItem[] })[];

    const evidence = collectEvidence(results);
    const assessment = assessOverall(results);
    const recommendations = buildRecommendations({
      assessment,
      kind: analysis.kind,
      results,
      evidence,
      format: analysis.format ?? undefined,
    });

    await markStep(ctx, args.analysisId, "report");
    await ctx.runMutation(internal.analyses.finish, {
      analysisId: args.analysisId,
      status: "completed",
      assessment,
      patch: { recommendations },
    });
    return { ok: true as const, assessment };
  },
});

/* ------------------------------------------------------------------ */
/* Comparison — validate (above) then compare pixels                   */
/* ------------------------------------------------------------------ */

export const compareStep = action({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await ownedAnalysis(ctx, args.analysisId);
    if (analysis.kind !== "comparison") {
      throw new Error("This analysis is not a comparison.");
    }
    const bytesA = await loadBytes(ctx, analysis.imageStorageId!);
    const bytesB = await loadBytes(ctx, analysis.imageStorageIdB!);
    const formatA = analysis.format ?? "unknown";
    const formatB = analysis.formatB ?? "unknown";

    // Structure checks for both sides (header-level, always possible).
    const infoA =
      formatA === "jpeg"
        ? parseJpeg(bytesA)
        : formatA === "png"
          ? parsePng(bytesA)
          : parseWebp(bytesA);
    const infoB =
      formatB === "jpeg"
        ? parseJpeg(bytesB)
        : formatB === "png"
          ? parsePng(bytesB)
          : parseWebp(bytesB);
    await recordCheck(
      ctx,
      args.analysisId,
      buildStructureCheck({
        format: `${formatA} / ${formatB}`,
        jpeg: formatA === "jpeg" ? (infoA as JpegInfo) : formatB === "jpeg" ? (infoB as JpegInfo) : null,
        png: formatA === "png" ? (infoA as PngInfo) : formatB === "png" ? (infoB as PngInfo) : null,
        webp: formatA === "webp" ? (infoA as WebpInfo) : formatB === "webp" ? (infoB as WebpInfo) : null,
        decodeOk: true,
        decodeNote: "Both containers parsed at header level.",
      }),
    );

    // Metadata: both files.
    const exifA = await extractExif(bytesA, formatA);
    const exifB = await extractExif(bytesB, formatB);
    await recordCheck(
      ctx,
      args.analysisId,
      buildMetadataCheck({
        format: `${formatA} vs ${formatB}`,
        exif: exifA ?? exifB,
        containerNotes: [
          exifA
            ? "File A carries EXIF metadata."
            : "File A has no EXIF metadata.",
          exifB
            ? "File B carries EXIF metadata."
            : "File B has no EXIF metadata.",
        ],
      }),
    );

    // Pixel-level comparison (JPEG + PNG have decoders in this pipeline).
    const decodable = (f: string) => f === "jpeg" || f === "png";
    if (!decodable(formatA) || !decodable(formatB)) {
      await recordCheck(ctx, args.analysisId, {
        type: "pixelDiff",
        name: "Pixel difference analysis",
        status: "skipped",
        completed: false,
        findings: [
          `Pixel-level comparison supports JPEG and PNG inputs; this pair is ${formatA.toUpperCase()} and ${formatB.toUpperCase()}. Converting either file first would measure the conversion instead of the uploaded content, so the comparison was not run.`,
        ],
        measurements: [
          { label: "File A", value: formatA.toUpperCase() },
          { label: "File B", value: formatB.toUpperCase() },
        ],
        explanation:
          "Both files are structurally readable, but this pipeline has no pixel decoder for WebP, so a numeric pixel difference was not computed.",
        limitations:
          "No pixel-difference claim is made for this pair. Container-level comparison only.",
        evidence: [
          {
            kind: "context",
            title: "Pixel comparison unavailable",
            detail: "At least one input format has no decoder in this pipeline.",
            source: "pixelDiff",
          },
        ],
      });
      await markStep(ctx, args.analysisId, "compare");
      return { ok: true as const, ran: false };
    }

    const decodedA = decodeForAnalysis(bytesA, formatA);
    const decodedB = decodeForAnalysis(bytesB, formatB);
    if (!decodedA.ok || !decodedB.ok) {
      const note = [
        decodedA.ok ? null : `File A: ${decodedA.note}`,
        decodedB.ok ? null : `File B: ${decodedB.note}`,
      ]
        .filter(Boolean)
        .join(" ");
      await recordCheck(ctx, args.analysisId, {
        type: "pixelDiff",
        name: "Pixel difference analysis",
        status: "error",
        completed: false,
        findings: [note],
        measurements: [],
        explanation: "At least one file could not be decoded to pixels.",
        limitations: "No pixel-difference measurement was produced.",
        evidence: [
          {
            kind: "warning",
            title: "Comparison decode failed",
            detail: note,
            source: "pixelDiff",
          },
        ],
      });
      await markStep(ctx, args.analysisId, "compare");
      return { ok: true as const, ran: false };
    }

    const result: ComparisonResult = compareImages(decodedA.image, decodedB.image);
    const diffPng = encodePng(result.diffImage);
    const storageId = await ctx.storage.store(
      new Blob([diffPng as unknown as BlobPart], { type: "image/png" }),
    );
    await ctx.runMutation(internal.analyses.saveArtifact, {
      analysisId: args.analysisId,
      kind: "diff",
      storageId,
      label: "Pixel difference visualization",
      description: result.method,
    });

    await recordCheck(
      ctx,
      args.analysisId,
      buildPixelDiffCheck({
        metrics: result.metrics,
        method: result.method,
        formatA,
        formatB,
        nameA: analysis.fileName,
        nameB: analysis.fileNameB ?? "file B",
      }),
    );
    await markStep(
      ctx,
      args.analysisId,
      "compare",
      {},
      {
        aspectRatioDelta: result.aspectRatioDelta,
        targetWidth: result.metrics.targetWidth,
        targetHeight: result.metrics.targetHeight,
        resampled: result.metrics.resampled,
      },
    );
    return { ok: true as const, ran: true };
  },
});

void MAX_UPLOAD_BYTES;
void ANALYSIS_ANALYSIS_VERSION;
