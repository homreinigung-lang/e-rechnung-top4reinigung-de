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
  const [km, setKm] = useState("");
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
      const distance = Number(km.replace(",", "."));
      if (!vehicles.some((vehicle) => vehicle.id === vehicleId)) {
        throw new Error("Bitte ein Fahrzeug auswählen.");
      }
      if (!date) throw new Error("Bitte Datum angeben.");
      if (!destination.trim()) throw new Error("Bitte Ziel / Kunde angeben.");
      if (
        !Number.isFinite(distance) ||
        distance <= 0 ||
        Math.round(distance * 10) !== distance * 10
      ) {
        throw new Error("Bitte gültige Kilometer mit höchstens einer Nachkommastelle angeben.");
      }
      const { error } = await db.from("fahrtenbuch_entries").insert({
        user_id: ownerUserId,
        employee_id: employeeId,
        vehicle_id: vehicleId,
        trip_date: date,
        from_location: "",
        to_location: destination.trim(),
        customer_name: destination.trim(),
        start_km: 0,
        end_km: distance,
        notes: notes.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fahrt gespeichert.");
      setDestination("");
      setKm("");
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
          <Car className="size-5" /> Kilometer erfassen
        </h2>
        <p className="text-sm text-muted-foreground">
          Trag hier die Kilometer ein, wenn du zu einem Kunden oder Einsatz fährst. Änderungen oder
          Löschungen macht nur die Verwaltung.
        </p>
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
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Gefahrene Kilometer</Label>
          <Input
            inputMode="decimal"
            placeholder="z. B. 12,5"
            value={km}
            onChange={(e) => setKm(e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Ziel / Kunde</Label>
          <Input
            placeholder="z. B. Kunde Müller, Saarlouis"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
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
