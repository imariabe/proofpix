import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { MAX_UPLOAD_BYTES } from "../lib/forensics/sniff";
import { ASSESSMENT_LABELS } from "../lib/forensics/types";
import type { Id } from "./_generated/dataModel";

/**
 * Storage deletes are best-effort: validation failures already delete the
 * uploaded blob immediately, so a later report deletion must not throw when
 * the file is gone.
 */
async function safeDeleteFile(
  ctx: MutationCtx,
  id: Id<"_storage"> | undefined,
) {
  if (!id) return;
  try {
    await ctx.storage.delete(id);
  } catch {
    /* already gone */
  }
}

export const ANALYSIS_VERSION = "proofpix-checks-v1";

/** Resolve the signed-in user or throw a clean, non-leaking error. */
async function requireUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated.");
  }
  return userId;
}

/**
 * Signed upload URL. The client POSTs the raw file straight to storage; no
 * file bytes ever pass through a function call payload.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Create the analysis record after the file is stored. */
export const create = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    sizeBytes: v.number(),
    kind: v.union(v.literal("image"), v.literal("comparison")),
    storageIdB: v.optional(v.id("_storage")),
    fileNameB: v.optional(v.string()),
    sizeBytesB: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.sizeBytes > MAX_UPLOAD_BYTES || (args.sizeBytesB ?? 0) > MAX_UPLOAD_BYTES) {
      // Reject and clean up the file that was already uploaded.
      await ctx.storage.delete(args.storageId);
      if (args.storageIdB) await ctx.storage.delete(args.storageIdB);
      throw new Error("File exceeds the upload size limit.");
    }
    if (args.kind === "comparison" && (!args.storageIdB || !args.fileNameB)) {
      await ctx.storage.delete(args.storageId);
      throw new Error("A comparison needs two files.");
    }
    const analysisId = await ctx.db.insert("analyses", {
      userId,
      kind: args.kind,
      status: "pending",
      fileName: args.fileName,
      sizeBytes: args.sizeBytes,
      recommendations: [],
      completedSteps: [],
      analysisVersion: ANALYSIS_VERSION,
      ...(args.storageIdB
        ? { storageIdB: args.storageIdB, fileNameB: args.fileNameB, sizeBytesB: args.sizeBytesB }
        : {}),
      imageStorageId: args.storageId,
    });
    return { analysisId };
  },
});

/** The signed-in customer's catalog, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("analyses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
    return rows.map((a) => ({
      _id: a._id,
      kind: a.kind,
      status: a.status,
      assessment: a.assessment ?? null,
      fileName: a.fileName,
      fileNameB: a.fileNameB ?? null,
      format: a.format ?? null,
      formatB: a.formatB ?? null,
      sizeBytes: a.sizeBytes,
      width: a.width ?? null,
      height: a.height ?? null,
      createdAt: a._creationTime,
      error: a.error ?? null,
    }));
  },
});

/** Aggregate numbers for the dashboard header. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { total: 0, completed: 0, flagged: 0, failed: 0, last30Days: 0 };
    }
    const rows = await ctx.db
      .query("analyses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    return {
      total: rows.length,
      completed: rows.filter((r) => r.status === "completed").length,
      flagged: rows.filter((r) => r.assessment === "inconsistencies").length,
      failed: rows.filter((r) => r.status === "failed").length,
      last30Days: rows.filter((r) => r._creationTime > monthAgo).length,
    };
  },
});

/**
 * Full report payload: analysis + checks + artifacts + explanations, with
 * signed storage URLs resolved for the requester only.
 */
export const getReport = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== userId) return null;

    const results = await ctx.db
      .query("analysisResults")
      .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
      .collect();
    const artifacts = await ctx.db
      .query("analysisArtifacts")
      .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
      .collect();
    const explanations = await ctx.db
      .query("aiExplanations")
      .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
      .order("desc")
      .take(30);

    const originalUrl = analysis.imageStorageId
      ? await ctx.storage.getUrl(analysis.imageStorageId)
      : null;
    const originalUrlB = analysis.imageStorageIdB
      ? await ctx.storage.getUrl(analysis.imageStorageIdB)
      : null;
    const artifactUrls = await Promise.all(
      artifacts.map(async (a) => ({
        _id: a._id,
        kind: a.kind,
        label: a.label,
        description: a.description,
        meta: a.meta ?? null,
        url: await ctx.storage.getUrl(a.storageId),
      })),
    );

    return {
      analysis: {
        _id: analysis._id,
        kind: analysis.kind,
        status: analysis.status,
        assessment: analysis.assessment ?? null,
        assessmentLabel: analysis.assessment
          ? ASSESSMENT_LABELS[analysis.assessment]
          : null,
        fileName: analysis.fileName,
        fileNameB: analysis.fileNameB ?? null,
        format: analysis.format ?? null,
        formatB: analysis.formatB ?? null,
        sizeBytes: analysis.sizeBytes,
        sizeBytesB: analysis.sizeBytesB ?? null,
        width: analysis.width ?? null,
        height: analysis.height ?? null,
        widthB: analysis.widthB ?? null,
        heightB: analysis.heightB ?? null,
        error: analysis.error ?? null,
        completedSteps: analysis.completedSteps,
        recommendations: analysis.recommendations,
        analysisVersion: analysis.analysisVersion,
        createdAt: analysis._creationTime,
      },
      results,
      artifacts: artifactUrls,
      originalUrl,
      originalUrlB,
      explanations,
    };
  },
});

