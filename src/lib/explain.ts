/**
 * Rule-based evidence explainer.
 *
 * Answers come strictly from the structured results stored for the analysis.
 * This module is the fallback when no LLM provider is configured, and it must
 * never invent file properties or claim checks that did not run.
 */
import type { Assessment, CheckResult } from "./forensics/types";
import { ASSESSMENT_LABELS, STATUS_LABELS } from "./forensics/types";
import type { EvidenceItem } from "./forensics/checks";

export interface ExplanationContext {
  assessment: Assessment;
  kind: "image" | "comparison";
  results: CheckResult[];
  evidence: EvidenceItem[];
}

export interface SuggestedQuestion {
  id: string;
  question: string;
}

export const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  {
    id: "meaning",
    question: "What does this result actually mean?",
  },
  {
    id: "missing-metadata",
    question: "Why is some of the metadata missing?",
  },
  {
    id: "proves-edit",
    question: "Does any of this prove the image was edited?",
  },
  {
    id: "next",
    question: "What should I check next?",
  },
  {
    id: "vs-proof",
    question:
      'What is the difference between a "potential inconsistency" and proof of manipulation?',
  },
];

export const MAX_QUESTION_LENGTH = 400;

function summarize(check: CheckResult): string {
  const label = STATUS_LABELS[check.status] ?? check.status;
  const first = check.findings[0];
  return `${check.name}: ${label}${first ? ` — ${first}` : ""}.`;
}

export function ruleBasedAnswer(
  question: string,
  ctx: ExplanationContext,
): string {
  const q = question.toLowerCase();
  const assessmentLabel = ASSESSMENT_LABELS[ctx.assessment];
  const completed = ctx.results.filter((r) => r.completed);
  const warnings = ctx.evidence.filter((e) => e.kind === "warning");
  const confirmed = ctx.evidence.filter((e) => e.kind === "confirmed");
  const skipped = ctx.results.filter((r) => r.status === "skipped");
  const failed = ctx.results.filter((r) => r.status === "error");

  const lines: string[] = [];

  const mentions = (...words: string[]) => words.some((w) => q.includes(w));

  if (mentions("prove", "proof", "fake", "edited", "manipulat", "fraud", "genuine", "real")) {
    lines.push(
      `This report does not establish that the image is genuine or that it was manipulated. Its overall reading is “${assessmentLabel}” — a description of what the checks measured, not a verdict.`,
    );
    if (warnings.length > 0) {
      lines.push(
        "What it did detect: " +
          warnings.map((w) => `${w.title} (${w.source} check)`).join("; ") +
          ". These are leads worth corroborating. Ordinary processing — resizing, re-saving, exporting, screenshots, platform uploads — produces the same signals.",
      );
    } else {
      lines.push(
        "No check flagged an inconsistency in this file. Passing every available check is weak support at best: the tools here look at file structure and encoding, which a determined forger can reproduce.",
      );
    }
    if (confirmed.length > 0) {
      lines.push(
        "Measured and confirmed directly from the file: " +
          confirmed.map((c) => c.title.toLowerCase()).join("; ") +
          ".",
      );
    }
    lines.push(
      "Establishing authenticity requires evidence outside the file: the original copy, the chain of custody, and corroboration of what the image claims to depict.",
    );
    return lines.join("\n\n");
  }

  if (mentions("missing", "metadata", "exif", "no data", "strip")) {
    const metadata = ctx.results.find((r) => r.type === "metadata");
    lines.push(
      metadata && metadata.status === "inconclusive"
        ? "This file contains no EXIF block. Social platforms, messaging apps, and most converters remove metadata during upload, download, sharing, or recompression — and screenshots never contain any. Missing metadata is the normal state for most images people exchange, so by itself it says nothing about authenticity."
        : metadata
          ? `This file does carry metadata. ${metadata.findings.slice(0, 3).join(" ")}`
          : "The metadata check did not run for this analysis.",
    );
    lines.push(
      "What would matter more: ask where the file came from and request the original from the source device. A photo claimed to come straight from a camera should carry camera metadata in its original form.",
    );
    return lines.join("\n\n");
  }

  if (mentions("next", "should i check", "what to do", "recommend")) {
    lines.push(
      warnings.length > 0
        ? "Start with the warning signs in this report — each one names a specific measurement to corroborate."
        : "The checks found nothing to chase, so the useful next steps sit outside the file itself:",
    );
    lines.push(
      "1. Request the original file from the source, transferred in a way that does not recompress it.\n2. Compare it against an independently obtained copy using the comparison workspace.\n3. Corroborate whatever the image claims — payments, messages, documents — directly with the institution involved.\n4. Check where and when the file first appeared; provenance is evidence that no technical check can replace.",
    );
    return lines.join("\n\n");
  }

  if (mentions("difference between", "potential inconsistency", "warning sign")) {
    lines.push(
      "A potential inconsistency is a measurement that differs from what a clean, single-process file usually looks like — an editing-tool signature, a dimension mismatch, an uneven compression response. It means “look closer”, and it has many innocent explanations.",
    );
    lines.push(
      `Proof of manipulation would require evidence that excludes every innocent explanation — which no check in this tool provides. That is why this report's reading is “${assessmentLabel}” and never “fake”.`,
    );
    return lines.join("\n\n");
  }

  if (mentions("ela", "compression", "error level", "highlight", "hotspot", "overlay")) {
    const ela = ctx.results.find((r) => r.type === "compression");
    lines.push(
      ela
        ? `The compression analysis (Error Level Analysis) worked by recompressing the JPEG at a fixed quality and amplifying where the file changed most. ${ela.findings.join(" ")}`
        : "No compression analysis ran for this file — ELA applies to JPEG inputs only.",
    );
    lines.push(
      "Bright areas in the visualization respond differently to a fresh save. Texture, sharp edges, resizing, and multiple legitimate saves all produce them; edits made before the first save may not stand out at all. It is a map for where to look, not a verdict on what you find there.",
    );
    return lines.join("\n\n");
  }

  if (mentions("compare", "comparison", "difference", "two images")) {
    const diff = ctx.results.find((r) => r.type === "pixelDiff");
    lines.push(
      diff
        ? `The comparison measured: ${diff.findings.join(" ")} ${diff.explanation}`
        : "No pixel comparison was part of this analysis. You can upload two files in the comparison workspace to measure how far apart they are.",
    );
    lines.push(
      "A pixel difference describes how far apart two files are in content. It cannot say who produced the difference or why.",
    );
    return lines.join("\n\n");
  }

  // Default: what was detected, what it may indicate, what cannot be concluded.
  lines.push(
    `Overall reading: “${assessmentLabel}”. ${completed.length} check(s) completed${failed.length ? `, ${failed.length} failed` : ""}${skipped.length ? `, ${skipped.length} not applicable to this file` : ""}.`,
  );
  if (warnings.length > 0) {
    lines.push(
      "Detected (potential warning signs): " +
        warnings.map((w) => `${w.title} — ${w.detail}`).join(" "),
    );
  }
  if (confirmed.length > 0) {
    lines.push(
      "Confirmed measurements: " +
        confirmed.map((c) => c.title).join("; ") +
        ".",
    );
  }
  lines.push(
    "What cannot be concluded: whether the image is authentic, whether anything depicted actually happened, or who altered the file if it was altered. Image analysis alone cannot establish real-world facts.",
  );
  void summarize;
  return lines.join("\n\n");
}
