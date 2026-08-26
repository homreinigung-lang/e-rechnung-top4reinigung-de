import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, LifeBuoy, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hilfe")({
  head: () => ({
    meta: [
      { title: "Hilfe & Support – GebCalc" },
      {
        name: "description",
        content:
          "Antworten auf häufige Fragen zu Rechnungen, Angeboten, Zeiterfassung und Paketen sowie direkter Kontakt zum GebCalc-Support.",
      },
      { property: "og:title", content: "Hilfe & Support – GebCalc" },
      {
        property: "og:description",
        content: "Häufige Fragen und direkter Support-Kontakt für GebCalc.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HilfePage,
});

const faqs: readonly { q: string; a: string }[] = [
  {
    q: "Wie erstelle ich eine Rechnung oder ein Angebot?",
    a: "Unter „Rechnungen“ legen Sie ein neues Dokument an, wählen den Kunden, ergänzen Positionen und speichern. Aus einem Angebot lässt sich per Workflow eine Auftragsbestätigung und daraus eine Rechnung erzeugen.",
  },
  {
    q: "Warum kann ich Reverse-Charge nicht auswählen?",
    a: "Rechnungen ohne deutsche MwSt. für EU-Geschäftskunden sind ab dem Pro-Paket verfügbar. Ihr aktuelles Paket sehen Sie unter „Mein Paket“.",
  },
  {
    q: "Wie versende ich ein Dokument per E-Mail?",
    a: "Im Dokument auf „Per E-Mail senden“ klicken. Absendername und Antwortadresse werden automatisch aus Ihren Firmenstammdaten übernommen.",
  },
  {
    q: "Wo pflege ich meine Firmendaten, IBAN und Steuernummer?",
    a: "Unter „Einstellungen“. Diese Angaben erscheinen automatisch auf allen PDFs, im GiroCode und in der E-Rechnung.",
  },
  {
    q: "Kann ich gelöschte Daten wiederherstellen?",
    a: "Ja. Gelöschte Einträge liegen 30 Tage im „Papierkorb“ und können dort wiederhergestellt werden.",
  },
  {
    q: "Wie sicher sind meine Daten?",
    a: "Jede Firma sieht ausschließlich ihre eigenen Daten – technisch getrennt über Zugriffsregeln auf Datenbankebene. Zusätzlich können Sie unter „Sicherheit & Backup“ die Zwei-Faktor-Anmeldung aktivieren und Backups exportieren.",
  },
];

const SUPPORT_MAIL = "info@top4reinigung.de";

function HilfePage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Hilfe &amp; Support</h1>
        <p className="text-sm text-muted-foreground">
          Antworten auf häufige Fragen – und ein direkter Draht zu uns, wenn etwas unklar ist.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4 text-primary" /> Support kontaktieren
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Beschreiben Sie kurz Ihr Anliegen – wir melden uns werktags innerhalb von 24 Stunden.
            </p>
            <Button asChild size="sm">
              <a
                href={`mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent("Support-Anfrage GebCalc")}`}
              >
                E-Mail an den Support
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 text-primary" /> Paket &amp; Funktionen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Manche Funktionen sind an Ihr Paket gebunden. Aktuellen Umfang prüfen oder erweitern:
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/mein-paket">Mein Paket ansehen</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="size-4 text-primary" /> Häufige Fragen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((item, i) => (
              <AccordionItem key={item.q} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
