import { Suspense } from "react";
import { ProjektAnalyse } from "@/components/ProjektAnalyse";
import { ProjektKennzahlen } from "@/components/ProjektKennzahlen";
import { KalkulationAnalytics } from "./CalculationAnalyticsPanel";
import { SectionIntro } from "./SectionIntro";
import type { KalkulationStateContext } from "./useKalkulationState";

export function CalculationAnalysis({ state }: { state: KalkulationStateContext }) {
  const { analyseSnapshot, projectId, setProjectId } = state;
  return (
    <div className="mt-4 space-y-6">
      <SectionIntro
        title="Analyse & Kennzahlen"
        text="Zentrale Auswertung aller Projekte: Wirtschaftlichkeit, Umsatzentwicklung, Personalkosten und Effizienz von Soll- zu Ist-Stunden. Die Werte entstehen live aus Grundriss-Kalkulation, Einsatzplanung und erfassten Arbeitszeiten."
      />
      <ProjektAnalyse
        projectId={projectId}
        onProjectChange={setProjectId}
        snapshot={analyseSnapshot}
      />
      <ProjektKennzahlen projectId={projectId} />
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Auswertung wird geladen…
          </p>
        }
      >
        <KalkulationAnalytics activeProjectId={projectId} />
      </Suspense>
    </div>
  );
}
