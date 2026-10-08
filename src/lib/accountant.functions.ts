import { fetchAllRows } from "./fetch-all-rows";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export type AccountantReport = {
  companyName: string;
  documents: Row[];
  expenses: Row[];
  timeEntries: Row[];
  wageTypes: Row[];
  holidays: Row[];
  adjustments: Row[];
  fahrtenbuchEntries: Row[];
  fahrtenbuchVehicles: Row[];
};

/** Kein Ablaufdatum: Zugang gilt dauerhaft. */
const NO_EXPIRY = "2999-12-31T00:00:00.000Z";

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

/** Ablaufdatum aus einer optionalen Gültigkeitsdauer in Tagen. */
function expiryFrom(validDays?: number | null) {
  const days = Number(validDays ?? 0);
  if (!Number.isFinite(days) || days <= 0) return NO_EXPIRY;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** Zufälliger Zugangscode (12 Zeichen, gut lesbar). */
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

/** Erstellt einen neuen Nur-Lese-Zugang für den Steuerberater. */
export const createAccountantAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email?: string; password?: string; validDays?: number }) => ({
    email: (data.email ?? "").trim(),
    password: (data.password ?? "").trim(),
    validDays: Number(data.validDays ?? 0),
  }))
  .handler(async ({ data, context }) => {
    const token = crypto.randomUUID().replace(/-/g, "");
    const accessCode = data.password ? normalizeCode(data.password) : randomCode();

    if (data.password && accessCode.length < 8) {
      throw new Error("Passwort muss mindestens 8 Zeichen haben.");
    }

    const { hashAccessCode } = await import("./accountant-access.server");

    const { data: created, error } = await context.supabase
      .from("accountant_access")
      .insert({
        user_id: context.userId,
        email: data.email,
        token,
        // Klartext wird nicht gespeichert – nur die Prüfsumme.
        access_code: "",
        access_code_hash: await hashAccessCode(token, accessCode),
        expires_at: expiryFrom(data.validDays),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { id: created.id as string, token, accessCode };
  });

/** Setzt ein selbst gewähltes Passwort für einen bestehenden Zugang. */
export const setAccountantPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; password: string; validDays?: number }) => ({
    id: data.id,
    password: normalizeCode(data.password ?? ""),
    validDays: Number(data.validDays ?? 0),
  }))
  .handler(async ({ data, context }) => {
    if (data.password.length < 8) {
      throw new Error("Passwort muss mindestens 8 Zeichen haben.");
    }
    const { data: access, error: loadError } = await context.supabase
      .from("accountant_access")
      .select("id, token")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!access) throw new Error("Zugang nicht gefunden.");

    const { hashAccessCode } = await import("./accountant-access.server");

    const { error } = await context.supabase
      .from("accountant_access")
      .update({
        access_code: "",
        access_code_hash: await hashAccessCode(access.token as string, data.password),
        expires_at: expiryFrom(data.validDays),
        active: true,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, accessCode: data.password };
  });

/** Prüft Token + Passwort und liefert die Auswertung des Zeitraums (nur Lesen). */
export const getAccountantReport = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<AccountantReport> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("./accountant-access.server");

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
          .select("*")
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

/**
 * Restricted DATEV settings access for the existing password-protected accountant portal.
 * These endpoints cannot modify any company profile, documents or expense data.
 */
export type AccountantDatevSettings = {
  chart: "SKR03" | "SKR04" | null;
  fiscal_year: number;
  datev_beraternummer: string;
  datev_mandantennummer: string;
};

