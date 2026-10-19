import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Wordmark } from "@/components/Logo";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  FolderSearch,
  Home,
  LogOut,
  Menu,
  ScanSearch,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Catalog", href: "/dashboard", icon: FolderSearch },
  { label: "New analysis", href: "/analyze", icon: ScanSearch },
  { label: "Home", href: "/", icon: Home },
] as const;

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav className="flex flex-col gap-1" aria-label="Workspace">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? false
            : location.pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              navigate(item.href);
              onNavigate?.();
            }}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function AccountBlock({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const email = user?.email ?? (user?.isAnonymous ? "Guest session" : "Signed in");
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <p className="truncate px-3 text-xs text-muted-foreground">{email}</p>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          onNavigate?.();
          navigate("/");
        }}
        className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4 shrink-0" />
        Sign out
      </button>
    </div>
  );
}

/**
 * Shell for every authenticated page: persistent sidebar on large screens,
 * sheet-based navigation on mobile.
 */
export function WorkspaceShell({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <aside className="print-hide fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card/60 px-3 py-4 lg:flex">
        <div className="px-2 pb-4">
          <Wordmark />
        </div>
        <NavItems />
        <div className="mt-auto">
          <AccountBlock />
        </div>
      </aside>

      <header className="print-hide sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Wordmark />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-border bg-card">
              <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
              <div className="mt-8 flex h-full flex-col">
                <NavItems onNavigate={() => setOpen(false)} />
                <div className="mt-auto">
                  <AccountBlock onNavigate={() => setOpen(false)} />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {title}
              </h1>
              {description && (
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
