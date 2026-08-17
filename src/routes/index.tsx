import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, Mail, MoreVertical, Receipt, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HomR – Rechnungen & Angebote für Reinigungsfirmen" },
      {
        name: "description",
        content:
          "Angebote und Rechnungen ohne Umsatzsteuer (Reverse-Charge, EU) erstellen, verwalten und direkt per E-Mail versenden.",
      },
      { property: "og:title", content: "HomR – Rechnungen & Angebote" },
      {
        property: "og:description",
        content:
          "Angebote und Rechnungen ohne Umsatzsteuer (Reverse-Charge, EU) erstellen, verwalten und versenden.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Receipt,
    title: "Rechnungen in Sekunden",
    text: "Positionen erfassen, Nummer wird automatisch vergeben, Summe wird live berechnet.",
  },
  {
    icon: FileText,
    title: "Angebote & Kostenvoranschläge",
    text: "Angebote schreiben und mit einem Klick in eine Rechnung umwandeln.",
  },
  {
    icon: ShieldCheck,
    title: "EU ohne Umsatzsteuer",
    text: "Reverse-Charge-Hinweis nach § 13b UStG inklusive USt-IdNr. beider Parteien.",
  },
  {
    icon: Mail,
    title: "Versand per E-Mail",
    text: "Dokument direkt an den Kunden senden oder als PDF drucken.",
  },
];

function Landing() {
  const navigate = useNavigate();
  // Eingeladene Mitarbeitende sehen ausschließlich die Anmeldung, keine Marketing-Seite.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let role: string | null = null;
    try {
      role = localStorage.getItem("homr:role");
    } catch {
      role = null;
    }
    const invited = new URLSearchParams(window.location.search).has("mitarbeiter");
    if (role === "employee" || invited) {
      setHidden(true);
      void navigate({ to: "/auth", replace: true });
    }
  }, [navigate]);

  if (hidden) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <img
            src="/app-icon-192.png"
            alt="HomR Logo"
            width={36}
            height={36}
            className="size-9 rounded-lg"
          />
          <span className="font-display text-lg font-semibold">HomR</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menü öffnen">
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Menü</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/auth" className="w-full cursor-pointer">
                Anmelden
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/rechtliches/impressum" className="w-full cursor-pointer">
                Impressum
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/rechtliches/agb" className="w-full cursor-pointer">
                AGB
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/rechtliches/datenschutz" className="w-full cursor-pointer">
                Datenschutz
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/rechtliches/bibliotheken" className="w-full cursor-pointer">
                Bibliotheken
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-10 pb-16 md:pt-20">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">
            Rechnungsprogramm für Reinigungsdienstleistungen
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-bold md:text-6xl">
            Angebote und Rechnungen – sauber, schnell, ohne Umsatzsteuer.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Verwalten Sie Kunden, schreiben Sie Angebote und Rechnungen mit Reverse-Charge-Hinweis
            für den EU-Raum und versenden Sie diese direkt per E-Mail.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Jetzt starten</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth">Ich habe bereits ein Konto</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="surface p-6">
                <f.icon className="size-6 text-primary" />
                <h2 className="mt-4 text-base font-semibold">{f.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 text-sm text-muted-foreground">
          <span>Hom Reinigung Service · Völklingen · USt-IdNr. DE458492078</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            <Link to="/rechtliches/impressum" className="hover:text-foreground hover:underline">
              Impressum
            </Link>
            <Link to="/rechtliches/agb" className="hover:text-foreground hover:underline">
              AGB
            </Link>
            <Link to="/rechtliches/datenschutz" className="hover:text-foreground hover:underline">
              Datenschutz
            </Link>
            <Link to="/rechtliches/bibliotheken" className="hover:text-foreground hover:underline">
              Bibliotheken
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