export const getAccountantDatevSettings = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string }) => data)
  .handler(async ({ data }): Promise<AccountantDatevSettings> => {
    const { verifyAccountantAccess } = await import("./accountant-access.server");
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

export const saveAccountantDatevSettings = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      token: string;
      code: string;
      chart: string;
      datev_beraternummer: string;
      datev_mandantennummer: string;
    }) => data,
  )
  .handler(async ({ data }): Promise<AccountantDatevSettings> => {
    // Validate before any privileged database write; accept only the three visible DATEV fields.
    if (data.chart !== "SKR03" && data.chart !== "SKR04") {
      throw new Error("Bitte SKR03 oder SKR04 auswählen.");
    }
    const beraternummer = String(data.datev_beraternummer ?? "").trim();
    const mandantennummer = String(data.datev_mandantennummer ?? "").trim();
    if (!/^\d{1,7}$/.test(beraternummer) || !/^\d{1,5}$/.test(mandantennummer)) {
      throw new Error("Beraternummer (1–7 Ziffern) und Mandantennummer (1–5 Ziffern) prüfen.");
    }
    const { verifyAccountantAccess } = await import("./accountant-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildAutomaticExpenseMappings } = await import("./datev-account-mapping");
    const accountingDb = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const access = await verifyAccountantAccess(data.token, data.code ?? "");
    const { data: existing, error: readError } = await accountingDb
      .from("company_accounting_settings")
      .select("user_id,fiscal_year")
      .eq("user_id", access.user_id)
      .maybeSingle();
    if (readError) throw new Error("DATEV-Einstellungen konnten nicht geprüft werden.");

    const values: Pick<
      AccountantDatevSettings,
      "chart" | "datev_beraternummer" | "datev_mandantennummer"
    > & { chart: "SKR03" | "SKR04" } = {
      chart: data.chart,
      datev_beraternummer: beraternummer,
      datev_mandantennummer: mandantennummer,
    };

    let fiscal_year: number;
    if (existing) {
      fiscal_year = existing.fiscal_year;
      const { error } = await accountingDb
        .from("company_accounting_settings")
        .update(values)
        .eq("user_id", access.user_id);
      if (error) throw new Error("DATEV-Einstellungen konnten nicht gespeichert werden.");
    } else {
      const { data: company, error: companyError } = await supabaseAdmin
        .from("company_settings")
        .select("user_id")
        .eq("user_id", access.user_id)
        .maybeSingle();
      if (companyError || !company) throw new Error("Mandant nicht gefunden.");
      fiscal_year = new Date().getUTCFullYear();
      const { error } = await accountingDb
        .from("company_accounting_settings")
        .insert({ ...values, user_id: access.user_id, fiscal_year });
      if (error) throw new Error("DATEV-Einstellungen konnten nicht gespeichert werden.");
    }

    // Account mapping stays invisible in the portal: selecting SKR03/SKR04 creates/updates it automatically.
    const expenseCategories = await fetchAllRows(() =>
      supabaseAdmin
        .from("expenses")
        .select("id,category")
        .eq("user_id", access.user_id)
        .is("deleted_at", null),
    );

    const categories = [
      ...new Set((expenseCategories ?? []).map((row) => String(row.category ?? ""))),
    ];
    const automaticMappings = buildAutomaticExpenseMappings(categories, data.chart);
    if (categories.length > 0) {
      const { error: mappingError } = await accountingDb.from("company_account_mappings").upsert(
        categories.map((category) => ({
          user_id: access.user_id,
          mapping_key: "expense:" + category,
          chart: data.chart,
          fiscal_year,
          account_number: automaticMappings[category],
        })),
        { onConflict: "user_id,mapping_key" },
      );
      if (mappingError) throw new Error("DATEV-Kontenzuordnung konnte nicht gespeichert werden.");
    }

    return { ...values, fiscal_year };
  });

export type AccountantDatevExport = {
  filename: string;
  base64: string;
};

export const getAccountantDatevExport = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<AccountantDatevExport> => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(data.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.to) ||
      data.from > data.to
    ) {
      throw new Error("Ungültiger DATEV-Zeitraum.");
    }

    const { verifyAccountantAccess } = await import("./accountant-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildDatevExtf } = await import("./datev-extf");
    const { buildAutomaticExpenseMappings } = await import("./datev-account-mapping");
    const accountingDb = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const access = await verifyAccountantAccess(data.token, data.code ?? "");

    const { data: settings, error: settingsError } = await accountingDb
      .from("company_accounting_settings")
      .select("chart,fiscal_year,datev_beraternummer,datev_mandantennummer")
      .eq("user_id", access.user_id)
      .maybeSingle();
    if (settingsError) throw new Error("DATEV-Einstellungen konnten nicht geladen werden.");
    if (!settings || (settings.chart !== "SKR03" && settings.chart !== "SKR04")) {
      throw new Error("DATEV-Einstellungen zuerst speichern.");
    }

    const [documents, expenses, accounts, mappings] = await Promise.all([
      fetchAllRows(() =>
        supabaseAdmin
          .from("documents")
          .select(
            "id,issue_date,number,total,net_total,vat_amount,tax_mode,customer_company,customer_name,status,cancels_document_id",
          )
          .eq("user_id", access.user_id)
          .eq("type", "invoice")
          .is("deleted_at", null)
          .in("status", ["sent", "paid", "cancelled"])
          .gte("issue_date", data.from)
          .lte("issue_date", data.to)
          .order("issue_date"),
      ),
      fetchAllRows(() =>
        supabaseAdmin
          .from("expenses")
          .select(
            "id,expense_date,document_number,supplier,gross_amount,category,net_amount,vat_amount",
          )
          .eq("user_id", access.user_id)
          .is("deleted_at", null)
          .gte("expense_date", data.from)
          .lte("expense_date", data.to)
          .order("expense_date"),
      ),
      fetchAllRows(() =>
        accountingDb
          .from("accounting_chart_accounts")
          .select("id,chart,fiscal_year,account_number,category,account_name")
          .eq("chart", settings.chart)
          .eq("fiscal_year", settings.fiscal_year)
          .eq("is_active", true),
      ),
      fetchAllRows(() =>
        accountingDb
          .from("company_account_mappings")
          .select("id,mapping_key,chart,fiscal_year,account_number")
          .eq("user_id", access.user_id)
          .eq("chart", settings.chart)
          .eq("fiscal_year", settings.fiscal_year),
      ),
    ]);

    const categories = [...new Set(expenses.map((row) => String(row.category ?? "")))];
    const expenseAccounts = buildAutomaticExpenseMappings(categories, settings.chart);
    for (const mapping of mappings) {
      const key = String(mapping.mapping_key ?? "");
      if (!key.startsWith("expense:")) continue;
      const category = key.slice("expense:".length);
      if (!category) continue;
      expenseAccounts[category] = String(mapping.account_number ?? "");
    }
    const bytes = buildDatevExtf(
      documents as unknown as Parameters<typeof buildDatevExtf>[0],
      expenses as unknown as Parameters<typeof buildDatevExtf>[1],
      {
        chart: settings.chart,
        fiscalYear: settings.fiscal_year,
        beraternummer: settings.datev_beraternummer ?? "",
        mandantennummer: settings.datev_mandantennummer ?? "",
        expenseAccounts,
        from: data.from,
        to: data.to,
        accounts: accounts as unknown as Parameters<typeof buildDatevExtf>[2]["accounts"],
      },
    );

    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return {
      filename: `EXTF_Buchungsstapel_${data.from}_${data.to}.csv`,
      base64: btoa(binary),
    };
  });

