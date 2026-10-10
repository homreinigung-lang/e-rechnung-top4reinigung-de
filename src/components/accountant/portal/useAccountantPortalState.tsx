import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAccountantReceiptExport,
  getAccountantReceiptUrl,
  getAccountantReport,
  getAccountantDatevSettings,
  getAccountantDatevExport,
  saveAccountantDatevSettings,
  type Row,
} from "@/lib/accountant.functions";

import { toast } from "sonner";
import { formatDate } from "@/lib/format";

import { saveFile } from "@/lib/download";
import { approvedWorkHours } from "@/lib/approved-work-totals";

import { buildExpenseReceiptZip } from "@/lib/expense-receipt-export";

import {
  buildLohnvorbereitung,
  lohnvorbereitungCsvRows,
  payrollReadinessIssues,
} from "@/lib/lohnvorbereitung";

import { type Table, num, de, download } from "./shared";

import { getRouteApi } from "@tanstack/react-router";
const routeApi = getRouteApi("/stb/$token");

export function useAccountantPortalState() {
  const { token } = routeApi.useParams();
  const year = new Date().getFullYear();
  const [code, setCode] = useState("");
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const [datevChart, setDatevChart] = useState<"" | "SKR03" | "SKR04">("");
  const [datevBeraternummer, setDatevBeraternummer] = useState("");
  const [datevMandantennummer, setDatevMandantennummer] = useState("");
  const fetchDatevSettings = useServerFn(getAccountantDatevSettings);
  const saveDatevSettingsRequest = useServerFn(saveAccountantDatevSettings);
  const datevSettings = useMutation({
    mutationFn: () => fetchDatevSettings({ data: { token, code } }),
    onSuccess: (value) => {
      setDatevChart(value.chart ?? "");
      setDatevBeraternummer(value.datev_beraternummer);
      setDatevMandantennummer(value.datev_mandantennummer);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveDatevSettings = useMutation({
    mutationFn: () =>
      saveDatevSettingsRequest({
        data: {
          token,
          code,
          chart: datevChart,
          datev_beraternummer: datevBeraternummer,
          datev_mandantennummer: datevMandantennummer,
        },
      }),
    onSuccess: (value) => {
      setDatevChart(value.chart ?? "");
      setDatevBeraternummer(value.datev_beraternummer);
      setDatevMandantennummer(value.datev_mandantennummer);
      toast.success("DATEV-Einstellungen gespeichert.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fetchDatevExport = useServerFn(getAccountantDatevExport);
  const datevExport = useMutation({
    mutationFn: () => fetchDatevExport({ data: { token, code, from, to } }),
    onSuccess: async (value) => {
      const binary = atob(value.base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      await saveFile(new Blob([buffer], { type: "text/csv" }), value.filename);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fetchReport = useServerFn(getAccountantReport);
  const report = useMutation({
    mutationFn: () => fetchReport({ data: { token, code, from, to } }),
    onSuccess: () => datevSettings.mutate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const [zipMonth, setZipMonth] = useState(new Date().toISOString().slice(0, 7));
  const fetchReceiptExport = useServerFn(getAccountantReceiptExport);
  const zipExport = useMutation({
    mutationFn: async () => {
      const expensesForExport = await fetchReceiptExport({ data: { token, code, from, to } });
      if (expensesForExport.length === 0) {
        throw new Error("Keine Ausgaben im gewählten Zeitraum.");
      }
      const result = await buildExpenseReceiptZip({
        expenses: expensesForExport,
        loadReceipt: async (row) => {
          const url = String(row.receipt_url ?? "");
          if (!url) throw new Error("Beleg fehlt");
          const res = await fetch(url);
          if (!res.ok) throw new Error("Beleg konnte nicht geladen werden.");
          return await res.blob();
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

  const fetchReceipt = useServerFn(getAccountantReceiptUrl);
  /** Lädt den Beleg als Blob und öffnet ihn lokal (kein Adblocker-Problem). */
  function openReceipt(expenseId: string) {
    void (async () => {
      try {
        const url = await fetchReceipt({ data: { token, code, expenseId } });
        const res = await fetch(url);
        if (!res.ok) throw new Error("Beleg konnte nicht geladen werden.");
        const blobUrl = URL.createObjectURL(await res.blob());
        const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
        if (!win) {
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = `Beleg_${expenseId}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Beleg konnte nicht geöffnet werden.");
      }
    })();
  }

  const data = report.data;
  const documents: Row[] = data?.documents ?? [];
  const expenses: Row[] = data?.expenses ?? [];
  const timeEntries: Row[] = data?.timeEntries ?? [];
  const wageTypes: Row[] = data?.wageTypes ?? [];
  const holidays: Row[] = data?.holidays ?? [];
  const fahrtenbuchEntries: Row[] = data?.fahrtenbuchEntries ?? [];
  const fahrtenbuchVehicles: Row[] = data?.fahrtenbuchVehicles ?? [];

  const docRows: Table[] = documents.map((d) => ({
    Belegdatum: formatDate(String(d["issue_date"] ?? "")),
    Rechnungsnummer: String(d["number"] ?? ""),
    Kunde: String(d["customer_company"] || d["customer_name"] || ""),
    "USt-IdNr. Kunde": String(d["customer_vat_id"] ?? ""),
    Netto: de(num(d["net_total"] ?? d["total"])),
    Umsatzsteuer: de(num(d["vat_amount"])),
    Brutto: de(num(d["total"])),
    Steuerart: d["tax_mode"] === "domestic" ? "19% Inland" : "Reverse-Charge (§ 13b UStG)",
    Status: String(d["status"] ?? ""),
  }));

  const expenseRows: Table[] = expenses.map((e) => ({
    Belegdatum: formatDate(String(e["expense_date"] ?? "")),
    Belegnummer: String(e["document_number"] ?? ""),
    Lieferant: String(e["supplier"] ?? ""),
    Kategorie: String(e["category"] ?? ""),
    Netto: de(num(e["net_amount"])),
    Vorsteuer: de(num(e["vat_amount"])),
    Brutto: de(num(e["gross_amount"])),
  }));

  const fahrtenbuchRows: Table[] = fahrtenbuchEntries.map((trip) => {
    const vehicle = fahrtenbuchVehicles.find(
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
  });

  /** Nur bestätigte Einträge fließen in Stunden-, Lohn- und Tagessummen ein. */
  const isConfirmed = (t: Row) => String(t["approval_status"] ?? "approved") === "approved";
  const workEntries = timeEntries.filter(
    (t) => String(t["lohnart"] ?? "A") === "A" && isConfirmed(t),
  );
  const absenceEntries = timeEntries.filter(
    (t) => String(t["lohnart"] ?? "A") !== "A" && isConfirmed(t),
  );

  const timeRows: Table[] = timeEntries.map((t) => {
    const isWork = String(t["lohnart"] ?? "A") === "A";
    const payableHours = isWork
      ? approvedWorkHours({
          entry_type: "work",
          approval_status: String(t["approval_status"] ?? "approved"),
          hours: num(t["hours"]),
        })
      : 0;
    const rate = num(t["hourly_rate"]);
    return {
      Datum: formatDate(String(t["work_date"] ?? "")),
      Mitarbeiter: String(t["employee_name"] ?? ""),
      "Personal-Nr.": String(t["personnel_number"] ?? ""),
      Lohnart: String(t["lohnart"] ?? "A"),
      Von: String(t["start_time"] ?? "").slice(0, 5),
      Bis: String(t["end_time"] ?? "").slice(0, 5),
      "Pause (Min.)": String(t["break_minutes"] ?? 0),
      "Erfasst (Std.)": de(isWork ? num(t["hours"]) : 0),
      Stunden: de(payableHours),
      Stundensatz: de(rate),
      Lohn: de(payableHours * rate),
      Status: String(t["approval_status"] ?? "approved"),
      Einsatzort: String(t["location"] ?? ""),
      Notiz: String(t["note"] || t["absence_reason"] || ""),
    };
  });
  /** Monatliche Lohnvorbereitung aus derselben Logik wie im internen Team-Bereich. */
  const payrollEmployees = [
    ...new Map(
      timeEntries
        .filter((t) => String(t["employee_id"] ?? ""))
        .map((t) => [
          String(t["employee_id"]),
          {
            id: String(t["employee_id"]),
            name: String(t["employee_name"] ?? ""),
            personnel_number: String(t["personnel_number"] ?? ""),
            hourly_rate: Number(t["hourly_rate"] ?? 0),
            weekly_hours: Number(t["weekly_hours"] ?? 0),
            contract_type: String(t["contract_type"] ?? ""),
            contract_start: String(t["contract_start"] ?? ""),
          },
        ]),
    ).values(),
  ];
  const payrollInputEntries = timeEntries.map((t) => ({
    employee_id: String(t["employee_id"] ?? ""),
    employee_name: String(t["employee_name"] ?? ""),
    work_date: String(t["work_date"] ?? ""),
    hours: Number(t["hours"] ?? 0),
    hourly_rate: Number(t["hourly_rate"] ?? 0),
    entry_type: String(t["entry_type"] ?? "work"),
    absence_reason: String(t["absence_reason"] ?? ""),
    approval_status: String(t["approval_status"] ?? "approved"),
    completed_at: String(t["completed_at"] ?? ""),
    start_time: String(t["start_time"] ?? ""),
    end_time: String(t["end_time"] ?? ""),
    break_minutes: Number(t["break_minutes"] ?? 0),
  }));
  const payrollPrepared = buildLohnvorbereitung(
    payrollInputEntries,
    payrollEmployees,
    wageTypes.map((w) => ({
      kind: String(w["kind"] ?? ""),
      surcharge_percent: Number(w["surcharge_percent"] ?? 0),
      active: Boolean(w["active"] ?? true),
      time_from: String(w["time_from"] ?? ""),
      time_to: String(w["time_to"] ?? ""),
    })),
    holidays
      .map((h) => ({
        holiday_date: String(h["holiday_date"] ?? ""),
        surcharge_percent: Number(h["surcharge_percent"] ?? 80),
      }))
      .filter((h) => Boolean(h.holiday_date)),
  );
  const payrollRows: Table[] = lohnvorbereitungCsvRows(payrollPrepared, {
    period: `${from} bis ${to}`,
  });
  const payrollReadiness = payrollReadinessIssues(payrollInputEntries, payrollEmployees);
  const hoursTotal = payrollPrepared.reduce(
    (sum, row) => sum + row.normalstunden + row.sonntagstunden,
    0,
  );
  const wageTotal = payrollPrepared.reduce((sum, row) => sum + row.bruttoVorbereitet, 0);
  const sickDays = absenceEntries.filter((t) => t["lohnart"] === "K").length;
  const vacationDays = absenceEntries.filter((t) => t["lohnart"] === "U").length;

  const netTotal = documents.reduce((s, d) => s + num(d["net_total"] ?? d["total"]), 0);
  const vatTotal = documents.reduce((s, d) => s + num(d["vat_amount"]), 0);
  const expVat = expenses.reduce((s, e) => s + num(e["vat_amount"]), 0);
  const expNet = expenses.reduce((s, e) => s + num(e["net_amount"]), 0);
  const period = `${from}_${to}`;

  return {
    ready: true as const,
    code,
    data,
    datevBeraternummer,
    datevChart,
    datevExport,
    datevMandantennummer,
    datevSettings,
    docRows,
    expNet,
    expVat,
    expenseRows,
    expenses,
    fahrtenbuchRows,
    from,
    hoursTotal,
    netTotal,
    openReceipt,
    payrollReadiness,
    payrollRows,
    period,
    report,
    saveDatevSettings,
    setCode,
    setDatevBeraternummer,
    setDatevChart,
    setDatevMandantennummer,
    setFrom,
    setTo,
    setZipMonth,
    sickDays,
    timeEntries,
    timeRows,
    to,
    vacationDays,
    vatTotal,
    wageTotal,
    year,
    zipExport,
    zipMonth,
  };
}
export type AccountantPortalState = Extract<
  ReturnType<typeof useAccountantPortalState>,
  { ready: true }
>;
