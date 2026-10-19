import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@//convex/_generated/api";
import type { Id } from "@//convex/_generated/dataModel";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  AssessmentBadge,
  PipelineBadge,
} from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes, formatDateTime, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Assessment } from "@/lib/forensics/types";
import {
  FolderSearch,
  GitCompareArrows,
  ImageIcon,
  Inbox,
  Loader2,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";

type Row = {
  _id: Id<"analyses">;
  kind: "image" | "comparison";
  status: "pending" | "running" | "completed" | "failed";
  assessment: Assessment | null;
  fileName: string;
  fileNameB: string | null;
  format: string | null;
  formatB: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: number;
  error: string | null;
};

const FILTERS = [
  { id: "all", label: "All items" },
  { id: "flagged", label: "Inconsistencies" },
  { id: "clean", label: "No anomaly" },
  { id: "inconclusive", label: "Inconclusive" },
  { id: "failed", label: "Failed" },
] as const;

export default function Dashboard() {
  const navigate = useNavigate();
  const analyses = useQuery(api.analyses.list) ?? null;
  const stats = useQuery(api.analyses.stats);
  const removeAnalysis = useMutation(api.analyses.remove);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [pendingDelete, setPendingDelete] = useState<Id<"analyses"> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = useMemo(() => {
    const items = (analyses ?? []) as Row[];
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (
        query &&
        !item.fileName.toLowerCase().includes(query) &&
        !(item.fileNameB ?? "").toLowerCase().includes(query)
      ) {
        return false;
      }
      switch (filter) {
        case "flagged":
          return item.assessment === "inconsistencies";
        case "clean":
          return item.assessment === "no_anomaly";
        case "inconclusive":
          return item.assessment === "inconclusive";
        case "failed":
          return item.status === "failed";
        default:
          return true;
      }
    });
  }, [analyses, search, filter]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeAnalysis({ analysisId: pendingDelete });
      toast.success("Report deleted.", {
        description: "The analysis and its stored files were removed.",
      });
      setPendingDelete(null);
    } catch (error) {
      toast.error("Could not delete the report.", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const isLoading = analyses === null;

  return (
    <WorkspaceShell
      title="Analysis catalog"
      description="Every image investigation you have submitted, with its current status and findings. Search by file name or filter by outcome."
      actions={
        <Button onClick={() => navigate("/analyze")} className="gap-2">
          <Plus className="size-4" />
          New analysis
        </Button>
      }
    >
      {/* Stat strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<FolderSearch className="size-4" />}
          label="Total analyses"
          value={stats?.total ?? "—"}
        />
        <StatCard
          icon={<TriangleAlert className="size-4 text-warning" />}
          label="With inconsistencies"
          value={stats?.flagged ?? "—"}
        />
        <StatCard
          icon={<XCircle className="size-4 text-destructive" />}
          label="Failed"
          value={stats?.failed ?? "—"}
        />
        <StatCard
          icon={<ImageIcon className="size-4 text-primary" />}
          label="Last 30 days"
          value={stats?.last30Days ?? "—"}
        />
      </div>

      {/* Search + filter */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file name…"
            className="pl-9"
            aria-label="Search analyses by file name"
          />
        </div>
        <Select
          value={filter}
          onValueChange={(value) => setFilter(value as typeof filter)}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by outcome">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Catalog */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-card/60 py-20 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Loading your catalog…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <Inbox className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-base font-semibold tracking-tight">
            {analyses && analyses.length > 0
              ? "No items match this view"
              : "Your catalog is empty"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
            {analyses && analyses.length > 0
              ? "Try a different search term or switch the filter back to “All items”."
              : "Submit your first image and ProofPix will build a full forensic report you can revisit here at any time."}
          </p>
          {analyses && analyses.length === 0 && (
            <Button className="mt-5" onClick={() => navigate("/analyze")}>
              <Plus className="mr-2 size-4" />
              Start your first analysis
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card/60">
          {rows.map((item) => (
            <li key={item._id}>
              <div className="group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4">
                <button
                  type="button"
                  onClick={() => navigate(`/report/${item._id}`)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted",
                      item.kind === "comparison" && "text-primary",
                    )}
                  >
                    {item.kind === "comparison" ? (
                      <GitCompareArrows className="size-4" />
                    ) : (
                      <ImageIcon className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold tracking-tight">
                      {item.fileName}
                      {item.fileNameB && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          vs {item.fileNameB}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.kind === "comparison" ? "Comparison" : "Image analysis"}
                      {" · "}
                      {item.format?.toUpperCase() ?? "—"}
                      {item.width && item.height
                        ? ` · ${item.width}×${item.height}`
                        : ""}
                      {" · "}
                      {formatBytes(item.sizeBytes)} · {formatDateTime(item.createdAt)}
                    </span>
                  </span>
                </button>

                <div className="flex shrink-0 flex-wrap items-center gap-2 pl-13 sm:pl-0">
                  {item.status === "completed" && item.assessment ? (
                    <AssessmentBadge assessment={item.assessment} compact />
                  ) : (
                    <PipelineBadge status={item.status} />
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {shortId(item._id)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete report for ${item.fileName}`}
                    onClick={() => setPendingDelete(item._id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              {item.error && (
                <p className="pb-3 pl-[4.25rem] text-xs text-destructive">
                  {item.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              The analysis, its findings, and every stored file — including the
              uploaded image — will be permanently removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Delete report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceShell>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3.5">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
