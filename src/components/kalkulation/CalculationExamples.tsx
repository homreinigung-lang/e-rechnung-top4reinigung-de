import { CALCULATION_EXAMPLES } from "@/lib/calculation-examples";
import { Button } from "@/components/ui/button";

export function CalculationExamples({ disabled = false, onSelect }: { disabled?: boolean; onSelect: (prompt: string) => void }) {
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Beispiele für Ihren Auftrag</summary>
      <p className="mt-2 text-xs text-muted-foreground">Ein Beispiel ersetzt die Beschreibung. Fläche und Turnus anpassen; den Verkaufspreis legen Sie selbst fest.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {CALCULATION_EXAMPLES.map(example => (
          <Button key={example.label} type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onSelect(example.prompt)}>{example.label}</Button>
        ))}
      </div>
    </details>
  );
}
