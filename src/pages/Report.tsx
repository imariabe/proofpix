import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { AssessmentBadge, StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatDateTime, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ASSESSMENT_SUMMARIES,
  CHECK_NAMES,
  LIMITATION_NOTES,
  type CheckStatus,
  type CheckType,
} from "@/lib/forensics/types";
import {
  usePipeline,
  IMAGE_STEP_KEYS,
  COMPARISON_STEP_KEYS,
  type PipelineStepKey,
  type StepState,
} from "@/hooks/use-pipeline";
import {
  AlertOctagon,
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  Download,
  Info,
  Loader2,
  Plus,
  Printer,
  RotateCw,
  ScanSearch,
  Send,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types derived from the report query                                 */
/* ------------------------------------------------------------------ */

interface HotspotCell {
  col: number;
  row: number;
  mean: number;
  percentileOfCells: number;
}

interface ElaMeta {
  columns: number;
  rows: number;
  cells: HotspotCell[];
  cellular: boolean;
}

function parseElaMeta(raw: string | null | undefined): ElaMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ElaMeta>;
    if (
      typeof parsed.columns === "number" &&
      typeof parsed.rows === "number" &&
      Array.isArray(parsed.cells)
    ) {
      return {
        columns: parsed.columns,
        rows: parsed.rows,
        cells: parsed.cells as HotspotCell[],
        cellular: Boolean(parsed.cellular),
      };
    }
  } catch {
    /* malformed meta — treat as absent */
  }
  return null;
}

const STEP_LABELS: Record<PipelineStepKey, string> = {
  validate: "Validating file(s)",
  metadata: "Extracting metadata",
  structure: "Inspecting file structure",
  consistency: "Running consistency checks",
  compression: "Analysing compression (ELA)",
  compare: "Comparing pixels",
  report: "Assembling the report",
};

