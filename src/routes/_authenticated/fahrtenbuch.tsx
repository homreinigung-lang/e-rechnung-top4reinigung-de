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
import { toast } from "sonner";
import { saveFile } from "@/lib/download";
import {
  Car,
  Download,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/fahrtenbuch")({
  head: () => ({
    meta: [
      { title: "Fahrtenbuch – GebCalc" },
      {
        name: "description",
        content:
          "Geschäftliche Fahrten mit Fahrzeug, Zeit, Fahrtart, Ziel und Kilometerständen erfassen.",
      },
    ],
  }),
  component: Fahrtenbuch,
});

type TripType = "one_way" | "round_trip";

type FahrtenbuchEntry = {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  trip_date: string;
  trip_time: string | null;
  return_time: string | null;
  trip_type: TripType;
  from_location: string;
  customer_id: string | null;
  customer_name: string;
  to_location: string;
  start_km: number;
  end_km: number;
  distance_km: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

type Vehicle = {
  id: string;
  user_id: string;
  vehicle_name: string;
  license_plate: string;
};

type MonthlyOdometer = {
  id: string;
  user_id: string;
  vehicle_id: string;
  month: string;
  start_km: number;
  end_km: number | null;
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
  vehicle_id: string;
  trip_date: string;
  trip_time: string;
  return_time: string;
  trip_type: TripType;
  from_location: string;
  customer_id: string;
  customer_name: string;
  to_location: string;
  start_km: string;
  end_km: string;
  notes: string;
};

function localDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), month: iso.slice(0, 7) };
}

const emptyForm = (): FormState => {
  const now = localDateTime();
  return {
    vehicle_id: "none",
    trip_date: now.date,
    trip_time: now.time,
    return_time: "",
    trip_type: "one_way",
    from_location: "",
    customer_id: "none",
    customer_name: "",
    to_location: "",
    start_km: "",
    end_km: "",
    notes: "",
  };
};

function customerLabel(c: Customer) {
  return c.company?.trim() || c.name?.trim() || "Kunde";
}

