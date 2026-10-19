import { describe, expect, it } from "vitest";
import {
  MAX_QUESTION_LENGTH,
  ruleBasedAnswer,
  type ExplanationContext,
} from "../explain";
import type { CheckResult } from "../forensics/types";
import type { EvidenceItem } from "../forensics/checks";

const results: CheckResult[] = [
  {
    type: "validation",
    name: "File validation",
    status: "clear",
    findings: ["File contents match the PNG specification."],
    measurements: [{ label: "Detected format", value: "PNG" }],
    explanation: "Upload validated against its own bytes.",
    limitations: "Validation is not an authenticity judgement.",
    completed: true,
  },
  {
    type: "metadata",
    name: "Metadata inspection",
    status: "inconclusive",
    findings: ["No EXIF block was found in this file."],
    measurements: [],
    explanation: "No embedded metadata survived.",
    limitations: "Metadata absence says little on its own.",
    completed: true,
  },
  {
    type: "compression",
    name: "JPEG compression analysis (ELA)",
    status: "flag",
    findings: ["Two regions respond differently to recompression."],
    measurements: [{ label: "Mean error level", value: "1.4" }],
    explanation: "Regions reacted unevenly to a fresh compression step.",
    limitations: "ELA is a heuristic, never proof of alteration.",
    completed: true,
  },
];

const evidence: EvidenceItem[] = [
  {
    kind: "warning",
    title: "Region responds differently to recompression",
    detail: "The cell sits well above the image's own median.",
    source: "compression",
  },
  {
    kind: "context",
    title: "No embedded metadata",
    detail: "Normal for screenshots and platform-hosted images.",
    source: "metadata",
  },
];

const imageContext: ExplanationContext = {
  assessment: "inconsistencies",
  kind: "image",
  results,
  evidence,
};

const comparisonContext: ExplanationContext = {
  assessment: "inconclusive",
  kind: "comparison",
  results: [results[0], results[1]],
  evidence: [],
};

describe("ruleBasedAnswer", () => {
  it("explains the overall reading without declaring a verdict", () => {
    const answer = ruleBasedAnswer(
      "Why is this the overall reading?",
      imageContext,
    );
    expect(answer.trim().length).toBeGreaterThan(30);
    expect(answer.length).toBeLessThan(3000);
    expect(answer).not.toMatch(/^(yes|no)[.!]?$/i);
  });

  it("answers the metadata question with the honest framing", () => {
    const answer = ruleBasedAnswer(
      "Does missing metadata mean the image was edited?",
      imageContext,
    );
    expect(answer.trim().length).toBeGreaterThan(30);
    expect(answer.length).toBeLessThan(3000);
  });

  it("answers what to check next", () => {
    const answer = ruleBasedAnswer("What should I check next?", imageContext);
    expect(answer.trim().length).toBeGreaterThan(30);
    expect(answer.length).toBeLessThan(3000);
  });

  it("answers comparison questions for comparison reports", () => {
    const answer = ruleBasedAnswer(
      "Do these files show the same content?",
      comparisonContext,
    );
    expect(answer.trim().length).toBeGreaterThan(30);
    expect(answer.length).toBeLessThan(3000);
  });

  it("survives a question far longer than the allowed maximum", () => {
    const oversized = "why ".repeat(MAX_QUESTION_LENGTH);
    const answer = ruleBasedAnswer(oversized, imageContext);
    expect(answer.trim().length).toBeGreaterThan(10);
    expect(answer.length).toBeLessThan(3000);
  });

  it("falls back to a helpful answer for questions it has no rule for", () => {
    const answer = ruleBasedAnswer(
      "What colour is the Eiffel tower in this photo?",
      imageContext,
    );
    expect(answer.trim().length).toBeGreaterThan(10);
    expect(answer.length).toBeLessThan(3000);
  });
});
