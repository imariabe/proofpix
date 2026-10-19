import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import EvidenceScene from "@/components/EvidenceScene";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import elaGridImg from "@/assets/viz-ela-grid.svg";
import exifImg from "@/assets/viz-exif.svg";
import diffImg from "@/assets/viz-diff.svg";
import uploadImg from "@/assets/scene-upload.svg";
import scanImg from "@/assets/scene-scan.svg";
import reportImg from "@/assets/scene-report.svg";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  CheckCircle2,
  FileDown,
  Fingerprint,
  GitCompareArrows,
  Info,
  Layers,
  Lock,
  MoveHorizontal,
  Newspaper,
  Scale,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.21, 0.6, 0.35, 1] as const },
};

/* ------------------------------------------------------------------ */
/* Hero — interactive original ⇄ ELA specimen viewer                   */
/* ------------------------------------------------------------------ */

function SpecimenViewer() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [split, setSplit] = useState(56); // % of the stage still showing the photo

  const clamp = (value: number) => Math.min(98, Math.max(2, value));

  const updateFromPointer = (clientX: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setSplit(clamp(((clientX - rect.left) / rect.width) * 100));
  };

  const setView = (next: number) => setSplit(next);

  const hudLabel =
    split <= 4
      ? "ELA · Q90 ×15"
      : split >= 96
        ? "ORIGINAL SPECIMEN"
        : "ORIGINAL ⇄ ELA";

  return (
    <div className="rounded-2xl border border-white/12 bg-card/70 p-3 shadow-[0_30px_80px_-40px_oklch(0.64_0.17_255/45%)] backdrop-blur">
      {/* Window chrome */}
      <div className="flex items-center justify-between gap-3 px-2 pb-3">
        <span className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-destructive/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
        </span>
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
          proofpix · specimen viewer
        </p>
        <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-warning">
          DEMO
        </span>
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className="relative aspect-[3/2] w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-xl border border-border bg-[#04060d]"
        role="img"
        aria-label="Interactive specimen viewer: drag to compare the original photograph with its Error Level Analysis map"
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) updateFromPointer(event.clientX);
        }}
        onPointerUp={(event) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          // Only release a pointer this stage actually captured — releasing an
          // uncaptured pointer throws NotFoundError.
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      >
        {/* Original */}
        <EvidenceScene variant="photo" className="absolute inset-0 h-full w-full" />

        {/* ELA layer, clipped to the right of the handle */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
        >
          <EvidenceScene variant="ela" className="absolute inset-0 h-full w-full" />
          {/* Pulse marker on the region the demo report flags */}
          <div
            className="pp-pulse absolute rounded-sm border-2 border-warning/90 bg-warning/15"
            style={{ left: "76.5%", top: "21%", width: "20%", height: "26%" }}
          />
        </div>

        {/* Handle */}
        {split > 4 && split < 96 && (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white/70"
            style={{ left: `${split}%` }}
          >
            <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-black/70 text-white">
              <MoveHorizontal className="size-4" />
            </span>
          </div>
        )}

        {/* HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="rounded bg-black/60 px-2 py-1 font-mono text-[10px] tracking-widest text-white/85">
            night-harbour.jpg
          </span>
          <span className="flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 font-mono text-[10px] tracking-widest text-primary">
            <span className="pp-pulse size-1.5 rounded-full bg-primary" />
            {hudLabel}
          </span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
          <span className="rounded bg-black/60 px-2 py-1 font-mono text-[10px] tracking-widest text-white/70">
            1200 × 760 · JPEG
          </span>
          <span className="rounded bg-black/60 px-2 py-1 font-mono text-[10px] tracking-widest text-warning">
            REGION 3,2 REACTS DIFFERENTLY
          </span>
        </div>
      </div>

      {/* Mode controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3">
        <div className="flex gap-1.5" role="group" aria-label="Viewer mode">
          {(
            [
              { label: "Original", value: 98 },
              { label: "Compare", value: 56 },
              { label: "ELA map", value: 2 },
            ] as const
          ).map((option) => {
            const active =
              (option.value === 98 && split >= 96) ||
              (option.value === 2 && split <= 4) ||
              (option.value === 56 && split > 4 && split < 96);
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => setView(option.value)}
                aria-pressed={active}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MoveHorizontal className="size-3.5" />
          Drag across the image to inspect
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 px-1 pt-3">
        <p className="text-[11px] leading-4 text-muted-foreground">
          Illustrative preview — regions reacting to recompression are a lead,
          not a detected edit.
        </p>
        <Button
          size="sm"
          onClick={() => navigate(isAuthenticated ? "/analyze" : "/auth")}
          className="shrink-0 gap-1.5"
        >
          Examine yours
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const start = () => navigate(isAuthenticated ? "/analyze" : "/auth");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      {/* ---------------------------------------------------------- HERO */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(to right, oklch(0.64 0.17 255 / 40%) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.64 0.17 255 / 40%) 1px, transparent 1px)",
            backgroundSize: "46px 46px",
            maskImage:
              "radial-gradient(ellipse 75% 65% at 50% 0%, black 25%, transparent 78%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-48 left-1/2 h-[26rem] w-[54rem] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.55 0.2 255 / 34%), transparent)",
          }}
        />
        {/* instrument sweep */}
        <div
          aria-hidden
          className="pp-sweep pointer-events-none absolute inset-x-0 top-0 h-16"
          style={{
            background:
              "linear-gradient(to bottom, transparent, oklch(0.64 0.17 255 / 14%) 55%, oklch(0.64 0.17 255 / 45%))",
          }}
        />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.06fr] lg:items-center lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.21, 0.6, 0.35, 1] }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <ScanSearch className="size-3.5" />
              Digital investigation lab
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.6rem]">
              Examine the image.
              <br />
              <span className="text-primary">Understand the evidence.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              ProofPix runs genuine forensic checks on your JPEG, PNG, and WebP
              files — metadata, structure, consistency, compression history —
              and returns a report that separates confirmed facts from warning
              signs, and states plainly what it cannot prove.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={start} className="gap-2">
                Analyse an image
                <ArrowRight className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() =>
                  document
                    .getElementById("features")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Tour the lab
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Lock className="size-3.5 text-primary" />
                Private to you — files delete with their reports
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" />
                No “real” or “fake” labels — ever
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.21, 0.6, 0.35, 1] }}
          >
            <SpecimenViewer />
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------- STATS */}
      <section className="border-b border-white/10 bg-navy/40">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
          {[
            { value: "7", label: "forensic checks per report" },
            { value: "3", label: "formats: JPEG · PNG · WebP" },
            { value: "sec", label: "from upload to full report" },
            { value: "0", label: "pixel bytes ever sent to AI" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-3">
              <span className="text-3xl font-bold tracking-tight text-primary">
                {stat.value}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ BENTO */}
      <section id="features" className="border-b border-white/10 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Inside the lab
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Instruments, not guesswork
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              Every instrument below reports only what it measured on your file
              — with its method and its limits attached.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {/* A — ELA, wide */}
            <motion.article
              {...fadeUp}
              className="group rounded-2xl border border-white/10 bg-card/60 p-4 transition-colors hover:border-primary/40 md:col-span-2"
            >
              <div className="overflow-hidden rounded-xl border border-border">
                <img
                  src={elaGridImg}
                  alt="Error Level Analysis heatmap with a highlighted hotspot cell"
                  className="h-56 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  loading="lazy"
                />
              </div>
              <div className="flex items-start gap-3 p-2 pt-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <Layers className="size-4" />
                </span>
                <div>
                  <h3 className="text-base font-semibold tracking-tight">
                    Compression history, visualised
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    Error Level Analysis rebuilds the file at a fixed quality
                    and maps where it reacts differently, with a hotspot grid
                    you can hover, read, and export. Bright regions are leads
                    for review — texture and resizing react the same way.
                  </p>
                </div>
              </div>
            </motion.article>

            {/* B — Metadata */}
            <motion.article
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.06 }}
              className="group rounded-2xl border border-white/10 bg-card/60 p-4 transition-colors hover:border-primary/40"
            >
              <div className="overflow-hidden rounded-xl border border-border">
                <img
                  src={exifImg}
                  alt="EXIF panel listing camera fields read from a file"
                  className="h-40 w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-2 pt-4">
                <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
                  <Fingerprint className="size-4 text-primary" />
                  Metadata, read honestly
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  Camera, timestamps, software tags — reported field by field.
                  Missing metadata is treated as normal, because screenshots
                  and platforms strip it by design.
                </p>
              </div>
            </motion.article>

            {/* C — Comparison */}
            <motion.article
              {...fadeUp}
              className="group rounded-2xl border border-white/10 bg-card/60 p-4 transition-colors hover:border-primary/40"
            >
              <div className="overflow-hidden rounded-xl border border-border">
                <img
                  src={diffImg}
                  alt="Two images split by a difference-map seam"
                  className="h-40 w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-2 pt-4">
                <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
                  <GitCompareArrows className="size-4 text-primary" />
                  Compare two files
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  Both images decoded onto one canvas — mean error, PSNR,
                  changed-pixel coverage, and a difference map to download.
                </p>
              </div>
            </motion.article>

            {/* D — Structure & consistency, wide */}
            <motion.article
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.06 }}
              className="rounded-2xl border border-white/10 bg-card/60 p-6 transition-colors hover:border-primary/40 md:col-span-2"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <ScanSearch className="size-4" />
                </span>
                <div>
                  <h3 className="text-base font-semibold tracking-tight">
                    Structure & consistency cross-examination
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    Marker and chunk inventories, truncation and appended-byte
                    detection, then cross-checks: header dimensions against
                    capture fields, timestamps against each other, encoding
                    signatures against the file&apos;s stated origin.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      "SOI … EOI walk",
                      "trailing bytes",
                      "chunk inventory",
                      "dimension cross-check",
                      "timeline order",
                      "quality estimate",
                    ].map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.article>

            {/* E — Explanations */}
            <motion.article
              {...fadeUp}
              className="rounded-2xl border border-white/10 bg-card/60 p-5 transition-colors hover:border-primary/40"
            >
              <span className="flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">
                Guided explanations
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Ask any question about your report. Answers are labelled
                <span className="text-foreground"> AI-assisted</span> or
                <span className="text-foreground"> rule-based</span> — and only
                structured results ever leave the backend.
              </p>
            </motion.article>

            {/* F — Exports */}
            <motion.article
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.06 }}
              className="rounded-2xl border border-white/10 bg-card/60 p-5 transition-colors hover:border-primary/40"
            >
              <span className="flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <FileDown className="size-4" />
              </span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">
                Exportable reports
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Print-ready PDF or machine-readable JSON — findings,
                measurements, methods, and limitations included.
              </p>
            </motion.article>

            {/* G — Privacy */}
            <motion.article
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.12 }}
              className="rounded-2xl border border-white/10 bg-card/60 p-5 transition-colors hover:border-primary/40"
            >
              <span className="flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <Lock className="size-4" />
              </span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">
                Private by design
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Every report read re-checks ownership server-side. Delete a
                report and its files go with it — immediately.
              </p>
            </motion.article>
          </div>
        </div>
      </section>

      {/* ------------------------------------- EVIDENCE BREAKDOWN */}
      <section id="breakdown" className="border-b border-white/10 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              The result screen
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              The Evidence Breakdown
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              Not a badge that says “real” or “fake” — a structured account of
              what was detected, why it may be unusual, and how much each item
              actually proves.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_1fr]">
            {/* Left: marked-up specimen */}
            <motion.div {...fadeUp} className="overflow-hidden rounded-2xl border border-white/12 bg-card/70">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
                  report · #A7F3
                </p>
                <span className="rounded border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-warning">
                  POTENTIAL INCONSISTENCIES
                </span>
              </div>
              <div className="relative aspect-[3/2]">
                <EvidenceScene variant="photo" className="absolute inset-0 h-full w-full" />
                {/* warning region */}
                <div className="absolute rounded-sm border-2 border-warning bg-warning/10" style={{ left: "76.5%", top: "21%", width: "20%", height: "26%" }}>
                  <span className="absolute -top-7 left-0 whitespace-nowrap rounded bg-warning px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-black">
                    WARNING · REACTS DIFFERENTLY
                  </span>
                </div>
                {/* confirmed region */}
                <div className="absolute rounded-sm border-2 border-success bg-success/10" style={{ left: "3%", top: "27%", width: "20%", height: "24%" }}>
                  <span className="absolute -top-7 left-0 whitespace-nowrap rounded bg-success px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-black">
                    CONFIRMED · GRID MATCHES
                  </span>
                </div>
              </div>
              <p className="border-t border-border px-4 py-3 text-[11px] leading-5 text-muted-foreground">
                Regions are labelled by what was measured there — never
                captioned as a detected edit.
              </p>
            </motion.div>

            {/* Right: the three groups */}
            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.08 }}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
                  <b className="mr-1">5</b> confirmed
                </span>
                <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                  <b className="mr-1">2</b> warning signs
                </span>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <b className="mr-1">4</b> context notes
                </span>
              </div>

              <BreakdownRow
                tone="success"
                icon={<CheckCircle2 className="size-4" />}
                title="Dimensions match the capture grid"
                body="The header declares 4000 × 3000 and the EXIF capture fields agree — read directly from the bytes."
                chip="4000×3000 JPEG"
              />
              <BreakdownRow
                tone="warning"
                icon={<TriangleAlert className="size-4" />}
                title="Written by an editing application"
                body="The software field reads “Snapseed”. That confirms the file was processed by an editor — exports, converters, and phone post-processing all record this. It confirms processing, not deception."
                chip="Software = Snapseed"
              />
              <BreakdownRow
                tone="primary"
                icon={<Info className="size-4" />}
                title="No location data retained"
                body="GPS fields are absent — normal after any platform upload. Needed to interpret the rest, meaningless alone."
                chip="GPS absent"
              />

              <div className="mt-1 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
                Every report also carries a permanent section:{" "}
                <span className="text-foreground">
                  “What this analysis cannot prove.”
                </span>{" "}
                Passing checks is weak support at best — never a certificate.
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ WORKFLOW */}
      <section id="how-it-works" className="border-b border-white/10 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Workflow
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Three moves, start to finish
            </h2>
          </motion.div>

          <div className="relative mt-12 grid gap-6 lg:grid-cols-3">
            <div
              aria-hidden
              className="absolute left-[16%] right-[16%] top-[26px] hidden h-px bg-gradient-to-r from-primary/10 via-primary/50 to-primary/10 lg:block"
            />
            {[
              {
                n: "01",
                title: "Submit the specimen",
                body: "Drop in a JPEG, PNG, or WebP up to 8 MB. The bytes are content-sniffed — the extension is never trusted.",
                img: uploadImg,
                alt: "Upload illustration: file card moving into a signed intake tray",
              },
              {
                n: "02",
                title: "Watch the checks run",
                body: "Validation, metadata, structure, consistency, compression — each step reports completion only when it genuinely finishes.",
                img: scanImg,
                alt: "Scan illustration: beam sweeping a specimen beside a live checklist",
              },
              {
                n: "03",
                title: "Read the evidence",
                body: "An organised report: breakdown, visualisations, per-check limits, next steps, and export in PDF or JSON.",
                img: reportImg,
                alt: "Report illustration: forensic report with reading pill, evidence rows, and export chips",
              },
            ].map((step, index) => (
              <motion.div
                key={step.n}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: index * 0.08 }}
                className="relative rounded-2xl border border-white/10 bg-card/60 p-5"
              >
                <span className="relative z-10 flex size-[52px] items-center justify-center rounded-full border border-primary/40 bg-background font-mono text-lg font-bold text-primary">
                  {step.n}
                </span>
                <div className="mt-4 overflow-hidden rounded-xl border border-border">
                  <img
                    src={step.img}
                    alt={step.alt}
                    className="h-40 w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <h3 className="mt-4 text-base font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {step.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ USE CASES */}
      <section className="border-b border-white/10 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp}>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Built for
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              People who have to get it right
            </h2>
          </motion.div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: BadgeCheck,
                title: "Fact-checking desks",
                body: "Turn a suspicious image into a defensible line of technical evidence — with its limits written down.",
              },
              {
                icon: Newspaper,
                title: "Newsrooms",
                body: "Vet user submissions fast, and ask sources for the original when the file raises a lead.",
              },
              {
                icon: Scale,
                title: "Legal & insurance",
                body: "Document what the bytes show, export the full report, and avoid claims the tool cannot back.",
              },
              {
                icon: ShieldCheck,
                title: "Trust & safety",
                body: "Triage incoming media with consistent, explainable checks instead of gut feeling.",
              },
            ].map((use, index) => {
              const Icon = use.icon;
              return (
                <motion.div
                  key={use.title}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: index * 0.05 }}
                  className="rounded-2xl border border-white/10 bg-card/60 p-5 transition-colors hover:border-primary/40"
                >
                  <Icon className="size-5 text-primary" />
                  <h3 className="mt-3 text-base font-semibold tracking-tight">
                    {use.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    {use.body}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- MANIFESTO */}
      <section id="about" className="border-b border-white/10 py-24">
        <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6">
          <motion.div {...fadeUp}>
            <BookOpenText className="mx-auto size-8 text-primary" />
            <p className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              An analysis is not a verdict.
            </p>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              ProofPix helps you examine technical evidence and understand its
              limits. No single check can establish the authenticity of every
              image — and we would rather say so loudly than sell you certainty.
            </p>
          </motion.div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-left sm:grid-cols-3">
            {[
              {
                head: "Passing checks",
                body: "is weak support at best — a clean structure can be reproduced by editing.",
              },
              {
                head: "A flagged check",
                body: "is a lead, not an accusation — ordinary re-saves produce the same signals.",
              },
              {
                head: "Pixels alone",
                body: "cannot prove real-world facts: events, payments, conversations, intent.",
              },
            ].map((note) => (
              <div key={note.head} className="bg-background p-6">
                <p className="text-sm font-semibold tracking-tight">{note.head}</p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {note.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- PRIVACY */}
      <section className="border-b border-white/10 py-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <Lock className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Your evidence stays yours
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Uploads exist only to produce your reports, are never shown to
                other customers, and are deleted the moment you delete the
                report. Failed uploads are removed on the spot.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/privacy")}>
            Read the privacy policy
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </section>

      {/* -------------------------------------------------------- CTA */}
      <section className="relative overflow-hidden py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[22rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.55 0.2 255 / 30%), transparent)",
          }}
        />
        <motion.div
          {...fadeUp}
          className="relative mx-auto w-full max-w-3xl px-4 text-center sm:px-6"
        >
          <ScanSearch className="mx-auto size-9 text-primary" />
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Open the lab. Look closer.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Submit an image, watch seven checks run, and read a full forensic
            report — findings, visualisations, and limits — in under a minute.
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <Button size="lg" onClick={start} className="gap-2">
              {isAuthenticated ? "Start an analysis" : "Create your account"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <p className="mt-6 font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
            REPORTS ARE EVIDENCE, NOT CERTIFICATES
          </p>
        </motion.div>
      </section>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BreakdownRow({
  tone,
  icon,
  title,
  body,
  chip,
}: {
  tone: "success" | "warning" | "primary";
  icon: React.ReactNode;
  title: string;
  body: string;
  chip: string;
}) {
  const tones = {
    success: {
      card: "border-l-success/70",
      badge: "border-success/30 bg-success/10 text-success",
    },
    warning: {
      card: "border-l-warning/70",
      badge: "border-warning/30 bg-warning/10 text-warning",
    },
    primary: {
      card: "border-l-primary/70",
      badge: "border-primary/30 bg-primary/10 text-primary",
    },
  }[tone];
  return (
    <div className={cn("rounded-xl border border-white/10 border-l-4 bg-card/60 p-4", tones.card)}>
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold tracking-tight">
        <span className={cn("flex size-6 items-center justify-center rounded-md border", tones.badge)}>
          {icon}
        </span>
        {title}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
          {chip}
        </span>
      </p>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
