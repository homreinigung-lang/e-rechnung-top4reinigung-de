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

import type { ProjektDetailState } from "./useProjektDetailState";
export function ProjektDetailRaumBearbeiten({ state }: { state: ProjektDetailState }) {
  const { patchRoom, roomDialog, setRoomDialog } = state;
  return (
    <Dialog open={Boolean(roomDialog)} onOpenChange={(o) => !o && setRoomDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raum bearbeiten</DialogTitle>
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
            <div className="space-y-2">
              <Label htmlFor="r-area">Fläche (m²)</Label>
              <Input
                id="r-area"
                type="number"
                step="0.01"
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
            onClick={() => {
              if (!roomDialog) return;
              patchRoom.mutate({
                roomId: roomDialog.id,
                values: {
                  name: roomDialog.name,
                  floor: roomDialog.floor,
                  usage_type: roomDialog.usage_type,
                  area_sqm: roomDialog.area_sqm,
                  floor_covering: roomDialog.floor_covering ?? "",
                  frequency: roomDialog.frequency,
                  note: roomDialog.note,
                  confirmed: true,
                },
              });
              setRoomDialog(null);
            }}
          >
            Speichern & als geprüft markieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
