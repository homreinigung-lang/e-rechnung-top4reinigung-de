import { LvAnalyseErgebnisTabs } from "./LvAnalyseErgebnisTabs";
import { LvDokumentInfoCard } from "./LvDokumentInfoCard";
import type { LvAnalyseState } from "./useLvAnalyseState";
export function LvAnalyseView({ state }: { state: LvAnalyseState }) {
  return (
    <div className="space-y-6">
      {/* Upload */}
      <LvDokumentInfoCard state={state} />

      {/* Auswertung */}
      <LvAnalyseErgebnisTabs state={state} />
    </div>
  );
}
