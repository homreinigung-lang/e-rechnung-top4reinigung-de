import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const LvAnalyse = lazy(() => import("@/components/lv-analyse/LvAnalyse"));

export const Route = createFileRoute("/_authenticated/lv-analyse")({
  head: () => ({
    meta: [
      { title: "LV-Analyse für Ausschreibungen – HomR Office" },
      {
        name: "description",
        content:
          "Ausschreibungen als PDF, Excel, CSV oder GAEB hochladen: Dokumenttyp erkennen, Reinigungspositionen extrahieren, Flächen, Stunden und Kosten auswerten und eine Preisempfehlung erhalten.",
      },
      { property: "og:title", content: "LV-Analyse für Ausschreibungen – HomR Office" },
      {
        property: "og:description",
        content:
          "Automatische Auswertung von Reinigungs-Leistungsverzeichnissen mit OCR, Prüfung fehlender Daten und Import-Protokoll.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LvAnalysePage,
});

function LvAnalysePage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">LV-Analyse (Ausschreibungen)</h1>
        <p className="text-sm text-muted-foreground">
          Leistungsverzeichnis, Preisblatt oder Leistungsbeschreibung hochladen – das System erkennt
          den Dokumenttyp, extrahiert die Reinigungspositionen und zeigt Flächen, Stunden, Kosten
          sowie fehlende Angaben.
        </p>
        <p className="text-sm text-muted-foreground" dir="rtl">
          ارفع كراسة الشروط أو نموذج التسعير، وسيقوم النظام بتحديد نوع المستند واستخراج البنود
          وعرض المساحات والساعات والتكاليف والنواقص.
        </p>
      </header>
      <ClientOnly fallback={<Loader2 className="size-5 animate-spin text-muted-foreground" />}>
        <Suspense fallback={<Loader2 className="size-5 animate-spin text-muted-foreground" />}>
          <LvAnalyse />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
