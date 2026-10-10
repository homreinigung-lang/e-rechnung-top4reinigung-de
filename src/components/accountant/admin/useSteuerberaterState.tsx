import { fahrtenbuchClient } from "@/lib/fahrtenbuch-client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { buildGobdExport, downloadBlob } from "@/lib/gobd";
import { saveFile } from "@/lib/download";
import { fetchStoredBlob } from "@/lib/storage";
import { buildExpenseReceiptZip } from "@/lib/expense-receipt-export";

import { buildIssuedDatevExtf, type DatevAccount, type DatevChart } from "@/lib/datev-extf";
import { buildPayrollSummary } from "@/lib/payroll-export";
import { approvedWorkHours, workHourlyRate } from "@/lib/approved-work-totals";
import { fetchAllRows } from "@/lib/fetch-all-rows";

import { automaticExpenseAccount } from "@/lib/datev-account-mapping";
import { buildEuerPdf, computeEuer } from "@/lib/euer";

import { type Row, num, de } from "./shared";

export function useSteuerberaterState() {
  const queryClient = useQueryClient();
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data: documents = [] } = useQuery({
    queryKey: ["stb_documents", from, to],
    queryFn: async () => {
      return fetchAllRows(() =>
        supabase
          .from("documents")
          .select("*")
          .is("deleted_at", null)
          .eq("type", "invoice")
          .gte("issue_date", from)
          .lte("issue_date", to)
          .order("issue_date"),
      );
    },
  });

  // EÜR is cash-based: a payment may be received in this period for an older invoice.
  // Keep the issue-date query above unchanged for the other accountant exports.
  const { data: receivedInvoices = [] } = useQuery({
    queryKey: ["stb_received_invoices", from, to],
    queryFn: () =>
      fetchAllRows(() =>
        supabase
          .from("documents")
          .select("*")
          .is("deleted_at", null)
          .eq("type", "invoice")
          .eq("status", "paid")
          .gte("paid_at", from)
          .lte("paid_at", to)
          .order("paid_at"),
      ),
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["stb_expenses", from, to],
    queryFn: async () => {
      return fetchAllRows(() =>
        supabase
          .from("expenses")
          .select("*")
          .is("deleted_at", null)
          .gte("expense_date", from)
          .lte("expense_date", to)
          .order("expense_date"),
      );
    },
  });

  // Zeiterfassung inkl. bestätigter Schichten und Abwesenheiten (K/U) – Basis der Lohnabrechnung.
  const { data: timeEntries = [] } = useQuery({
    queryKey: ["stb_time_entries", from, to],
    queryFn: async () => {
      return fetchAllRows(() =>
        supabase
          .from("time_entries")
          // Ohne photo_paths: Fotos bleiben ausschließlich intern (Verwaltung).
          .select(
            "id, user_id, employee_id, employee_name, customer_id, project_id, work_date, start_time, end_time, break_minutes, hours, hourly_rate, location, note, billed, entry_type, absence_reason, approval_status, decided_at, decided_by, decision_note, completed_at, created_at, updated_at, employees(name, personnel_number, contract_type, weekly_hours, hourly_rate)",
          )
          .gte("work_date", from)
          .lte("work_date", to)
          .neq("approval_status", "rejected")
          .order("work_date"),
      );
    },
  });

  const { data: fahrtenbuchEntries = [] } = useQuery({
    queryKey: ["stb_fahrtenbuch_entries", from, to],
    queryFn: async () => {
      return fetchAllRows(() =>
        fahrtenbuchClient
          .from("fahrtenbuch_entries")
          .select("*")
          .gte("trip_date", from)
          .lte("trip_date", to)
          .order("trip_date")
          .order("trip_time"),
      );
    },
  });

  const { data: fahrtenbuchVehicles = [] } = useQuery({
    queryKey: ["stb_fahrtenbuch_vehicles"],
    queryFn: async () => {
      const { data, error } = await fahrtenbuchClient
        .from("fahrtenbuch_vehicles")
        .select("id,vehicle_name,license_plate")
        .order("vehicle_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const gobdExport = useMutation({
    mutationFn: async () => {
      const blob = await buildGobdExport(from, to);
      await downloadBlob(blob, `GoBD-Pruefexport_${from}_${to}.zip`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: settings } = useQuery({
    queryKey: ["stb_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("company_name").maybeSingle();
      return data ?? null;
    },
  });

  const euer = useMemo(
    () =>
      computeEuer(
        receivedInvoices as unknown as Record<string, unknown>[],
        expenses as unknown as Record<string, unknown>[],
        from,
        to,
      ),
    [receivedInvoices, expenses, from, to],
  );

  const euerPdf = useMutation({
    mutationFn: async () => {
      const blob = await buildEuerPdf(euer, settings?.company_name ?? "");
      await saveFile(blob, `EUER_${from}_${to}.pdf`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(() => {
    const net = documents.reduce(
      (s, d) => s + num((d as Record<string, unknown>)["net_total"] ?? d.total),
      0,
    );
    const vat = documents.reduce(
      (s, d) => s + num((d as Record<string, unknown>)["vat_amount"]),
      0,
    );
    const gross = documents.reduce((s, d) => s + num(d.total), 0);
    const expNet = expenses.reduce((s, e) => s + num(e.net_amount), 0);
    const expVat = expenses.reduce((s, e) => s + num(e.vat_amount), 0);
    const expGross = expenses.reduce((s, e) => s + num(e.gross_amount), 0);
    return {
      net,
      vat,
      gross,
      expNet,
      expVat,
      expGross,
      zahllast: vat - expVat,
      ergebnis: net - expNet,
    };
  }, [documents, expenses]);

  const docRows: Row[] = documents.map((d) => ({
    Belegdatum: formatDate(d.issue_date),
    Rechnungsnummer: d.number,
    Kunde: d.customer_company || d.customer_name,
    "USt-IdNr. Kunde": String((d as Record<string, unknown>)["customer_vat_id"] ?? ""),
    Bestellnummer: String((d as Record<string, unknown>)["order_number"] ?? ""),
    Netto: de(num((d as Record<string, unknown>)["net_total"] ?? d.total)),
    Umsatzsteuer: de(num((d as Record<string, unknown>)["vat_amount"])),
    Brutto: de(num(d.total)),
    Steuerart:
      (d as Record<string, unknown>)["tax_mode"] === "domestic"
        ? "19% Inland"
        : "Reverse-Charge (§ 13b UStG)",
    Status: String(d.status),
  }));

  const expenseRows: Row[] = expenses.map((e) => ({
    Belegdatum: formatDate(e.expense_date),
    Belegnummer: e.document_number,
    Lieferant: e.supplier,
    Kategorie: e.category,
    Netto: de(num(e.net_amount)),
    Vorsteuer: de(num(e.vat_amount)),
    Brutto: de(num(e.gross_amount)),
    Notiz: e.notes,
  }));

  // Existing accounting tables are loaded without changing any other application data.
  const accountingDb = supabase as unknown as import("@supabase/supabase-js").SupabaseClient;
  const [chart, setChart] = useState<DatevChart>("SKR03");
  const [beraternummer, setBeraternummer] = useState("");
  const [mandantennummer, setMandantennummer] = useState("");
  const [expenseMappings, setExpenseMappings] = useState<Record<string, string>>({});
  const { data: accountingSettings } = useQuery({
    queryKey: ["datev_accounting_settings"],
    queryFn: async () => {
      const { data, error } = await accountingDb
        .from("company_accounting_settings")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as {
        chart: DatevChart;
        fiscal_year: number;
        datev_beraternummer: string;
        datev_mandantennummer: string;
      } | null;
    },
  });
  const { data: chartAccounts = [] } = useQuery({
    queryKey: ["datev_chart_accounts", year],
    queryFn: async () => {
      const { data, error } = await accountingDb
        .from("accounting_chart_accounts")
        .select("chart,fiscal_year,account_number,account_name,category")
        .eq("fiscal_year", year)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as DatevAccount[];
    },
  });
  const { data: savedMappings = [] } = useQuery({
    queryKey: ["datev_account_mappings"],
    queryFn: async () => {
      const { data, error } = await accountingDb
        .from("company_account_mappings")
        .select("mapping_key,chart,fiscal_year,account_number");
      if (error) throw error;
      return (data ?? []) as {
        mapping_key: string;
        chart: string;
        fiscal_year: number;
        account_number: string;
      }[];
    },
  });
  const expenseCategories = [...new Set(expenses.map((e) => String(e.category || "")))].sort();
  useEffect(() => {
    if (!accountingSettings) return;
    setChart(accountingSettings.chart);
    setBeraternummer(accountingSettings.datev_beraternummer ?? "");
    setMandantennummer(accountingSettings.datev_mandantennummer ?? "");
  }, [accountingSettings]);
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const category of expenseCategories) {
      next[category] = automaticExpenseAccount(category, chart);
    }
    setExpenseMappings(next);
  }, [chart, year, expenses]);
  const saveDatevSettings = useMutation({
    mutationFn: async () => {
      if (!/^\d{1,7}$/.test(beraternummer) || !/^\d{1,5}$/.test(mandantennummer))
        throw new Error("Berater- und Mandantennummer prüfen.");
      for (const category of expenseCategories) {
        const account = expenseMappings[category];
        if (
          !chartAccounts.some(
            (a) =>
              a.chart === chart &&
              a.fiscal_year === year &&
              a.category === "expense" &&
              a.account_number === account,
          )
        )
          throw new Error("Bitte Aufwandskonto für " + (category || "Ausgabe") + " wählen.");
      }
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Nicht angemeldet.");
      const { error } = await accountingDb.from("company_accounting_settings").upsert(
        {
          user_id: auth.user.id,
          chart,
          fiscal_year: year,
          datev_beraternummer: beraternummer,
          datev_mandantennummer: mandantennummer,
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      for (const category of expenseCategories) {
        const { error: mappingError } = await accountingDb.from("company_account_mappings").upsert(
          {
            user_id: auth.user.id,
            mapping_key: "expense:" + category,
            chart,
            fiscal_year: year,
            account_number: expenseMappings[category],
          },
          { onConflict: "user_id,mapping_key" },
        );
        if (mappingError) throw mappingError;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["datev_accounting_settings"] }),
        queryClient.invalidateQueries({ queryKey: ["datev_account_mappings"] }),
      ]);
      toast.success("DATEV-Einstellungen gespeichert.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const datevExport = useMutation({
    mutationFn: async () => {
      if (
        !accountingSettings ||
        accountingSettings.chart !== chart ||
        accountingSettings.fiscal_year !== year ||
        accountingSettings.datev_beraternummer !== beraternummer ||
        accountingSettings.datev_mandantennummer !== mandantennummer ||
        expenseCategories.some(
          (category) =>
            savedMappings.find(
              (m) =>
                m.mapping_key === "expense:" + category &&
                m.chart === chart &&
                m.fiscal_year === year,
            )?.account_number !== expenseMappings[category],
        )
      ) {
        throw new Error("DATEV-Einstellungen zuerst speichern.");
      }
      const bytes = buildIssuedDatevExtf(documents, expenses, {
        chart,
        fiscalYear: year,
        beraternummer,
        mandantennummer,
        expenseAccounts: expenseMappings,
        from,
        to,
        accounts: chartAccounts,
      });
      await saveFile(
        new Blob(
          [
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
          ],
          { type: "text/csv" },
        ),
        `EXTF_Buchungsstapel_${from}_${to}.csv`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receiptZipExport = useMutation({
    mutationFn: async () => {
      if (!from || !to || from > to) {
        throw new Error("Bitte einen gültigen Zeitraum auswählen.");
      }
      if (expenses.length === 0) {
        throw new Error("Keine Ausgaben im gewählten Zeitraum.");
      }
      const result = await buildExpenseReceiptZip({
        expenses,
        loadReceipt: async (row) => {
          const path = String(row.receipt_url ?? "");
          if (!path) throw new Error("Beleg fehlt");
          return fetchStoredBlob(path);
        },
      });
      await saveFile(result.blob, `Ausgabenbelege_${from}_${to}.zip`);
      return result;
    },
    onSuccess: (result) =>
      toast.success(
        `${result.receiptCount} Belege geladen · ${result.expenseCount} Ausgaben in der Übersicht`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  /** Lohnart-Kürzel: A = Arbeit, K = Krank, U = Urlaub, F = Feiertag, S = Sonstige. */
  function lohnart(t: Record<string, unknown>) {
    const type = String(t["entry_type"] ?? "work");
    if (type === "work") return "A";
    const r = String(t["absence_reason"] ?? "").toLowerCase();
    if (r.includes("krank") || type === "sick") return "K";
    if (r.includes("urlaub") || type === "vacation") return "U";
    if (r.includes("feiertag") || type === "holiday") return "F";
    return "S";
  }

  const timeList = timeEntries as unknown as Record<string, unknown>[];

  const timeRows: Row[] = timeList.map((t) => {
    const emp = (t["employees"] ?? null) as {
      name?: string;
      personnel_number?: string;
      hourly_rate?: number;
    } | null;
    const code = lohnart(t);
    const rate = workHourlyRate({ hourly_rate: num(t["hourly_rate"]) }, num(emp?.hourly_rate));
    const payableHours =
      code === "A"
        ? approvedWorkHours({
            entry_type: "work",
            approval_status: String(t["approval_status"] ?? "approved"),
            hours: num(t["hours"]),
          })
        : 0;
    return {
      Datum: formatDate(String(t["work_date"] ?? "")),
      Mitarbeiter: String(t["employee_name"] || emp?.name || ""),
      "Personal-Nr.": String(emp?.personnel_number ?? ""),
      Lohnart: code,
      Von: String(t["start_time"] ?? "").slice(0, 5),
      Bis: String(t["end_time"] ?? "").slice(0, 5),
      "Pause (Min.)": String(t["break_minutes"] ?? 0),
      "Erfasst (Std.)": de(code === "A" ? num(t["hours"]) : 0),
      Stunden: de(payableHours),
      Stundensatz: de(rate),
      Lohn: de(payableHours * rate),
      Status: String(t["approval_status"] ?? "approved"),
      Einsatzort: String(t["location"] ?? ""),
    };
  });

  const fahrtenbuchRows: Row[] = (fahrtenbuchEntries as unknown as Record<string, unknown>[]).map(
    (trip) => {
      const vehicle = (fahrtenbuchVehicles as unknown as Record<string, unknown>[]).find(
        (v) => String(v["id"] ?? "") === String(trip["vehicle_id"] ?? ""),
      );
      return {
        Datum: formatDate(String(trip["trip_date"] ?? "")),
        Startzeit: String(trip["trip_time"] ?? "").slice(0, 5),
        Rückkehrzeit: String(trip["return_time"] ?? "").slice(0, 5),
        Fahrtart: trip["trip_type"] === "round_trip" ? "Hin- und Rückfahrt" : "Nur Hinfahrt",
        Fahrzeug: String(vehicle?.["vehicle_name"] ?? ""),
        Kennzeichen: String(vehicle?.["license_plate"] ?? ""),
        Von: String(trip["from_location"] ?? ""),
        "Kunde / Ziel / Zweck": String(trip["customer_name"] ?? ""),
        Zieladresse: String(trip["to_location"] ?? ""),
        "Start-km": String(trip["start_km"] ?? ""),
        "End-km": String(trip["end_km"] ?? ""),
        "Geschäftliche km": String(trip["distance_km"] ?? ""),
        Bemerkung: String(trip["notes"] ?? ""),
      };
    },
  );

  const payrollRows: Row[] = buildPayrollSummary(
    timeList.map((t) => {
      const emp = (t["employees"] ?? null) as {
        name?: string;
        personnel_number?: string;
        contract_type?: string;
        weekly_hours?: number;
        hourly_rate?: number;
      } | null;
      return {
        employee_id: String(t["employee_id"] ?? ""),
        employee_name: String(t["employee_name"] || emp?.name || "Ohne Zuordnung"),
        personnel_number: String(emp?.personnel_number ?? ""),
        contract_type: String(emp?.contract_type ?? ""),
        weekly_hours: Number(emp?.weekly_hours ?? 0),
        hourly_rate: Number(t["hourly_rate"] ?? emp?.hourly_rate ?? 0),
        work_date: String(t["work_date"] ?? ""),
        hours: Number(t["hours"] ?? 0),
        entry_type: String(t["entry_type"] ?? "work"),
        absence_reason: String(t["absence_reason"] ?? ""),
        approval_status: String(t["approval_status"] ?? "approved"),
      };
    }),
  );

  const period = `${from}_${to}`;

  return {
    ready: true as const,
    beraternummer,
    chart,
    datevExport,
    docRows,
    documents,
    euer,
    euerPdf,
    expenseRows,
    expenses,
    fahrtenbuchRows,
    from,
    gobdExport,
    mandantennummer,
    payrollRows,
    period,
    receiptZipExport,
    saveDatevSettings,
    setBeraternummer,
    setChart,
    setFrom,
    setMandantennummer,
    setTo,
    timeRows,
    to,
    totals,
    year,
  };
}
export type SteuerberaterState = Extract<ReturnType<typeof useSteuerberaterState>, { ready: true }>;
