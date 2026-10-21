import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KalkulationSearch } from "@/components/kalkulation/shared";
import { useKalkulationState } from "@/components/kalkulation/useKalkulationState";
import { ApplyCalculationDialog } from "@/components/kalkulation/ApplyCalculationDialog";
import { TenderPricing } from "@/components/kalkulation/TenderPricing";
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
          Drei klare Wege: schnell kalkulieren, Räume planen oder LV für Ausschreibungen bearbeiten.
        </p>
      </div>

      <Tabs defaultValue="schnell" className="space-y-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="schnell">1. Schnellkalkulation</TabsTrigger>
          <TabsTrigger value="grundriss">2. Räume & Flächen</TabsTrigger>
          <TabsTrigger value="ausschreibung">3. LV / Ausschreibungen</TabsTrigger>
        </TabsList>

        <CalculationBasis state={state} />

        <TabsContent value="schnell" className="space-y-4">
          <TenderPricing state={state} />
        </TabsContent>

        <FloorplanSection state={state} />

        <TenderSection state={state} />
      </Tabs>

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium">Analyse & Kennzahlen (optional)</summary>
        <CalculationAnalysis state={state} />
      </details>

      <ApplyCalculationDialog state={state} />
    </div>
  );
}
