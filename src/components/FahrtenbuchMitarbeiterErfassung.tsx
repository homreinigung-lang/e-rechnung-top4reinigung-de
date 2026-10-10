import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { Car, Plus } from "lucide-react";
import { formatDate } from "@/lib/format";
import { getEmployeeFahrtenbuchOptions } from "@/lib/employee-fahrtenbuch.functions";

type Props = {
  employeeId: string;
  ownerUserId: string;
};

type MyTrip = {
  id: string;
  trip_date: string;
  to_location: string;
  distance_km: number;
  vehicle_id: string | null;
};

type Vehicle = { id: string; vehicle_name: string; license_plate: string };

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function FahrtenbuchMitarbeiterErfassung({ employeeId, ownerUserId }: Props) {
  const queryClient = useQueryClient();
  // The generated Supabase types do not yet include the Fahrtenbuch tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [date, setDate] = useState(localDate());
  const [destination, setDestination] = useState("");
  const [startKm, setStartKm] = useState("");
  const [endKm, setEndKm] = useState("");
  const [startTime, setStartTime] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [tripType, setTripType] = useState<"one_way" | "round_trip">("one_way");
  const [origin, setOrigin] = useState("");
  const [customer, setCustomer] = useState("");
  const [customerId, setCustomerId] = useState("none");
  const [taskId, setTaskId] = useState("none");
  const [startPointMode, setStartPointMode] = useState<"company" | "manual">("manual");
  const {
    data: options,
    isLoading: optionsLoading,
    isError: optionsError,
  } = useQuery({
    queryKey: ["employee_fahrtenbuch_options", employeeId, ownerUserId],
    queryFn: async () => {
      const result = await getEmployeeFahrtenbuchOptions();
      if (result.employeeId !== employeeId || result.ownerId !== ownerUserId)
        throw new Error("Mitarbeiterzugang hat sich geändert. Bitte Seite neu laden.");
      return result;
    },
  });
  const companyAddress = options?.companyAddress ?? "";
  const customers = options?.customers ?? [];
  const tasks = (options?.tasks ?? []).filter(
    (task) =>
      (!task.startDate || task.startDate <= date) && (!task.endDate || task.endDate >= date),
  );
  const effectiveOrigin = startPointMode === "company" ? companyAddress : origin;

  function selectCustomer(value: string) {
    setCustomerId(value);
    setTaskId("none");
    const selected = customers.find((item) => item.id === value);
    if (!selected) {
      setCustomer("");
      setDestination("");
      return;
    }
    setCustomer(selected.company?.trim() || selected.name?.trim() || "Kunde");
    setDestination(
      [
        selected.service_address_line?.trim() || selected.address_line?.trim(),
        [
          selected.service_postal_code?.trim() || selected.postal_code?.trim(),
          selected.service_city?.trim() || selected.city?.trim(),
        ]
          .filter(Boolean)
          .join(" "),
      ]
        .filter(Boolean)
        .join(", "),
    );
  }

  function selectTask(value: string) {
    setTaskId(value);
    const selected = tasks.find((item) => item.id === value);
    if (!selected) {
      setCustomerId("none");
      setCustomer("");
      setDestination("");
      return;
    }
    setCustomerId(selected.customerId ?? "none");
    setCustomer([selected.customerName, selected.name, selected.role].filter(Boolean).join(" · "));
    setDestination(selected.address);
  }
  const distance =
    startKm.trim() && endKm.trim()
      ? Number(endKm.replace(",", ".")) - Number(startKm.replace(",", "."))
      : null;
  const [notes, setNotes] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const {
    data: vehicles = [],
    isLoading: vehiclesLoading,
    isError: vehiclesError,
  } = useQuery({
    queryKey: ["fahrtenbuch_vehicles", ownerUserId],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await db
        .from("fahrtenbuch_vehicles")
        .select("id,vehicle_name,license_plate")
        .eq("user_id", ownerUserId)
        .order("vehicle_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: myTrips = [] } = useQuery({
    queryKey: ["my_fahrtenbuch_trips", employeeId],
    queryFn: async (): Promise<MyTrip[]> => {
      const { data, error } = await db
        .from("fahrtenbuch_entries")
        .select("id,trip_date,to_location,distance_km,vehicle_id")
        .eq("employee_id", employeeId)
        .order("trip_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveTrip = useMutation({
    mutationFn: async () => {
      const start = Number(startKm.replace(",", "."));
      const end = Number(endKm.replace(",", "."));
      if (!vehicles.some((vehicle) => vehicle.id === vehicleId)) {
        throw new Error("Bitte ein Fahrzeug auswählen.");
      }
      if (!date) throw new Error("Bitte Datum angeben.");
      if (!startTime) throw new Error("Bitte Startzeit eingeben.");
      if (tripType === "round_trip" && !returnTime) throw new Error("Bitte Rückkehrzeit eingeben.");
      if (!effectiveOrigin.trim()) throw new Error("Bitte Startpunkt eingeben.");
      if (!customer.trim()) throw new Error("Bitte Kunde, Ziel oder Zweck eingeben.");
      if (!destination.trim()) throw new Error("Bitte Zieladresse eingeben.");
      if (!startKm.trim() || !endKm.trim() || !Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error("Bitte gültige Kilometerstände eingeben.");
      }
      if (start < 0 || end < 0) throw new Error("Kilometerstände dürfen nicht negativ sein.");
      if (end < start) throw new Error("End-km muss größer oder gleich Start-km sein.");
      const { error } = await db.from("fahrtenbuch_entries").insert({
        user_id: ownerUserId,
        employee_id: employeeId,
        vehicle_id: vehicleId,
        trip_date: date,
        trip_time: startTime,
        return_time: tripType === "round_trip" ? returnTime : null,
        trip_type: tripType,
        from_location: effectiveOrigin.trim(),
        customer_id: customerId === "none" ? null : customerId,
        to_location: destination.trim(),
        customer_name: customer.trim(),
        start_km: start,
        end_km: end,
        notes: notes.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fahrt gespeichert.");
      setDestination("");
      setStartKm("");
      setEndKm("");
      setStartTime("");
      setReturnTime("");
      setTripType("one_way");
      setOrigin("");
      setCustomer("");
      setCustomerId("none");
      setTaskId("none");
      setNotes("");
      setDate(localDate());
      queryClient.invalidateQueries({ queryKey: ["my_fahrtenbuch_trips", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["fahrtenbuch"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Fahrt konnte nicht gespeichert werden.";
      toast.error(message);
    },
  });

  return (
    <section className="surface space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Car className="size-5" /> Fahrtenbuch
        </h2>
        <p className="text-sm text-muted-foreground">
          Erfasse deine Fahrt mit Uhrzeit, Startpunkt, Ziel und Kilometerständen. Änderungen oder
          Löschungen macht nur die Verwaltung.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Fahrer</Label>
        <Input value={options?.employeeName || (optionsLoading ? "Wird geladen…" : "Name nicht verfügbar")} readOnly />
        <p className="text-xs text-muted-foreground">Du wirst bei deiner Fahrt automatisch als Fahrer zugeordnet.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Fahrzeug</Label>
          <Select
            value={vehicleId}
            onValueChange={setVehicleId}
            disabled={vehiclesLoading || vehiclesError || vehicles.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Fahrzeug auswählen" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.vehicle_name || "Fahrzeug"} · {vehicle.license_plate}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {vehiclesError ? (
            <p className="text-sm text-destructive">Fahrzeuge konnten nicht geladen werden.</p>
          ) : null}
          {!vehiclesLoading && !vehiclesError && vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Die Verwaltung muss zuerst ein Fahrzeug im Fahrtenbuch anlegen.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label>Datum</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (taskId !== "none") {
                setTaskId("none");
                setCustomerId("none");
                setCustomer("");
                setDestination("");
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Startzeit</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Fahrtart</Label>
          <Select
            value={tripType}
            onValueChange={(value) => {
              setTripType(value as "one_way" | "round_trip");
              if (value === "one_way") setReturnTime("");
            }}
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
        {tripType === "round_trip" ? (
          <div className="space-y-2">
            <Label>Rückkehrzeit</Label>
            <Input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} />
          </div>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <Label>Von (Startpunkt)</Label>
          <Select
            value={startPointMode}
            onValueChange={(value) => setStartPointMode(value as "company" | "manual")}
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
              startPointMode === "company"
                ? "Firmenadresse"
                : "Startpunkt eingeben, z. B. Lager oder letzter Termin"
            }
            value={effectiveOrigin}
            readOnly={startPointMode === "company"}
            onChange={(e) => setOrigin(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {optionsLoading
              ? "Firmenadresse wird geladen…"
              : companyAddress
                ? `Firmenadresse: ${companyAddress}`
                : "Keine Firmenadresse verfügbar. Bitte Startpunkt manuell eingeben."}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Kunde auswählen (optional)</Label>
          <Select
            value={customerId}
            onValueChange={selectCustomer}
            disabled={optionsLoading || optionsError}
          >
            <SelectTrigger>
              <SelectValue placeholder="Kunde auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine Auswahl / manuell</SelectItem>
              {customers.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.company?.trim() || item.name?.trim() || "Kunde"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Einsatz / Aufgabe auswählen (optional)</Label>
          <Select
            value={taskId}
            onValueChange={selectTask}
            disabled={optionsLoading || optionsError}
          >
            <SelectTrigger>
              <SelectValue placeholder="Einsatz auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine Auswahl / manuell</SelectItem>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={task.id}>
                  {[task.customerName, task.name, task.role].filter(Boolean).join(" · ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!optionsLoading && !optionsError && tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Keine zugewiesenen Einsätze für dieses Datum. Fahrtzweck manuell eingeben.
            </p>
          ) : null}
        </div>
        {optionsError ? (
          <p className="text-sm text-destructive sm:col-span-2">
            Firmenadresse, Kunden und Einsätze konnten nicht geladen werden. Bitte Seite neu laden
            oder manuell eingeben.
          </p>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <Label>Kunde / Ziel / Zweck</Label>
          <Input
            placeholder="z. B. Kunde Müller, Besichtigung, Materialeinkauf"
            value={customer}
            onChange={(e) => {
              setCustomer(e.target.value);
              setCustomerId("none");
              setTaskId("none");
            }}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Nach (Ziel / Adresse)</Label>
          <Input
            placeholder="Straße, Hausnummer, PLZ, Ort"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Start-km</Label>
          <Input
            inputMode="decimal"
            placeholder="z. B. 12500,0"
            value={startKm}
            onChange={(e) => setStartKm(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>End-km</Label>
          <Input
            inputMode="decimal"
            placeholder="z. B. 12512,5"
            value={endKm}
            onChange={(e) => setEndKm(e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Strecke (automatisch)</Label>
          <div
            className="flex h-9 items-center rounded-md border bg-muted px-3 font-semibold"
            aria-live="polite"
          >
            {distance !== null && Number.isFinite(distance) && distance >= 0
              ? `${distance.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`
              : "–"}
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Bemerkung (optional)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <Button
        onClick={() => saveTrip.mutate()}
        disabled={saveTrip.isPending || vehiclesLoading || vehiclesError || vehicles.length === 0}
      >
        <Plus className="size-4" />
        {saveTrip.isPending ? "Speichern…" : "Fahrt speichern"}
      </Button>

      {myTrips.length > 0 ? (
        <div className="space-y-2 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground">Meine letzten Fahrten</p>
          <div className="space-y-1 text-sm">
            {myTrips.map((trip) => (
              <div
                key={trip.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span>
                  {formatDate(trip.trip_date)} · {trip.to_location} ·{" "}
                  {vehicles.find((vehicle) => vehicle.id === trip.vehicle_id)?.license_plate ??
                    "Fahrzeug unbekannt"}
                </span>
                <span className="font-semibold">{trip.distance_km} km</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
