import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
};

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function FahrtenbuchMitarbeiterErfassung({ employeeId, ownerUserId }: Props) {
  const queryClient = useQueryClient();
  const db = supabase as any;
  const [date, setDate] = useState(localDate());
  const [destination, setDestination] = useState("");
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");

  const { data: myTrips = [] } = useQuery({
    queryKey: ["my_fahrtenbuch_trips", employeeId],
    queryFn: async (): Promise<MyTrip[]> => {
      const { data, error } = await db
        .from("fahrtenbuch_entries")
        .select("id,trip_date,to_location,distance_km")
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
      if (!destination.trim()) throw new Error("Bitte Ziel / Kunde angeben.");
      if (!distance || distance <= 0) throw new Error("Bitte gefahrene Kilometer angeben.");
      const { error } = await db.from("fahrtenbuch_entries").insert({
        user_id: ownerUserId,
        employee_id: employeeId,
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

      <Button onClick={() => saveTrip.mutate()} disabled={saveTrip.isPending}>
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
                  {formatDate(trip.trip_date)} · {trip.to_location}
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