/** Liefert eine zeitlich begrenzte Download-Adresse für den Beleg einer Ausgabe. */
export const getAccountantReceiptUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; expenseId: string }) => data)
  .handler(async ({ data }): Promise<string> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("./accountant-access.server");

    const access = await verifyAccountantAccess(data.token, data.code ?? "");

    const { data: expense } = await supabaseAdmin
      .from("expenses")
      .select("receipt_url")
      .eq("id", data.expenseId)
      .eq("user_id", access.user_id)
      .maybeSingle();

    const path = expense?.receipt_url ?? "";
    if (!path) throw new Error("Zu dieser Ausgabe ist kein Beleg hinterlegt.");
    if (/^https?:/.test(path)) return path;

    const { data: signed, error } = await supabaseAdmin.storage
      .from("firmen-dateien")
      .createSignedUrl(path, 60 * 60);
    if (error || !signed?.signedUrl) throw new Error("Beleg konnte nicht geladen werden.");
    return signed.signedUrl;
  });

export type AccountantReceiptExportRow = {
  id: string;
  expense_date: string;
  supplier: string;
  category: string;
  document_number: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  payment_method: string;
  receipt_url: string;
};

/** Liefert alle Ausgaben eines Zeitraums; Belege werden ausschließlich als kurzlebige signierte URLs ausgegeben. */
export const getAccountantReceiptExport = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<AccountantReceiptExportRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("./accountant-access.server");

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(data.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.to) ||
      data.from > data.to
    ) {
      throw new Error("Ungültiger Belegzeitraum.");
    }

    const access = await verifyAccountantAccess(data.token, data.code ?? "");
    const expenses = await fetchAllRows(() =>
      supabaseAdmin
        .from("expenses")
        .select("*")
        .eq("user_id", access.user_id)
        .is("deleted_at", null)
        .gte("expense_date", data.from)
        .lte("expense_date", data.to)
        .order("expense_date", { ascending: true }),
    );

    const out: AccountantReceiptExportRow[] = [];
    for (const raw of expenses ?? []) {
      const e = raw as Record<string, unknown>;
      const path = String(e["receipt_url"] ?? "");
      let receiptUrl = "";
      if (path) {
        if (/^https?:/.test(path)) {
          receiptUrl = path;
        } else {
          const { data: signed, error: signedError } = await supabaseAdmin.storage
            .from("firmen-dateien")
            .createSignedUrl(path, 60 * 30);
          if (signedError || !signed?.signedUrl)
            throw new Error("Beleg konnte nicht geladen werden.");
          receiptUrl = signed.signedUrl;
        }
      }

      out.push({
        id: String(e["id"] ?? ""),
        expense_date: String(e["expense_date"] ?? ""),
        supplier: String(e["supplier"] ?? ""),
        category: String(e["category"] ?? ""),
        document_number: String(e["document_number"] ?? ""),
        net_amount: Number(e["net_amount"] ?? 0),
        vat_amount: Number(e["vat_amount"] ?? 0),
        gross_amount: Number(e["gross_amount"] ?? 0),
        payment_method: String(e["payment_method"] ?? ""),
        receipt_url: receiptUrl,
      });
    }
    return out;
  });

