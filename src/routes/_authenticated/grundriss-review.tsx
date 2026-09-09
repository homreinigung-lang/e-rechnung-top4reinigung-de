import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CheckCircle2, FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FileUploadButton } from "@/components/FileUploadButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { analyzeProject, type ScannedRoom } from "@/lib/project-scan.functions";
import { fileUrl, openStoredFile } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/grundriss-review")({
  head: () => ({
    meta: [
      { title: "Grundriss prüfen – Kalkulation" },
      {
        name: "description",
        content: "Grundriss hochladen, Räume und Flächen prüfen und für die Kalkulation vorbereiten.",
      },
    ],
  }),
  component: GrundrissReviewPage,
});

type ReviewRoom = ScannedRoom & {
  id: string;
  checked: boolean;
};

type UploadedPlan = {
  path: string;
  name: string;
  url: string;
  mimeType: string;
};

function decimal(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100).replace(".", ",") : "";
}

function parseDecimal(value: string): number {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function GrundrissReviewPage() {
  const navigate = useNavigate();
  const runProjectScan = useServerFn(analyzeProject);
  const [plan, setPlan] = useState<UploadedPlan | null>(null);
  const [rooms, setRooms] = useState<ReviewRoom[]>([]);
  const [summary, setSummary] = useState("");
  const [highlights, setHighlights] = useState<string[]>([]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const approvedRooms = rooms.filter((room) => room.checked);
  const totalArea = useMemo(
    () => approvedRooms.reduce((sum, room) => sum + Number(room.area_sqm || 0), 0),
    [approvedRooms],
  );
  const floors = useMemo(
    () => new Set(approvedRooms.map((room) => room.floor.trim()).filter(Boolean)).size,
    [approvedRooms],
  );

  const analyse = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const scan = await runProjectScan({
        data: {
          fileUrl: plan.url,
          mimeType: plan.mimeType,
          mode: "floorplan",
        },
      });
      setRooms(
        scan.rooms.map((room, index) => ({
          ...room,
          id: `room-${Date.now()}-${index}`,
          checked: true,
        })),
      );
      setSummary(scan.executive_summary || "");
      setHighlights(scan.highlights || []);
      setRequirements(scan.requirements || []);
      toast.success(`Grundriss gelesen – ${scan.rooms.length} Räume gefunden`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message, { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const addRoom = () => {
    setRooms((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        checked: true,
        name: "",
        floor: "",
        usage_type: "",
        area_sqm: 0,
        floor_covering: "",
      },
    ]);
  };

  const patchRoom = (id: string, patch: Partial<ReviewRoom>) => {
    setRooms((prev) => prev.map((room) => (room.id === id ? { ...room, ...patch } : room)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Grundriss prüfen</h1>
          <p className="text-sm text-muted-foreground">
            Plan links öffnen, Räume und Flächen rechts prüfen. Nur bestätigte Zeilen fließen in die
            Summen ein. Alle Werte bleiben manuell änderbar.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/kalkulation" })}>
          Zur Kalkulation
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.6fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Grundriss / Objektfoto</CardTitle>
            <CardDescription>PDF, JPG, PNG oder WebP. Der Originalplan bleibt jederzeit öffnbar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileUploadButton
              folder="kalkulation"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              label="Grundriss hochladen"
              onUploaded={(path, file) => {
                void (async () => {
                  const url = await fileUrl(path);
                  setPlan({
                    path,
                    name: file.name,
                    url,
                    mimeType: file.type || "application/pdf",
                  });
                  setRooms([]);
                  setSummary("");
                  setHighlights([]);
                  setRequirements([]);
                  toast.success("Grundriss hochgeladen");
                })();
              }}
            />

            {plan ? (
              <div className="space-y-3 rounded-lg border p-3">
                <button
                  type="button"
                  className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-md bg-muted p-4 text-center"
                  onClick={() =>
                    void openStoredFile(plan.path, plan.name).catch(() =>
                      toast.error("Datei konnte nicht geöffnet werden."),
                    )
                  }
                >
                  {plan.mimeType.startsWith("image/") ? (
                    <img src={plan.url} alt={plan.name} className="max-h-72 rounded object-contain" />
                  ) : (
                    <FileText className="size-12 text-muted-foreground" />
                  )}
                  <span className="break-all text-xs text-muted-foreground">{plan.name}</span>
                </button>

                <Button type="button" className="w-full" disabled={busy} onClick={() => void analyse()}>
                  <Sparkles className="size-4" />
                  {busy ? "Grundriss wird gelesen …" : "Grundriss automatisch lesen"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Falls der KI-Dienst noch nicht eingerichtet ist, können Räume und Flächen rechts
                  trotzdem manuell erfasst und geprüft werden.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Noch kein Grundriss hochgeladen.
              </div>
            )}

            <div className="space-y-2">
              <Label>Objekt-Zusammenfassung</Label>
              <Textarea
                rows={5}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="z. B. Büroeinheit EG, überwiegend Linoleum, zwei Sanitärräume …"
              />
            </div>

            {highlights.length > 0 ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium">Erkannte Eckdaten</p>
                {highlights.map((entry, index) => (
                  <p key={`${entry}-${index}`} className="text-muted-foreground">• {entry}</p>
                ))}
              </div>
            ) : null}

            {requirements.length > 0 ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium">Anforderungen</p>
                {requirements.map((entry, index) => (
                  <p key={`${entry}-${index}`} className="text-muted-foreground">• {entry}</p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Räume & Flächen prüfen</CardTitle>
                  <CardDescription>
                    Jede Zeile einzeln bestätigen. Unklare oder falsche Werte direkt korrigieren.
                  </CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addRoom}>
                  <Plus className="size-4" /> Raum hinzufügen
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {rooms.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Noch keine Räume. Automatisch lesen oder manuell einen Raum hinzufügen.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[920px] space-y-2">
                    <div className="grid grid-cols-[3rem_1.4fr_.7fr_1fr_.65fr_1fr_3rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
                      <span>OK</span>
                      <span>Raum / Nr.</span>
                      <span>Etage</span>
                      <span>Raumart</span>
                      <span>m²</span>
                      <span>Bodenbelag</span>
                      <span />
                    </div>
                    {rooms.map((room) => (
                      <div
                        key={room.id}
                        className="grid grid-cols-[3rem_1.4fr_.7fr_1fr_.65fr_1fr_3rem] items-center gap-2 rounded-md border p-2"
                      >
                        <button
                          type="button"
                          className="flex justify-center"
                          aria-label={room.checked ? "Raum bestätigt" : "Raum nicht bestätigt"}
                          onClick={() => patchRoom(room.id, { checked: !room.checked })}
                        >
                          <CheckCircle2 className={room.checked ? "size-5 text-emerald-600" : "size-5 text-muted-foreground/40"} />
                        </button>
                        <Input value={room.name} onChange={(e) => patchRoom(room.id, { name: e.target.value })} />
                        <Input value={room.floor} onChange={(e) => patchRoom(room.id, { floor: e.target.value })} />
                        <Input value={room.usage_type} onChange={(e) => patchRoom(room.id, { usage_type: e.target.value })} />
                        <Input
                          inputMode="decimal"
                          value={decimal(room.area_sqm)}
                          onChange={(e) => patchRoom(room.id, { area_sqm: parseDecimal(e.target.value) })}
                        />
                        <Input value={room.floor_covering} onChange={(e) => patchRoom(room.id, { floor_covering: e.target.value })} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Raum löschen"
                          onClick={() => setRooms((prev) => prev.filter((entry) => entry.id !== room.id))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Geprüfte Zusammenfassung</CardTitle>
              <CardDescription>Nur bestätigte Raumzeilen werden hier berücksichtigt.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Räume bestätigt</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{approvedRooms.length}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Gesamtfläche</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{decimal(totalArea)} m²</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Etagen erkannt</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{floors}</p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Nächster Schritt: Nach der Prüfung werden diese bestätigten Werte gezielt in die
                normale Kalkulation übernommen. Die Verbindung kommt erst nach erfolgreichem Test
                dieser Review-Seite, damit die bestehende Kalkulation unverändert bleibt.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
