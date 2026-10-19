"use node";

/**
 * Evidence explainer.
 *
 * Uses the LLM integration when one is configured on this deployment;
 * otherwise (or on any provider failure) answers from the rule-based engine.
 * The source of every answer is stored and shown in the UI, so the app never
 * presents rule-based text as AI output or vice versa. The model only ever
 * receives structured check results — never image bytes.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { vly } from "../lib/vly-integrations";
import {
  MAX_QUESTION_LENGTH,
  ruleBasedAnswer,
  type ExplanationContext,
} from "../lib/explain";
import { collectEvidence } from "../lib/forensics/checks";
import type { CheckResult } from "../lib/forensics/types";

const SYSTEM_PROMPT = `You are the evidence explainer inside ProofPix, a digital image investigation platform for fact-checkers.

You are given the structured output of technical image checks that actually ran. Rules you must never break:
- Never state that an image is fake, forged, authentic, or genuine. Describe only what the checks measured.
- Never invent file properties, measurements, checks, or tests that are not in the provided results.
- Missing metadata is normal for screenshots and platform-hosted images; it is not evidence of manipulation.
- Explain each finding in plain language: what was detected, what it may indicate, innocent alternative explanations, and what cannot be concluded.
- Distinguish a "potential inconsistency" (a lead) from proof of manipulation (which you never provide).
- If asked about real-world facts (payments, messages, events), say image analysis cannot establish them.
- Keep answers under 200 words, clear enough for a non-technical reader, no markdown headers, short paragraphs or a simple list.`;

interface StoredCheck {
  type?: string;
  name?: string;
  status?: string;
  findings?: string[];
  measurements?: { label: string; value: string }[];
  explanation?: string;
  limitations?: string;
  completed?: boolean;
}

interface CompletionRequest {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

type CompletionFn = (
  request: CompletionRequest,
) => Promise<{ success: boolean; data?: unknown }>;

/**
 * The integration gateway exposes completion at runtime; the wrapper type
 * surface differs across versions, so resolve it defensively and treat a
 * missing method as "no AI configured" rather than an error.
 */
function resolveCompletion(): CompletionFn | null {
  const candidate = (vly as unknown as { completion?: unknown }).completion;
  return typeof candidate === "function"
    ? (candidate as CompletionFn).bind(vly)
    : null;
}

export const ask = action({
  args: {
    analysisId: v.id("analyses"),
    question: v.string(),
  },
  handler: async (ctx, args): Promise<{ answer: string; source: "rule_based" | "ai" }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated.");
    const analysis = (await ctx.runQuery(internal.analyses.getAnalysis, {
      analysisId: args.analysisId,
    })) as Doc<"analyses"> | null;
    if (!analysis || analysis.userId !== userId) {
      throw new Error("Not authorized for this analysis.");
    }

    const question = args.question.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question) throw new Error("Please enter a question.");

    const results = (await ctx.runQuery(internal.analyses.getResults, {
      analysisId: args.analysisId,
    })) as unknown as StoredCheck[];

    const normalized: CheckResult[] = results.map((r) => ({
      type: (r.type ?? "structure") as CheckResult["type"],
      name: r.name ?? r.type ?? "Check",
      status: (r.status ?? "error") as CheckResult["status"],
      findings: r.findings ?? [],
      measurements: r.measurements ?? [],
      explanation: r.explanation ?? "",
      limitations: r.limitations ?? "",
      completed: r.completed ?? false,
    }));

    const ctxData: ExplanationContext = {
      assessment: analysis.assessment ?? "inconclusive",
      kind: analysis.kind,
      results: normalized,
      evidence: collectEvidence(
        results as unknown as (CheckResult & { evidence?: import("../lib/forensics/checks").EvidenceItem[] })[],
      ),
    };

    const ruleBased = ruleBasedAnswer(question, ctxData);

    let answer = ruleBased;
    let source: "rule_based" | "ai" = "rule_based";

    const aiConfigured = Boolean(process.env.VLY_INTEGRATION_KEY);
    const completion = resolveCompletion();
    if (aiConfigured && completion) {
      try {
        const result = await completion({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `OVERALL READING: ${analysis.assessment ?? "incomplete"}\n` +
                `ANALYSIS KIND: ${analysis.kind}\n` +
                `FILE: ${analysis.fileName} (${analysis.format ?? "unknown"}${
                  analysis.width && analysis.height
                    ? `, ${analysis.width}×${analysis.height}`
                    : ""
                })\n\n` +
                `CHECK RESULTS (all that actually ran):\n` +
                JSON.stringify(
                  normalized.map((r) => ({
                    name: r.name,
                    status: r.status,
                    completed: r.completed,
                    findings: r.findings.slice(0, 6),
                    measurements: r.measurements.slice(0, 12),
                    limitations: r.limitations,
                  })),
                ) +
                `\n\nCUSTOMER QUESTION:\n${question}`,
            },
          ],
          temperature: 0.2,
          maxTokens: 400,
        });
        if (result.success && result.data) {
          const text =
            typeof result.data === "string"
              ? result.data
              : String(
                  (result.data as { choices?: { message?: { content?: string } }[] })
                    .choices?.[0]?.message?.content ?? "",
                ).trim();
          if (text.length > 0) {
            answer = text;
            source = "ai";
          }
        }
      } catch {
        // Graceful fallback: the rule-based answer is already computed.
        answer = ruleBased;
        source = "rule_based";
      }
    }

    await ctx.runMutation(internal.analyses.saveExplanation, {
      analysisId: args.analysisId,
      question,
      answer,
      source,
    });

    return { answer, source };
  },
});
