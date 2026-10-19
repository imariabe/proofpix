import { useNavigate } from "react-router";
import { Wordmark } from "@/components/Logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Image analysis", href: "/analyze" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Features", href: "/#features" },
      { label: "About ProofPix", href: "/#about" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
    ],
  },
  {
    title: "Security & contact",
    links: [
      { label: "Security practices", href: "/privacy#security" },
      { label: "Contact support", href: "mailto:support@proofpix.example" },
    ],
  },
] as const;

export function SiteFooter() {
  const navigate = useNavigate();
  return (
    <footer className="print-hide border-t border-white/10 bg-navy/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark onClick={() => navigate("/")} />
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
              ProofPix is a digital image investigation workspace. It helps you
              examine technical evidence and understand its limits — it does
              not certify authenticity.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold tracking-tight">
                {column.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <button
                      type="button"
                      onClick={() => navigate(link.href)}
                      className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} ProofPix. All rights reserved.
          </p>
          <p>
            An analysis result is not a verdict. No single check establishes
            the authenticity of every image.
          </p>
        </div>
      </div>
    </footer>
  );
}
