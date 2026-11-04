import { createServerFn } from "@tanstack/react-start";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { monthlyMileage } from "@/lib/fahrtenbuch-month";

export const getAccountantFahrtenbuchMonth = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; month: string }) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month))
      throw new Error("Bitte gültigen Monat auswählen.");
    return data;
  })
  .handler(async ({ data }) => {
    const { verifyAccountantAccess } = await import("@/lib/accountant-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { user_id: owner } = await verifyAccountantAccess(data.token, data.code);
    const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const from = `${data.month}-01`;
    const [year, month] = data.month.split("-").map(Number);
    const to = `${data.month}-${new Date(Date.UTC(year!, month!, 0)).getUTCDate()}`;
    const [trips, vehicles, readings, company] = await Promise.all([
      fetchAllRows(() =>
        db
          .from("fahrtenbuch_entries")
          .select(
            "id,vehicle_id,trip_date,trip_time,return_time,trip_type,from_location,customer_name,to_location,start_km,end_km,distance_km,notes",
          )
          .eq("user_id", owner)
          .gte("trip_date", from)
          .lte("trip_date", to)
          .order("trip_date")
          .order("trip_time")
          .order("id"),
      ),
      fetchAllRows(() =>
        db
          .from("fahrtenbuch_vehicles")
          .select("id,vehicle_name,license_plate")
          .eq("user_id", owner)
          .order("id"),
      ),
      fetchAllRows(() =>
        db
          .from("fahrtenbuch_monthly_odometer")
          .select("id,vehicle_id,start_km,end_km")
          .eq("user_id", owner)
          .eq("month", from)
          .order("id"),
      ),
      db
        .from("company_settings")
        .select("company_name,logo_url")
        .eq("user_id", owner)
        .maybeSingle(),
    ]);
    if (company.error) throw new Error("Firmendaten konnten nicht geladen werden.");
    if (!trips.length) throw new Error("Für diesen Monat sind keine Fahrten vorhanden.");
    const summaries = [...new Set(trips.map((trip) => trip.vehicle_id))].map((id) => {
      const vehicle = vehicles.find((vehicle) => vehicle.id === id);
      const reading = readings.find((row) => row.vehicle_id === id);
      if (!reading)
        throw new Error("Bitte Monatsanfang und Monatsende in der Verwaltung speichern.");
      const business = trips
        .filter((trip) => trip.vehicle_id === id)
        .reduce((sum, trip) => sum + Number(trip.distance_km), 0);
      return {
        month: data.month,
        vehicle: `${vehicle?.vehicle_name ?? ""} · ${vehicle?.license_plate ?? ""}`,
        ...monthlyMileage(
          Number(reading.start_km),
          reading.end_km == null ? null : Number(reading.end_km),
          business,
        ),
      };
    });
    let logoUrl = String(company.data?.logo_url ?? "");
    // Sign only the verified tenant's own logo, never an arbitrary caller-supplied path.
    if (logoUrl && !/^https?:/.test(logoUrl)) {
      if (!logoUrl.startsWith(`${owner}/`))
        throw new Error("Firmenlogo konnte nicht zugeordnet werden.");
      const { data: signed, error } = await supabaseAdmin.storage
        .from("firmen-dateien")
        .createSignedUrl(logoUrl, 300);
      if (error || !signed?.signedUrl) throw new Error("Firmenlogo konnte nicht geladen werden.");
      logoUrl = signed.signedUrl;
    }
    const rows = trips.map((trip) => {
      const vehicle = vehicles.find((vehicle) => vehicle.id === trip.vehicle_id);
      return {
        Datum: new Intl.DateTimeFormat("de-DE").format(new Date(`${trip.trip_date}T12:00:00`)),
        Startzeit: String(trip.trip_time ?? "").slice(0, 5),
        Rückkehrzeit: String(trip.return_time ?? "").slice(0, 5),
        Fahrtart: trip.trip_type === "round_trip" ? "Hin- und Rückfahrt" : "Nur Hinfahrt",
        Fahrzeug: String(vehicle?.vehicle_name ?? ""),
        Kennzeichen: String(vehicle?.license_plate ?? ""),
        Von: String(trip.from_location ?? ""),
        "Kunde / Ziel / Zweck": String(trip.customer_name ?? ""),
        Zieladresse: String(trip.to_location ?? ""),
        "Start-km": String(trip.start_km),
        "End-km": String(trip.end_km),
        "Geschäftliche km": String(trip.distance_km),
        Bemerkung: String(trip.notes ?? ""),
      };
    });
    return {
      rows,
      summaries,
      from,
      to,
      companyName: String(company.data?.company_name ?? ""),
      logoUrl,
    };
  });
