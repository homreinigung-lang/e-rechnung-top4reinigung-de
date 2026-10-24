import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { type CalculationRoom, suggestRoomDefaults } from "@/lib/room-calculation";
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
  function addRoom() {
    setRoomCalculation((current) => ({
      ...current,
      rooms: [...current.rooms, {
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
        calculationMode: "minutes",
        minutesPerVisit: "",
        tasks: "",
      }],
    }));
  }

  if (!roomCalculation.rooms.length) return (
    <section id="raumkalkulation" className="space-y-3 rounded-lg border p-3 sm:p-4" aria-label="Raumweise Stundenberechnung">
      <h3 className="font-semibold">Räume & Stundenberechnung</h3>
      <p className="text-sm text-muted-foreground">Ersten Raum direkt erfassen oder Räume aus einem Grundriss analysieren. Danach Minuten, Turnus und Stundensatz prüfen und die Raumkalkulation aktivieren.</p>
      <Button type="button" variant="outline" onClick={addRoom}>Ersten Raum hinzufügen</Button>
    </section>
  );

  function patch(id: string, values: Partial<CalculationRoom>) {
    setRoomCalculation((current) => ({
      ...current,
      rooms: current.rooms.map((room) => {
        if (room.id !== id) return room;
        const next = { ...room, ...values };
        const typeChanged = "usage_type" in values || "floor_covering" in values;
        if (room.tasksOrigin === "estimate" && (typeChanged || "name" in values)) {
          next.tasks = "";
        }
        if (
          room.minutesOrigin === "estimate" &&
          ("area" in values ||
            "sqmPerHour" in values ||
            "usage_type" in values ||
            "floor_covering" in values)
        ) {
          next.minutesPerVisit = "";
          if (typeChanged) {
            const rate = findRate(visiblePerformanceRates, next);
            next.sqmPerHour = rate ? String(rate.sqm_per_hour).replace(".", ",") : "";
            next.rateLabel = rate?.label ?? "Kein passender Leistungswert";
          }
          return suggestRoomDefaults(next, visiblePerformanceRates);
        }
        if (room.tasksOrigin === "estimate" && (typeChanged || "name" in values)) {
          return suggestRoomDefaults(next, visiblePerformanceRates);
        }
        return next;
      }),
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
    if (state.frequencyUnit !== "once") setFrequencyUnit("month");
    setArea(String(roomSummary.area).replace(".", ","));
    // Stairs included in the room list must not also receive a separate floor fee.
    setStairs(false);
    toast.success(
      "Raumweise Stundenberechnung aktiv – Positionen und Preis in der Angebotsvorschau prüfen.",
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
          Je Raum Minuten für alle vereinbarten Aufgaben pro Besuch festlegen oder nach m²/Std.
          rechnen. Der Zeitansatz ist Personalzeit: Zwei Personen à 15 Minuten ergeben 30 Minuten.
          Zeiten aus Leistungswerten und Standardaufgaben sind Vorschläge: Umfang und Aufwand prüfen
          und bei Bedarf ändern. Ein nicht im Dokument genannter Turnus bleibt offen.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRoomCalculation((current) => ({
              ...current,
              rooms: current.rooms.map((room) =>
                room.included ? suggestRoomDefaults(room, visiblePerformanceRates) : room,
              ),
            }))
          }
        >
          Fehlende Zeiten und Aufgaben vorschlagen
        </Button>
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
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`room-${index}-${key}`}>{label}</Label>
                    <Input
                      id={`room-${index}-${key}`}
                      disabled={!room.included}
                      inputMode={key === "area" ? "decimal" : "text"}
                      value={room[key]}
                      onChange={(event) =>
                        patch(room.id, {
                          [key]: event.target.value,
                        })
                      }
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label>Berechnung je Besuch</Label>
                  <Select
                    disabled={!room.included}
                    value={room.calculationMode ?? "area"}
                    onValueChange={(value) =>
                      patch(room.id, { calculationMode: value as "area" | "minutes" })
                    }
                  >
                    <SelectTrigger aria-label={`Berechnung ${room.name || index + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minuten je Besuch (alle Aufgaben)</SelectItem>
                      <SelectItem value="area">Fläche ÷ m²/Std.</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {room.calculationMode === "minutes" ? (
                  <div className="space-y-1">
                    <Label htmlFor={`room-${index}-minutes`}>Personalminuten je Besuch</Label>
                    <Input
                      id={`room-${index}-minutes`}
                      inputMode="decimal"
                      disabled={!room.included}
                      value={room.minutesPerVisit ?? ""}
                      placeholder="Zeit selbst einschätzen"
                      onChange={(event) =>
                        patch(room.id, {
                          minutesPerVisit: event.target.value,
                          minutesOrigin: undefined,
                        })
                      }
                    />
                    {room.minutesOrigin && (
                      <p className="text-xs text-muted-foreground">
                        {room.minutesOrigin === "estimate"
                          ? `Zeitvorschlag aus Fläche und Leistungswert (${room.rateLabel}) – Aufgaben und Aufwand prüfen.`
                          : "Minuten aus dem Dokument übernommen – bitte prüfen."}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label htmlFor={`room-${index}-performance`}>Leistungswert (m²/Std.)</Label>
                    <Input
                      id={`room-${index}-performance`}
                      inputMode="decimal"
                      disabled={!room.included}
                      value={room.sqmPerHour}
                      onChange={(event) =>
                        patch(room.id, {
                          sqmPerHour: event.target.value,
                          rateLabel: "Eigener Leistungswert",
                        })
                      }
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor={`room-${index}-frequency`}>Reinigungen</Label>
                  <Input
                    id={`room-${index}-frequency`}
                    disabled={!room.included || state.frequencyUnit === "once"}
                    inputMode="decimal"
                    value={state.frequencyUnit === "once" ? "1" : room.frequency}
                    placeholder="Bitte festlegen"
                    onChange={(event) => patch(room.id, { frequency: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Zeitraum</Label>
                  <Select
                    disabled={!room.included || state.frequencyUnit === "once"}
                    value={state.frequencyUnit === "once" ? "once" : room.frequencyUnit}
                    onValueChange={(value) =>
                      patch(room.id, { frequencyUnit: value as RecurrenceUnit })
                    }
                  >
                    <SelectTrigger aria-label={`Zeitraum ${room.name || index + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {state.frequencyUnit === "once" && <SelectItem value="once">Einmalig</SelectItem>}
                      {units.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {recurrenceUnitLabel(unit)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`room-${index}-tasks`}>Enthaltene Aufgaben</Label>
                <Textarea
                  id={`room-${index}-tasks`}
                  disabled={!room.included}
                  value={room.tasks ?? ""}
                  placeholder="z. B. Boden, Oberflächen, Abfall, WC und Waschbecken"
                  onChange={(event) =>
                    patch(room.id, { tasks: event.target.value, tasksOrigin: undefined })
                  }
                />
                {room.tasksOrigin === "estimate" && (
                  <p className="text-xs text-muted-foreground">
                    Aufgabenvorschlag nach Raumart – tatsächlichen Leistungsumfang prüfen.
                  </p>
                )}
              </div>
              {room.calculationMode !== "minutes" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Ansatz: {room.rateLabel}. Nur die damit abgedeckten Aufgaben sind enthalten.
                  </p>
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
                </>
              )}
              {result && (
                <p className="text-sm">
                  <strong>{formatNumber(result.hoursPerVisit * 60)} Min./Reinigung</strong> ·{" "}
                  {formatNumber(result.monthlyHours)} {state.frequencyUnit === "once" ? "Std./Auftrag" : "Std./Monat"}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={addRoom}
      >
        Raum / Rüst- oder Wegezeit ergänzen
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
          {formatNumber(roomSummary.monthlyHours)} {state.frequencyUnit === "once" ? "Std./Auftrag" : "Std./Monat"} ·{" "}
          {formatMoney(positionsTotal(roomSummary.positions))} {state.frequencyUnit === "once" ? "netto je Auftrag" : "netto/Monat"} vor Zusatzleistungen und
          Rabatt
        </p>
        <p className="text-xs text-muted-foreground">
          {state.frequencyUnit === "once" ? "Ein Einsatz je ausgewähltem Raum. " : "Wochenbasierte Turnusse: 52 Wochen ÷ 12 Monate. "}Abrechenbare Stunden je Raum auf zwei
          Nachkommastellen gerundet. Rüst-, Wege- und Nebenzeiten in den Minuten berücksichtigen
          oder als eigene Zeitposition ergänzen; gemeinsame Zeiten nur einmal pro Besuch ansetzen.
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
          Die Raumwerte steuern jetzt Stunden, Kosten und Preis. Prüfen Sie die Positionen in der
          Angebotsvorschau und wählen Sie anschließend „In Angebot übernehmen“.
        </p>
      )}
    </section>
  );
}
