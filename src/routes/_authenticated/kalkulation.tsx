import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KalkulationSearch } from "@/components/kalkulation/shared";
import { useKalkulationState } from "@/components/kalkulation/useKalkulationState";
import { ApplyCalculationDialog } from "@/components/kalkulation/ApplyCalculationDialog";
import { TenderSection } from "@/components/kalkulation/TenderSection";
import { FloorplanSection } from "@/components/kalkulation/FloorplanSection";
import { CalculationAnalysis } from "@/components/kalkulation/CalculationAnalysis";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Kalkulation</h1>
        <p className="text-sm text-muted-foreground">
          Zentraler Bereich für Analyse, Grundriss-Kalkulation und Ausschreibungen. Alles bleibt
          manuell änderbar und geht mit einem Klick ins Angebot.
        </p>
      </div>

      <Tabs defaultValue="grundriss" className="space-y-6">
        <TabsList>
          <TabsTrigger value="analyse">Analyse & Kennzahlen</TabsTrigger>
          <TabsTrigger value="grundriss">Grundriss (Planung)</TabsTrigger>
          <TabsTrigger value="ausschreibung">Ausschreibung (Angebot & Vergabe)</TabsTrigger>
        </TabsList>

        <CalculationBasis state={state} />

        <CalculationAnalysis state={state} />

        <FloorplanSection state={state} />

        <TenderSection state={state} />
      </Tabs>

      <ApplyCalculationDialog state={state} />
    </div>
  );
}
