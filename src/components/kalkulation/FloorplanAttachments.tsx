import { RoomCalculationEditor } from "./RoomCalculationEditor";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { toast } from "sonner";
import { FileText, Sparkles, Trash2 } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { fileUrl, openStoredFile } from "@/lib/storage";
import { FileUploadButton } from "@/components/FileUploadButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

export function FloorplanAttachments({ state }: { state: KalkulationStateContext }) {
  const {
    analysisTotals,
    attachments,
    scanFile,
    scanningPath,
    setArea,
    setAttachments,
    setFloors,
    setMode,
    setNote,
    setStairs,
    updateAttachment,
  } = state;
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <Label>Grundrisse & Fotos</Label>
        <p className="text-xs text-muted-foreground">
          PDF-Grundrisse oder Fotos hochladen und analysieren. Erkannte Räume unten prüfen,
          Leistungswerte und Reinigungsrhythmus festlegen und die Raumstunden übernehmen.
        </p>
      </div>
      <FileUploadButton
        folder="kalkulation"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        label="Datei oder Foto hochladen"
        onUploaded={(path, file) => {
          void (async () => {
            const url = await fileUrl(path);
            const attachment = {
              path,
              name: file.name,
              url,
              isImage: file.type.startsWith("image/"),
              sqm: "",
              rooms: "",
              floors: "",
              note: "",
            };
            setAttachments((prev) => [...prev, attachment]);
            scanFile.mutate(attachment);
          })();
        }}
      />

      {attachments.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {attachments.map((a) => (
              <div key={a.path} className="space-y-2 rounded-md border p-2">
                {a.isImage && a.url ? (
                  <button
                    type="button"
                    onClick={() =>
                      void openStoredFile(a.path, a.name).catch(() =>
                        toast.error("Datei konnte nicht geöffnet werden."),
                      )
                    }
                  >
                    <img
                      src={a.url}
                      alt={`Vorschau ${a.name}`}
                      className="h-32 w-full rounded object-cover"
                      loading="lazy"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void openStoredFile(a.path, a.name).catch(() =>
                        toast.error("Datei konnte nicht geöffnet werden."),
                      )
                    }
                    className="flex h-32 w-full items-center justify-center rounded bg-muted"
                  >
                    <FileText className="size-8 text-muted-foreground" />
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-xs">{a.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setAttachments((prev) => prev.filter((x) => x.path !== a.path));
                      state.setRoomCalculation((current) => ({
                        ...current,
                        rooms: current.rooms.filter((room) => room.source !== a.path),
                      }));
                    }}
                    aria-label="Entfernen"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">m²</Label>
                    <Input
                      inputMode="decimal"
                      value={a.sqm}
                      onChange={(e) => updateAttachment(a.path, { sqm: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Räume</Label>
                    <Input
                      inputMode="decimal"
                      value={a.rooms}
                      onChange={(e) => updateAttachment(a.path, { rooms: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Etagen</Label>
                    <Input
                      inputMode="decimal"
                      value={a.floors}
                      onChange={(e) => updateAttachment(a.path, { floors: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Beschreibung & Reinigungsanforderungen</Label>
                  <Textarea
                    rows={3}
                    value={a.note}
                    onChange={(e) => updateAttachment(a.path, { note: e.target.value })}
                    placeholder="z. B. Bodenbelag Linoleum, 4 Sanitärräume, Glasfassade EG, Zutritt nur werktags 6–8 Uhr"
                  />
                </div>

                {scanningPath === a.path && <AnalysisProgress />}
                {a.analysisStatus === "completed" && (
                  <div className="rounded-md border border-emerald-500/50 bg-emerald-50 p-2 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">
                    <p className="font-medium">Analyseergebnis</p>
                    <p>
                      {formatNumber(a.analysisRooms ?? 0)} Räume ·{" "}
                      {formatNumber(a.analysisItems ?? 0)} Vorschlagspositionen
                    </p>
                    {a.analysisSummary && (
                      <p className="mt-1 text-xs opacity-80">{a.analysisSummary}</p>
                    )}
                    {(a.analysisRooms ?? 0) === 0 && (
                      <p className="mt-1 text-xs">
                        Keine Räume erkannt. Bitte Datei prüfen oder die Raumdaten manuell ergänzen.
                      </p>
                    )}
                  </div>
                )}
                {a.analysisStatus === "error" && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/50 p-2 text-sm text-destructive"
                  >
                    <p className="font-medium">Analyse fehlgeschlagen</p>
                    <p className="text-xs">{a.analysisError || "Bitte Analyse erneut starten."}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={scanningPath === a.path || scanFile.isPending}
                    onClick={() => scanFile.mutate(a)}
                  >
                    <Sparkles className="size-4" />
                    {scanningPath === a.path ? "Wird analysiert …" : "Datei analysieren"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={num(a.sqm) <= 0}
                    onClick={() => {
                      state.setRoomCalculation((current) => ({ ...current, enabled: false }));
                      setMode("area");
                      setArea(a.sqm);
                      toast.success("Fläche in die Kalkulation übernommen");
                    }}
                  >
                    m² übernehmen
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={num(a.floors) <= 0}
                    onClick={() => {
                      setStairs(true);
                      setFloors(a.floors);
                      toast.success("Etagen in die Treppenhausreinigung übernommen");
                    }}
                  >
                    Etagen übernehmen
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const line = [
                        a.name,
                        num(a.sqm) > 0 ? `${formatNumber(num(a.sqm))} m²` : "",
                        num(a.rooms) > 0 ? `${formatNumber(num(a.rooms))} Räume` : "",
                        num(a.floors) > 0 ? `${formatNumber(num(a.floors))} Etagen` : "",
                        a.note.trim(),
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      setNote((prev) => (prev.trim() ? `${prev}\n${line}` : line));
                      toast.success("Als Notiz übernommen");
                    }}
                  >
                    Als Notiz übernehmen
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="mb-1 font-medium">Übersicht aus Unterlagen</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
              <span>Gesamtfläche: {formatNumber(analysisTotals.sqm)} m²</span>
              <span>Räume: {formatNumber(analysisTotals.rooms)}</span>
              <span>Etagen: {formatNumber(analysisTotals.floors)}</span>
            </div>
            {analysisTotals.sqm > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  state.setRoomCalculation((current) => ({ ...current, enabled: false }));
                  setMode("area");
                  setArea(String(analysisTotals.sqm));
                  toast.success("Gesamtfläche übernommen");
                }}
              >
                Gesamtfläche in Kalkulation übernehmen
              </Button>
            )}
          </div>
        </>
      )}
      <RoomCalculationEditor state={state} />
    </div>
  );
}

