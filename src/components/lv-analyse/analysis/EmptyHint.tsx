import { type LvAnalysisResult } from "@/lib/lv-analyse/types";

export function EmptyHint({ result }: { result: LvAnalysisResult | null }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {result ? (
        <>
          <p className="font-medium text-foreground">{result.statusMessage}</p>
          <p className="mt-1">{result.recommendedAction}</p>
          {result.kind === "pricing_form" && (
            <p className="mt-1">Die erkannten Beträge stehen im Reiter „Kostenanalyse“.</p>
          )}
        </>
      ) : (
        <p>Noch keine Datei analysiert.</p>
      )}
    </div>
  );
}
