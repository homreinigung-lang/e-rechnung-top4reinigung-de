import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { saveFile } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/steuerberater/fahrtenbuch")({
  head: () => ({ meta: [{ title: "Fahrtenbuch – Steuerberater" }] }),
  component: SteuerberaterFahrtenbuch,
});

type Trip = {
  id: string;
  vehicle_id: string | null;
  trip_date: string;
  trip_time: string | null;
  return_time: string | null;
  trip_type: "one_way" | "round_trip";
  from_location: string;
  customer_name: string;
  to_location: string;
  start_km: number;
  end_km: number;
  distance_km: number;
  notes: string;
};

type Vehicle = { id: string; vehicle_name: string; license_plate: string };
type Monthly = {
  id: string;
  vehicle_id: string;
  month: string;
  start_km: number;
  end_km: number | null;
};

function deKm(value: number | string | null | undefined) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(Number(value ?? 0));
}

function deDate(value: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(`${value}T12:00:00`));
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function downloadCsv(name: string, rows: unknown[][]) {
  if (rows.length <= 1) {
    toast.error("Keine Fahrten im gewählten Zeitraum.");
    return;
  }
  const csv = "\uFEFF" + rows.map((r) => r.map(csvEscape).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  await saveFile(blob, name);
}

async function buildPdf(
  from: string,
  to: string,
  trips: Trip[],
  vehicles: Vehicle[],
  monthSummaries: Array<{
    row: Monthly;
    vehicle: Vehicle | undefined;
    business: number;
    total: number | null;
    other: number | null;
  }>,
) {
  if (trips.length === 0) {
    toast.error("Keine Fahrten im gewählten Zeitraum.");
    return;
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 10;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 13;

  const addHeader = () => {
    doc.setFontSize(15);
    doc.text(`Fahrtenbuch ${deDate(from)} – ${deDate(to)}`, margin, y);
    y += 7;
    doc.setFontSize(8);
    doc.text(
      "Datum | Zeit | Rückkehr | Fahrzeug | Kennzeichen | Fahrtart | Von | Ziel/Zweck | Nach | Start-km | End-km | km",
      margin,
      y,
    );
    y += 5;
  };

  const ensureSpace = (needed = 6) => {
    if (y + needed > pageHeight - 10) {
      doc.addPage();
      y = 13;
      addHeader();
    }
  };

  addHeader();
  doc.setFontSize(7);
  trips.forEach((trip) => {
    ensureSpace(6);
    const vehicle = vehicles.find((v) => v.id === trip.vehicle_id);
    const cells = [
      deDate(trip.trip_date),
      trip.trip_time?.slice(0, 5) ?? "–",
      trip.return_time?.slice(0, 5) ?? "–",
      vehicle?.vehicle_name ?? "–",
      vehicle?.license_plate ?? "–",
      trip.trip_type === "round_trip" ? "Hin+Rück" : "Hinfahrt",
      trip.from_location,
      trip.customer_name,
      trip.to_location,
      deKm(trip.start_km),
      deKm(trip.end_km),
      deKm(trip.distance_km),
    ];
    const widths = [18, 12, 14, 24, 20, 16, 29, 40, 29, 18, 18, 12];
    let x = margin;
    cells.forEach((value, i) => {
      const text = doc.splitTextToSize(String(value ?? ""), widths[i]! - 1)[0] ?? "";
      doc.text(text, x, y);
      x += widths[i]!;
    });
    y += 5;
  });

  ensureSpace(18);
  y += 3;
  doc.setFontSize(10);
  doc.text("Monatsabgleich je Fahrzeug", margin, y);
  y += 6;
  doc.setFontSize(7);
  monthSummaries.forEach(({ row, vehicle, total, business, other }) => {
    ensureSpace(5);
    const line = [
      row.month.slice(0, 7),
      vehicle?.vehicle_name ?? "–",
      vehicle?.license_plate ?? "–",
      `Anfang ${deKm(row.start_km)}`,
      `Ende ${row.end_km == null ? "–" : deKm(row.end_km)}`,
      `Gesamt ${total == null ? "–" : `${deKm(total)} km`}`,
      `Geschäftlich ${deKm(business)} km`,
      `Privat/sonstig ${other == null ? "–" : `${deKm(other)} km`}`,
    ].join("   |   ");
    doc.text(doc.splitTextToSize(line, pageWidth - margin * 2), margin, y);
    y += 5;
  });

  const blob = doc.output("blob");
  await saveFile(blob, `Fahrtenbuch_${from}_${to}.pdf`);
}

function SteuerberaterFahrtenbuch() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const db = supabase as any;

  const { data: trips = [], error: tripsError } = useQuery<Trip[]>({
    queryKey: ["stb_fahrtenbuch", from, to],
    queryFn: async () => {
      const { data, error } = await db
        .from("fahrtenbuch_entries")
        .select("*")
        .gte("trip_date", from)
        .lte("trip_date", to)
        .order("trip_date")
        .order("trip_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: vehicles = [], error: vehiclesError } = useQuery<Vehicle[]>({
    queryKey: ["stb_fahrtenbuch_vehicles"],
    queryFn: async () => {
      const { data, error } = await db
        .from("fahrtenbuch_vehicles")
        .select("id,vehicle_name,license_plate")
        .order("vehicle_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: monthly = [], error: monthlyError } = useQuery<Monthly[]>({
    queryKey: ["stb_fahrtenbuch_monthly"],
    queryFn: async () => {
      const { data, error } = await db
        .from("fahrtenbuch_monthly_odometer")
        .select("*")
        .order("month");
      if (error) throw error;
      return data ?? [];
    },
  });

  const loadError = tripsError || vehiclesError || monthlyError;

  const totalBusinessKm = useMemo(
    () => trips.reduce((sum, trip) => sum + Number(trip.distance_km || 0), 0),
    [trips],
  );

  const monthSummaries = useMemo(() => {
    const startMonth = from.slice(0, 7);
    const endMonth = to.slice(0, 7);
    return monthly
      .filter((row) => row.month.slice(0, 7) >= startMonth && row.month.slice(0, 7) <= endMonth)
      .map((row) => {
        const vehicle = vehicles.find((v) => v.id === row.vehicle_id);
        const key = row.month.slice(0, 7);
        const business = trips
          .filter((t) => t.vehicle_id === row.vehicle_id && t.trip_date.slice(0, 7) === key)
          .reduce((sum, t) => sum + Number(t.distance_km || 0), 0);
        const total = row.end_km == null ? null : Number(row.end_km) - Number(row.start_km);
        const other = total == null ? null : Math.max(0, total - business);
        return { row, vehicle, business, total, other };
      });
  }, [monthly, vehicles, trips, from, to]);

  async function tripCsv() {
    const rows: unknown[][] = [[
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
    ]];
    trips.forEach((trip) => {
      const vehicle = vehicles.find((v) => v.id === trip.vehicle_id);
      rows.push([
        deDate(trip.trip_date),
        trip.trip_time?.slice(0, 5) ?? "",
        trip.return_time?.slice(0, 5) ?? "",
        trip.trip_type === "round_trip" ? "Hin- und Rückfahrt" : "Nur Hinfahrt",
        vehicle?.vehicle_name ?? "",
        vehicle?.license_plate ?? "",
        trip.from_location,
        trip.customer_name,
        trip.to_location,
        trip.start_km,
        trip.end_km,
        trip.distance_km,
        trip.notes,
      ]);
    });
    await downloadCsv(`Fahrtenbuch_${from}_${to}.csv`, rows);
  }

  async function monthlyCsv() {
    const rows: unknown[][] = [[
      "Monat",
      "Fahrzeug",
      "Kennzeichen",
      "Km Monatsanfang",
      "Km Monatsende",
      "Gesamt gefahren",
      "Geschäftlich",
      "Privat / sonstig / nicht erfasst",
    ]];
    monthSummaries.forEach(({ row, vehicle, total, business, other }) =>
      rows.push([
        row.month.slice(0, 7),
        vehicle?.vehicle_name ?? "",
        vehicle?.license_plate ?? "",
        row.start_km,
        row.end_km ?? "",
        total ?? "",
        business,
        other ?? "",
      ]),
    );
    if (rows.length <= 1) {
      toast.error("Keine Monatsstände im gewählten Zeitraum.");
      return;
    }
    await downloadCsv(`Fahrtenbuch_Monatsuebersicht_${from}_${to}.csv`, rows);
  }

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="text-2xl font-semibold">Steuerberater · Fahrtenbuch</h1>
        <p className="text-sm text-muted-foreground">
          Geschäftliche Fahrten und Monatsabgleich je Fahrzeug für den gewählten Zeitraum.
        </p>
      </div>

      {loadError ? (
        <div className="no-print rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Fahrtenbuch-Daten konnten nicht geladen werden: {loadError instanceof Error ? loadError.message : "Unbekannter Fehler"}
        </div>
      ) : null}

      <section className="no-print grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Zeitraum von</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Zeitraum bis</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button asChild variant="outline">
            <Link to="/fahrtenbuch">Fahrten und Fahrzeuge verwalten</Link>
          </Button>
          <Button onClick={() => void tripCsv()}>
            <Download className="size-4" /> Fahrtenbuch CSV
          </Button>
          <Button variant="outline" onClick={() => void monthlyCsv()}>
            <Download className="size-4" /> Monatsübersicht CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => void buildPdf(from, to, trips, vehicles, monthSummaries)}
          >
            <FileText className="size-4" /> Fahrtenbuch PDF herunterladen
          </Button>
        </div>
      </section>

      <section className="print-area rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">
          Fahrtenbuch {deDate(from)} – {deDate(to)}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Geschäftlich erfasste Kilometer: <strong>{deKm(totalBusinessKm)} km</strong>
        </p>
        {trips.length === 0 && !loadError ? (
          <p className="mt-4 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            Im gewählten Zeitraum sind keine Fahrten erfasst.
          </p>
        ) : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1250px] text-sm">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th className="p-2">Datum</th>
                <th className="p-2">Zeit</th>
                <th className="p-2">Rückkehr</th>
                <th className="p-2">Fahrzeug</th>
                <th className="p-2">Kennzeichen</th>
                <th className="p-2">Fahrtart</th>
                <th className="p-2">Von</th>
                <th className="p-2">Ziel / Zweck</th>
                <th className="p-2">Nach</th>
                <th className="p-2 text-right">Start-km</th>
                <th className="p-2 text-right">End-km</th>
                <th className="p-2 text-right">km</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {trips.map((trip) => {
                const vehicle = vehicles.find((v) => v.id === trip.vehicle_id);
                return (
                  <tr key={trip.id}>
                    <td className="p-2">{deDate(trip.trip_date)}</td>
                    <td className="p-2">{trip.trip_time?.slice(0, 5) ?? "–"}</td>
                    <td className="p-2">{trip.return_time?.slice(0, 5) ?? "–"}</td>
                    <td className="p-2">{vehicle?.vehicle_name ?? "–"}</td>
                    <td className="p-2">{vehicle?.license_plate ?? "–"}</td>
                    <td className="p-2">{trip.trip_type === "round_trip" ? "Hin + Rück" : "Hinfahrt"}</td>
                    <td className="p-2">{trip.from_location}</td>
                    <td className="p-2">{trip.customer_name}</td>
                    <td className="p-2">{trip.to_location}</td>
                    <td className="p-2 text-right">{deKm(trip.start_km)}</td>
                    <td className="p-2 text-right">{deKm(trip.end_km)}</td>
                    <td className="p-2 text-right font-semibold">{deKm(trip.distance_km)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="print-area rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">Monatsabgleich je Fahrzeug</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Differenz aus Monatsendstand minus Monatsanfangsstand, abgeglichen mit den geschäftlichen Fahrten.
        </p>
        {monthSummaries.length === 0 && !loadError ? (
          <p className="mt-4 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            Für den gewählten Zeitraum sind noch keine Monatsstände hinterlegt.
          </p>
        ) : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th className="p-2">Monat</th>
                <th className="p-2">Fahrzeug</th>
                <th className="p-2">Kennzeichen</th>
                <th className="p-2 text-right">Anfang</th>
                <th className="p-2 text-right">Ende</th>
                <th className="p-2 text-right">Gesamt</th>
                <th className="p-2 text-right">Geschäftlich</th>
                <th className="p-2 text-right">Privat / sonstig / nicht erfasst</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {monthSummaries.map(({ row, vehicle, total, business, other }) => (
                <tr key={row.id}>
                  <td className="p-2">{row.month.slice(0, 7)}</td>
                  <td className="p-2">{vehicle?.vehicle_name ?? "–"}</td>
                  <td className="p-2">{vehicle?.license_plate ?? "–"}</td>
                  <td className="p-2 text-right">{deKm(row.start_km)}</td>
                  <td className="p-2 text-right">{row.end_km == null ? "–" : deKm(row.end_km)}</td>
                  <td className="p-2 text-right">{total == null ? "–" : `${deKm(total)} km`}</td>
                  <td className="p-2 text-right">{deKm(business)} km</td>
                  <td className="p-2 text-right">{other == null ? "–" : `${deKm(other)} km`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
