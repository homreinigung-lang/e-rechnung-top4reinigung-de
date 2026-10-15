import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { measuredArea } from "@/lib/aufmass";
import type { ProjektDetailState } from "./useProjektDetailState";
export function ProjektDetailRaumBearbeiten({ state }: { state: ProjektDetailState }) {
  const { patchRoom, roomDialog, setRoomDialog } = state;
  return (
    <Dialog open={Boolean(roomDialog)} onOpenChange={(o) => !o && setRoomDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aufmaß bearbeiten</DialogTitle>
        </DialogHeader>
        {roomDialog && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="r-name">Bezeichnung</Label>
              <Input
                id="r-name"
                value={roomDialog.name}
                onChange={(e) => setRoomDialog({ ...roomDialog, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-floor">Etage</Label>
              <Input
                id="r-floor"
                value={roomDialog.floor}
                onChange={(e) => setRoomDialog({ ...roomDialog, floor: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-usage">Nutzung</Label>
              <Input
                id="r-usage"
                value={roomDialog.usage_type}
                onChange={(e) => setRoomDialog({ ...roomDialog, usage_type: e.target.value })}
              />
            </div>
            {(["length_m", "width_m"] as const).map((field) => (
              <div className="space-y-2" key={field}>
                <Label htmlFor={field}>{field === "length_m" ? "Länge (m)" : "Breite (m)"}</Label>
                <Input
                  id={field}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={roomDialog[field] ?? ""}
                  onChange={(e) => {
                    const next = {
                      ...roomDialog,
                      [field]: e.target.value === "" ? null : Number(e.target.value),
                      confirmed: false,
                    };
                    const area = measuredArea(next.length_m, next.width_m);
                    setRoomDialog({ ...next, ...(area === null ? {} : { area_sqm: area }) });
                  }}
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="r-glass">Glasfläche (m², separat)</Label>
              <Input
                id="r-glass"
                type="number"
                min="0"
                step="0.01"
                value={roomDialog.glass_sqm ?? 0}
                onChange={(e) =>
                  setRoomDialog({
                    ...roomDialog,
                    glass_sqm: Number(e.target.value),
                    confirmed: false,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-area">Bodenfläche (m²)</Label>
              <Input
                id="r-area"
                type="number"
                step="0.01"
                min="0"
                disabled={measuredArea(roomDialog.length_m, roomDialog.width_m) !== null}
                value={roomDialog.area_sqm}
                onChange={(e) =>
                  setRoomDialog({ ...roomDialog, area_sqm: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-covering">Bodenbelag / Oberfläche</Label>
              <Input
                id="r-covering"
                value={roomDialog.floor_covering ?? ""}
                placeholder="Teppich, Fliesen, PVC …"
                onChange={(e) => setRoomDialog({ ...roomDialog, floor_covering: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-freq">Turnus</Label>
              <Input
                id="r-freq"
                value={roomDialog.frequency}
                placeholder="z. B. 2x wöchentlich"
                onChange={(e) => setRoomDialog({ ...roomDialog, frequency: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="r-note">Bemerkung</Label>
              <Textarea
                id="r-note"
                value={roomDialog.note}
                onChange={(e) => setRoomDialog({ ...roomDialog, note: e.target.value })}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={
              patchRoom.isPending ||
              !roomDialog ||
              roomDialog.area_sqm < 0 ||
              (roomDialog.glass_sqm ?? 0) < 0 ||
              (roomDialog.length_m != null && roomDialog.length_m <= 0) ||
              (roomDialog.width_m != null && roomDialog.width_m <= 0)
            }
            onClick={async () => {
              if (!roomDialog) return;
              try {
                await patchRoom.mutateAsync({
                  roomId: roomDialog.id,
                  values: {
                    name: roomDialog.name,
                    floor: roomDialog.floor,
                    usage_type: roomDialog.usage_type,
                    area_sqm: roomDialog.area_sqm,
                    length_m: roomDialog.length_m ?? null,
                    width_m: roomDialog.width_m ?? null,
                    glass_sqm: roomDialog.glass_sqm ?? 0,
                    floor_covering: roomDialog.floor_covering ?? "",
                    frequency: roomDialog.frequency,
                    note: roomDialog.note,
                    confirmed: true,
                  },
                });
                setRoomDialog(null);
              } catch {
                /* mutation reports the error; keep the form open */
              }
            }}
          >
            Speichern & als geprüft markieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
