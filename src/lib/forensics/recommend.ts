/**
 * Contextual recommended next steps.
 *
 * Guidance is derived from what the analysis actually measured — never from a
 * template that implies a technical check proved fraud.
 */
import type { Assessment, CheckResult } from "./types";
import type { EvidenceItem } from "./checks";

export interface Recommendation {
  title: string;
  detail: string;
}

export function buildRecommendations(input: {
  assessment: Assessment;
  kind: "image" | "comparison";
  results: CheckResult[];
  evidence: EvidenceItem[];
  format?: string;
}): Recommendation[] {
  const recs: Recommendation[] = [];
  const has = (type: string, pred?: (r: CheckResult) => boolean) =>
    input.results.some((r) => r.type === type && (!pred || pred(r)));

  // Always first: technical checks are one leg of the evidence, not the verdict.
  recs.push({
    title: "Treat this report as one line of inquiry",
    detail:
      "Technical checks describe how the file is built. They cannot confirm what actually happened in the world — that needs corroboration beyond the image.",
  });

  if (input.assessment === "unsupported" || input.assessment === "incomplete") {
    recs.push({
      title: "Re-upload an unmodified copy",
      detail:
        "Ask the sender for the original file as it first left the source device — through a method that does not recompress, such as a direct file transfer or email attachment rather than a messaging app.",
    });
    return recs;
  }

  const missingMetadata =
    has("metadata", (r) => r.status === "inconclusive");
  const flagged = input.evidence.filter((e) => e.kind === "warning");

  if (missingMetadata) {
    recs.push({
      title: "Request the original file, not a re-share",
      detail:
        "This file carries no embedded metadata, which is normal for screenshots and platform-hosted images. Ask for the original from the source device — if the file claims to be a photo, the camera's own copy should contain camera metadata.",
    });
  }

  if (flagged.some((e) => /software|editing|written by/i.test(e.title))) {
    recs.push({
      title: "Compare against an independently obtained original",
      detail:
        "The file records that an editing or conversion tool wrote it. Obtain a copy from a source you control — the camera, the official website, the issuing organisation — and compare the two here.",
    });
  }

  if (flagged.some((e) => /trailing|appended|checksum|dimension|mismatch/i.test(e.title))) {
    recs.push({
      title: "Obtain a second copy before relying on this one",
      detail:
        "One or more internal consistency conditions failed. Get another copy of the same image through a different channel and run the comparison — genuine files from the same source should agree.",
    });
  }

  if (has("compression", (r) => r.status === "inconclusive")) {
    recs.push({
      title: "Inspect the highlighted areas by eye",
      detail:
        "The ELA visualization shows regions that respond differently to recompression. Compare those areas with the rest of the image for editing cues that the machine cannot judge — mismatched text, repeated patterns, unnatural edges — and remember the highlight alone proves nothing.",
    });
  }

  if (input.kind === "comparison") {
    recs.push({
      title: "Verify provenance with the publisher of the image",
      detail:
        "Pixel comparison tells you how far apart two files are. Only the chain of custody — where each file came from and who handled it — can establish which one to trust.",
    });
  }

  recs.push({
    title: "Corroborate claims through official channels",
    detail:
      "For payment receipts, conversations, and documents: verify the underlying event directly with the institution involved. An image of a receipt is never proof that a transaction occurred.",
  });

  // Cap the list so the report stays readable.
  return recs.slice(0, 5);
}
