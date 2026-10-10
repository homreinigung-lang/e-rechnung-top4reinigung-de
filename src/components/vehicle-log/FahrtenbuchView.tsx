import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Car, Download, FileText, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { formatKm, formatDate, formatTime, tripTypeLabel } from "./shared";

import { FahrtenbuchSection1 } from "./FahrtenbuchSection1";
import type { FahrtenbuchState } from "./useFahrtenbuchState";
export function FahrtenbuchView({ state }: { state: FahrtenbuchState }) {
  const {
    businessKmForMonth,
    drivers,
    editEntry,
    entries,
    exportCsv,
    exportPdf,
    isLoading,
    licensePlate,
    loadMonthlyRow,
    month,
    monthEndKm,
    monthStartKm,
    monthlyTotalKm,
    monthlyVehicleId,
    privateOrUnloggedKm,
    removeTrip,
    saveMonthly,
    saveVehicle,
    searchDate,
    selectedMonthly,
    setLicensePlate,
    setMonth,
    setMonthEndKm,
    setMonthStartKm,
    setSearchDate,
    setVehicleName,
    totalKm,
    vehicleName,
    vehicles,
    visibleEntries,
  } = state;
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <Car className="size-7 text-primary" />
            <h1 className="text-3xl font-bold">Fahrtenbuch</h1>
          </div>
          <p className="mt-1 text-muted-foreground">
            Geschäftliche Fahrten, Fahrzeuge und monatliche Kilometerstände vollständig
            dokumentieren.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" /> CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => void exportPdf()}
            disabled={isLoading || entries.length === 0}
          >
            <FileText className="size-4" /> Fahrtenbuch PDF herunterladen
          </Button>
          <div className="rounded-lg border bg-card px-4 py-3 text-right">
            <p className="text-xs text-muted-foreground">Geschäftlich erfasst</p>
            <p className="text-xl font-semibold">{formatKm(totalKm)} km</p>
          </div>
        </div>
      </div>

      <section className="surface min-w-0 space-y-4 p-4 sm:p-5 no-print">
        <div>
          <h2 className="text-lg font-semibold">Fahrzeuge</h2>
          <p className="text-sm text-muted-foreground">
            Fahrzeug und Kennzeichen einmal anlegen und danach bei jeder Fahrt auswählen.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="Fahrzeug, z. B. VW Caddy"
            value={vehicleName}
            onChange={(e) => setVehicleName(e.target.value)}
          />
          <Input
            placeholder="Kennzeichen, z. B. VK-HR 123"
            value={licensePlate}
            onChange={(e) => setLicensePlate(e.target.value)}
          />
          <Button onClick={() => saveVehicle.mutate()} disabled={saveVehicle.isPending}>
            <Plus className="size-4" /> Fahrzeug speichern
          </Button>
        </div>
        {vehicles.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-sm">
            {vehicles.map((vehicle) => (
              <span key={vehicle.id} className="rounded-md border px-3 py-2">
                {vehicle.vehicle_name} · <strong>{vehicle.license_plate}</strong>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="surface min-w-0 space-y-4 p-4 sm:p-5 no-print">
        <div>
          <h2 className="text-lg font-semibold">Monatskilometer</h2>
          <p className="text-sm text-muted-foreground">
            Monatsanfang und Monatsende je Fahrzeug erfassen. Geschäftliche Kilometer kommen
            automatisch aus dem Fahrtenbuch.
          </p>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>Monat</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => {
                const value = e.target.value;
                setMonth(value);
                if (monthlyVehicleId !== "none") loadMonthlyRow(monthlyVehicleId, value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Fahrzeug</Label>
            <Select value={monthlyVehicleId} onValueChange={(value) => loadMonthlyRow(value)}>
              <SelectTrigger className="min-w-0">
                <SelectValue placeholder="Fahrzeug auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Fahrzeug auswählen</SelectItem>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.vehicle_name} · {vehicle.license_plate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Km-Stand Monatsanfang</Label>
            <Input
              type="number"
              min="0"
              step="0.1"
              value={monthStartKm}
              onChange={(e) => setMonthStartKm(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Km-Stand Monatsende</Label>
            <Input
              type="number"
              min="0"
              step="0.1"
              value={monthEndKm}
              onChange={(e) => setMonthEndKm(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Gesamt gefahren</div>
            <div className="text-lg font-semibold">
              {monthlyTotalKm === null ? "–" : `${formatKm(monthlyTotalKm)} km`}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Geschäftlich laut Fahrtenbuch</div>
            <div className="text-lg font-semibold">{formatKm(businessKmForMonth)} km</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Privat gefahren</div>
            <div className="text-lg font-semibold">
              {privateOrUnloggedKm === null ? "–" : `${formatKm(privateOrUnloggedKm)} km`}
            </div>
          </div>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() => saveMonthly.mutate()}
          disabled={saveMonthly.isPending || monthlyVehicleId === "none"}
        >
          <Save className="size-4" /> Monatskilometer speichern
        </Button>
        {selectedMonthly ? (
          <p className="text-xs text-muted-foreground">
            Für diesen Monat existiert bereits ein Eintrag. Speichern aktualisiert ihn.
          </p>
        ) : null}
      </section>

      <FahrtenbuchSection1 state={state} />

      <section className="surface overflow-hidden print-area">
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Fahrtenbuch</h2>
          <p className="text-sm text-muted-foreground">
            Älteste Fahrten zuerst · Geschäftlich erfasst: {formatKm(totalKm)} km
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-b px-5 py-4 no-print">
          <div className="space-y-2">
            <Label htmlFor="fahrtenbuch-search-date">Fahrten nach Datum suchen</Label>
            <Input
              id="fahrtenbuch-search-date"
              type="date"
              value={searchDate}
              onChange={(event) => setSearchDate(event.target.value)}
            />
          </div>
          {searchDate ? (
            <Button variant="outline" onClick={() => setSearchDate("")}>
              Alle Fahrten anzeigen
            </Button>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {visibleEntries.length} Fahrten
            {searchDate ? ` am ${formatDate(searchDate)}` : " insgesamt"}
          </p>
        </div>
        {isLoading ? (
          <div className="p-5 text-sm text-muted-foreground">Fahrten werden geladen…</div>
        ) : visibleEntries.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {searchDate ? "Keine Fahrten an diesem Datum gefunden." : "Noch keine Fahrten erfasst."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Datum</th>
                  <th className="px-3 py-3">Zeit</th>
                  <th className="px-3 py-3">Rückkehr</th>
                  <th className="px-3 py-3">Fahrzeug</th>
                  <th className="px-3 py-3">Kennzeichen</th>
                  <th className="px-3 py-3 no-print">Fahrer / Mitarbeiter</th>
                  <th className="px-3 py-3">Fahrtart</th>
                  <th className="px-3 py-3">Von</th>
                  <th className="px-3 py-3">Kunde / Ziel / Zweck</th>
                  <th className="px-3 py-3">Nach</th>
                  <th className="px-3 py-3 text-right">Start-km</th>
                  <th className="px-3 py-3 text-right">End-km</th>
                  <th className="px-3 py-3 text-right">Strecke</th>
                  <th className="px-3 py-3">Bemerkung</th>
                  <th className="px-3 py-3 text-right no-print">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleEntries.map((entry) => {
                  const vehicle = vehicles.find((item) => item.id === entry.vehicle_id);
                  return (
                    <tr key={entry.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {formatDate(entry.trip_date)}
                      </td>
                      <td className="px-3 py-3">{formatTime(entry.trip_time)}</td>
                      <td className="px-3 py-3">{formatTime(entry.return_time)}</td>
                      <td className="px-3 py-3">{vehicle?.vehicle_name ?? "–"}</td>
                      <td className="px-3 py-3">{vehicle?.license_plate ?? "–"}</td>
                      <td className="px-3 py-3 no-print">
                        {drivers.find((driver) => driver.id === entry.employee_id)?.name ??
                          (entry.employee_id ? "Mitarbeiter nicht verfügbar" : "Nicht zugeordnet")}
                      </td>
                      <td className="px-3 py-3">{tripTypeLabel(entry.trip_type ?? "one_way")}</td>
                      <td className="px-3 py-3">{entry.from_location}</td>
                      <td className="px-3 py-3">{entry.customer_name || "–"}</td>
                      <td className="px-3 py-3">{entry.to_location}</td>
                      <td className="px-3 py-3 text-right">{formatKm(entry.start_km)}</td>
                      <td className="px-3 py-3 text-right">{formatKm(entry.end_km)}</td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatKm(entry.distance_km)} km
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{entry.notes || "–"}</td>
                      <td className="px-3 py-3 no-print">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => editEntry(entry)}
                            aria-label="Fahrt bearbeiten"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (window.confirm("Fahrt wirklich löschen?"))
                                removeTrip.mutate(entry.id);
                            }}
                            aria-label="Fahrt löschen"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
