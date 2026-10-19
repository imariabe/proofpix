import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  usePipeline,
  type PipelineStepKey,
  type StepState,
} from "@/hooks/use-pipeline";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { validateFileClientSide, uploadToStorage, readImageDimensions } from "@/lib/upload";
import {
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileImage,
  GitCompareArrows,
  Loader2,
  ScanSearch,
  Upload,
  X,
} from "lucide-react";

type Mode = "image" | "comparison";

interface Slot {
  file: File;
  previewUrl: string;
  width: number | null;
  height: number | null;
}

/** One pipeline step as the user experiences it. */
interface StepView {
  key: PipelineStepKey;
  label: string;
  hint: string;
}

const IMAGE_STEPS: StepView[] = [
  {
    key: "validate",
    label: "Validating file",
    hint: "Content sniffing, size, and dimensions — checked against the actual bytes, not the extension.",
  },
  {
    key: "metadata",
    label: "Extracting metadata",
    hint: "EXIF fields, container blocks, camera and software tags.",
  },
  {
    key: "structure",
    label: "Inspecting file structure",
    hint: "Markers, chunks, truncation, trailing data, decode integrity.",
  },
  {
    key: "consistency",
    label: "Running consistency checks",
    hint: "Header dimensions vs capture fields, timestamps, encoding signatures.",
  },
  {
    key: "compression",
    label: "Analysing compression (ELA)",
    hint: "Recompressing at a fixed quality and mapping where the file reacts differently.",
  },
  {
    key: "report",
    label: "Assembling the report",
    hint: "Separating confirmed measurements from warning signs, and stating the limits.",
  },
];

const COMPARISON_STEPS: StepView[] = [
  {
    key: "validate",
    label: "Validating both files",
    hint: "Content sniffing and dimensions for each upload.",
  },
  {
    key: "compare",
    label: "Comparing pixels",
    hint: "Resampling to a common canvas and measuring per-pixel error.",
  },
  {
    key: "report",
    label: "Assembling the report",
    hint: "Separating confirmed measurements from warning signs, and stating the limits.",
  },
];

const ACCEPTED = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