/** Display order for the check-by-check section. */
const CHECK_ORDER: string[] = [
  "validation",
  "metadata",
  "structure",
  "encoding",
  "consistency",
  "compression",
  "pixelDiff",
];

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const analysisId = id as Id<"analyses">;
  const navigate = useNavigate();
  const report = useQuery(api.analyses.getReport, { analysisId });
  const askExplanation = useAction(api.explain.ask);
  const runPipelineSteps = usePipeline();

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [resumeStates, setResumeStates] = useState<
    Record<string, StepState | undefined>
  >({});
  const [resuming, setResuming] = useState(false);
  const [viewer, setViewer] = useState<string>("original");
  const [inspect, setInspect] = useState<HotspotCell | null>(null);
  const [openChecks, setOpenChecks] = useState<Record<string, boolean>>({});

  /* ---------------- loading / not found ---------------- */

  if (report === undefined) {
    return (
      <WorkspaceShell title="Report" description="Loading the forensic report…">
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-xl border border-border bg-card/60" />
          <div className="h-64 animate-pulse rounded-xl border border-border bg-card/60" />
          <div className="h-48 animate-pulse rounded-xl border border-border bg-card/60" />
        </div>
      </WorkspaceShell>
    );
  }

  if (report === null) {
    return (
      <WorkspaceShell title="Report not found" description="">
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
          <ScanSearch className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-base font-semibold tracking-tight">
            This report is unavailable
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
            It may have been deleted, or it belongs to a different account.
            Reports are private to their owner.
          </p>
          <Button className="mt-5" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 size-4" />
            Back to catalog
          </Button>
        </div>
      </WorkspaceShell>
    );
  }

  const { analysis, results, artifacts, originalUrl, originalUrlB, explanations } =
    report;
  const assessment = analysis.assessment;
  const isComparison = analysis.kind === "comparison";
  const stepKeys = isComparison ? COMPARISON_STEP_KEYS : IMAGE_STEP_KEYS;
  const completedSteps = new Set(analysis.completedSteps);

  /* ---------------- running / resume view ---------------- */

  if (analysis.status === "pending" || analysis.status === "running") {
    const stateFor = (key: PipelineStepKey): StepState =>
      completedSteps.has(key)
        ? "done"
        : (resumeStates[key] ?? "pending");
    const doneCount = stepKeys.filter((k) => stateFor(k) === "done").length;

    const handleResume = async () => {
      setResuming(true);
      const remaining = stepKeys.filter((k) => !completedSteps.has(k));
      try {
        await runPipelineSteps(analysisId, remaining, (key, state) => {
          setResumeStates((prev) => ({ ...prev, [key]: state }));
        });
        toast.success("Analysis complete", {
          description: "Your forensic report is ready.",
        });
      } catch (error) {
        toast.error("The run stopped", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      } finally {
        setResuming(false);
      }
    };

    return (
      <WorkspaceShell
        title={analysis.fileName}
        description="Analysis in progress — each check completes individually."
        actions={
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 size-4" />
            Back to catalog
          </Button>
        }
      >
        <div className="overflow-hidden rounded-xl border border-border bg-card/70">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Loader2 className="size-4 animate-spin text-primary" />
              {resuming ? "Resuming the pipeline…" : "Waiting for the pipeline…"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {doneCount}/{stepKeys.length} steps
            </p>
          </div>
          <div className="h-1 w-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${(doneCount / stepKeys.length) * 100}%` }}
            />
          </div>
          <ol className="divide-y divide-border/60">
            {stepKeys.map((key) => {
              const state = stateFor(key);
              return (
                <li key={key} className="flex items-center gap-4 px-5 py-3.5">
                  <span>
                    {state === "done" ? (
                      <CheckCircle2 className="size-5 text-success" />
                    ) : state === "running" ? (
                      <Loader2 className="size-5 animate-spin text-primary" />
                    ) : state === "failed" ? (
                      <AlertOctagon className="size-5 text-destructive" />
                    ) : (
                      <span className="block size-2.5 rounded-full bg-muted-foreground/40" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      state === "pending" && "text-muted-foreground",
                    )}
                  >
                    {STEP_LABELS[key]}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted-foreground">
              This run stopped before every check finished. Resuming re-runs
              only the missing steps — completed work is kept.
            </p>
            <Button
              onClick={() => void handleResume()}
              disabled={resuming}
              className="shrink-0 gap-2"
            >
              {resuming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCw className="size-4" />
              )}
              Resume analysis
            </Button>
          </div>
        </div>
      </WorkspaceShell>
    );
  }

  /* ---------------- derived data ---------------- */

  type ReportData = NonNullable<typeof report>;
  type ResultRow = ReportData["results"][number];
  type EvidenceRow = ResultRow["evidence"][number];
  type ExplanationRow = ReportData["explanations"][number];

  interface EvidenceDisplay extends EvidenceRow {
    checkName: string;
  }

  const evidence: EvidenceDisplay[] = results.flatMap((r) =>
    (r.evidence ?? []).map((e) => ({
      ...e,
      checkName:
        CHECK_NAMES[e.source as CheckType] ?? (e.source as string) ?? "Check",
    })),
  );
  const confirmed = evidence.filter((e) => e.kind === "confirmed");
  const warnings = evidence.filter((e) => e.kind === "warning");
  const contextNotes = evidence.filter((e) => e.kind === "context");

  const orderedResults = [...results].sort((a, b) => {
    const ai = CHECK_ORDER.indexOf(a.type);
    const bi = CHECK_ORDER.indexOf(b.type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const checksCompleted = results.filter((r) => r.completed).length;
  const hasCompression = results.some((r) => r.type === "compression" && r.completed);
  const hasPixelDiff = results.some((r) => r.type === "pixelDiff" && r.completed);
  const hasMetadata = results.some((r) => r.type === "metadata");

  const cannotProve: string[] = [
    "No single check can certify an image. A file that passes every check can still have been edited in ways these tools cannot detect, and a genuine image can trip checks after ordinary re-saving.",
    LIMITATION_NOTES.technicalOnly,
    "Image analysis cannot establish real-world facts — whether an event happened, whether a payment was made, who altered a file, or why.",
  ];
  if (hasMetadata) cannotProve.push(LIMITATION_NOTES.noMetadata);
  if (hasCompression) cannotProve.push(LIMITATION_NOTES.ela);
  if (hasPixelDiff) cannotProve.push(LIMITATION_NOTES.pixelDiff);

  const elaArtifact = artifacts.find((a) => a.kind === "ela");
  const diffArtifact = artifacts.find((a) => a.kind === "diff");
  const elaMeta = parseElaMeta(elaArtifact?.meta);

  const viewerTabs =
    isComparison
      ? [
          { value: "original", label: "File A" },
          { value: "fileB", label: "File B" },
          ...(diffArtifact
            ? [{ value: "diff", label: "Difference map" }]
            : []),
        ]
      : [
          { value: "original", label: "Original" },
          ...(elaMeta ? [{ value: "ela", label: "Error Level Analysis" }] : []),
        ];
  const activeTab = viewerTabs.some((t) => t.value === viewer)
    ? viewer
    : viewerTabs[0]?.value ?? "original";

  const showOverlay = Boolean(elaMeta) && activeTab !== "diff" && activeTab !== "fileB";
  const activeUrl =
    activeTab === "fileB"
      ? originalUrlB
      : activeTab === "ela" && elaArtifact
        ? elaArtifact.url
        : activeTab === "diff" && diffArtifact
          ? diffArtifact.url
          : originalUrl;

  const isOpen = (r: ResultRow) =>
    openChecks[r._id] ??
    (r.status === "flag" || r.status === "error" || r.status === "inconclusive");

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    try {
      await askExplanation({ analysisId, question: q });
      setQuestion("");
    } catch (error) {
      toast.error("Could not get an explanation", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setAsking(false);
    }
  };

  const exportPayload = () => ({
    product: "ProofPix",
    reportId: analysis._id,
    exportedAt: new Date().toISOString(),
    file: {
      name: analysis.fileName,
      nameSecond: analysis.fileNameB ?? null,
      kind: analysis.kind,
      format: analysis.format ?? null,
      sizeBytes: analysis.sizeBytes,
      width: analysis.width ?? null,
      height: analysis.height ?? null,
      submittedAt: new Date(analysis.createdAt).toISOString(),
    },
    reading: {
      assessment: assessment ?? "incomplete",
      label: analysis.assessmentLabel ?? null,
      summary: assessment ? ASSESSMENT_SUMMARIES[assessment] : null,
    },
    evidenceBreakdown: {
      confirmedFindings: confirmed,
      potentialWarningSigns: warnings,
      context: contextNotes,
    },
    checks: results.map((r) => ({
      name: r.name,
      status: r.status,
      completed: r.completed,
      findings: r.findings,
      measurements: r.measurements,
      whatItMeans: r.explanation,
      whatItCannotProve: r.limitations,
    })),
    recommendations: analysis.recommendations,
    whatThisCannotProve: cannotProve,
    disclaimer:
      "This report describes technical evidence measured from the uploaded file. It does not certify authenticity and cannot establish real-world facts.",
  });

  /* ---------------- render ---------------- */

  const shellTitle = isComparison
    ? `${analysis.fileName} vs ${analysis.fileNameB ?? "file B"}`
    : analysis.fileName;

  const shellDescription = [
    analysis.kind === "comparison" ? "Comparison report" : "Image analysis report",
    analysis.format ? analysis.format.toUpperCase() : null,
    analysis.width && analysis.height ? `${analysis.width}×${analysis.height}` : null,
    formatBytes(analysis.sizeBytes),
    formatDateTime(analysis.createdAt),
    `#${shortId(analysis._id)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <WorkspaceShell
      title={shellTitle}
      description={shellDescription}
      actions={
        <div className="flex items-center gap-2 print-hide">
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 size-4" />
            Catalog
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/analyze")}>
            <Plus className="mr-2 size-4" />
            New analysis
          </Button>
        </div>
      }
    >
      {/* Failure banner */}
      {analysis.status === "failed" && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertOctagon className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-destructive">
                The analysis failed before completing
              </p>
              <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                {analysis.error ?? "No further detail was recorded."}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate("/analyze")} className="shrink-0">
            Start a new analysis
          </Button>
        </div>
      )}

      {/* ---------------- Assessment hero ---------------- */}
      {assessment && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.21, 0.6, 0.35, 1] }}
          className="mb-8 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.05]"
        >
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Overall reading
                </p>
                <div className="mt-2.5">
                  <AssessmentBadge assessment={assessment} className="text-sm px-3 py-1.5 h-auto" />
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-foreground/85 sm:text-base sm:leading-7">
                  {ASSESSMENT_SUMMARIES[assessment]}
                </p>
              </div>
              <div className="grid shrink-0 grid-cols-3 gap-3 lg:w-72">
                <StatTile
                  value={confirmed.length}
                  label="Confirmed"
                  tone="text-success"
                />
                <StatTile
                  value={warnings.length}
                  label="Warning signs"
                  tone="text-warning"
                />
                <StatTile
                  value={`${checksCompleted}/${results.length}`}
                  label="Checks done"
                  tone="text-primary"
                />
              </div>
            </div>
          </div>
          {/* What this cannot prove — always on the result screen */}
          <div className="px-6 py-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Info className="size-3.5 text-primary" />
              What this analysis cannot prove
            </p>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-3">
              {cannotProve.slice(0, 3).map((line) => (
                <li
                  key={line}
                  className="rounded-lg border border-border bg-card/60 px-3.5 py-3 text-xs leading-5 text-muted-foreground"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </motion.section>
      )}

      {/* ---------------- Evidence Breakdown ---------------- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: [0.21, 0.6, 0.35, 1] }}
        className="mb-8"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Evidence Breakdown
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight">
              Exactly what ProofPix detected
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
              Every item below was measured from your file. The three groups
              differ in how much each item proves — read them separately.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CountChip tone="success" count={confirmed.length} label="confirmed" />
            <CountChip tone="warning" count={warnings.length} label="warning signs" />
            <CountChip tone="primary" count={contextNotes.length} label="context notes" />
          </div>
        </div>

        {/* Legend: the distinction, in plain language */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <LegendCard
            className="border-success/30 bg-success/[0.05]"
            title="Confirmed findings"
            body="Facts read directly from the file's bytes. Confirmed about the file — not about what happened in the world."
          />
          <LegendCard
            className="border-warning/30 bg-warning/[0.05]"
            title="Potential warning signs"
            body="Measured patterns that can indicate processing or editing — and also have ordinary explanations. Leads to investigate, not proof."
          />
          <LegendCard
            className="border-primary/30 bg-primary/[0.05]"
            title="Context"
            body="Neutral information needed to interpret the rest of the report correctly."
          />
        </div>

        <div className="mt-5 space-y-5">
          <EvidenceGroup
            kind="confirmed"
            title="Confirmed findings"
            items={confirmed}
            emptyText="No confirmed findings were recorded for this file."
          />
          <EvidenceGroup
            kind="warning"
            title="Potential warning signs"
            items={warnings}
            emptyText="No potential warning signs were measured — nothing in the checks that ran was worth flagging."
          />
          <EvidenceGroup
            kind="context"
            title="Context"
            items={contextNotes}
            emptyText="No contextual notes for this report."
          />
        </div>
      </motion.section>

      {/* ---------------- Visualizations: suspicious areas ---------------- */}
      {(originalUrl || originalUrlB || artifacts.length > 0) && (
        <section className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Image examination
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight">
            {elaMeta
              ? "Areas that respond differently"
              : "The submitted evidence"}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {elaMeta
              ? "Highlighted regions reacted more strongly than the rest of the image when recompressed at a fixed quality. Hover a region to inspect it."
              : "View the submitted file and any visualisations this analysis produced."}
          </p>

          {/* Viewer tabs */}
          <div className="mt-4 flex flex-wrap gap-2 print-hide" role="tablist" aria-label="Image views">
            {viewerTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.value}
                onClick={() => {
                  setViewer(tab.value);
                  setInspect(null);
                }}
                className={cn(
                  "cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  activeTab === tab.value
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-card/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-border bg-card/60 p-5">
            <ImageStage
              url={activeUrl}
              alt={
                activeTab === "ela"
                  ? "Error Level Analysis map"
                  : activeTab === "diff"
                    ? "Pixel difference map"
                    : activeTab === "fileB"
                      ? "Second submitted image"
                      : "Submitted image"
                    }
              meta={showOverlay ? elaMeta : null}
              inspect={inspect}
              onInspect={setInspect}
            />

            {/* Readout under the stage */}
            {showOverlay && elaMeta && (
              <div className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs leading-5">
                {inspect ? (
                  <>
                    <p>
                      <span className="font-semibold text-warning">
                        Region {inspect.col + 1}, {inspect.row + 1}
                      </span>{" "}
                      — amplified level{" "}
                      <span className="font-mono">{inspect.mean}</span>, higher
                      than {inspect.percentileOfCells}% of regions in this image.
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      This region reacted differently to recompression. Texture,
                      edges, resizing, and multiple legitimate saves can all
                      cause this — treat it as a place to look, not a detected
                      edit.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {elaMeta.cells.length === 0
                      ? "No region stood out from the rest of the image under this method."
                      : `${elaMeta.cells.length} region${
                          elaMeta.cells.length === 1 ? "" : "s"
                        } respond differently to recompression — hover a highlighted box to inspect it.`}
                  </p>
                )}
              </div>
            )}

            {activeTab === "diff" && (
              <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
                Brighter pixels mean larger numeric differences between the two
                files. Differences also arise from resizing, recompression, and
                format changes — the size of the difference does not identify
                who changed anything or why.
              </p>
            )}

            {(activeTab === "ela" || (activeTab === "original" && elaMeta)) && (
              <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
                {LIMITATION_NOTES.ela}
              </p>
            )}

            {!elaMeta && !diffArtifact && activeTab === "original" && (
              <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
                No visualisation was produced for this file — Error Level
                Analysis applies to JPEG inputs, and comparisons need decodable
                pixels. The checks below report what was measured instead.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ---------------- Check-by-check detail ---------------- */}
      <section className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Method detail
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight">
          Every check, with its own limits
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          Each check states what it measured, what the result means, and what it
          cannot establish on its own.
        </p>

        <div className="mt-4 space-y-3">
          {orderedResults.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No checks have recorded results for this report yet.
            </p>
          )}
          {orderedResults.map((r) => (
            <div
              key={r._id}
              className="overflow-hidden rounded-xl border border-border bg-card/60"
            >
              <button
                type="button"
                aria-expanded={isOpen(r)}
                onClick={() =>
                  setOpenChecks((prev) => ({ ...prev, [r._id]: !isOpen(r) }))
                }
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold tracking-tight">
                    {r.name}
                  </span>
                  <StatusBadge status={r.status as CheckStatus} />
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen(r) && "rotate-180",
                  )}
                />
              </button>

              {isOpen(r) && (
                <div className="space-y-4 border-t border-border/60 px-5 py-4">
                  {r.findings.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Findings
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {r.findings.map((finding) => (
                          <li
                            key={finding}
                            className="flex gap-2.5 text-sm leading-6 text-foreground/85"
                          >
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
                            {finding}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {r.measurements.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Measurements
                      </p>
                      <dl className="mt-2 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                        {r.measurements.map((m) => (
                          <div
                            key={m.label}
                            className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-1.5"
                          >
                            <dt className="text-xs text-muted-foreground">
                              {m.label}
                            </dt>
                            <dd className="text-right font-mono text-xs font-medium">
                              {m.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  {r.explanation && (
                    <div className="rounded-lg border border-primary/20 bg-primary/[0.05] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                        What this means
                      </p>
                      <p className="mt-1.5 text-sm leading-6 text-foreground/85">
                        {r.explanation}
                      </p>
                    </div>
                  )}

                  {r.limitations && (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        What this check cannot prove
                      </p>
                      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                        {r.limitations}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Limitations ---------------- */}
      <section className="mb-8 rounded-2xl border border-warning/30 bg-warning/[0.05] p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-warning">
          <TriangleAlert className="size-4" />
          What this analysis cannot prove
        </p>
        <ul className="mt-4 space-y-3">
          {cannotProve.map((line) => (
            <li
              key={line}
              className="flex gap-3 text-sm leading-6 text-foreground/85"
            >
              <Info className="mt-0.5 size-4 shrink-0 text-warning/80" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- Recommendations ---------------- */}
      {analysis.recommendations.length > 0 && (
        <section className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Next steps
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight">
            What to check next
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {analysis.recommendations.map((rec) => (
              <div
                key={rec.title}
                className="rounded-xl border border-border bg-card/60 p-4"
              >
                <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <ScanSearch className="size-4 shrink-0 text-primary" />
                  {rec.title}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {rec.detail}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- Ask explainer ---------------- */}
      <section className="mb-8 rounded-xl border border-border bg-card/60 p-5 print-hide">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Ask about this report
        </p>
        <h2 className="mt-2 text-lg font-bold tracking-tight">
          Plain-language explanations on demand
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Answers use only the check results above — your image bytes are never
          sent to an AI provider. The source of every answer is labelled.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {(isComparison
            ? [
                "Do these files show the same content?",
                "What does the difference map mean?",
                "What should I check next?",
              ]
            : [
                "Why is this the overall reading?",
                "Does missing metadata mean the image was edited?",
                "What should I check next?",
              ]
          ).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setQuestion(suggestion)}
              className="cursor-pointer rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAsk();
          }}
        >
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about this report…"
            rows={2}
            maxLength={300}
            disabled={asking || results.length === 0}
            className="flex-1 resize-none"
          />
          <Button
            type="submit"
            disabled={asking || !question.trim() || results.length === 0}
            className="shrink-0 gap-2"
          >
            {asking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Ask
          </Button>
        </form>

        {explanations.length > 0 && (
          <div className="mt-5 space-y-3">
            {explanations.map((explanation: ExplanationRow) => (
              <div
                key={explanation._id}
                className="rounded-lg border border-border bg-muted/30 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{explanation.question}</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      explanation.source === "ai"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {explanation.source === "ai" ? (
                      <Sparkles className="size-3" />
                    ) : (
                      <BookOpenText className="size-3" />
                    )}
                    {explanation.source === "ai" ? "AI-assisted" : "Rule-based"}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-foreground/85">
                  {explanation.answer}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Report meta + export ---------------- */}
      <section className="rounded-xl border border-border bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 print-hide">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Report details
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-2"
            >
              <Printer className="size-4" />
              Print / PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadJson(
                  `proofpix-report-${shortId(analysis._id)}.json`,
                  exportPayload(),
                )
              }
              className="gap-2"
            >
              <Download className="size-4" />
              Download JSON
            </Button>
          </div>
        </div>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetaItem label="Report ID" value={shortId(analysis._id)} mono />
          <MetaItem label="Submitted" value={formatDateTime(analysis.createdAt)} />
          <MetaItem label="Type" value={isComparison ? "Two-image comparison" : "Single-image analysis"} />
          <MetaItem label="Format" value={analysis.format ? analysis.format.toUpperCase() : "—"} />
          <MetaItem
            label="Dimensions"
            value={
              analysis.width && analysis.height
                ? `${analysis.width} × ${analysis.height}`
                : "—"
            }
          />
          <MetaItem label="File size" value={formatBytes(analysis.sizeBytes)} />
          <MetaItem label="Checks completed" value={`${checksCompleted} of ${results.length}`} />
          <MetaItem label="Engine" value={analysis.analysisVersion} mono />
          <MetaItem label="Evidence items" value={`${evidence.length} total`} />
        </dl>
        <p className="mt-4 border-t border-border/60 pt-3 text-[11px] leading-5 text-muted-foreground">
          This report describes technical evidence measured from the uploaded
          file. It does not certify authenticity and cannot establish
          real-world facts.
        </p>
      </section>
    </WorkspaceShell>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function StatTile({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/70 px-3 py-2.5 text-center">
      <p className={cn("text-xl font-bold tracking-tight", tone)}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function CountChip({
  tone,
  count,
  label,
}: {
  tone: "success" | "warning" | "primary";
  count: number;
  label: string;
}) {
  const cls = {
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    primary: "border-primary/30 bg-primary/10 text-primary",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        cls,
      )}
    >
      <span className="font-bold">{count}</span>
      {label}
    </span>
  );
}

function LegendCard({
  className,
  title,
  body,
}: {
  className: string;
  title: string;
  body: string;
}) {
  return (
    <div className={cn("rounded-lg border px-4 py-3", className)}>
      <p className="text-xs font-semibold tracking-tight">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}

const GROUP_META = {
  confirmed: {
    icon: CheckCircle2,
    iconCls: "border-success/30 bg-success/10 text-success",
    accent: "border-l-success/60",
  },
  warning: {
    icon: TriangleAlert,
    iconCls: "border-warning/30 bg-warning/10 text-warning",
    accent: "border-l-warning/60",
  },
  context: {
    icon: Info,
    iconCls: "border-primary/30 bg-primary/10 text-primary",
    accent: "border-l-primary/60",
  },
} as const;

function EvidenceGroup({
  kind,
  title,
  items,
  emptyText,
}: {
  kind: keyof typeof GROUP_META;
  title: string;
  items: {
    kind: string;
    title: string;
    detail: string;
    source: string;
    measurement?: string;
    checkName: string;
  }[];
  emptyText: string;
}) {
  const meta = GROUP_META[kind];
  const Icon = meta.icon;
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-md border",
            meta.iconCls,
          )}
        >
          <Icon className="size-3.5" />
        </span>
        {title}
        <span className="font-mono text-xs font-normal text-muted-foreground">
          {items.length}
        </span>
      </p>
      {items.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {items.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className={cn(
                "rounded-lg border border-border bg-card/60 border-l-4 px-4 py-3",
                meta.accent,
              )}
            >
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {item.title}
                {item.measurement && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                    {item.measurement}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {item.detail}
              </p>
              <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                Source · {item.checkName}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageStage({
  url,
  alt,
  meta,
  inspect,
  onInspect,
}: {
  url: string | null;
  alt: string;
  meta: ElaMeta | null;
  inspect: HotspotCell | null;
  onInspect: (cell: HotspotCell | null) => void;
}) {
  if (!url) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-lg border border-dashed border-border bg-[#070b14]">
        <p className="text-sm text-muted-foreground">
          The source file is no longer available for display.
        </p>
      </div>
    );
  }

  const cells = meta?.cells ?? [];
  const columns = meta?.columns ?? 4;
  const rows = meta?.rows ?? 4;

  return (
    <div className="flex justify-center">
      <div className="relative inline-block max-w-full overflow-hidden rounded-lg border border-border bg-[#070b14]">
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="block max-h-[65vh] max-w-full"
        />
        {meta && meta.columns > 0 && meta.rows > 0 && (
          <div
            aria-hidden={cells.length === 0}
            className="pointer-events-none absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
            }}
          >
            {Array.from({ length: columns * rows }, (_, index) => {
              const col = index % columns;
              const row = Math.floor(index / columns);
              const hot = cells.find((c) => c.col === col && c.row === row);
              if (!hot) {
                return (
                  <div key={index} className="border border-white/[0.06]" />
                );
              }
              const active =
                inspect !== null &&
                inspect.col === col &&
                inspect.row === row;
              return (
                <button
                  key={index}
                  type="button"
                  aria-label={`Region column ${col + 1}, row ${row + 1}: amplified level ${hot.mean}`}
                  className={cn(
                    "pointer-events-auto border-2 transition-colors",
                    active
                      ? "border-warning bg-warning/35"
                      : "border-warning/80 bg-warning/15 hover:bg-warning/30",
                  )}
                  onMouseEnter={() => onInspect(hot)}
                  onMouseLeave={() => onInspect(null)}
                  onFocus={() => onInspect(hot)}
                  onBlur={() => onInspect(null)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("mt-0.5 text-sm font-medium", mono && "font-mono")}>
        {value}
      </dd>
    </div>
  );
}
