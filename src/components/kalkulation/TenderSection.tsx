import { SectionIntro } from "./SectionIntro";
import type { KalkulationStateContext } from "./useKalkulationState";
import { TenderPricing } from "./TenderPricing";
import { TenderPositions } from "./TenderPositions";
import { TenderDescription } from "./TenderDescription";

export function TenderSection({ state }: { state: KalkulationStateContext }) {
  return (
    <div className="space-y-6">
      <SectionIntro
        title="Ausschreibung (Angebot & Vergabe)"
        text="Ausschreibungstext und Vergabeunterlagen hinterlegen, Leistungspositionen bearbeiten und den geprüften Preis als Angebot übernehmen. Dieser Bereich hat eine eigene Kalkulation."
      />

      <TenderDescription state={state} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <TenderPositions state={state} />

        <TenderPricing state={state} />
      </div>
    </div>
  );
}
