import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Car, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/fahrtenbuch")({
  head: () => ({
    meta: [
      { title: "Fahrtenbuch – GebCalc" },
      {
        name: "description",
        content: "Geschäftliche Fahrten mit Start- und Endkilometer erfassen.",
      },
    ],
  }),
  component: Fahrtenbuch,
});

type FahrtenbuchEntry = {
  id: string;
  user_id: string;
  trip_date: string;
  from_location: string;
  customer_id: string | null;
  to_location: string;
  start_km: number;
  end_km: number;
  distance_km: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

type Customer = {
  id: string;
  name: string | null;
  company: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  service_address_line: string | null;
  service_postal_code: string | null;
  service_city: string | null;
};

type FormState = {
  id?: string;
  trip_date: string;
  from_location: string;
  customer_id: string;
  to_location: string;
  start_km: string;
  end_km: string;
  notes: string;
};

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const emptyForm = (): FormState => ({
  trip_date: todayIso(),
  from_location: "",
  customer_id: "none",
  to_location: "",
  start_km: "",
  end_km: "",
  notes: "",
});

function customerLabel(c: Customer) {
  return c.company?.trim() || c.name?.trim() || "Kunde";
}

function customerDestination(c: Customer) {
  const street = c.service_address_line?.trim() || c.address_line?.trim() || "";
  const postal = c.service_postal_code?.trim() || c.postal_code?.trim() || "";
  const city = c.service_city?.trim() || c.city?.trim() || "";
  const address = [street, [postal, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const name = customerLabel(c);
  return address ? `${name} – ${address}` : name;
}

function formatKm(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(n);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(`${date}T12:00:00`));
}

function Fahrtenbuch() {
  const queryClient = useQueryClient();
  const db = supabase as any;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: entries = [], isLoading } = useQuery<FahrtenbuchEntry[]>({
    queryKey: ["fahrtenbuch"],
    queryFn: async () => {
      const { data, error } = await db
        .from("fahrtenbuch_entries")
        .select("*")
        .order("trip_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FahrtenbuchEntry[];
    },
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers", "fahrtenbuch"],
    queryFn: async () => {
      const { data, error } = await db
        .from("customers")
        .select(
          "id,name,company,address_line,postal_code,city,service_address_line,service_postal_code,service_city",
        )
        .order("company", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const distance = useMemo(() => {
    const start = Number(form.start_km);
    const end = Number(form.end_km);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
    return Math.round((end - start) * 10) / 10;
  }, [form.start_km, form.end_km]);

  const totalKm = useMemo(
    () => entries.reduce((sum, entry) => sum + Number(entry.distance_km || 0), 0),
    [entries],
  );

  const latestEntry = entries[0];

  const save = useMutation({
    mutationFn: async (values: FormState) => {
      const startKm = Number(values.start_km);
      const endKm = Number(values.end_km);
      if (!values.trip_date) throw new Error("Bitte Datum eingeben.");
      if (!values.from_location.trim()) throw new Error("Bitte Startpunkt eingeben.");
      if (!values.to_location.trim()) throw new Error("Bitte Ziel eingeben.");
      if (!Number.isFinite(startKm) || !Number.isFinite(endKm)) {
        throw new Error("Bitte gültige Kilometerstände eingeben.");
      }
      if (startKm < 0 || endKm < 0) throw new Error("Kilometerstände dürfen nicht negativ sein.");
      if (endKm < startKm) throw new Error("End-km muss größer oder gleich Start-km sein.");

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const payload = {
        trip_date: values.trip_date,
        from_location: values.from_location.trim(),
        customer_id: values.customer_id === "none" ? null : values.customer_id,
        to_location: values.to_location.trim(),
        start_km: startKm,
        end_km: endKm,
        notes: values.notes.trim(),
        updated_at: new Date().toISOString(),
      };

      if (values.id) {
        const { error } = await db
          .from("fahrtenbuch_entries")
          .update(payload)
          .eq("id", values.id)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await db
          .from("fahrtenbuch_entries")
          .insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Fahrt aktualisiert" : "Fahrt gespeichert");
      setForm(emptyForm());
      queryClient.invalidateQueries({ queryKey: ["fahrtenbuch"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("fahrtenbuch_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fahrt gelöscht");
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["fahrtenbuch"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function selectCustomer(value: string) {
    if (value === "none") {
      setForm((current) => ({ ...current, customer_id: "none" }));
      return;
    }
    const customer = customers.find((item) => item.id === value);
    setForm((current) => ({
      ...current,
      customer_id: value,
      to_location: customer ? customerDestination(customer) : current.to_location,
    }));
  }

  function editEntry(entry: FahrtenbuchEntry) {
    setForm({
      id: entry.id,
      trip_date: entry.trip_date,
      from_location: entry.from_location,
      customer_id: entry.customer_id ?? "none",
      to_location: entry.to_location,
      start_km: String(entry.start_km),
      end_km: String(entry.end_km),
      notes: entry.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function useLastDestination() {
    if (!latestEntry) return;
    setForm((current) => ({
      ...current,
      from_location: latestEntry.to_location,
      start_km: String(latestEntry.end_km),
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Car className="size-7 text-primary" />
            <h1 className="text-3xl font-bold">Fahrtenbuch</h1>
          </div>
          <p className="mt-1 text-muted-foreground">
            Geschäftliche Fahrten erfassen. Die Strecke wird automatisch aus End-km minus Start-km berechnet.
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 text-right">
          <p className="text-xs text-muted-foreground">Gesamt erfasste Strecke</p>
          <p className="text-xl font-semibold">{formatKm(totalKm)} km</p>
        </div>
      </div>

      <section className="surface space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{form.id ? "Fahrt bearbeiten" : "Neue Fahrt"}</h2>
            <p className="text-sm text-muted-foreground">Start, Ziel und Kilometerstand eintragen.</p>
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="trip_date">Datum</Label>
            <Input
              id="trip_date"
              type="date"
              value={form.trip_date}
              onChange={(e) => setForm({ ...form, trip_date: e.target.value })}
            />
          </div>

          <div className="space-y-2 md:col-span-1 lg:col-span-2">
            <Label htmlFor="from_location">Von (Startpunkt)</Label>
            <Input
              id="from_location"
              placeholder="z. B. Betrieb, Lager oder letzter Kunde"
              value={form.from_location}
              onChange={(e) => setForm({ ...form, from_location: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Kunde / Einsatzort auswählen</Label>
            <Select value={form.customer_id} onValueChange={selectCustomer}>
              <SelectTrigger>
                <SelectValue placeholder="Kunde auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Manuelles Ziel</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customerLabel(customer)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-1 lg:col-span-2">
            <Label htmlFor="to_location">Nach (Ziel)</Label>
            <Input
              id="to_location"
              placeholder="Kunde / Objekt / Adresse"
              value={form.to_location}
              onChange={(e) => setForm({ ...form, to_location: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="start_km">Start-km</Label>
            <Input
              id="start_km"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="z. B. 12540"
              value={form.start_km}
              onChange={(e) => setForm({ ...form, start_km: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end_km">End-km</Label>
            <Input
              id="end_km"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="z. B. 12558"
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

          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <Label htmlFor="notes">Bemerkung (optional)</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="z. B. Kundentermin, Materiallieferung"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
          {form.id ? <Save className="size-4" /> : <Plus className="size-4" />}
          {save.isPending ? "Speichern…" : form.id ? "Änderungen speichern" : "Fahrt speichern"}
        </Button>
      </section>

      <section className="surface overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Fahrten</h2>
          <p className="text-sm text-muted-foreground">Neueste Fahrten zuerst.</p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-muted-foreground">Fahrten werden geladen…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Noch keine Fahrten erfasst.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Datum</th>
                  <th className="px-4 py-3 font-medium">Von</th>
                  <th className="px-4 py-3 font-medium">Nach</th>
                  <th className="px-4 py-3 text-right font-medium">Start-km</th>
                  <th className="px-4 py-3 text-right font-medium">End-km</th>
                  <th className="px-4 py-3 text-right font-medium">Strecke</th>
                  <th className="px-4 py-3 font-medium">Bemerkung</th>
                  <th className="px-4 py-3 text-right font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{formatDate(entry.trip_date)}</td>
                    <td className="px-4 py-3">{entry.from_location}</td>
                    <td className="px-4 py-3">{entry.to_location}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatKm(entry.start_km)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatKm(entry.end_km)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{formatKm(entry.distance_km)} km</td>
                    <td className="max-w-52 px-4 py-3 text-muted-foreground">{entry.notes || "–"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => editEntry(entry)} aria-label="Fahrt bearbeiten">
                          <Pencil className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setDeleteId(entry.id)} aria-label="Fahrt löschen">
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fahrt löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Fahrtenbucheintrag wird dauerhaft gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && remove.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
