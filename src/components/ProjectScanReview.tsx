import { useEffect, useState } from "react";
import type { ScannedLvItem, ScannedProject, ScannedRoom } from "@/lib/project-scan.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { formatNumber } from "@/lib/format";

export type ReviewResult = {
  rooms: ScannedRoom[];
  items: ScannedLvItem[];
  expected_room_count: number;
  executive_summary: string;
  highlights: string[];
  requirements: string[];
};

const EMPTY_ROOM: ScannedRoom = {
  name: "",
  floor: "",
  usage_type: "",
  area_sqm: 0,
  floor_covering: "",
};

/** Zeilenweise Liste <-> Textfeld. */
function toLines(values: string[]): string {
  return values.join("\n");
}
function fromLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean);
}
const EMPTY_ITEM: ScannedLvItem = {
  section: "",
  title: "",
  description: "",
  quantity: 0,
  unit: "",
  deadline: "",
  evidence: "",
  critical: false,
};

type Props = {
  open: boolean;
  mode: "floorplan" | "tender";
  result: ScannedProject | null;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (value: ReviewResult) => void;
};

/** Vorschau der erkannten Daten – jede Zeile kann geprüft, geändert, ergänzt oder gelöscht werden. */
export function ProjectScanReview({ open, mode, result, saving, onCancel, onConfirm }: Props) {
  const [rooms, setRooms] = useState<ScannedRoom[]>([]);
  const [items, setItems] = useState<ScannedLvItem[]>([]);
  const [summary, setSummary] = useState("");
  const [highlights, setHighlights] = useState("");
  const [requirements, setRequirements] = useState("");

  useEffect(() => {
    if (!open) return;
    setRooms(result?.rooms ?? []);
    setItems(result?.items ?? []);
    setSummary(result?.executive_summary ?? "");
    setHighlights(toLines(result?.highlights ?? []));
    setRequirements(toLines(result?.requirements ?? []));
  }, [open, result]);

  const isTender = mode === "tender";
  const totalSqm = rooms.reduce((sum, r) => sum + (Number(r.area_sqm) || 0), 0);

  function patchRoom(index: number, values: Partial<ScannedRoom>) {
    setRooms((prev) => prev.map((r, i) => (i === index ? { ...r, ...values } : r)));
  }
  function patchItem(index: number, values: Partial<ScannedLvItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...values } : it)));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Erkannte Daten prüfen</DialogTitle>
          <DialogDescription>
            Es werden ausschließlich Werte übernommen, die hier stehen. Bitte alles kontrollieren,
            fehlende Zeilen ergänzen und falsche Zeilen löschen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="scan-highlights">Erkannte Eckdaten (ein Stichpunkt pro Zeile)</Label>
            <Textarea
              id="scan-highlights"
              rows={4}
              value={highlights}
              placeholder="Erkannte Fläche: ca. 120 m² Büro"
              onChange={(e) => setHighlights(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scan-requirements">Kundenanforderungen (eine pro Zeile)</Label>
            <Textarea
              id="scan-requirements"
              rows={4}
              value={requirements}
              placeholder="Reinigung nach 18:00 Uhr"
              onChange={(e) => setRequirements(e.target.value)}
            />
          </div>
        </div>

        {!isTender && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {rooms.length} Räume · {formatNumber(totalSqm)} m² gesamt
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRooms((prev) => [...prev, { ...EMPTY_ROOM }])}
              >
                <Plus className="size-4" /> Raum hinzufügen
              </Button>
            </div>

            {rooms.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Es konnten keine Räume sicher gelesen werden. Bitte manuell ergänzen.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-2">Nr.</th>
                      <th className="py-2 pr-2">Raum</th>
                      <th className="py-2 pr-2">Etage</th>
                      <th className="py-2 pr-2">Nutzung</th>
                      <th className="py-2 pr-2">m²</th>
                      <th className="py-2 pr-2">Bodenbelag</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((r, index) => (
                      <tr key={index} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-2 text-muted-foreground">{index + 1}</td>
                        <td className="py-2 pr-2">
                          <Input
                            value={r.name}
                            placeholder="Bezeichnung"
                            onChange={(e) => patchRoom(index, { name: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={r.floor}
                            placeholder="EG / 1. OG"
                            onChange={(e) => patchRoom(index, { floor: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={r.usage_type}
                            placeholder="Büro, WC …"
                            onChange={(e) => patchRoom(index, { usage_type: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={r.area_sqm}
                            onChange={(e) =>
                              patchRoom(index, { area_sqm: Number(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={r.floor_covering}
                            placeholder="Teppich, Fliesen …"
                            onChange={(e) => patchRoom(index, { floor_covering: e.target.value })}
                          />
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setRooms((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {isTender && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="scan-summary">Zusammenfassung</Label>
              <Textarea
                id="scan-summary"
                rows={3}
                value={summary}
                placeholder="Kritische Punkte und Fristen …"
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{items.length} Positionen</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
              >
                <Plus className="size-4" /> Position hinzufügen
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Es konnten keine Positionen sicher gelesen werden. Bitte manuell ergänzen.
              </p>
            ) : (
              <ul className="divide-y">
                {items.map((it, index) => (
                  <li key={index} className="space-y-2 py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            value={it.section}
                            placeholder="Leistungsbereich"
                            onChange={(e) => patchItem(index, { section: e.target.value })}
                          />
                          <Input
                            value={it.title}
                            placeholder="Position"
                            onChange={(e) => patchItem(index, { title: e.target.value })}
                          />
                        </div>
                        <Textarea
                          rows={2}
                          value={it.description}
                          placeholder="Beschreibung"
                          onChange={(e) => patchItem(index, { description: e.target.value })}
                        />
                        <div className="grid gap-2 sm:grid-cols-4">
                          <Input
                            type="number"
                            value={it.quantity}
                            placeholder="Menge"
                            onChange={(e) =>
                              patchItem(index, { quantity: Number(e.target.value) || 0 })
                            }
                          />
                          <Input
                            value={it.unit}
                            placeholder="Einheit"
                            onChange={(e) => patchItem(index, { unit: e.target.value })}
                          />
                          <Input
                            type="date"
                            value={it.deadline}
                            onChange={(e) => patchItem(index, { deadline: e.target.value })}
                          />
                          <Input
                            value={it.evidence}
                            placeholder="Nachweis"
                            onChange={(e) => patchItem(index, { evidence: e.target.value })}
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Checkbox
                            checked={it.critical}
                            onCheckedChange={(v) => patchItem(index, { critical: Boolean(v) })}
                          />
                          Kritischer Punkt / Frist
                        </label>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Verwerfen
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() =>
              onConfirm({
                rooms: rooms.filter((r) => r.name.trim() || r.area_sqm > 0),
                items: items.filter((i) => i.title.trim() || i.section.trim()),
                expected_room_count: rooms.length,
                executive_summary: summary,
                highlights: fromLines(highlights),
                requirements: fromLines(requirements),
              })
            }
          >
            {isTender ? "Positionen übernehmen" : "Räume übernehmen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