/** Rückwärtskompatibel: Monatsabruf für ältere Clients. */
export const getAccountantMonthReceipts = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; month: string }) => data)
  .handler(async ({ data }): Promise<Array<{ name: string; url: string }>> => {
    if (!/^\d{4}-\d{2}$/.test(data.month)) throw new Error("Ungültiger Monat.");
    const [year, month] = data.month.split("-").map(Number);
    const from = `${data.month}-01`;
    const to = new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAccountantAccess } = await import("./accountant-access.server");
    const access = await verifyAccountantAccess(data.token, data.code ?? "");
    const expenses = await fetchAllRows(() =>
      supabaseAdmin
        .from("expenses")
        .select("id,expense_date,supplier,category,receipt_url")
        .eq("user_id", access.user_id)
        .is("deleted_at", null)
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: true }),
    );

    const out: Array<{ name: string; url: string }> = [];
    let index = 1;
    for (const e of expenses ?? []) {
      const storedPath = e.receipt_url ?? "";
      if (!storedPath) continue;
      const ext = String(storedPath).split("?")[0]?.split(".").pop()?.toLowerCase() || "pdf";
      const label = [
        String(index).padStart(2, "0"),
        e.expense_date,
        String(e.supplier || "Beleg")
          .replace(/[^\w\s-]+/g, "")
          .trim()
          .replace(/\s+/g, "-"),
        String(e.category || "").replace(/[^\w-]+/g, ""),
      ]
        .filter(Boolean)
        .join("_");
      if (/^https?:/.test(storedPath)) {
        out.push({ name: `${label}.${ext}`, url: storedPath });
      } else {
        const { data: signed, error: signedError } = await supabaseAdmin.storage
          .from("firmen-dateien")
          .createSignedUrl(storedPath, 60 * 30);
        if (signedError || !signed?.signedUrl)
          throw new Error("Beleg konnte nicht geladen werden.");
        out.push({ name: `${label}.${ext}`, url: signed.signedUrl });
      }
      index += 1;
    }
    return out;
  });

