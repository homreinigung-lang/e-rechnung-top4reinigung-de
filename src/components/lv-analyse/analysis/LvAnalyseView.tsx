import { LvAnalyseAAnforderungenAusDerAusschreibung } from "./LvAnalyseAAnforderungenAusDerAusschreibung";
import { LvAnalyseSection1 } from "./LvAnalyseSection1";
import type { LvAnalyseState } from "./useLvAnalyseState";
export function LvAnalyseView({ state }: { state: LvAnalyseState }) {
  return (
    <div className="space-y-6">
      {/* Upload */}
      <LvAnalyseSection1 state={state} />

      {/* Auswertung */}
      <LvAnalyseAAnforderungenAusDerAusschreibung state={state} />
    </div>
  );
}
