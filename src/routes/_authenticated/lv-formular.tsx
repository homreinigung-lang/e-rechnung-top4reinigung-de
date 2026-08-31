import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const LvFormFiller = lazy(() => import("@/components/lv-form/LvFormFiller"));

export const Route = createFileRoute("/_authenticated/lv-formular")({
  head: () => ({
    meta: [
      { title: "LV-Formular ausfüllen – GebCalc" },
      {
        name: "description",
        content:
          "Leistungsverzeichnisse aus Ausschreibungen als PDF hochladen, Preise und Stunden prüfen und ein ausgefülltes PDF erzeugen – mit Mindeststunden-Kontrolle.",
      },
      { property: "og:title", content: "LV-Formular ausfüllen – GebCalc" },
      {
        property: "og:description",
        content:
          "Ausschreibungs-Leistungsverzeichnisse geprüft ausfüllen: Vorschau, Korrektur und Plausibilitätsprüfung vor dem Export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LvFormularPage,
});

function LvFormularPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">LV-Formular ausfüllen</h1>
        <p className="text-sm text-muted-foreground">
          Für Ausschreibungen: Original-PDF hochladen, vorgeschlagene Positionen prüfen und erst
          nach Freigabe eine ausgefüllte Kopie erzeugen. Kalkulation und Angebote bleiben
          unverändert.
        </p>
      </header>
      <ClientOnly fallback={<Loader2 className="size-5 animate-spin text-muted-foreground" />}>
        <Suspense fallback={<Loader2 className="size-5 animate-spin text-muted-foreground" />}>
          <LvFormFiller />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