/**
 * Versendet den Steuerberater-Einladungslink direkt aus der App (Resend).
 * Es wird kein externes E-Mail-Programm geöffnet.
 */
export const sendAccountantInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; email: string; origin?: string; password?: string }) => ({
    id: String(data.id ?? ""),
    email: String(data.email ?? "").trim(),
    origin: String(data.origin ?? "").trim(),
    password: normalizeCode(String(data.password ?? "")),
  }))
  .handler(async ({ data, context }) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
    }
    if (data.password && data.password.length < 8) {
      throw new Error("Passwort muss mindestens 8 Zeichen haben.");
    }

    const { data: access, error } = await context.supabase
      .from("accountant_access")
      .select("id, token")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!access) throw new Error("Zugang nicht gefunden.");

    // Das Passwort ist nur als Prüfsumme gespeichert und kann nicht mehr
    // ausgelesen werden. Für die Einladung wird deshalb ein neues Passwort
    // gesetzt (entweder das eingegebene oder ein zufälliges).
    const accessCode = data.password || randomCode();
    const { hashAccessCode } = await import("./accountant-access.server");
    const { error: pwError } = await context.supabase
      .from("accountant_access")
      .update({
        access_code: "",
        access_code_hash: await hashAccessCode(access.token as string, accessCode),
        active: true,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", access.id)
      .eq("user_id", context.userId);
    if (pwError) throw new Error(pwError.message);

    const { data: settings } = await context.supabase
      .from("company_settings")
      .select("company_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const companyName = settings?.company_name || "Ihr Mandant";
    const companyEmail = settings?.email || undefined;

    const { sendMail, siteUrl, escapeHtml } = await import("./approval-mail.server");
    const base = /^https?:\/\//.test(data.origin) ? data.origin.replace(/\/$/, "") : siteUrl();
    const link = `${base}/stb/${access.token}`;

    const subject = `Steuerberater-Zugang von ${companyName}`;
    const text = `Guten Tag,

anbei Ihr persönlicher Nur-Lese-Zugang zu den Rechnungen und Ausgaben von ${companyName} (DATEV- und Excel-Export inklusive). Die DATEV-Einstellungen (SKR03/SKR04 sowie Berater- und Mandantennummer) dürfen Sie selbst pflegen. Andere Unternehmensdaten bleiben schreibgeschützt.

Zugangs-Link: ${link}
Passwort: ${accessCode}

Bitte bewahren Sie das Passwort sicher auf – es kann aus Sicherheitsgründen nicht erneut angezeigt werden.

Mit freundlichen Grüßen
${companyName}`;

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;font-size:15px">
      <h2 style="margin:0 0 12px">Ihr Steuerberater-Zugang</h2>
      <p>Guten Tag,</p>
      <p>anbei Ihr persönlicher Nur-Lese-Zugang zu den Rechnungen und Ausgaben von <strong>${escapeHtml(companyName)}</strong> (DATEV- und Excel-Export inklusive).</p>\n      <p>Sie dürfen ausschließlich die DATEV-Einstellungen (SKR03/SKR04 sowie Berater- und Mandantennummer) selbst pflegen. Andere Unternehmensdaten bleiben schreibgeschützt.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#0369a1;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Zugang öffnen</a></p>
      <p>Passwort: <strong>${escapeHtml(accessCode)}</strong></p>
      <p style="color:#64748b;font-size:13px">Falls der Button nicht funktioniert: ${escapeHtml(link)}</p>
      <p style="margin-top:28px;color:#64748b;font-size:12px">${escapeHtml(companyName)}</p>
    </div>`;

    const delivery = await sendMail({
      to: data.email,
      subject,
      html,
      text,
      companyName,
      ...(companyEmail ? { companyEmail } : {}),
    });

    if (data.email) {
      await context.supabase
        .from("accountant_access")
        .update({ email: data.email, invited_at: new Date().toISOString() })
        .eq("id", access.id)
        .eq("user_id", context.userId);
    }

    return { accepted: true as const, to: data.email, messageId: delivery.id, accessCode, link };
  });
