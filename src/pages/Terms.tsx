import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Scale } from "lucide-react";

const SECTIONS = [
  {
    title: "The service",
    body: [
      "ProofPix is a digital image investigation workspace. It runs technical checks on files you submit and produces reports describing what those checks measured.",
      "You need an account (including anonymous guest sessions) to submit analyses. You are responsible for what you upload and for keeping access to your account secure.",
    ],
  },
  {
    title: "Reports are evidence, not verdicts",
    body: [
      "Reports are technical readings of a file. They are not certifications of authenticity, not legal opinions, and not guarantees that any image is genuine or manipulated.",
      "A clean result is weak support at best — the same structure a clean file has can be reproduced by editing. A flagged check is a lead, not an accusation: ordinary resizing, exporting, screenshots, and platform compression produce the same signals.",
      "Image analysis alone cannot establish real-world facts — whether an event occurred, whether a payment was made, who changed a file, or why. Corroborate outside the image before relying on any conclusion.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "Upload only files you have the right to process. Do not submit content that is unlawful, that violates another person's privacy or rights, or that you are not authorised to examine.",
      "Do not attempt to access analyses that are not yours, disrupt the service, or probe the infrastructure. Ownership checks are enforced server-side and circumventing them is grounds for termination.",
      "Automated bulk use requires written permission from us first.",
    ],
  },
  {
    title: "Your content and your controls",
    body: [
      "You keep ownership of everything you upload. You grant us only the permission needed to run the analysis and show you your reports.",
      "You can delete individual reports or your entire account at any time, from inside the product. Deletion removes the associated files and results.",
      "Exports (print/PDF and JSON) are yours to keep, share, and cite — subject to the limitations described in the report itself.",
    ],
  },
  {
    title: "Availability and liability",
    body: [
      "The service is provided as-is. Checks may be skipped for unsupported inputs or fail for technical reasons; reports state plainly when that happens, and an incomplete analysis is labelled as such.",
      "To the maximum extent permitted by law, we are not liable for indirect or consequential damages arising from use of the service or reliance on a report. Our total liability is limited to the amount you paid us in the twelve months before the claim, or $50 if you have paid nothing.",
    ],
  },
  {
    title: "Changes and contact",
    body: [
      "We may update these terms; material changes will be dated on this page. Continued use after an update means you accept the revised terms.",
      "Questions: support@proofpix.example.",
    ],
  },
] as const;

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="border-b border-white/10">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Scale className="size-3.5" />
            Terms of service
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Fair terms, plain language
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
            These terms govern your use of ProofPix. The core of them: reports
            are technical evidence rather than verdicts, your files stay yours,
            and you are responsible for what you submit.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Last updated: October 2026
          </p>

          <div className="mt-10 space-y-8">
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <h2 className="text-lg font-semibold tracking-tight">
                  {section.title}
                </h2>
                <ul className="mt-3 space-y-3">
                  {section.body.map((paragraph) => (
                    <li
                      key={paragraph}
                      className="flex gap-3 text-sm leading-6 text-muted-foreground"
                    >
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
                      <span>{paragraph}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
