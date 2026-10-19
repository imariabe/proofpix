import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Clock3,
  Eye,
  FileDown,
  Fingerprint,
  GitCompareArrows,
  Layers,
  Lock,
  ScanSearch,
  ShieldQuestion,
  Sparkles,
  ZoomIn,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.21, 0.6, 0.35, 1] as const },
};

const FEATURES = [
  {
    icon: Fingerprint,
    title: "Metadata inspection",
    body: "Extracts EXIF and container metadata — camera, timestamps, software tags — and reports exactly which fields are present or missing.",
    to: "/analyze",
  },
  {
    icon: Layers,
    title: "Consistency checks",
    body: "Cross-checks header dimensions against EXIF capture fields, timestamps against each other, and encoding signatures against the file's stated origin.",
    to: "/analyze",
  },
  {
    icon: GitCompareArrows,
    title: "Image comparison",
    body: "Decodes two files and measures them against each other on a common canvas — mean error, peak signal ratio, and a difference visualization you can download.",
    to: "/analyze",
  },
  {
    icon: ScanSearch,
    title: "JPEG compression analysis",
    body: "Error Level Analysis rebuilds the file at a fixed quality and maps where it reacts differently, with a hotspot grid overlaid for inspection.",
    to: "/analyze",
  },
  {
    icon: Sparkles,
    title: "Guided explanations",
    body: "Every technical finding is translated into plain language — what was detected, what it may indicate, and what it cannot establish.",
    to: "/analyze",
  },
  {
    icon: FileDown,
    title: "Exportable reports",
    body: "Download a complete report — findings, measurements, methods, and limitations — as a print-ready document or machine-readable JSON.",
    to: "/analyze",
  },
] as const;

