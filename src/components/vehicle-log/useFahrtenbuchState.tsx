import type { SupabaseClient } from "@supabase/supabase-js";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { saveFile } from "@/lib/download";

import {
  type FahrtenbuchEntry,
  type Vehicle,
  type MonthlyOdometer,
  type Customer,
  type CompanyAddress,
  type FormState,
  localDateTime,
  emptyForm,
  customerLabel,
  customerAddress,
  formatDate,
  formatTime,
  tripTypeLabel,
  csvEscape,
  downloadText,
} from "./shared";

export function useFahrtenbuchState() {
  const queryClient = useQueryClient();
  const db = supabase as SupabaseClient;
  const now = localDateTime();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [searchDate, setSearchDate] = useState("");
  const [startPointMode, setStartPointMode] = useState<"company" | "manual">("manual");
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
        .order("trip_date", { ascending: true })
        .order("trip_time", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FahrtenbuchEntry[];
    },
  });

  const {
    data: drivers = [],
    isError: driversError,
    isLoading: driversLoading,
  } = useQuery({
    queryKey: ["fahrtenbuch_drivers"],
    queryFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Nicht angemeldet.");
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,active")
        .eq("user_id", auth.user.id)
        .order("name");
      if (error) throw error;
      return data ?? [];
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

  const { data: companyAddressData } = useQuery<CompanyAddress | null>({
    queryKey: ["company_address", "fahrtenbuch"],
    queryFn: async () => {
      const { data, error } = await db
        .from("company_settings")
        .select("company_name,address_line,postal_code,city")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CompanyAddress | null;
    },
  });

  const companyAddress = useMemo(() => {
    if (!companyAddressData) return "";
    const street = companyAddressData.address_line?.trim() ?? "";
    const postal = companyAddressData.postal_code?.trim() ?? "";
    const city = companyAddressData.city?.trim() ?? "";
    return [street, [postal, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  }, [companyAddressData]);

  const distance = useMemo(() => {
    const start = Number(form.start_km);
    const end = Number(form.end_km);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
    return Math.round((end - start) * 10) / 10;
  }, [form.start_km, form.end_km]);

  const visibleEntries = useMemo(
    () => (searchDate ? entries.filter((entry) => entry.trip_date === searchDate) : entries),
    [entries, searchDate],
  );

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
        (entry) => entry.vehicle_id === monthlyVehicleId && entry.trip_date.slice(0, 7) === month,
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

  const latestEntry = entries.at(-1);

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
      if (!Number.isFinite(start) || start < 0)
        throw new Error("Ungültiger Monatsanfangs-km-Stand.");
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

      // Validate company membership again when saving, including edited trips.
      if (values.employee_id !== "none") {
        const { data: driver, error: driverError } = await supabase
          .from("employees")
          .select("id")
          .eq("id", values.employee_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (driverError || !driver) throw new Error("Fahrer konnte nicht geprüft werden.");
      }

      const payload = {
        employee_id: values.employee_id === "none" ? null : values.employee_id,
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
    setStartPointMode(
      companyAddress && entry.from_location.trim() === companyAddress.trim() ? "company" : "manual",
    );
    setForm({
      id: entry.id,
      employee_id: entry.employee_id ?? "none",
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
      const { buildBrandedFahrtenbuchPdf } = await import("@/lib/fahrtenbuch-branded-pdf");
      const rows = [...entries]
        .sort((a, b) =>
          `${a.trip_date} ${a.trip_time ?? ""}`.localeCompare(
            `${b.trip_date} ${b.trip_time ?? ""}`,
          ),
        )
        .map((entry) => {
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
      const to = rows.length
        ? [...entries]
            .map((e) => e.trip_date)
            .sort()
            .at(-1)!
        : now.date;
      const summary =
        selectedMonthly?.end_km != null && monthlyTotalKm !== null && privateOrUnloggedKm !== null
          ? {
              month: new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(
                new Date(`${month}-01T12:00:00`),
              ),
              startKm: Number(selectedMonthly.start_km),
              endKm: Number(selectedMonthly.end_km),
              totalKm: monthlyTotalKm,
              businessKm: businessKmForMonth,
              privateKm: privateOrUnloggedKm,
            }
          : undefined;
      await saveFile(
        await buildBrandedFahrtenbuchPdf(rows, from, to, summary),
        `Fahrtenbuch_${from}_${to}.pdf`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fahrtenbuch-PDF konnte nicht erstellt werden.",
      );
    }
  }

  return {
    ready: true as const,
    businessKmForMonth,
    companyAddress,
    customers,
    distance,
    drivers,
    driversError,
    driversLoading,
    editEntry,
    entries,
    exportCsv,
    exportPdf,
    form,
    isLoading,
    latestEntry,
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
    saveTrip,
    saveVehicle,
    searchDate,
    selectCustomer,
    selectedMonthly,
    setForm,
    setLicensePlate,
    setMonth,
    setMonthEndKm,
    setMonthStartKm,
    setSearchDate,
    setStartPointMode,
    setVehicleName,
    startPointMode,
    totalKm,
    useLastDestination,
    vehicleName,
    vehicles,
    visibleEntries,
  };
}
export type FahrtenbuchState = Extract<ReturnType<typeof useFahrtenbuchState>, { ready: true }>;
