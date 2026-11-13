import { CalculationExamples } from "./CalculationExamples";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Sparkles } from "lucide-react";
import { SpeechToTextButton } from "@/components/SpeechToTextButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionIntro } from "./SectionIntro";
import type { KalkulationStateContext } from "./useKalkulationState";
import { CleaningParameters } from "./CleaningParameters";
import { SuggestedPositions } from "./SuggestedPositions";
import { KiTrainingPanel } from "./KiTrainingPanel";

export function FloorplanSection({ state, mode }: { state: KalkulationStateContext; mode: "room" | "ki" }) {
  const {
    aiPrompt,
    aiReviewNotes,
    aiReviewQuestions,
    aiSuggest,
    floorplanSummary,
    priceHints,
    setAiPrompt,
    setFloorplanSummary,
    warnings,
  } = state;
  return (
    <div className="space-y-6">
      <SectionIntro
        title={mode === "room" ? "Raumkalkulation" : "KI-Kalkulation"}
        text={mode === "room" ? "Räume, Flächen und Leistungswerte erfassen und prüfen." : "KI analysiert den Auftrag; Preise stammen aus den hinterlegten Kalkulationsgrundlagen und bleiben vor der Übernahme prüfbar."}
      />

      {warnings.length > 0 && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-amber-500/60 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Angaben bitte prüfen</p>
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        </div>
      )}

      {priceHints.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-sky-500/60 bg-sky-50 p-4 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Preisniveau prüfen</p>
            {priceHints.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        </div>
      )}

      {mode === "room" && (
      <Card>
        <CardHeader>
          <CardTitle>Objektbeschreibung</CardTitle>
          <CardDescription>
            Bauliche Besonderheiten und Reinigungsanforderungen zum Objekt – ergänzend zu den
            Notizen an den einzelnen Grundrissen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2">
            <Textarea
              rows={4}
              className="flex-1"
              value={floorplanSummary}
              onChange={(e) => setFloorplanSummary(e.target.value)}
              placeholder="z. B. 3 Etagen ohne Aufzug, Treppenhaus mit Naturstein, Großraumbüros mit Teppich, Serverraum von der Reinigung ausgenommen"
            />
            <SpeechToTextButton
              value={floorplanSummary}
              onChange={setFloorplanSummary}
              label="Objektbeschreibung diktieren"
            />
          </div>
        </CardContent>
      </Card>

      )}

      {mode === "ki" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5" /> KI-Assistent
          </CardTitle>
          <CardDescription>
            Auftrag beschreiben oder Beispiel wählen. Fehlende Angaben ergänzen; Zeit und Preis werden vor der Übernahme angezeigt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CalculationExamples disabled={aiSuggest.isPending} onSelect={setAiPrompt} />
          <Label htmlFor="ki-job-description">Was soll gereinigt werden?</Label>
          <div className="flex items-start gap-2">
            <Textarea
              id="ki-job-description"
              rows={3}
              className="flex-1"
              placeholder="z. B. Büroreinigung 150 m² plus Teeküche 20 m² und WC 12 m², einmal pro Woche"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <SpeechToTextButton
              value={aiPrompt}
              onChange={setAiPrompt}
              label="Auftragsbeschreibung diktieren"
            />
          </div>
          <div className="max-w-sm space-y-1">
            <Label htmlFor="job-selling-hourly-rate">Verkaufspreis für diesen Auftrag (€ / Std. netto)</Label>
            <Input id="job-selling-hourly-rate" inputMode="decimal" value={state.hourlyRate ?? ""} onChange={(event) => state.setHourlyRate(event.target.value)} placeholder="Automatisch aus Firmendaten" />
            <p className="text-xs text-muted-foreground">Optional: überschreibt den aus gespeicherten Firmenkosten und Gewinnaufschlag berechneten Preis. Ein Preis im Auftragstext hat Vorrang.</p>
          </div>
          <Button
            type="button"
            disabled={aiSuggest.isPending || aiPrompt.trim().length < 5}
            onClick={() => aiSuggest.mutate(undefined)}
          >
            <Sparkles className="size-4" />
            {aiSuggest.isPending ? "Wird kalkuliert…" : "Kalkulation erstellen"}
          </Button>
          {aiReviewQuestions.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <p className="font-medium">
                Bitte Angaben ergänzen und die Kalkulation erneut erstellen:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {aiReviewQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}
          {aiReviewNotes.length > 0 && (
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              <p className="font-medium">Vor dem Angebot prüfen:</p>
              <ul className="mt-1 list-disc pl-5">
                {aiReviewNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      )}

      {mode === "ki" && <SuggestedPositions state={state} direct />}
      {mode === "ki" && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Erfahrungswerte speichern (optional)
          </summary>
          <div className="mt-4">
            <KiTrainingPanel state={state} />
          </div>
        </details>
      )}
      {mode === "room" && <CleaningParameters state={state} />}
    </div>
  );
}
