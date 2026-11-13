import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SpeechToTextButton } from "@/components/SpeechToTextButton";
import { useKalkulationState } from "./useKalkulationState";
import { CalculationTransfer } from "./CalculationTransfer";
import { ApplyCalculationDialog } from "./ApplyCalculationDialog";
import { SuggestedPositions } from "./SuggestedPositions";

export function SimpleAiCalculation() {
  const state = useKalkulationState("ki");
  return (
    <section aria-label="KI-Analyse" className="mx-auto w-full max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">KI-Analyse</h1>
      <p className="text-sm text-muted-foreground">Beschreiben Sie den Auftrag. Der Assistent berechnet Zeit und Preis und fragt nach, wenn etwas fehlt.</p>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <label htmlFor="ai-order" className="text-sm font-medium">Was soll gereinigt werden?</label>
        <div className="flex items-start gap-2">
          <Textarea id="ai-order" rows={5} className="min-w-0 flex-1" value={state.aiPrompt} onChange={(e) => state.setAiPrompt(e.target.value)} placeholder="Auftrag, Fläche oder Etagen und Häufigkeit beschreiben. Einen vereinbarten Preis können Sie direkt dazuschreiben." />
          <SpeechToTextButton value={state.aiPrompt} onChange={state.setAiPrompt} label="Auftragsbeschreibung diktieren" />
        </div>
        <Button type="button" disabled={state.aiSuggest.isPending || state.aiPrompt.trim().length < 5} onClick={() => state.aiSuggest.mutate(undefined)}>
          <Sparkles className="size-4" />{state.aiSuggest.isPending ? "Wird analysiert…" : "Auftrag analysieren"}
        </Button>
      </div>
      {state.aiReviewQuestions.length > 0 && <div role="alert" className="space-y-2 rounded-xl border p-4 text-sm">
        <p className="font-medium">Bitte oben ergänzen und erneut analysieren:</p>
        <ul className="list-disc pl-5">{state.aiReviewQuestions.map((question) => <li key={question}>{question.replace("Bitte oben eingeben oder im Auftragstext nennen.", "Bitte im Auftragstext nennen.")}</li>)}</ul>
      </div>}
      {state.kiItems.length > 0 && <>
        <CalculationTransfer state={state} workflow="ki" />
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">Berechnung und Positionen prüfen</summary>
          <div className="mt-4 space-y-3">
            {state.aiReviewNotes.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-foreground">{state.aiReviewNotes.map((note) => <li key={note}>{note}</li>)}</ul>}
            <SuggestedPositions state={state} direct />
          </div>
        </details>
      </>}
      <ApplyCalculationDialog state={state} />
    </section>
  );
}
