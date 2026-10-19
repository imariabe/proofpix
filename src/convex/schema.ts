import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const analysisStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);
export type AnalysisStatus = Infer<typeof analysisStatusValidator>;

export const assessmentValidator = v.union(
  v.literal("no_anomaly"),
  v.literal("inconsistencies"),
  v.literal("inconclusive"),
  v.literal("incomplete"),
  v.literal("unsupported"),
);

const evidenceItemValidator = v.object({
  kind: v.union(v.literal("confirmed"), v.literal("warning"), v.literal("context")),
  title: v.string(),
  detail: v.string(),
  source: v.string(),
  measurement: v.optional(v.string()),
});

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // One submitted item in the customer's catalog: a single image analysis or
    // a two-image comparison. `status` reflects the pipeline stage honestly.
    analyses: defineTable({
      userId: v.id("users"),
      kind: v.union(v.literal("image"), v.literal("comparison")),
      status: analysisStatusValidator,
      assessment: v.optional(assessmentValidator),
      // Display names are user input rendered as text only (never as HTML).
      fileName: v.string(),
      format: v.optional(v.string()),
      sizeBytes: v.number(),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      imageStorageId: v.optional(v.id("_storage")),
      fileNameB: v.optional(v.string()),
      formatB: v.optional(v.string()),
      sizeBytesB: v.optional(v.number()),
      widthB: v.optional(v.number()),
      heightB: v.optional(v.number()),
      imageStorageIdB: v.optional(v.id("_storage")),
      error: v.optional(v.string()),
      /** JSON blob for pipeline handoff between steps (not shown to users). */
      stepMeta: v.optional(v.string()),
      // Step keys that have genuinely completed, in completion order.
      completedSteps: v.array(v.string()),
      recommendations: v.array(
        v.object({ title: v.string(), detail: v.string() }),
      ),
      analysisVersion: v.string(),
    }).index("by_user", ["userId"]),

    analysisResults: defineTable({
      analysisId: v.id("analyses"),
      type: v.string(),
      name: v.string(),
      status: v.string(),
      findings: v.array(v.string()),
      measurements: v.array(v.object({ label: v.string(), value: v.string() })),
      explanation: v.string(),
      limitations: v.string(),
      completed: v.boolean(),
      evidence: v.array(evidenceItemValidator),
    }).index("by_analysis", ["analysisId"]),

    analysisArtifacts: defineTable({
      analysisId: v.id("analyses"),
      kind: v.string(), // "ela" | "ela_grid" | "diff"
      storageId: v.id("_storage"),
      label: v.string(),
      description: v.string(),
      // Serialized overlay coordinates (e.g. ELA hotspot cells) for the UI.
      meta: v.optional(v.string()),
    }).index("by_analysis", ["analysisId"]),

    aiExplanations: defineTable({
      analysisId: v.id("analyses"),
      question: v.string(),
      answer: v.string(),
      source: v.union(v.literal("rule_based"), v.literal("ai")),
    }).index("by_analysis", ["analysisId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
