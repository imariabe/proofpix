import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  MinusCircle,
  ShieldCheck,
  TriangleAlert,
  XCircle,
  CircleHelp,
} from "lucide-react";
import type { Assessment, CheckStatus } from "@/lib/forensics/types";

/**
 * Status is never communicated by colour alone: every badge pairs an icon
 * with a readable label.
 */
const STATUS_META: Record<
  CheckStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  clear: {
    label: "Clear",
    icon: CheckCircle2,
    className:
      "border-success/30 bg-success/10 text-success hover:bg-success/15",
  },
  flag: {
    label: "Potential inconsistency",
    icon: AlertTriangle,
    className:
      "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
  },
  inconclusive: {
    label: "Inconclusive",
    icon: CircleHelp,
    className:
      "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
  },
  skipped: {
    label: "Not applicable",
    icon: MinusCircle,
    className:
      "border-border bg-muted text-muted-foreground hover:bg-muted/80",
  },
  error: {
    label: "Check failed",
    icon: XCircle,
    className:
      "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
  },
  pending: {
    label: "Pending",
    icon: CircleDashed,
    className: "border-border bg-muted text-muted-foreground",
  },
  running: {
    label: "Running",
    icon: Loader2,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: CheckStatus;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-medium whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      <Icon
        className={cn("size-3.5", status === "running" && "animate-spin")}
      />
      {meta.label}
    </Badge>
  );
}

const ASSESSMENT_META: Record<
  Assessment,
  { label: string; icon: typeof ShieldCheck; className: string }
> = {
  no_anomaly: {
    label: "No Significant Anomaly Detected by Available Checks",
    icon: ShieldCheck,
    className: "border-success/30 bg-success/10 text-success",
  },
  inconsistencies: {
    label: "Potential Technical Inconsistencies Identified",
    icon: TriangleAlert,
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  inconclusive: {
    label: "Inconclusive",
    icon: CircleHelp,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  incomplete: {
    label: "Analysis Incomplete",
    icon: CircleDashed,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  unsupported: {
    label: "Unsupported File",
    icon: XCircle,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

export function AssessmentBadge({
  assessment,
  className,
  compact = false,
}: {
  assessment: Assessment;
  className?: string;
  /** Short label for dense surfaces like the catalog table. */
  compact?: boolean;
}) {
  const meta = ASSESSMENT_META[assessment] ?? ASSESSMENT_META.inconclusive;
  const Icon = meta.icon;
  const shortLabels: Partial<Record<Assessment, string>> = {
    no_anomaly: "No anomaly detected",
    inconsistencies: "Inconsistencies found",
    inconclusive: "Inconclusive",
    incomplete: "Incomplete",
    unsupported: "Unsupported",
  };
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", meta.className, className)}
    >
      <Icon className="size-3.5 shrink-0" />
      {compact ? shortLabels[assessment] ?? meta.label : meta.label}
    </Badge>
  );
}

/** Pipeline status for a single analysis (pending/running/completed/failed). */
export function PipelineBadge({
  status,
  className,
}: {
  status: "pending" | "running" | "completed" | "failed";
  className?: string;
}) {
  const map = {
    pending: { label: "Queued", icon: CircleDashed, spin: false },
    running: { label: "Running", icon: Loader2, spin: true },
    completed: { label: "Completed", icon: CheckCircle2, spin: false },
    failed: { label: "Failed", icon: XCircle, spin: false },
  } as const;
  const meta = map[status] ?? map.pending;
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-medium",
        status === "completed" &&
          "border-success/30 bg-success/10 text-success",
        status === "failed" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        (status === "pending" || status === "running") &&
          "border-primary/30 bg-primary/10 text-primary",
        className,
      )}
    >
      <Icon className={cn("size-3.5", meta.spin && "animate-spin")} />
      {meta.label}
    </Badge>
  );
}
