import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePublicPartners } from "@/lib/subscriptions";
import { usePlans, euro, type Plan } from "@/lib/admin";
import { PlanOrderDialog } from "@/components/PlanOrderDialog";
import { TestimonialCarousel } from "@/components/TestimonialCarousel";
import { FeatureVergleich } from "@/components/FeatureVergleich";
import { useApprovedReviews } from "@/lib/reviews";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  Calculator,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Receipt,
  ShieldCheck,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GebCalc – Software für Gebäudereinigung & E-Rechnung" },
      {
        name: "description",
        content:
          "Software für Reinigungsfirmen: Angebote, Kalkulation und E-Rechnungen für Büroreinigung, Unterhaltsreinigung und Treppenhausreinigung – GoBD-konform, EU-Reverse-Charge.",
      },
      {
        property: "og:title",
        content: "GebCalc – Software für Gebäudereinigung & E-Rechnung",
      },
      {
        property: "og:description",
        content:
          "Angebote, Kalkulation, Zeiterfassung und rechtssichere E-Rechnungen für Büroreinigung, Unterhaltsreinigung und Treppenhausreinigung.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://e-rechnung.top4reinigung.de/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://e-rechnung.top4reinigung.de/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "GebCalc",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: "https://e-rechnung.top4reinigung.de/",
          inLanguage: "de-DE",
          description:
            "Software für Reinigungsfirmen: Angebote, Kalkulation, Zeiterfassung und GoBD-konforme E-Rechnungen (XRechnung, ZUGFeRD).",
        }),
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
  {
    icon: Calculator,
    title: "Kalkulation & Leistungsverzeichnis",
    text: "Flächen, Leistungswerte und Stundensätze zu einem belastbaren Angebotspreis rechnen.",
  },
  {
    icon: Clock,
    title: "Zeiterfassung & Einsatzplanung",
    text: "Mitarbeitende erfassen ihre Zeiten mobil, Einsätze werden im Kalender geplant.",
  },
];

const fallbackPartners = [
  "SGS Industrial Services",
  "Top4 Reinigung",
  "Saar Facility GmbH",
  "Objektservice Rhein-Main",
  "CleanPoint Süd",
  "Hausmeister Union",
];

const trustPoints = [
  "GoBD-konforme Archivierung mit Festschreibung",
  "E-Rechnung: XRechnung 3.0 & ZUGFeRD 2.3",
  "Serverstandort EU, Daten je Firma streng getrennt",
];