/** Delete an analysis, its rows, its explanations, and every stored file. */
export const remove = mutation({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== userId) {
      throw new Error("Not authorized.");
    }
    const results = await ctx.db
      .query("analysisResults")
      .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
      .collect();
    for (const r of results) await ctx.db.delete(r._id);
    const artifacts = await ctx.db
      .query("analysisArtifacts")
      .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
      .collect();
    for (const a of artifacts) {
      await safeDeleteFile(ctx, a.storageId);
      await ctx.db.delete(a._id);
    }
    const explanations = await ctx.db
      .query("aiExplanations")
      .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
      .collect();
    for (const e of explanations) await ctx.db.delete(e._id);
    await safeDeleteFile(ctx, analysis.imageStorageId);
    await safeDeleteFile(ctx, analysis.imageStorageIdB);
    await ctx.db.delete(analysis._id);
  },
});

/* ------------------------------------------------------------------ */
/* Internal helpers called by the analysis pipeline (steps.ts)         */
/* ------------------------------------------------------------------ */

export const appendStep = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    step: v.string(),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) throw new Error("Analysis not found.");
    await ctx.db.patch(args.analysisId, {
      ...args.patch,
      // The pipeline is actively working: reflect that for catalog viewers.
      status: "running",
      completedSteps: analysis.completedSteps.includes(args.step)
        ? analysis.completedSteps
        : [...analysis.completedSteps, args.step],
    });
  },
});

export const saveResult = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    type: v.string(),
    name: v.string(),
    status: v.string(),
    findings: v.array(v.string()),
    measurements: v.array(v.object({ label: v.string(), value: v.string() })),
    explanation: v.string(),
    limitations: v.string(),
    completed: v.boolean(),
    evidence: v.array(
      v.object({
        kind: v.string(),
        title: v.string(),
        detail: v.string(),
        source: v.string(),
        measurement: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("analysisResults")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const same = existing.find((r) => r.type === args.type);
    const doc = {
      type: args.type,
      name: args.name,
      status: args.status,
      findings: args.findings,
      measurements: args.measurements,
      explanation: args.explanation,
      limitations: args.limitations,
      completed: args.completed,
      evidence: args.evidence as {
        kind: "confirmed" | "warning" | "context";
        title: string;
        detail: string;
        source: string;
        measurement?: string;
      }[],
    };
    if (same) {
      await ctx.db.patch(same._id, doc);
    } else {
      await ctx.db.insert("analysisResults", {
        analysisId: args.analysisId,
        ...doc,
      });
    }
  },
});

export const saveArtifact = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    kind: v.string(),
    storageId: v.id("_storage"),
    label: v.string(),
    description: v.string(),
    meta: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Upsert by kind: a resumed or retried pipeline step must not leave
    // duplicate artifacts (or orphaned blobs) behind.
    const existing = await ctx.db
      .query("analysisArtifacts")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const same = existing.find((a) => a.kind === args.kind);
    if (same) {
      await safeDeleteFile(ctx, same.storageId);
      await ctx.db.patch(same._id, {
        storageId: args.storageId,
        label: args.label,
        description: args.description,
        meta: args.meta,
      });
    } else {
      await ctx.db.insert("analysisArtifacts", { ...args });
    }
  },
});

export const finish = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    assessment: v.optional(
      v.union(
        v.literal("no_anomaly"),
        v.literal("inconsistencies"),
        v.literal("inconclusive"),
        v.literal("incomplete"),
        v.literal("unsupported"),
      ),
    ),
    status: v.union(v.literal("completed"), v.literal("failed")),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    const { assessment, status, patch, analysisId } = args;
    await ctx.db.patch(analysisId, {
      ...(assessment ? { assessment } : {}),
      status,
      ...patch,
    });
  },
});

export const saveExplanation = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    question: v.string(),
    answer: v.string(),
    source: v.union(v.literal("rule_based"), v.literal("ai")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiExplanations", args);
  },
});

/**
 * Delete an account and everything it owns: analyses, results, artifacts,
 * explanations, stored files, auth sessions/accounts, and finally the user.
 */
/**
 * Internal reads used by the pipeline actions. Authorization is re-checked in
 * the calling action against the signed-in user before these are used.
 */
export const getAnalysis = internalQuery({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.analysisId);
  },
});

export const getResults = internalQuery({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("analysisResults")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const analyses = await ctx.db
      .query("analyses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const analysis of analyses) {
      const results = await ctx.db
        .query("analysisResults")
        .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
        .collect();
      for (const r of results) await ctx.db.delete(r._id);
      const artifacts = await ctx.db
        .query("analysisArtifacts")
        .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
        .collect();
      for (const a of artifacts) {
        await safeDeleteFile(ctx, a.storageId);
        await ctx.db.delete(a._id);
      }
      const explanations = await ctx.db
        .query("aiExplanations")
        .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
        .collect();
      for (const e of explanations) await ctx.db.delete(e._id);
      await safeDeleteFile(ctx, analysis.imageStorageId);
      await safeDeleteFile(ctx, analysis.imageStorageIdB);
      await ctx.db.delete(analysis._id);
    }

    // The user document is the identity anchor for Convex Auth: removing it
    // invalidates the account immediately (identity lookups return null and
    // every owned analysis is already gone with it).
    await ctx.db.delete(userId);
  },
});
