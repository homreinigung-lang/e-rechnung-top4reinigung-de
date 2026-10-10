import { toast } from "sonner";
import { FileSignature, FileText, Sparkles, Trash2 } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { fileUrl, openStoredFile } from "@/lib/storage";
import { FileUploadButton } from "@/components/FileUploadButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

export function TenderDescription({ state }: { state: KalkulationStateContext }) {
  const {
    area,
    floorplanSummary,
    hours,
    mode,
    monthlyHours,
    proposalText,
    proposalTitle,
    scanFile,
    scanningPath,
    selected,
    setProposalText,
    setProposalTitle,
    setTenderDocs,
    tenderDocs,
    visitsPerMonth,
  } = state;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="size-5" /> Angebots- & Ausschreibungstext
        </CardTitle>
        <CardDescription>
          Offizieller Text für die Vergabestelle. Er wird beim Übernehmen als Einleitungstext in das
          Angebot geschrieben und bleibt dort änderbar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Bezeichnung der Ausschreibung / Vergabe</Label>
          <Input
            value={proposalTitle}
            onChange={(e) => setProposalTitle(e.target.value)}
            placeholder="z. B. Unterhaltsreinigung Verwaltungsgebäude – Vergabe Saarland, Los 2"
          />
        </div>
        <div className="space-y-2">
          <Label>Angebotstext</Label>
          <Textarea
            rows={7}
            value={proposalText}
            onChange={(e) => setProposalText(e.target.value)}
            placeholder="Leistungsumfang, Qualitätssicherung, Personaleinsatz, Nachweise, Referenzen …"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const line = [
                  selected.label,
                  mode === "area"
                    ? `Fläche ${formatNumber(num(area))} m²`
                    : `${formatNumber(num(hours))} Std. je Einsatz`,
                  `${formatNumber(visitsPerMonth)} Einsätze pro Monat`,
                  `kalkulierter Stundenbedarf ${formatNumber(monthlyHours)} Std./Monat`,
                ].join(" · ");
                setProposalText((prev) => (prev.trim() ? `${prev}\n${line}` : line));
                toast.success("Eckdaten in den Angebotstext übernommen");
              }}
            >
              Eckdaten aus Grundriss einfügen
            </Button>
            {floorplanSummary.trim() ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setProposalText((prev) =>
                    prev.trim() ? `${prev}\n${floorplanSummary.trim()}` : floorplanSummary.trim(),
                  );
                  toast.success("Objektbeschreibung übernommen");
                }}
              >
                Objektbeschreibung einfügen
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <div>
            <Label>Vergabeunterlagen</Label>
            <p className="text-xs text-muted-foreground">
              Ausschreibungsunterlagen (PDF, Leistungsverzeichnis, Formblätter) hochladen und mit
              dieser Kalkulation verknüpfen. Über „Datei analysieren“ werden Positionen automatisch
              vorgeschlagen.
            </p>
          </div>
          <FileUploadButton
            folder="ausschreibung"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            label="Vergabeunterlage hochladen"
            onUploaded={(path, file) => {
              void (async () => {
                const url = await fileUrl(path);
                setTenderDocs((prev) => [
                  ...prev,
                  {
                    path,
                    name: file.name,
                    url,
                    isImage: file.type.startsWith("image/"),
                    sqm: "",
                    rooms: "",
                    floors: "",
                    note: "",
                  },
                ]);
              })();
            }}
          />
          {tenderDocs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Noch keine Vergabeunterlagen hinterlegt.
            </p>
          ) : (
            <ul className="space-y-2">
              {tenderDocs.map((d) => (
                <li key={d.path} className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <button
                      type="button"
                      className="flex-1 truncate text-left text-sm underline-offset-2 hover:underline"
                      onClick={() =>
                        void openStoredFile(d.path, d.name).catch(() =>
                          toast.error("Datei konnte nicht geöffnet werden."),
                        )
                      }
                    >
                      {d.name}
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={scanningPath === d.path || scanFile.isPending}
                      onClick={() => scanFile.mutate(d)}
                    >
                      <Sparkles className="size-4" />
                      {scanningPath === d.path ? "Wird analysiert …" : "Datei analysieren"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Entfernen"
                      onClick={() => setTenderDocs((prev) => prev.filter((x) => x.path !== d.path))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    value={d.note}
                    onChange={(e) =>
                      setTenderDocs((prev) =>
                        prev.map((x) => (x.path === d.path ? { ...x, note: e.target.value } : x)),
                      )
                    }
                    placeholder="Notiz zur Unterlage (z. B. Los, Abgabefrist, Eignungsnachweise)"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
