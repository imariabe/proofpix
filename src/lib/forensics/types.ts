/**
 * Shared result vocabulary for ProofPix analysis checks.
 *
 * These types are used by the Convex analysis actions, the report UI, and the
 * unit tests, so they must stay free of runtime dependencies on Convex.
 */

/** A check finished and produced a defensible reading. */
export type CompletedStatus = "clear" | "flag" | "inconclusive";

/**
 * Check outcome. These are deliberately distinct states that must never be
 * conflated: an image that passed available checks is not the same as an image
 * whose check could not run.
 *
 * - clear:           the check ran and found nothing worth flagging
 * - flag:            the check ran and measured something worth investigating
 * - inconclusive:    the check ran but the evidence does not support a reading
 * - skipped:         the check does not apply to this file (method unsupported)
 * - error:           the check failed technically
 */
export type CheckStatus =
  | CompletedStatus
  | "skipped"
  | "error"
  | "pending"
  | "running";

export type CheckType =
  | "validation"
  | "metadata"
  | "structure"
  | "encoding"
  | "consistency"
  | "compression"
  | "pixelDiff";

export interface Measurement {
  label: string;
  value: string;
}

export interface CheckResult {
  type: CheckType;
  name: string;
  status: CheckStatus;
  /** Observed facts, written as measurements rather than verdicts. */
  findings: string[];
  /** Quantities the engine actually measured. */
  measurements: Measurement[];
  /** What the result means in plain language. */
  explanation: string;
  /** Explicit boundary of what this check cannot establish. */
  limitations: string;
  /** True when the underlying operation ran to completion. */
  completed: boolean;
}

/** Overall report assessment. Never "real" or "fake". */
export type Assessment =
  | "no_anomaly"
  | "inconsistencies"
  | "inconclusive"
  | "incomplete"
  | "unsupported";

export const ASSESSMENT_LABELS: Record<Assessment, string> = {
  no_anomaly: "No Significant Anomaly Detected by Available Checks",
  inconsistencies: "Potential Technical Inconsistencies Identified",
  inconclusive: "Inconclusive",
  incomplete: "Analysis Incomplete",
  unsupported: "Unsupported File",
};

export const ASSESSMENT_SUMMARIES: Record<Assessment, string> = {
  no_anomaly:
    "Every check that applies to this file completed and none of them measured an inconsistency worth flagging. This is not a statement that the image is authentic — only that these tools found nothing unusual.",
  inconsistencies:
    "At least one check measured a technical characteristic that can occur when an image has been processed, re-saved, or assembled from more than one source. This is a lead to investigate, not proof of manipulation.",
  inconclusive:
    "The checks that ran did not produce enough evidence to support a reading either way. Missing or sparse metadata is the most common reason.",
  incomplete:
    "One or more checks could not be completed, so the report is partial. Review the findings below with that in mind.",
  unsupported:
    "The uploaded file could not be accepted for analysis. See the validation findings for the reason.",
};

export const STATUS_LABELS: Record<CheckStatus, string> = {
  clear: "Clear",
  flag: "Potential inconsistency",
  inconclusive: "Inconclusive",
  skipped: "Not applicable",
  error: "Check failed",
  pending: "Pending",
  running: "Running",
};

/** Human-facing names for each check. */
export const CHECK_NAMES: Record<CheckType, string> = {
  validation: "File validation",
  metadata: "Metadata inspection",
  structure: "File structure and encoding",
  encoding: "Encoding characteristics",
  consistency: "Consistency checks",
  compression: "JPEG compression analysis (ELA)",
  pixelDiff: "Pixel difference analysis",
};

export const LIMITATION_NOTES = {
  noMetadata:
    "Metadata only survives if nothing stripped it. Social platforms, messaging apps, screenshots, and most re-saving workflows remove EXIF entirely. Missing metadata therefore says very little on its own — most screenshots and platform-hosted images have no EXIF by design.",
  technicalOnly:
    "This check inspects file structure and encoding. Ordinary workflows — re-saving, resizing, exporting from an editor, platform uploads, screenshots — produce the same patterns as deliberate editing.",
  ela: "Error Level Analysis highlights regions that respond differently to a recompression step. Texture, edges, resizing, camera processing, and multiple legitimate saves all produce bright areas, and edits made before the first save may not stand out at all. It is a heuristic for guiding review, never proof of alteration.",
  pixelDiff:
    "Pixel comparison measures numeric differences between decoded pixels. Small differences are expected from resizing, alignment, recompression, colour-profile conversion, and format changes. A large difference shows the two files depict different content or processing — not who altered them or why.",
} as const;