function customerAddress(c: Customer) {
  const street = c.service_address_line?.trim() || c.address_line?.trim() || "";
  const postal = c.service_postal_code?.trim() || c.postal_code?.trim() || "";
  const city = c.service_city?.trim() || c.city?.trim() || "";
  return [street, [postal, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
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

function formatTime(time: string | null | undefined) {
  return time ? time.slice(0, 5) : "–";
}

function tripTypeLabel(type: TripType) {
  return type === "round_trip" ? "Hin- und Rückfahrt" : "Nur Hinfahrt";
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadText(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Fahrtenbuch() {
  const queryClient = useQueryClient();
  const db = supabase as any;
  const now = localDateTime();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [vehicleName, setVehicleName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [month, setMonth] = useState(now.month);
  const [monthlyVehicleId, setMonthlyVehicleId] = useState("none");
  const [monthStartKm, setMonthStartKm] = useState("");
  const [monthEndKm, setMonthEndKm] = useState("");

  const { data: entries = [], isLoading } = useQuery<FahrtenbuchEntry[]>({
    queryKey: ["fahrtenbuch"],
    queryFn: async () => {
      const { data, error } = await db
        .from("fahrtenbuch_entries")
        .select("*")
        .order("trip_date", { ascending: false })
        .order("trip_time", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FahrtenbuchEntry[];
    },
  });

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["fahrtenbuch_vehicles"],
    queryFn: async () => {
      const { data, error } = await db
        .from("fahrtenbuch_vehicles")
        .select("id,user_id,vehicle_name,license_plate")
        .order("vehicle_name");
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });

  const { data: monthlyRows = [] } = useQuery<MonthlyOdometer[]>({
    queryKey: ["fahrtenbuch_monthly_odometer"],
    queryFn: async () => {
      const { data, error } = await db
        .from("fahrtenbuch_monthly_odometer")
        .select("*")
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MonthlyOdometer[];
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

  const selectedMonthly = useMemo(
    () =>
      monthlyRows.find(
        (row) => row.vehicle_id === monthlyVehicleId && row.month.slice(0, 7) === month,
      ),
    [monthlyRows, monthlyVehicleId, month],
  );

  const businessKmForMonth = useMemo(() => {
    if (monthlyVehicleId === "none") return 0;
    return entries
      .filter(
        (entry) =>
          entry.vehicle_id === monthlyVehicleId && entry.trip_date.slice(0, 7) === month,
      )
      .reduce((sum, entry) => sum + Number(entry.distance_km || 0), 0);
  }, [entries, monthlyVehicleId, month]);

  const monthlyTotalKm = useMemo(() => {
    const start = Number(monthStartKm);
    const end = Number(monthEndKm);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.round((end - start) * 10) / 10;
  }, [monthStartKm, monthEndKm]);

  const privateOrUnloggedKm =
    monthlyTotalKm === null ? null : Math.max(0, monthlyTotalKm - businessKmForMonth);

  const latestEntry = entries[0];

  const saveVehicle = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      if (!vehicleName.trim()) throw new Error("Bitte Fahrzeugbezeichnung eingeben.");
      if (!licensePlate.trim()) throw new Error("Bitte Kennzeichen eingeben.");
      const { error } = await db.from("fahrtenbuch_vehicles").insert({
        user_id: userId,
        vehicle_name: vehicleName.trim(),
        license_plate: licensePlate.trim().toUpperCase(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fahrzeug gespeichert");
      setVehicleName("");
      setLicensePlate("");
      queryClient.invalidateQueries({ queryKey: ["fahrtenbuch_vehicles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMonthly = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      if (monthlyVehicleId === "none") throw new Error("Bitte Fahrzeug auswählen.");
      const start = Number(monthStartKm);
      const end = monthEndKm.trim() === "" ? null : Number(monthEndKm);
      if (!Number.isFinite(start) || start < 0) throw new Error("Ungültiger Monatsanfangs-km-Stand.");
      if (end !== null && (!Number.isFinite(end) || end < start)) {
        throw new Error("Monatsend-km muss größer oder gleich Monatsanfang sein.");
      }
      const payload = {
        user_id: userId,
        vehicle_id: monthlyVehicleId,
        month: `${month}-01`,
        start_km: start,
        end_km: end,
        updated_at: new Date().toISOString(),
      };
      const { error } = await db
        .from("fahrtenbuch_monthly_odometer")
        .upsert(payload, { onConflict: "user_id,vehicle_id,month" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Monatskilometer gespeichert");
      queryClient.invalidateQueries({ queryKey: ["fahrtenbuch_monthly_odometer"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTrip = useMutation({
    mutationFn: async (values: FormState) => {
      const startKm = Number(values.start_km);
      const endKm = Number(values.end_km);
      if (values.vehicle_id === "none") throw new Error("Bitte Fahrzeug auswählen.");
      if (!values.trip_date) throw new Error("Bitte Datum eingeben.");
      if (!values.trip_time) throw new Error("Bitte Startzeit eingeben.");
      if (values.trip_type === "round_trip" && !values.return_time) {
        throw new Error("Bitte Rückkehrzeit eingeben.");
      }
      if (!values.from_location.trim()) throw new Error("Bitte Startpunkt eingeben.");
      if (!values.customer_name.trim()) throw new Error("Bitte Kunde, Ziel oder Zweck eingeben.");
      if (!values.to_location.trim()) throw new Error("Bitte Zieladresse eingeben.");
      if (!Number.isFinite(startKm) || !Number.isFinite(endKm)) {
        throw new Error("Bitte gültige Kilometerstände eingeben.");
      }
      if (startKm < 0 || endKm < 0) throw new Error("Kilometerstände dürfen nicht negativ sein.");
      if (endKm < startKm) throw new Error("End-km muss größer oder gleich Start-km sein.");

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const payload = {
        vehicle_id: values.vehicle_id,
        trip_date: values.trip_date,
        trip_time: values.trip_time,
        return_time: values.trip_type === "round_trip" ? values.return_time : null,
        trip_type: values.trip_type,
        from_location: values.from_location.trim(),
        customer_id: values.customer_id === "none" ? null : values.customer_id,
        customer_name: values.customer_name.trim(),
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

  const removeTrip = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("fahrtenbuch_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fahrt gelöscht");
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
      customer_name: customer ? customerLabel(customer) : current.customer_name,
      to_location: customer ? customerAddress(customer) : current.to_location,
    }));
  }

  function editEntry(entry: FahrtenbuchEntry) {
    setForm({
      id: entry.id,
      vehicle_id: entry.vehicle_id ?? "none",
      trip_date: entry.trip_date,
      trip_time: entry.trip_time?.slice(0, 5) ?? "",
      return_time: entry.return_time?.slice(0, 5) ?? "",
      trip_type: entry.trip_type ?? "one_way",
      from_location: entry.from_location,
      customer_id: entry.customer_id ?? "none",
      customer_name: entry.customer_name ?? "",
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
      vehicle_id: latestEntry.vehicle_id ?? current.vehicle_id,
      from_location: latestEntry.to_location,
      start_km: String(latestEntry.end_km),
    }));
  }

  function loadMonthlyRow(vehicleId: string, selectedMonth = month) {
    setMonthlyVehicleId(vehicleId);
    const row = monthlyRows.find(
      (item) => item.vehicle_id === vehicleId && item.month.slice(0, 7) === selectedMonth,
    );
    setMonthStartKm(row ? String(row.start_km) : "");
    setMonthEndKm(row?.end_km == null ? "" : String(row.end_km));
  }

  function exportCsv() {
    const header = [
      "Datum",
      "Startzeit",
      "Rückkehrzeit",
      "Fahrtart",
      "Fahrzeug",
      "Kennzeichen",
      "Von",
      "Kunde / Ziel / Zweck",
      "Zieladresse",
      "Start-km",
      "End-km",
      "Geschäftliche km",
      "Bemerkung",
    ];
    const rows = entries.map((entry) => {
      const vehicle = vehicles.find((item) => item.id === entry.vehicle_id);
      return [
        formatDate(entry.trip_date),
        formatTime(entry.trip_time),
        formatTime(entry.return_time),
        tripTypeLabel(entry.trip_type),
        vehicle?.vehicle_name ?? "",
        vehicle?.license_plate ?? "",
        entry.from_location,
        entry.customer_name,
        entry.to_location,
        entry.start_km,
        entry.end_km,
        entry.distance_km,
        entry.notes,
      ];
    });
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
    downloadText(`Fahrtenbuch_${now.date}.csv`, csv, "text/csv;charset=utf-8");
  }

  async function exportPdf() {
            if (entries.length === 0) {
              toast.error("Keine Fahrten vorhanden.");
              return;
            }
            try {
              // Same PDF renderer and the same row fields as the Steuerberater export.
              const { buildAccountantFahrtenbuchPdf } = await import("@/lib/fahrtenbuch-accountant-pdf");
              const rows = [...entries].sort((a, b) =>
                `${a.trip_date} ${a.trip_time ?? ""}`.localeCompare(`${b.trip_date} ${b.trip_time ?? ""}`),
              ).map((entry) => {
                const vehicle = vehicles.find((item) => item.id === entry.vehicle_id);
                return {
                  Datum: formatDate(entry.trip_date),
                  Startzeit: String(entry.trip_time ?? "").slice(0, 5),
                  Rückkehrzeit: String(entry.return_time ?? "").slice(0, 5),
                  Fahrtart: tripTypeLabel(entry.trip_type),
                  Fahrzeug: vehicle?.vehicle_name ?? "",
                  Kennzeichen: vehicle?.license_plate ?? "",
                  Von: entry.from_location,
                  "Kunde / Ziel / Zweck": entry.customer_name,
                  Zieladresse: entry.to_location,
                  "Start-km": String(entry.start_km),
                  "End-km": String(entry.end_km),
                  "Geschäftliche km": String(entry.distance_km),
                  Bemerkung: entry.notes ?? "",
                };
              });
              const from = rows.length ? [...entries].map((e) => e.trip_date).sort()[0]! : now.date;
              const to = rows.length ? [...entries].map((e) => e.trip_date).sort().at(-1)! : now.date;
              await saveFile(buildAccountantFahrtenbuchPdf(rows, from, to), `Fahrtenbuch_${from}_${to}.pdf`);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Fahrtenbuch-PDF konnte nicht erstellt werden.");
            }
          }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <Car className="size-7 text-primary" />
            <h1 className="text-3xl font-bold">Fahrtenbuch</h1>
          </div>
          <p className="mt-1 text-muted-foreground">
            Geschäftliche Fahrten, Fahrzeuge und monatliche Kilometerstände vollständig dokumentieren.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => void exportPdf()} disabled={isLoading || entries.length === 0}>
            <FileText className="size-4" /> Fahrtenbuch PDF herunterladen
          </Button>
          <div className="rounded-lg border bg-card px-4 py-3 text-right">
            <p className="text-xs text-muted-foreground">Geschäftlich erfasst</p>
            <p className="text-xl font-semibold">{formatKm(totalKm)} km</p>
          </div>
        </div>
      </div>

      <section className="surface space-y-4 p-5 no-print">
        <div>
          <h2 className="text-lg font-semibold">Fahrzeuge</h2>
          <p className="text-sm text-muted-foreground">Fahrzeug und Kennzeichen einmal anlegen und danach bei jeder Fahrt auswählen.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="Fahrzeug, z. B. VW Caddy" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} />
          <Input placeholder="Kennzeichen, z. B. VK-HR 123" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} />
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

      <section className="surface space-y-4 p-5 no-print">
        <div>
          <h2 className="text-lg font-semibold">Monatskilometer</h2>
          <p className="text-sm text-muted-foreground">
            Monatsanfang und Monatsende je Fahrzeug erfassen. Geschäftliche Kilometer kommen automatisch aus dem Fahrtenbuch.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <SelectTrigger><SelectValue placeholder="Fahrzeug auswählen" /></SelectTrigger>
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
            <Input type="number" min="0" step="0.1" value={monthStartKm} onChange={(e) => setMonthStartKm(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Km-Stand Monatsende</Label>
            <Input type="number" min="0" step="0.1" value={monthEndKm} onChange={(e) => setMonthEndKm(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Gesamt gefahren</div><div className="text-lg font-semibold">{monthlyTotalKm === null ? "–" : `${formatKm(monthlyTotalKm)} km`}</div></div>
          <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Geschäftlich laut Fahrtenbuch</div><div className="text-lg font-semibold">{formatKm(businessKmForMonth)} km</div></div>
          <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Privat / sonstig / nicht erfasst</div><div className="text-lg font-semibold">{privateOrUnloggedKm === null ? "–" : `${formatKm(privateOrUnloggedKm)} km`}</div></div>
        </div>
        <Button onClick={() => saveMonthly.mutate()} disabled={saveMonthly.isPending || monthlyVehicleId === "none"}>
          <Save className="size-4" /> Monatskilometer speichern
        </Button>
        {selectedMonthly ? <p className="text-xs text-muted-foreground">Für diesen Monat existiert bereits ein Eintrag. Speichern aktualisiert ihn.</p> : null}
      </section>

      <section className="surface space-y-5 p-5 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{form.id ? "Fahrt bearbeiten" : "Neue Fahrt"}</h2>
            <p className="text-sm text-muted-foreground">Zeit, Fahrzeug, Ziel/Zweck und reale Kilometerstände eintragen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {latestEntry ? (
              <Button type="button" variant="outline" size="sm" onClick={useLastDestination}>
                <RotateCcw className="size-4" /> Letztes Ziel als Start
              </Button>
            ) : null}
            {form.id ? <Button type="button" variant="ghost" size="sm" onClick={() => setForm(emptyForm())}>Abbrechen</Button> : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Fahrzeug / Kennzeichen</Label>
            <Select value={form.vehicle_id} onValueChange={(value) => setForm({ ...form, vehicle_id: value })}>
              <SelectTrigger><SelectValue placeholder="Fahrzeug auswählen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Fahrzeug auswählen</SelectItem>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_name} · {vehicle.license_plate}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Datum</Label><Input type="date" value={form.trip_date} onChange={(e) => setForm({ ...form, trip_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Startzeit</Label><Input type="time" value={form.trip_time} onChange={(e) => setForm({ ...form, trip_time: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Fahrtart</Label>
            <Select value={form.trip_type} onValueChange={(value) => setForm({ ...form, trip_type: value as TripType, return_time: value === "round_trip" ? form.return_time : "" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="one_way">Nur Hinfahrt</SelectItem><SelectItem value="round_trip">Hin- und Rückfahrt</SelectItem></SelectContent>
            </Select>
          </div>
          {form.trip_type === "round_trip" ? <div className="space-y-2"><Label>Rückkehrzeit</Label><Input type="time" value={form.return_time} onChange={(e) => setForm({ ...form, return_time: e.target.value })} /></div> : null}
          <div className="space-y-2 md:col-span-2"><Label>Von (Startpunkt)</Label><Input placeholder="Betrieb, Lager oder letzter Termin" value={form.from_location} onChange={(e) => setForm({ ...form, from_location: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Kunde auswählen (optional)</Label>
            <Select value={form.customer_id} onValueChange={selectCustomer}>
              <SelectTrigger><SelectValue placeholder="Kunde auswählen" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Keine Auswahl / manuell</SelectItem>{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customerLabel(customer)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2"><Label>Kunde / Ziel / Zweck</Label><Input placeholder="z. B. Besichtigung Saarlouis, Materialeinkauf, Kunde Müller" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value, customer_id: "none" })} /><p className="text-xs text-muted-foreground">Freie Eingabe ist immer möglich; ein Kunde aus dem Kundenstamm ist nicht erforderlich.</p></div>
          <div className="space-y-2 md:col-span-3"><Label>Nach (Ziel / Adresse)</Label><Input placeholder="Straße, Hausnummer, PLZ, Ort" value={form.to_location} onChange={(e) => setForm({ ...form, to_location: e.target.value })} /></div>
          <div className="space-y-2"><Label>Start-km</Label><Input type="number" min="0" step="0.1" value={form.start_km} onChange={(e) => setForm({ ...form, start_km: e.target.value })} /></div>
          <div className="space-y-2"><Label>End-km</Label><Input type="number" min="0" step="0.1" value={form.end_km} onChange={(e) => setForm({ ...form, end_km: e.target.value })} /></div>
          <div className="space-y-2"><Label>Strecke (automatisch)</Label><div className="flex h-9 items-center rounded-md border bg-muted px-3 font-semibold">{formatKm(distance)} km</div></div>
          <div className="space-y-2 md:col-span-3"><Label>Bemerkung (optional)</Label><Textarea rows={2} placeholder="Kundentermin, Besichtigung, Materiallieferung …" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>

        <Button onClick={() => saveTrip.mutate(form)} disabled={saveTrip.isPending}>
          {form.id ? <Save className="size-4" /> : <Plus className="size-4" />}
          {saveTrip.isPending ? "Speichern…" : form.id ? "Änderungen speichern" : "Fahrt speichern"}
        </Button>
      </section>

      <section className="surface overflow-hidden print-area">
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Fahrtenbuch</h2>
          <p className="text-sm text-muted-foreground">Neueste Fahrten zuerst · Geschäftlich erfasst: {formatKm(totalKm)} km</p>
        </div>
        {isLoading ? <div className="p-5 text-sm text-muted-foreground">Fahrten werden geladen…</div> : entries.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Noch keine Fahrten erfasst.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-3">Datum</th><th className="px-3 py-3">Zeit</th><th className="px-3 py-3">Rückkehr</th><th className="px-3 py-3">Fahrzeug</th><th className="px-3 py-3">Kennzeichen</th><th className="px-3 py-3">Fahrtart</th><th className="px-3 py-3">Von</th><th className="px-3 py-3">Kunde / Ziel / Zweck</th><th className="px-3 py-3">Nach</th><th className="px-3 py-3 text-right">Start-km</th><th className="px-3 py-3 text-right">End-km</th><th className="px-3 py-3 text-right">Strecke</th><th className="px-3 py-3">Bemerkung</th><th className="px-3 py-3 text-right no-print">Aktionen</th></tr></thead>
              <tbody className="divide-y">{entries.map((entry) => { const vehicle = vehicles.find((item) => item.id === entry.vehicle_id); return <tr key={entry.id} className="align-top"><td className="whitespace-nowrap px-3 py-3 font-medium">{formatDate(entry.trip_date)}</td><td className="px-3 py-3">{formatTime(entry.trip_time)}</td><td className="px-3 py-3">{formatTime(entry.return_time)}</td><td className="px-3 py-3">{vehicle?.vehicle_name ?? "–"}</td><td className="px-3 py-3">{vehicle?.license_plate ?? "–"}</td><td className="px-3 py-3">{tripTypeLabel(entry.trip_type ?? "one_way")}</td><td className="px-3 py-3">{entry.from_location}</td><td className="px-3 py-3">{entry.customer_name || "–"}</td><td className="px-3 py-3">{entry.to_location}</td><td className="px-3 py-3 text-right">{formatKm(entry.start_km)}</td><td className="px-3 py-3 text-right">{formatKm(entry.end_km)}</td><td className="px-3 py-3 text-right font-semibold">{formatKm(entry.distance_km)} km</td><td className="px-3 py-3 text-muted-foreground">{entry.notes || "–"}</td><td className="px-3 py-3 no-print"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => editEntry(entry)} aria-label="Fahrt bearbeiten"><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => { if (window.confirm("Fahrt wirklich löschen?")) removeTrip.mutate(entry.id); }} aria-label="Fahrt löschen"><Trash2 className="size-4 text-destructive" /></Button></div></td></tr>; })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
