import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KalkulationSearch } from "@/components/kalkulation/shared";
import { useKalkulationState } from "@/components/kalkulation/useKalkulationState";
import { ApplyCalculationDialog } from "@/components/kalkulation/ApplyCalculationDialog";
import { TenderSection } from "@/components/kalkulation/TenderSection";
import { FloorplanSection } from "@/components/kalkulation/FloorplanSection";
import { CalculationAnalysis } from "@/components/kalkulation/CalculationAnalysis";
import { TenderPricing } from "@/components/kalkulation/TenderPricing";
import { CalculationBasis } from "@/components/kalkulation/CalculationBasis";

export const Route = createFileRoute("/_authenticated/kalkulation")({
  validateSearch: (search: Record<string, unknown>): KalkulationSearch => {
    const area = Number(search["area"]);
    return {
      ...(Number.isFinite(area) && area > 0 ? { area } : {}),
      ...(search["objekt"] ? { objekt: String(search["objekt"]) } : {}),
      ...(search["belag"] ? { belag: String(search["belag"]) } : {}),
      ...(search["projekt"] ? { projekt: String(search["projekt"]) } : {}),
    };
  },

  head: () => ({
    meta: [
      { title: "Kalkulation – Reinigungspreise berechnen" },
      {
        name: "description",
        content:
          "Reinigungsaufträge nach Fläche, Stundensatz und Zusatzleistungen kalkulieren, Endpreis anpassen und direkt in ein Angebot übernehmen.",
      },
      { property: "og:title", content: "Kalkulation – Reinigungspreise berechnen" },
      {
        property: "og:description",
        content: "Preise für Reinigungsaufträge kalkulieren und als Angebot übernehmen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KalkulationPage,
});

function KalkulationPage() {
  const state = useKalkulationState();
  const [showAnalytics, setShowAnalytics] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Kalkulation</h1>
        <p className="text-sm text-muted-foreground">
          Vier Arbeitswege für schnelle Preise, Räume, KI-Vorschläge und Ausschreibungen. Alle Preise basieren auf den hinterlegten Kalkulationsgrundlagen.
        </p>
      </div>

      <Tabs defaultValue="schnell" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
          <TabsTrigger className="h-auto min-h-11 whitespace-normal text-center" value="schnell">Schnellkalkulation</TabsTrigger>
          <TabsTrigger className="h-auto min-h-11 whitespace-normal text-center" value="raum">Raumkalkulation</TabsTrigger>
          <TabsTrigger className="h-auto min-h-11 whitespace-normal text-center" value="ki">KI-Kalkulation</TabsTrigger>
          <TabsTrigger className="h-auto min-h-11 whitespace-normal text-center" value="ausschreibung">LV / Ausschreibungen</TabsTrigger>
        </TabsList>

        <CalculationBasis state={state} />

        <TabsContent value="schnell" className="space-y-4">
          <TenderPricing state={state} />
        </TabsContent>

        <FloorplanSection state={state} mode="room" />
        <FloorplanSection state={state} mode="ki" />

        <TenderSection state={state} />

        <div className="rounded-lg border p-3">
          <button type="button" className="text-sm font-medium text-primary" aria-expanded={showAnalytics} onClick={() => setShowAnalytics((value) => !value)}>
            {showAnalytics ? "Analyse & Kennzahlen schließen" : "Analyse & Kennzahlen anzeigen"}
          </button>
          {showAnalytics && <div className="pt-4"><CalculationAnalysis state={state} /></div>}
        </div>
      </Tabs>

      <ApplyCalculationDialog state={state} />
    </div>
  );
}
