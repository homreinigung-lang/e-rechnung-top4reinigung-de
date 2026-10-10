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
        text="Hier entsteht das offizielle Angebot: Ausschreibungstext verfassen, Vergabeunterlagen (z. B. Vergabe Saarland) hinterlegen, Leistungspositionen kalkulieren und den geprüften Preis direkt als Angebot übernehmen. Flächen und Stunden stammen aus dem Grundriss-Tab."
      />

      <TenderDescription state={state} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <TenderPositions state={state} />

        <TenderPricing state={state} />
      </div>
    </TabsContent>
  );
}
