import { AlertTriangle, Sparkles } from "lucide-react";
import { SpeechToTextButton } from "@/components/SpeechToTextButton";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionIntro } from "./SectionIntro";
import type { KalkulationStateContext } from "./useKalkulationState";
import { CleaningParameters } from "./CleaningParameters";
import { SuggestedPositions } from "./SuggestedPositions";

export function FloorplanSection({ state }: { state: KalkulationStateContext }) {
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
    <TabsContent value="grundriss" className="space-y-6">
      <SectionIntro
        title="Grundriss (Planung)"
        text="Grundlage der Kalkulation: Grundrisse und Objektfotos hochladen, Flächen, Räume und Etagen dokumentieren und den Reinigungsaufwand berechnen. Die hier ermittelten Werte fließen automatisch in die Ausschreibung und in die Kennzahlen."
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5" /> KI-Assistent
          </CardTitle>
          <CardDescription>
            Auftrag kurz beschreiben – Reinigungstyp, Fläche, Turnus, Etagen und die
            Leistungspositionen werden automatisch übernommen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <Textarea
              rows={3}
              className="flex-1"
              placeholder="z. B. Bürogebäude 450 m², 3 Etagen, 2× wöchentlich Unterhaltsreinigung, Sanitär täglich, Fensterreinigung 2× jährlich"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <SpeechToTextButton
              value={aiPrompt}
              onChange={setAiPrompt}
              label="Auftragsbeschreibung diktieren"
            />
          </div>
          <Button
            type="button"
            disabled={aiSuggest.isPending || aiPrompt.trim().length < 5}
            onClick={() => aiSuggest.mutate()}
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

      {/* --- Bereich A: KI-Analyse (eigene Positionen, eigener Übernahme-Button) --- */}
      <SuggestedPositions state={state} />

      <CleaningParameters state={state} />
    </TabsContent>
  );
}
