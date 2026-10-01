import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentTitleSelector } from "@/components/DocumentTitleSelector";

type DocumentTitleEditorProps = {
  isQuote: boolean;
  title: string;
  onChange: (value: string) => void;
};

export function DocumentTitleEditor({ isQuote, title, onChange }: DocumentTitleEditorProps) {
  if (isQuote) {
    return <DocumentTitleSelector title={title} onChange={onChange} />;
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="title">Titel (optional)</Label>
      <Input
        id="title"
        value={title}
        onChange={(event) => onChange(event.target.value)}
        placeholder="z. B. Grundreinigung – Komplett Haus"
      />
      <p className="text-xs text-muted-foreground">
        Eigene Hauptüberschrift des Belegs. Bleibt das Feld leer, wird die Überschrift wie bisher automatisch erzeugt.
      </p>
    </div>
  );
}
