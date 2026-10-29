import { useState } from "react";
import { CalculationTransfer } from "@/components/kalkulation/CalculationTransfer";
import { CleaningParameters } from "@/components/kalkulation/CleaningParameters";
import { CALCULATION_WORKFLOWS, WORKFLOW_LABELS, type CalculationWorkflow } from "@/lib/calculation-transfer";

import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KalkulationSearch } from "@/components/kalkulation/shared";
import { useKalkulationState } from "@/components/kalkulation/useKalkulationState";
import { ApplyCalculationDialog } from "@/components/kalkulation/ApplyCalculationDialog";
import { FloorplanSection } from "@/components/kalkulation/FloorplanSection";
import { CalculationAnalysis } from "@/components/kalkulation/CalculationAnalysis";
import { TenderPricing } from "@/components/kalkulation/TenderPricing";
import { CalculationBasis } from "@/components/kalkulation/CalculationBasis";
import { DiscountPanel } from "@/components/kalkulation/DiscountPanel";
import { TaxModePanel } from "@/components/kalkulation/TaxModePanel";

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
  const [active, setActive] = useState<CalculationWorkflow>("schnell");
  const [visited, setVisited] = useState<CalculationWorkflow[]>(["schnell"]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Kalkulation</h1>
        <p className="text-sm text-muted-foreground">
          Aufträge unabhängig berechnen, Positionen prüfen und direkt als Angebot übernehmen.
          Ausschreibungsunterlagen und deren Analyse bleiben im getrennten Bereich „LV-Analyse“.
        </p>
      </div>
      <Tabs value={active} onValueChange={(value) => {
        const next = value as CalculationWorkflow;
        setActive(next);
        setVisited((current) => current.includes(next) ? current : [...current, next]);
      }} className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-3">
          {CALCULATION_WORKFLOWS.map((workflow) => (
            <TabsTrigger key={workflow} className="h-auto min-h-11 whitespace-normal text-center" value={workflow}>
              {WORKFLOW_LABELS[workflow]}
            </TabsTrigger>
          ))}
        </TabsList>
        {visited.map((workflow) => (
          <TabsContent key={workflow} value={workflow} forceMount className="space-y-6 data-[state=inactive]:hidden">
            <CalculationWorkflowPanel workflow={workflow} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CalculationWorkflowPanel({ workflow }: { workflow: CalculationWorkflow }) {
  const state = useKalkulationState(workflow);
  const [showAnalytics, setShowAnalytics] = useState(false);
  return (
    <>
      <CalculationBasis state={state} />
      {workflow === "schnell" && <>
        <CleaningParameters state={state} attachments={false} />
        <TenderPricing state={state} showLvTotals={false} />
      </>}
      {workflow === "raum" && <FloorplanSection state={state} mode="room" />}
      {workflow === "ki" && <FloorplanSection state={state} mode="ki" />}
      {workflow === "raum" && <DiscountPanel state={state} />}
      {(workflow === "raum" || workflow === "ki") && <TaxModePanel state={state} />}
      <CalculationTransfer state={state} workflow={workflow} />
      <div className="rounded-lg border p-3">
        <button type="button" className="text-sm font-medium text-primary" aria-expanded={showAnalytics} onClick={() => setShowAnalytics((value) => !value)}>
          {showAnalytics ? "Analyse & Kennzahlen schließen" : "Analyse & Kennzahlen anzeigen"}
        </button>
        {showAnalytics && <div className="pt-4"><CalculationAnalysis state={state} /></div>}
      </div>
      <ApplyCalculationDialog state={state} />
    </>
  );
}
