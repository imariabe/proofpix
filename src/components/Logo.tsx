import { cn } from "@/lib/utils";

/**
 * ProofPix mark: a lens reticle over a framed plate — the "look closer"
 * idea in one glyph. Inherits currentColor for the frame so it works on
 * navy surfaces and light cards alike.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="ProofPix"
      className={cn("size-8", className)}
      fill="none"
    >
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="7.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="15" cy="15" r="6.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="15" cy="15" r="2.25" fill="var(--primary)" />
      <path
        d="M15 5.5v3M15 21.5v3M5.5 15h3M21.5 15h3"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const content = (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-7 text-foreground" />
      <span className="text-lg font-bold tracking-tight">
        Proof<span className="text-primary">Pix</span>
      </span>
    </span>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="ProofPix home"
      >
        {content}
      </button>
    );
  }
  return content;
}