function Landing() {
  const navigate = useNavigate();
  const { data: dbPartners } = usePublicPartners();
  const { data: plans } = usePlans();
  const { data: reviews = [] } = useApprovedReviews();
  const avgRating =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const activePlans = (plans ?? []).filter((p) => p.active);
  const partners =
    dbPartners && dbPartners.length > 0
      ? dbPartners.map((p) => ({
          key: p.id,
          name: p.company_name,
          city: p.city,
        }))
      : fallbackPartners.map((name) => ({ key: name, name, city: "" }));

  const [orderPlan, setOrderPlan] = useState<Plan | null>(null);
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
            src="/app-icon-192.png?v=3"
            alt="GebCalc Logo"
            width={36}
            height={36}
            className="size-9 rounded-lg"
          />
          <span className="flex flex-col leading-tight">
            <span className="font-display text-lg font-semibold">GebCalc</span>
            <span className="text-xs text-muted-foreground">Rechnungssystem</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link to="/auth">Login</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Kundenbewertungen anzeigen (${avgRating.toFixed(1)} von 5 Sternen, ${reviews.length} Bewertungen)`}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card/90 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent"
              >
                <span className="flex items-center text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`size-3.5 ${i < Math.round(avgRating) ? "fill-current" : "fill-transparent opacity-40"}`}
                    />
                  ))}
                </span>
                <span>{avgRating.toFixed(1)}</span>
                <span className="text-muted-foreground font-normal">· {reviews.length}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
              <DropdownMenuLabel className="flex items-center justify-between gap-2">
                <span>Kundenbewertungen</span>
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-500">
                  {avgRating.toFixed(1)}
                  <Star className="size-3 fill-current" />
                  <span className="font-normal text-muted-foreground">
                    · {reviews.length} Bewertungen
                  </span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {reviews.map((r) => (
                <div key={r.id} className="px-2 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{r.company_name}</span>
                    <span className="flex items-center gap-0.5 text-amber-500">
                      {Array.from({ length: r.rating }).map((_, j) => (
                        <Star key={j} className="size-3 fill-current" />
                      ))}
                    </span>
                  </div>
                  <p className="text-[11px] text-primary">Verified Business User</p>
                  <p className="mt-1 text-xs text-foreground/90 leading-snug">{r.text}</p>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
                <Link to="/rechtliches/avv" className="w-full cursor-pointer">
                  AVV
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/rechtliches/bibliotheken" className="w-full cursor-pointer">
                  Bibliotheken
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
              <Link to="/auth">Kostenlos registrieren</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth">Zum Firmen-Login</Link>
            </Button>
          </div>
          <ul className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            {trustPoints.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <h2 className="text-2xl font-bold md:text-3xl">Funktionen im Überblick</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Alles, was ein Reinigungsbetrieb im Tagesgeschäft braucht – in einer Oberfläche.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="surface p-6">
                <f.icon className="size-6 text-primary" />
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y bg-secondary/40 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-2xl font-bold md:text-3xl">Abonnenten & Partnerfirmen</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Reinigungs- und Facility-Betriebe, die mit GebCalc abrechnen, planen und kalkulieren.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {partners.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-4 text-sm font-semibold"
                >
                  <Building2 className="size-5 shrink-0 text-primary" />
                  <span className="flex flex-col leading-tight">
                    <span>{p.name}</span>
                    {p.city ? (
                      <span className="text-xs font-normal text-muted-foreground">{p.city}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="preise" className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-bold md:text-3xl">Pakete & Preise</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Transparente Preise – monatlich oder jährlich abrechenbar. Alle Preise zzgl.
            gesetzlicher Umsatzsteuer.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activePlans.map((plan) => (
              <div key={plan.id} className="surface flex flex-col p-6">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                <p className="mt-4 text-3xl font-bold">
                  {euro(plan.price_monthly_cents)}
                  <span className="text-sm font-normal text-muted-foreground"> / Monat</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  oder {euro(plan.price_yearly_cents)} / Jahr
                  {plan.code === "pro" ? " · ab dem 21. Mitarbeitenden +2,50 € / Monat" : ""}
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button className="mt-6" onClick={() => setOrderPlan(plan)}>
                  Paket wählen
                </Button>
              </div>
            ))}
            {activePlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Die Preisübersicht wird gerade aktualisiert.
              </p>
            ) : null}
          </div>
          <FeatureVergleich plans={activePlans} />
        </section>

        <TestimonialCarousel />

        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface p-6">
              <Lock className="size-6 text-primary" />
              <h2 className="mt-4 text-xl font-bold">Getrennte Firmenbereiche</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Diese Seite ist die öffentliche Website. Nach dem Login arbeitet jede Firma in ihrer
                eigenen, geschützten GebCalc-Umgebung: Rechnungen, Kunden, Projekte und Zeiten sind
                pro Konto vollständig isoliert – technisch abgesichert über Zugriffsregeln direkt in
                der Datenbank.
              </p>
              <Button asChild className="mt-6">
                <Link to="/auth">Zur Web-App anmelden</Link>
              </Button>
            </div>

            <div id="kontakt" className="surface p-6">
              <Mail className="size-6 text-primary" />
              <h2 className="mt-4 text-xl font-bold">Kontakt</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Fragen zu Funktionen, Einrichtung oder Datenübernahme? Wir melden uns werktags
                innerhalb von 24 Stunden.
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <Mail className="size-4 text-primary" />
                  <a className="hover:underline" href="mailto:info@top4reinigung.de">
                    info@top4reinigung.de
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="size-4 text-primary" />
                  <a className="hover:underline" href="tel:+4968989999999">
                    +49 6898 9999999
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  <span>66333 Völklingen, Deutschland</span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Vollständige Angaben finden Sie im{" "}
                <Link to="/rechtliches/impressum" className="underline">
                  Impressum
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </main>

      <PlanOrderDialog plan={orderPlan} onOpenChange={(o) => !o && setOrderPlan(null)} />

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 text-sm text-muted-foreground">
          <span>GebCalc – Rechnungssystem · Völklingen · USt-IdNr. DE458492078</span>
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
            <Link to="/rechtliches/avv" className="hover:text-foreground hover:underline">
              AVV
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
