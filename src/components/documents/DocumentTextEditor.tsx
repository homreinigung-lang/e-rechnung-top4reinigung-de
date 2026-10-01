import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DocumentTextEditorProps = {
  isQuote: boolean;
  isInvoice: boolean;
  isPrivat: boolean;
  companyName: string;
  introText: string;
  notes: string;
  serviceDescription: string;
  defaultQuoteIntro: (isPrivat: boolean, companyName: string) => string;
  onIntroChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onServiceDescriptionChange: (value: string) => void;
};

export function DocumentTextEditor({
  isQuote,
  isInvoice,
  isPrivat,
  companyName,
  introText,
  notes,
  serviceDescription,
  defaultQuoteIntro,
  onIntroChange,
  onNotesChange,
  onServiceDescriptionChange,
}: DocumentTextEditorProps) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="intro">Einleitungstext</Label>
            {isQuote && (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onIntroChange(defaultQuoteIntro(isPrivat, companyName))}>
                Standardtext einsetzen
              </Button>
            )}
          </div>
          <Textarea id="intro" rows={isQuote ? 8 : 3} value={introText} onChange={(event) => onIntroChange(event.target.value)} placeholder="Für die erbrachten Reinigungsleistungen berechnen wir Ihnen wie folgt:" />
          {isQuote && (
            <p className="text-xs text-muted-foreground">
              Frei bearbeitbar – gilt nur für dieses Angebot. Bleibt das Feld leer, wird beim
              PDF-Export automatisch der Standardtext verwendet.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Schlussbemerkung</Label>
          <Textarea id="notes" value={notes} onChange={(event) => onNotesChange(event.target.value)} />
        </div>
      </div>

      {!isInvoice && (
        <div className="space-y-2">
          <Label htmlFor="service_description">Detaillierte Leistungsbeschreibung (optional)</Label>
          <Textarea
            id="service_description"
            rows={8}
            value={serviceDescription}
            onChange={(event) => onServiceDescriptionChange(event.target.value)}
            placeholder={
              "Beschreiben Sie hier ausführlich, welche Reinigungsleistungen enthalten sind, z. B.:\n" +
              "- Unterhaltsreinigung Büroflächen (Staubwischen, Böden, Papierkörbe)\n" +
              "- Sanitärreinigung inkl. Desinfektion und Auffüllen der Verbrauchsmaterialien\n" +
              "- Glasreinigung innen, monatlich\n" +
              "- Alle Reinigungsmittel und Geräte inklusive"
            }
          />
          <p className="text-xs text-muted-foreground">
            Erscheint übersichtlich im PDF-Angebot unter „Leistungsbeschreibung“. Jede Zeile wird
            als eigener Punkt dargestellt (Zeilen mit „-“ oder „•“ werden als Liste formatiert).
          </p>
        </div>
      )}
    </>
  );
}