export default function Analyze() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("image");
  const [slotA, setSlotA] = useState<Slot | null>(null);
  const [slotB, setSlotB] = useState<Slot | null>(null);
  const [dragOver, setDragOver] = useState<"a" | "b" | null>(null);
  const [running, setRunning] = useState(false);
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const inputA = useRef<HTMLInputElement>(null);
  const inputB = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.analyses.generateUploadUrl);
  const createAnalysis = useMutation(api.analyses.create);
  const runPipelineSteps = usePipeline();

  const steps = mode === "comparison" ? COMPARISON_STEPS : IMAGE_STEPS;

  const reset = useCallback(() => {
    setSlotA((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setSlotB((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setStepStates({});
    setFailure(null);
    setRunning(false);
  }, []);

  const pickFile = useCallback(
    async (file: File, which: "a" | "b") => {
      const check = validateFileClientSide(file);
      if (!check.ok) {
        toast.error("File rejected", { description: check.error });
        return;
      }
      const dims = await readImageDimensions(file);
      const previewUrl = URL.createObjectURL(file);
      const next: Slot = {
        file,
        previewUrl,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      };
      if (which === "a") {
        setSlotA((prev) => {
          if (prev) URL.revokeObjectURL(prev.previewUrl);
          return next;
        });
      } else {
        setSlotB((prev) => {
          if (prev) URL.revokeObjectURL(prev.previewUrl);
          return next;
        });
      }
      setFailure(null);
    },
    [],
  );

  const onDrop = useCallback(
    (event: React.DragEvent, which: "a" | "b") => {
      event.preventDefault();
      setDragOver(null);
      const file = event.dataTransfer.files?.[0];
      if (file) void pickFile(file, which);
    },
    [pickFile],
  );

  const setStep = (key: PipelineStepKey, state: StepState) =>
    setStepStates((prev) => ({ ...prev, [key]: state }));

  const runPipeline = async () => {
    if (!slotA) return;
    if (mode === "comparison" && !slotB) {
      toast.error("A comparison needs two files.", {
        description: "Add a second image before starting.",
      });
      return;
    }
    setRunning(true);
    setFailure(null);
    setStepStates({});
    const localSteps = steps;
    localSteps.forEach((s) => setStep(s.key, "pending"));
    const active = { key: null as PipelineStepKey | null };

    try {
      // --- Upload (real bytes, straight to storage) ---
      const storageIdA = (await uploadToStorage(slotA.file, generateUploadUrl))
        .storageId as Id<"_storage">;
      let storageIdB: Id<"_storage"> | undefined;
      if (mode === "comparison" && slotB) {
        storageIdB = (await uploadToStorage(slotB.file, generateUploadUrl))
          .storageId as Id<"_storage">;
      }

      const { analysisId } = await createAnalysis({
        storageId: storageIdA,
        fileName: slotA.file.name,
        sizeBytes: slotA.file.size,
        kind: mode,
        ...(storageIdB
          ? {
              storageIdB,
              fileNameB: slotB!.file.name,
              sizeBytesB: slotB!.file.size,
            }
          : {}),
      });

      // --- Run each step for real; only mark done when its action returns. ---
      await runPipelineSteps(
        analysisId,
        localSteps.map((s) => s.key),
        (key, state) => {
          active.key = key;
          setStep(key, state);
        },
      );
      navigate(`/report/${analysisId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The analysis could not start.";
      setFailure(message);
      const label = active.key
        ? localSteps.find((s) => s.key === active.key)?.label
        : undefined;
      if (label) {
        toast.error(`${label} failed`, { description: message });
      } else {
        toast.error("Analysis could not start", { description: message });
      }
      setRunning(false);
    }
  };

  const busy = running;
  const ready = slotA !== null && (mode === "image" || slotB !== null);
  const doneCount = useMemo(
    () => Object.values(stepStates).filter((s) => s === "done").length,
    [stepStates],
  );

  return (
    <WorkspaceShell
      title="New analysis"
      description="Submit a JPEG, PNG, or WebP and watch each forensic check complete in real time. Every step below runs on your actual file — nothing is simulated."
      actions={
        running ? undefined : (
          <Button variant="outline" onClick={reset} disabled={!slotA && !slotB}>
            <X className="mr-2 size-4" />
            Clear
          </Button>
        )
      }
    >
      {/* Mode selector */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Analysis mode">
        {(
          [
            {
              id: "image" as const,
              icon: ScanSearch,
              title: "Analyse one image",
              body: "Metadata, structure, consistency, and compression analysis on a single file.",
            },
            {
              id: "comparison" as const,
              icon: GitCompareArrows,
              title: "Compare two images",
              body: "Measure how two files differ — resampled onto a common canvas, with a difference map.",
            },
          ]
        ).map((option) => {
          const Icon = option.icon;
          const active = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={busy}
              onClick={() => {
                if (busy) return;
                setMode(option.id);
                setSlotB(null);
                setStepStates({});
                setFailure(null);
              }}
              className={cn(
                "cursor-pointer rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "border-primary/50 bg-primary/[0.07] shadow-[0_0_0_1px_oklch(0.64_0.17_255/25%)]"
                  : "border-border bg-card/60 hover:border-primary/30",
              )}
            >
              <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} />
                {option.title}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{option.body}</p>
            </button>
          );
        })}
      </div>

      {/* Dropzones */}
      <div className={cn("grid gap-4", mode === "comparison" && "md:grid-cols-2")}>
        <Dropzone
          slot={slotA}
          label="Primary image"
          busy={busy}
          dragOver={dragOver === "a"}
          inputRef={inputA}
          onPick={(file) => void pickFile(file, "a")}
          onDrop={(e) => onDrop(e, "a")}
          onDragOver={(e) => { e.preventDefault(); setDragOver("a"); }}
          onDragLeave={() => setDragOver(null)}
          onClear={() => setSlotA((prev) => { if (prev) URL.revokeObjectURL(prev.previewUrl); return null; })}
        />
        {mode === "comparison" && (
          <Dropzone
            slot={slotB}
            label="Second image"
            busy={busy}
            dragOver={dragOver === "b"}
            inputRef={inputB}
            onPick={(file) => void pickFile(file, "b")}
            onDrop={(e) => onDrop(e, "b")}
            onDragOver={(e) => { e.preventDefault(); setDragOver("b"); }}
            onDragLeave={() => setDragOver(null)}
            onClear={() => setSlotB((prev) => { if (prev) URL.revokeObjectURL(prev.previewUrl); return null; })}
          />
        )}
      </div>

      {/* Start */}
      {!running && (
        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            Up to 8 MB per file. Files that fail validation are deleted immediately.
          </p>
          <Button size="lg" onClick={() => void runPipeline()} disabled={!ready} className="gap-2">
            <Upload className="size-4" />
            Start analysis
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      {failure && !running && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <AlertOctagon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">The analysis stopped early</p>
            <p className="mt-0.5 leading-6 text-muted-foreground">{failure}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void runPipeline()}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Live pipeline */}
      {running && (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card/70">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Loader2 className="size-4 animate-spin text-primary" />
              Running forensic checks…
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {doneCount}/{steps.length} steps
            </p>
          </div>
          {/* Progress bar reflects genuinely completed steps only. */}
          <div className="h-1 w-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${(doneCount / steps.length) * 100}%` }}
            />
          </div>
          <ol className="divide-y divide-border/60">
            {steps.map((step) => {
              const state = stepStates[step.key] ?? "pending";
              return (
                <li key={step.key} className="flex items-start gap-4 px-5 py-4">
                  <span className="mt-0.5">
                    {state === "done" ? (
                      <CheckCircle2 className="size-5 text-success" />
                    ) : state === "running" ? (
                      <Loader2 className="size-5 animate-spin text-primary" />
                    ) : state === "failed" ? (
                      <AlertOctagon className="size-5 text-destructive" />
                    ) : (
                      <CircleDashed className="size-5 text-muted-foreground/60" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm font-medium",
                        state === "pending" && "text-muted-foreground",
                        state === "failed" && "text-destructive",
                      )}
                    >
                      {step.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {step.hint}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </WorkspaceShell>
  );
}

function Dropzone({
  slot,
  label,
  busy,
  dragOver,
  inputRef,
  onPick,
  onDrop,
  onDragOver,
  onDragLeave,
  onClear,
}: {
  slot: Slot | null;
  label: string;
  busy: boolean;
  dragOver: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onClear: () => void;
}) {
  if (slot) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-card/70">
        <div className="relative aspect-[16/10] bg-[#070b14]">
          <img
            src={slot.previewUrl}
            alt={slot.file.name}
            className="h-full w-full object-contain"
          />
          {!busy && (
            <button
              type="button"
              onClick={onClear}
              aria-label={`Remove ${slot.file.name}`}
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md border border-border bg-black/70 text-white/80 transition-colors hover:border-destructive/50 hover:text-destructive"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{slot.file.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatBytes(slot.file.size)}
              {slot.width && slot.height ? ` · ${slot.width}×${slot.height}` : ""}
            </p>
          </div>
          <FileImage className="size-4 shrink-0 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={cn(
        "flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-all",
        dragOver
          ? "border-primary bg-primary/[0.07]"
          : "border-border bg-card/40 hover:border-primary/40 hover:bg-card/60",
      )}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
      <div className="flex size-12 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
        <Upload className="size-5" />
      </div>
      <p className="mt-4 text-sm font-semibold tracking-tight">{label}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        Drop a JPEG, PNG, or WebP here, or click to choose a file.
      </p>
    </div>
  );
}
