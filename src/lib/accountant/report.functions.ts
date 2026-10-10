import { fetchAllRows } from "@/lib/fetch-all-rows";
import { createServerFn } from "@tanstack/react-start";

import { type Row, type AccountantReport } from "./shared";

export const getAccountantReport = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<AccountantReport> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("@/lib/accountant-access.server");

    const access = await verifyAccountantAccess(data.token, data.code ?? "");

    const [
      documents,
      expenses,
      timeEntries,
      employees,
      wageTypes,
      holidays,
      adjustments,
      settings,
      fahrtenbuchEntries,
      fahrtenbuchVehicles,
    ] = await Promise.all([
      fetchAllRows(() =>
        supabaseAdmin
          .from("documents")
          .select("*")
          .eq("user_id", access.user_id)
          .eq("type", "invoice")
          // Keine Papierkorb-Belege, Stornorechnungen oder stornierten Originale.
          .is("deleted_at", null)
          .eq("is_storno", false)
          .neq("status", "cancelled")
          .gte("issue_date", data.from)
          .lte("issue_date", data.to)
          .order("issue_date"),
      ),
      fetchAllRows(() =>
        supabaseAdmin
          .from("expenses")
          .select("*")
          .eq("user_id", access.user_id)
          .is("deleted_at", null)
          .gte("expense_date", data.from)
          .lte("expense_date", data.to)
          .order("expense_date"),
      ),
      fetchAllRows(() =>
        supabaseAdmin
          .from("time_entries")
          // Fotos (photo_paths) sind rein interne Nachweise – nie an den Steuerberater.
          .select(
            "id, user_id, employee_id, employee_name, customer_id, project_id, work_date, start_time, end_time, break_minutes, hours, hourly_rate, location, note, billed, entry_type, absence_reason, approval_status, decided_at, decided_by, decision_note, completed_at, created_at, updated_at",
          )
          .eq("user_id", access.user_id)
          .gte("work_date", data.from)
          .lte("work_date", data.to)
          .order("work_date"),
      ),
      fetchAllRows(() =>
        supabaseAdmin
          .from("employees")
          .select(
            "id, name, personnel_number, hourly_rate, weekly_hours, contract_type, contract_start",
          )
          .eq("user_id", access.user_id),
      ),
      fetchAllRows(() =>
        supabaseAdmin
          .from("wage_types")
          .select("id,kind,surcharge_percent,active,time_from,time_to")
          .eq("user_id", access.user_id),
      ),
      fetchAllRows(() =>
        supabaseAdmin
          .from("company_holidays")
          .select("id,holiday_date,name,active,surcharge_percent")
          .eq("user_id", access.user_id)
          .eq("active", true)
          .gte("holiday_date", data.from)
          .lte("holiday_date", data.to),
      ),
      fetchAllRows(() =>
        supabaseAdmin
          .from("time_account_adjustments")
          .select("*")
          .eq("user_id", access.user_id)
          .gte("entry_date", data.from)
          .lte("entry_date", data.to)
          .order("entry_date"),
      ),
      supabaseAdmin
        .from("company_settings")
        .select("company_name")
        .eq("user_id", access.user_id)
        .maybeSingle(),
      fetchAllRows(() =>
        (supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient)
          .from("fahrtenbuch_entries")
          .select(
            "id,user_id,vehicle_id,trip_date,trip_time,return_time,trip_type,from_location,customer_id,customer_name,to_location,start_km,end_km,distance_km,notes,created_at,updated_at",
          )
          .eq("user_id", access.user_id)
          .gte("trip_date", data.from)
          .lte("trip_date", data.to)
          .order("trip_date")
          .order("trip_time"),
      ),
      fetchAllRows(() =>
        (supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient)
          .from("fahrtenbuch_vehicles")
          .select("id,vehicle_name,license_plate")
          .eq("user_id", access.user_id)
          .order("vehicle_name"),
      ),
    ]);
    if (settings.error) throw new Error("Firmendaten konnten nicht geladen werden.");

    const empById = new Map(employees.map((e) => [e.id as string, e as Record<string, unknown>]));

    /** Kürzel für die Lohnabrechnung: A = Arbeit, U = Urlaub, K = Krank, F = Feiertag, S = Sonstige. */
    function absenceCode(entryType: string, reason: string) {
      if (entryType === "work") return "A";
      const r = (reason || "").toLowerCase();
      if (r.includes("krank") || r.includes("sick")) return "K";
      if (r.includes("urlaub") || r.includes("vacation")) return "U";
      if (r.includes("feiertag") || r.includes("holiday")) return "F";
      if (entryType === "vacation") return "U";
      if (entryType === "sick") return "K";
      if (entryType === "holiday") return "F";
      return "S";
    }

    const enrichedTime = timeEntries
      // Abgelehnte Anträge fließen nicht in die Lohnabrechnung ein.
      .filter((t) => String(t.approval_status ?? "") !== "rejected")
      .map((t) => {
        const emp = t.employee_id ? empById.get(t.employee_id as string) : undefined;
        const entryType = String(t.entry_type ?? "work");
        const code = absenceCode(entryType, String(t.absence_reason ?? ""));
        // Nur bestätigte (erledigte) Schichten zählen als Ist-Arbeitszeit.
        const confirmed =
          entryType !== "work" || Boolean(t.completed_at) || Number(t.hours ?? 0) > 0;
        return {
          ...t,
          employee_name: String(t.employee_name || emp?.["name"] || ""),
          personnel_number: String(emp?.["personnel_number"] ?? ""),
          contract_type: String(emp?.["contract_type"] ?? ""),
          weekly_hours: Number(emp?.["weekly_hours"] ?? 0),
          contract_start: String(emp?.["contract_start"] ?? ""),
          hourly_rate: Number(t.hourly_rate ?? emp?.["hourly_rate"] ?? 0),
          lohnart: code,
          is_absence: entryType !== "work",
          confirmed,
        };
      });

    return {
      companyName: settings.data?.company_name ?? "",
      documents: documents as unknown as Row[],
      expenses: expenses as unknown as Row[],
      timeEntries: enrichedTime as unknown as Row[],
      wageTypes: wageTypes as unknown as Row[],
      holidays: holidays as unknown as Row[],
      adjustments: adjustments as unknown as Row[],
      fahrtenbuchEntries: fahrtenbuchEntries as unknown as Row[],
      fahrtenbuchVehicles: fahrtenbuchVehicles as unknown as Row[],
    };
  });

export type AccountantDatevSettings = {
  chart: "SKR03" | "SKR04" | null;
  fiscal_year: number;
  datev_beraternummer: string;
  datev_mandantennummer: string;
};

export const getAccountantDatevSettings = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string }) => data)
  .handler(async ({ data }): Promise<AccountantDatevSettings> => {
    const { verifyAccountantAccess } = await import("@/lib/accountant-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountingDb = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const access = await verifyAccountantAccess(data.token, data.code ?? "");
    const { data: row, error } = await accountingDb
      .from("company_accounting_settings")
      .select("chart,fiscal_year,datev_beraternummer,datev_mandantennummer")
      .eq("user_id", access.user_id)
      .maybeSingle();
    if (error) throw new Error("DATEV-Einstellungen konnten nicht geladen werden.");
    return {
      chart: row?.chart === "SKR03" || row?.chart === "SKR04" ? row.chart : null,
      fiscal_year: row?.fiscal_year ?? new Date().getUTCFullYear(),
      datev_beraternummer: row?.datev_beraternummer ?? "",
      datev_mandantennummer: row?.datev_mandantennummer ?? "",
    };
  });