const STEPS = [
  {
    number: "01",
    title: "Submit your image",
    body: "Upload a JPEG, PNG, or WebP up to 8 MB. Files are validated by content — the actual bytes — not by their extension.",
  },
  {
    number: "02",
    title: "Run the forensic checks",
    body: "Metadata, structure, encoding, consistency, and compression analysis run as separate, verifiable steps. You watch each one complete in real time.",
  },
  {
    number: "03",
    title: "Read the evidence, understand the limits",
    body: "The report separates confirmed measurements from warning signs, states plainly what the analysis cannot prove, and suggests what to check next.",
  },
] as const;

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      {/* ---------------------------------------------------------- HERO */}
      <section className="relative overflow-hidden border-b border-white/10">
        {/* faint grid texture — the "instrument" feel */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(to right, oklch(0.64 0.17 255 / 35%) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.64 0.17 255 / 35%) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 0%, black 30%, transparent 75%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[46rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.55 0.2 255 / 32%), transparent)",
          }}
        />

        <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.21, 0.6, 0.35, 1] }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Eye className="size-3.5" />
              Digital evidence workspace
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Can you trust
              <br />
              what you see?
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Investigate images and screenshots with digital forensic tools.
              Examine file metadata, test technical consistency, inspect
              compression history, compare versions — and understand exactly
              what the evidence can and cannot tell you.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={() => navigate(isAuthenticated ? "/analyze" : "/auth")}
                className="gap-2"
              >
                Analyse an image
                <ArrowRight className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  document
                    .getElementById("how-it-works")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Explore how it works
              </Button>
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="size-3.5 text-primary" />
              Customer accounts are protected. Files are stored only for your
              reports and delete with them.
            </p>
          </motion.div>

          {/* Illustrative report preview */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.21, 0.6, 0.35, 1] }}
            className="rounded-xl border border-white/12 bg-card/80 p-5 backdrop-blur"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Illustrative preview
                </p>
                <p className="text-sm font-semibold tracking-tight">
                  Sample evidence report
                </p>
              </div>
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">
                Demonstration only
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1.1fr_1fr]">
              {/* fake ELA visualization */}
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-[#070b14]">
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "radial-gradient(140px 100px at 28% 62%, oklch(0.95 0.02 85 / 78%), transparent 70%), radial-gradient(90px 70px at 74% 30%, oklch(0.9 0.02 85 / 55%), transparent 70%), radial-gradient(60px 50px at 55% 80%, oklch(0.85 0.02 85 / 45%), transparent 70%)",
                  }}
                />
                {/* hotspot grid overlay */}
                <div className="absolute inset-0 grid grid-cols-4 grid-rows-4">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div
                      key={i}
                      className={
                        i === 9
                          ? "border-2 border-warning/90"
                          : "border border-white/5"
                      }
                    />
                  ))}
                </div>
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
                  ELA map · grid overlay
                </span>
              </div>

              {/* evidence rows */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Evidence breakdown
                </p>
                <PreviewRow
                  tone="warning"
                  icon={<AlertTriangle className="size-3.5" />}
                  label="Warning sign"
                  text="Editing-software signature in marker blocks"
                />
                <PreviewRow
                  tone="ok"
                  icon={<CheckCircle2 className="size-3.5" />}
                  label="Confirmed"
                  text="Dimensions match EXIF capture grid"
                />
                <PreviewRow
                  tone="info"
                  icon={<ShieldQuestion className="size-3.5" />}
                  label="Context"
                  text="No EXIF — normal for shared screenshots"
                />
                <div className="mt-1 rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    “No single check establishes authenticity. This report
                    describes technical evidence and its limits.”
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------- FEATURES */}
      <section id="features" className="border-b border-white/10 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Capabilities
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Six forensic tools, one honest report
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              Every capability below runs on your uploaded file and reports
              only what it actually measured. Nothing here is simulated.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.button
                  key={feature.title}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: index * 0.05 }}
                  type="button"
                  onClick={() => navigate(feature.to)}
                  className="group cursor-pointer rounded-xl border border-white/10 bg-card/60 p-5 text-left transition-colors hover:border-primary/40 hover:bg-card"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {feature.body}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                    Open workspace
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- HOW IT WORKS */}
      <section id="how-it-works" className="border-b border-white/10 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Workflow
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Three steps from upload to understanding
            </h2>
          </motion.div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <motion.div
                key={step.number}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: index * 0.08 }}
                className="relative rounded-xl border border-white/10 bg-card/60 p-6"
              >
                <span className="text-4xl font-bold tracking-tight text-primary/25">
                  {step.number}
                </span>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {step.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- TRUST */}
      <section id="about" className="relative border-b border-white/10 py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <motion.div
            {...fadeUp}
            className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-8 sm:p-10"
          >
            <div className="flex items-center gap-3">
              <ShieldQuestion className="size-6 text-primary" />
              <h2 className="text-xl font-bold tracking-tight">
                Investigation, not certification
              </h2>
            </div>
            <p className="mt-5 text-lg leading-8 text-foreground/90">
              “An analysis result is not a verdict. ProofPix helps you examine
              technical evidence, but no single check can establish the
              authenticity of every image.”
            </p>
            <div className="mt-6 grid gap-4 text-sm leading-6 text-muted-foreground sm:grid-cols-3">
              <p>
                Passing every check is <strong className="text-foreground">weak support</strong> at
                best — the same structure a clean file has can be reproduced by
                a forger.
              </p>
              <p>
                Flagging a check is <strong className="text-foreground">a lead</strong>, not an
                accusation — ordinary resizing, exporting, and screenshots
                produce the same signals.
              </p>
              <p>
                Image analysis alone <strong className="text-foreground">cannot establish real-world
                facts</strong> — whether a payment happened, whether a conversation
                occurred, who altered a file, or why.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* -------------------------------------------------------- PRIVACY */}
      <section className="border-b border-white/10 py-20">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <motion.div {...fadeUp}>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Privacy
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Your evidence stays yours
            </h2>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => navigate("/privacy")}
            >
              <BookOpenText className="mr-2 size-4" />
              Read the privacy policy
            </Button>
          </motion.div>
          <motion.ul {...fadeUp} className="space-y-4 text-sm leading-6 text-muted-foreground">
            {[
              "Uploads are tied to your account and used only to produce your reports. No file is shared with other customers.",
              "Analysis runs on dedicated image-processing code; your file bytes are never sent to any AI provider — only structured check results are, and only when you ask for an explanation.",
              "Reports and stored files can be deleted by you at any time from the catalog; deleting a report removes its files and artifacts immediately.",
              "Images that fail validation are deleted right away — nothing unusable is retained.",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <span>{item}</span>
              </li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ------------------------------------------------------ FINAL CTA */}
      <section className="py-24">
        <motion.div
          {...fadeUp}
          className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6"
        >
          <ZoomIn className="mx-auto size-9 text-primary" />
          <h2 className="mt-4 text-3xl font-bold tracking-tight">
            Look closer. Know what you&apos;re looking at.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Open the workspace, submit an image, and read a full forensic
            report in under a minute.
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <Button
              size="lg"
              onClick={() => navigate(isAuthenticated ? "/analyze" : "/auth")}
              className="gap-2"
            >
              {isAuthenticated ? "Start an analysis" : "Create your account"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            Analysis typically completes in a few seconds.
          </p>
        </motion.div>
      </section>

      <SiteFooter />
    </div>
  );
}

function PreviewRow({
  tone,
  icon,
  label,
  text,
}: {
  tone: "warning" | "ok" | "info";
  icon: React.ReactNode;
  label: string;
  text: string;
}) {
  const styles = {
    warning: "border-warning/30 bg-warning/10 text-warning",
    ok: "border-success/30 bg-success/10 text-success",
    info: "border-primary/30 bg-primary/10 text-primary",
  } as const;
  return (
    <div className={`rounded-lg border px-3 py-2 ${styles[tone]}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-foreground/80">{text}</p>
    </div>
  );
}
