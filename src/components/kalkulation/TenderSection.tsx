import { TabsContent } from "@/components/ui/tabs";
import { SectionIntro } from "./SectionIntro";
import type { KalkulationStateContext } from "./useKalkulationState";
import { TenderPricing } from "./TenderPricing";
import { TenderPositions } from "./TenderPositions";
import { TenderDescription } from "./TenderDescription";

export function TenderSection({ state }: { state: KalkulationStateContext }) {
  return (
    <TabsContent value="ausschreibung" className="space-y-6">
      <SectionIntro
        title="Ausschreibung (Angebot & Vergabe)"
        text="Für Vergaben: Ausschreibungsunterlagen, Leistungspositionen und LV separat bearbeiten. Die allgemeine Kundenkalkulation befindet sich unter Schnellkalkulation."
      />

      <TenderDescription state={state} />

      <TenderPositions state={state} />
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium">LV-Preis prüfen & Angebot erstellen</summary>
        <div className="mt-3"><TenderPricing state={state} /></div>
      </details>
    </TabsContent>
  );
}
