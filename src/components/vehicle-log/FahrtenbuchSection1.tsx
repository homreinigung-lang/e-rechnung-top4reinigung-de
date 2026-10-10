import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Plus, RotateCcw, Save } from "lucide-react";
import { type TripType, emptyForm, customerLabel, formatKm } from "./shared";

import type { FahrtenbuchState } from "./useFahrtenbuchState";
export function FahrtenbuchSection1({ state }: { state: FahrtenbuchState }) {
  const {
    companyAddress,
    customers,
    distance,
    drivers,
    driversError,
    driversLoading,
    form,
    latestEntry,
    saveTrip,
    selectCustomer,
    setForm,
    setStartPointMode,
    startPointMode,
    useLastDestination,
    vehicles,
  } = state;
  return (
    <section className="surface min-w-0 space-y-5 p-4 sm:p-5 no-print">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{form.id ? "Fahrt bearbeiten" : "Neue Fahrt"}</h2>
          <p className="text-sm text-muted-foreground">
            Zeit, Fahrzeug, Ziel/Zweck und reale Kilometerstände eintragen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {latestEntry ? (
            <Button type="button" variant="outline" size="sm" onClick={useLastDestination}>
              <RotateCcw className="size-4" /> Letztes Ziel als Start
            </Button>
          ) : null}
          {form.id ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setForm(emptyForm())}>
              Abbrechen
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2">
          <Label>Fahrzeug / Kennzeichen</Label>
          <Select
            value={form.vehicle_id}
            onValueChange={(value) => setForm({ ...form, vehicle_id: value })}
          >
            <SelectTrigger>
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
          <Label>Fahrer / Mitarbeiter</Label>
          <Select
            value={form.employee_id}
            onValueChange={(value) => setForm({ ...form, employee_id: value })}
            disabled={driversLoading || driversError}
          >
            <SelectTrigger>
              <SelectValue placeholder="Fahrer auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nicht zugeordnet</SelectItem>
              {drivers.map((driver) => (
                <SelectItem key={driver.id} value={driver.id}>
                  {driver.name}
                  {driver.active ? "" : " (inaktiv)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Interne Zuordnung für die Verwaltung. Wird nicht exportiert.
          </p>
          {driversError ? (
            <p className="text-sm text-destructive">Fahrer konnten nicht geladen werden.</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label>Datum</Label>
          <Input
            type="date"
            value={form.trip_date}
            onChange={(e) => setForm({ ...form, trip_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Startzeit</Label>
          <Input
            type="time"
            value={form.trip_time}
            onChange={(e) => setForm({ ...form, trip_time: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Fahrtart</Label>
          <Select
            value={form.trip_type}
            onValueChange={(value) =>
              setForm({
                ...form,
                trip_type: value as TripType,
                return_time: value === "round_trip" ? form.return_time : "",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_way">Nur Hinfahrt</SelectItem>
              <SelectItem value="round_trip">Hin- und Rückfahrt</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.trip_type === "round_trip" ? (
          <div className="space-y-2">
            <Label>Rückkehrzeit</Label>
            <Input
              type="time"
              value={form.return_time}
              onChange={(e) => setForm({ ...form, return_time: e.target.value })}
            />
          </div>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <Label>Von (Startpunkt)</Label>
          <div className="grid min-w-0 gap-2 lg:grid-cols-[220px_minmax(0,1fr)]">
            <Select
              value={startPointMode}
              onValueChange={(value) => {
                const mode = value as "company" | "manual";
                setStartPointMode(mode);
                setForm((current) => ({
                  ...current,
                  from_location: mode === "company" ? companyAddress : "",
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Startpunkt wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company" disabled={!companyAddress}>
                  Firmenadresse
                </SelectItem>
                <SelectItem value="manual">Manuell eingeben</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder={
                startPointMode === "manual"
                  ? "Startpunkt eingeben, z. B. Lager oder letzter Termin"
                  : "Firmenadresse"
              }
              value={startPointMode === "company" ? companyAddress : form.from_location}
              readOnly={startPointMode === "company"}
              onChange={(e) => setForm({ ...form, from_location: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {companyAddress
              ? `Firmenadresse: ${companyAddress}`
              : "Keine Firmenadresse hinterlegt. Bitte den Startpunkt manuell eingeben."}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Kunde auswählen (optional)</Label>
          <Select value={form.customer_id} onValueChange={selectCustomer}>
            <SelectTrigger>
              <SelectValue placeholder="Kunde auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine Auswahl / manuell</SelectItem>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customerLabel(customer)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Kunde / Ziel / Zweck</Label>
          <Input
            placeholder="z. B. Besichtigung Saarlouis, Materialeinkauf, Kunde Müller"
            value={form.customer_name}
            onChange={(e) =>
              setForm({ ...form, customer_name: e.target.value, customer_id: "none" })
            }
          />
          <p className="text-xs text-muted-foreground">
            Freie Eingabe ist immer möglich; ein Kunde aus dem Kundenstamm ist nicht erforderlich.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2 xl:col-span-3">
          <Label>Nach (Ziel / Adresse)</Label>
          <Input
            placeholder="Straße, Hausnummer, PLZ, Ort"
            value={form.to_location}
            onChange={(e) => setForm({ ...form, to_location: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Start-km</Label>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={form.start_km}
            onChange={(e) => setForm({ ...form, start_km: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>End-km</Label>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={form.end_km}
            onChange={(e) => setForm({ ...form, end_km: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Strecke (automatisch)</Label>
          <div className="flex h-9 items-center rounded-md border bg-muted px-3 font-semibold">
            {formatKm(distance)} km
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2 xl:col-span-3">
          <Label>Bemerkung (optional)</Label>
          <Textarea
            rows={2}
            placeholder="Kundentermin, Besichtigung, Materiallieferung …"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </div>

      <Button
        onClick={() =>
          saveTrip.mutate({
            ...form,
            from_location: startPointMode === "company" ? companyAddress : form.from_location,
          })
        }
        disabled={saveTrip.isPending}
      >
        {form.id ? <Save className="size-4" /> : <Plus className="size-4" />}
        {saveTrip.isPending ? "Speichern…" : form.id ? "Änderungen speichern" : "Fahrt speichern"}
      </Button>
    </section>
  );
}
