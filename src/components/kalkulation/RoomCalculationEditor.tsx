import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { openStoredFile } from "@/lib/storage";
import { positionsTotal } from "@/lib/kalkulation-engine";
import { findRate } from "@/lib/leistungswerte";
import { formatMoney, formatNumber } from "@/lib/format";
import { type RecurrenceUnit, recurrenceUnitLabel } from "@/lib/constants";
import { type CalculationRoom } from "@/lib/room-calculation";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

const units: RecurrenceUnit[] = ["week", "fortnight", "month", "quarter", "year"];

export function RoomCalculationEditor({ state }: { state: KalkulationStateContext }) {
  const {
    roomCalculation,
    setRoomCalculation,
    roomSummary,
    visiblePerformanceRates,
    setMode,
    setFrequency,
    setFrequencyUnit,
    setArea,
    setStairs,
  } = state;
  const [bulkFrequency, setBulkFrequency] = useState("");
  const [bulkUnit, setBulkUnit] = useState<RecurrenceUnit>("week");
  if (!roomCalculation.rooms.length) return null;

  function patch(id: string, values: Partial<CalculationRoom>) {
    setRoomCalculation((current) => ({
      ...current,
      rooms: current.rooms.map((room) => (room.id === id ? { ...room, ...values } : room)),
    }));
  }

  function activate() {
    if (roomSummary.errors.length) {
      toast.error("Bitte zuerst die markierten Raumdaten und Turnusse ergänzen.");
      return;
    }
    setRoomCalculation((current) => ({ ...current, enabled: true }));
    setMode("hours");
    setFrequency("1");
    setFrequencyUnit("month");
    setArea(String(roomSummary.area).replace(".", ","));
    // Stairs included in the room list must not also receive a separate floor fee.
    setStairs(false);
    toast.success(
      "Raumweise Stundenberechnung aktiv – Vorschau und Kosten wurden aktualisiert. Danach Grundkalkulation für Angebot übernehmen.",
    );
  }

  return (
    <section
      id="raumkalkulation"
      className="space-y-4 rounded-lg border p-3 sm:p-4"
      aria-label="Raumweise Stundenberechnung"
    >
      <div>
        <h3 className="font-semibold">Räume & Stundenberechnung</h3>
        <p className="text-sm text-muted-foreground">
          Fläche ÷ m² pro Stunde × Reinigungshäufigkeit. Leistungswerte sind prüfbare Vorschläge für
          Unterhaltsreinigung. Turnusse bitte selbst festlegen; ein Grundriss enthält normalerweise
          keinen Reinigungsplan.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ...new Set(
            roomCalculation.rooms
              .map((room) => room.source)
              .filter((source) => source && source !== "manual"),
          ),
        ].map((source, index) => (
          <Button
            key={source}
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void openStoredFile(source, source.split("/").pop() || "Grundriss").catch(() =>
                toast.error("Originalplan konnte nicht geöffnet werden."),
              )
            }
          >
            Originalplan {index + 1} öffnen
          </Button>
        ))}
      </div>
      <div className="space-y-2 rounded-md bg-muted/40 p-3">
        <p className="text-sm font-medium">Gemeinsamen Turnus für ausgewählte Räume setzen</p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-24"
            aria-label="Gemeinsame Anzahl"
            inputMode="decimal"
            placeholder="z. B. 2"
            value={bulkFrequency}
            onChange={(event) => setBulkFrequency(event.target.value)}
          />
          <Select value={bulkUnit} onValueChange={(value) => setBulkUnit(value as RecurrenceUnit)}>
            <SelectTrigger className="w-44" aria-label="Gemeinsamer Zeitraum">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {recurrenceUnitLabel(unit)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={num(bulkFrequency) <= 0}
            onClick={() =>
              setRoomCalculation((current) => ({
                ...current,
                rooms: current.rooms.map((room) =>
                  room.included
                    ? { ...room, frequency: bulkFrequency, frequencyUnit: bulkUnit }
                    : room,
                ),
              }))
            }
          >
            Auf ausgewählte Räume anwenden
          </Button>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {roomCalculation.rooms.map((room, index) => {
          const result = roomSummary.rows.find((row) => row.room.id === room.id);
          return (
            <div key={room.id} className="space-y-3 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={room.included}
                  onCheckedChange={(checked) => patch(room.id, { included: Boolean(checked) })}
                />
                Raum {index + 1} reinigen
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["name", "Raumname"],
                    ["floor", "Etage"],
                    ["usage_type", "Raumart"],
                    ["floor_covering", "Bodenbelag"],
                    ["area", "Fläche (m²)"],
                    ["sqmPerHour", "Leistungswert (m²/Std.)"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`room-${index}-${key}`}>{label}</Label>
                    <Input
                      id={`room-${index}-${key}`}
                      disabled={!room.included}
                      inputMode={key === "area" || key === "sqmPerHour" ? "decimal" : "text"}
                      value={room[key]}
                      onChange={(event) =>
                        patch(room.id, {
                          [key]: event.target.value,
                          ...(key === "sqmPerHour" ? { rateLabel: "Eigener Leistungswert" } : {}),
                        })
                      }
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label htmlFor={`room-${index}-frequency`}>Reinigungen</Label>
                  <Input
                    id={`room-${index}-frequency`}
                    disabled={!room.included}
                    inputMode="decimal"
                    value={room.frequency}
                    placeholder="Bitte festlegen"
                    onChange={(event) => patch(room.id, { frequency: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Zeitraum</Label>
                  <Select
                    disabled={!room.included}
                    value={room.frequencyUnit}
                    onValueChange={(value) =>
                      patch(room.id, { frequencyUnit: value as RecurrenceUnit })
                    }
                  >
                    <SelectTrigger aria-label={`Zeitraum ${room.name || index + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {recurrenceUnitLabel(unit)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Ansatz: {room.rateLabel}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!room.included}
                onClick={() => {
                  const rate = findRate(visiblePerformanceRates, room);
                  if (!rate) {
                    toast.error("Kein passender Leistungswert – bitte m²/Std. selbst angeben.");
                    return;
                  }
                  patch(room.id, {
                    sqmPerHour: String(rate.sqm_per_hour).replace(".", ","),
                    rateLabel: rate.label,
                  });
                }}
              >
                Leistungswert neu vorschlagen
              </Button>
              {result && (
                <p className="text-sm">
                  <strong>{formatNumber(result.hoursPerVisit * 60)} Min./Reinigung</strong> ·{" "}
                  {formatNumber(result.monthlyHours)} Std./Monat
                </p>
              )}
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setRoomCalculation((current) => ({
            ...current,
            rooms: [
              ...current.rooms,
              {
                id: crypto.randomUUID(),
                source: "manual",
                name: "Neuer Raum",
                floor: "",
                usage_type: "",
                floor_covering: "",
                area: "",
                sqmPerHour: "",
                rateLabel: "Bitte Leistungswert festlegen",
                frequency: "",
                frequencyUnit: "week",
                included: true,
              },
            ],
          }))
        }
      >
        Fehlenden Raum ergänzen
      </Button>
      {roomSummary.errors.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-500/60 p-3 text-sm">
          <p className="font-medium">Vor der Übernahme prüfen</p>
          <ul className="list-disc pl-5">
            {roomSummary.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p>
          {roomSummary.rows.length} Räume · {formatNumber(roomSummary.area)} m²
        </p>
        <p className="font-semibold">
          {formatNumber(roomSummary.monthlyHours)} Std./Monat ·{" "}
          {formatMoney(positionsTotal(roomSummary.positions))} netto/Monat vor Zusatzleistungen und
          Rabatt
        </p>
        <p className="text-xs text-muted-foreground">
          Wochenbasierte Turnusse: 52 Wochen ÷ 12 Monate. Abrechenbare Stunden je Raum auf zwei
          Nachkommastellen gerundet. Ohne Wege-, Rüst- und Nebenzeiten; diese im Ansatz
          berücksichtigen.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={roomSummary.errors.length > 0} onClick={activate}>
          {roomCalculation.enabled
            ? "Raumkalkulation ist aktiv"
            : "Raumstunden für Kalkulation übernehmen"}
        </Button>
        {roomCalculation.enabled && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setRoomCalculation((current) => ({ ...current, enabled: false }))}
          >
            Zur manuellen Kalkulation wechseln
          </Button>
        )}
      </div>
      {roomCalculation.enabled && (
        <p className="text-sm text-primary">
          Die Raumwerte steuern jetzt Stunden, Kosten und Grundkalkulation. Für das Angebot
          anschließend „Grundkalkulation für Angebot übernehmen“ auswählen und das LV prüfen.
        </p>
      )}
    </section>
  );
}
