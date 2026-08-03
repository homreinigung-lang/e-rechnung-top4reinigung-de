import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/rechtliches")({
  component: LegalLayout,
});

const links = [
  { to: "/rechtliches/impressum", label: "Impressum" },
  { to: "/rechtliches/agb", label: "AGB" },
  { to: "/rechtliches/datenschutz", label: "Datenschutz" },
  { to: "/rechtliches/bibliotheken", label: "Bibliotheken" },
] as const;

function LegalLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-6 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="size-4" /> Zurück
            </Link>
          </Button>
          <nav className="flex flex-wrap gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                activeProps={{ className: "bg-secondary text-secondary-foreground" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
