import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";
import { buildGobdExport, downloadBlob } from "@/lib/gobd";
import { saveFile } from "@/lib/download";
import {
  Archive,
  Calculator,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  Printer,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { buildEuerCsv, buildEuerPdf, computeEuer } from "@/lib/euer";
import { AccountantAccessCard } from "@/components/AccountantAccessCard";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { TableSummary } from "@/components/TableSummary";
import {
  buildCsvBlob,
  filterRowsByDateRange,
  summaryHtml,
  type DateRange,
} from "@/lib/table-summary";

export const Route = createFileRoute("/_authenticated/steuerberater")({
  head: () => ({
    meta: [
      { title: "Steuerberater – DATEV, Excel & PDF Export" },
      {
        name: "description",
        content:
          "Auswertung für den Steuerberater: Umsatz, Umsatzsteuer und Ausgaben je Zeitraum als DATEV-CSV, Excel oder PDF exportieren.",
      },
      { property: "og:title", content: "Steuerberater-Auswertung" },
      {
        property: "og:description",
        content: "Umsätze, Vorsteuer und Zahllast exportieren – DATEV, Excel, PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Steuerberater,
});

type Row = Record<string, string>;

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function download(name: string, blob: Blob) {
  void saveFile(blob, name);
}

function downloadCsv(name: string, rows: Row[], range?: DateRange) {
  if (rows.length === 0) {
    toast.error("Keine Daten im gewählten Zeitraum.");
    return;
  }
  // Endsummen stehen generisch immer ganz oben im Export.
  const csv = buildCsvWithSummary(rows, { title: name.replace(/\.csv$/i, "") });
  download(name, new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
}

function downloadExcel(
  name: string,
  sheets: { title: string; rows: Row[] }[],
  range?: DateRange,
) {
  sheets = sheets.map((s) => ({ ...s, rows: filterRowsByDateRange(s.rows, range) }));
  const filled = sheets.filter((s) => s.rows.length > 0);
  const tables = filled
    .map((s) => {
      const headers = Object.keys(s.rows[0]!);
      return `<h3>${s.title}</h3>${summaryHtml(s.rows, s.title)}<table border="1"><tr>${headers
        .map((h) => `<th>${h}</th>`)
        .join("")}</tr>${s.rows
        .map((r) => `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`)
        .join("")}</table>`;
    })
    .join("<br/>");
  if (!tables) {
    toast.error("Keine Daten im gewählten Zeitraum.");
    return;
  }
  // Gesamtübersicht aller Blätter zuerst.
  const overview = filled
    .map((s) => `<h4>${s.title}</h4>${summaryHtml(s.rows, s.title)}`)
    .join("");
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body><h2>Zusammenfassung (Endsummen)</h2>${overview}<hr/>${tables}</body></html>`;
  download(name, new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" }));
}

function num(v: unknown) {
  return Number(v ?? 0) || 0;
}

function de(v: number) {
  return v.toFixed(2).replace(".", ",");
}

function Steuerberater() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data: documents = [] } = useQuery({
    queryKey: ["stb_documents", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .is("deleted_at", null)
        .eq("type", "invoice")
        .gte("issue_date", from)
        .lte("issue_date", to)
        .order("issue_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["stb_expenses", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .is("deleted_at", null)
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Zeiterfassung inkl. bestätigter Schichten und Abwesenheiten (K/U) – Basis der Lohnabrechnung.
  const { data: timeEntries = [] } = useQuery({
    queryKey: ["stb_time_entries", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        // Ohne photo_paths: Fotos bleiben ausschließlich intern (Verwaltung).
        .select(
          "id, user_id, employee_id, employee_name, customer_id, project_id, work_date, start_time, end_time, break_minutes, hours, hourly_rate, location, note, billed, entry_type, absence_reason, approval_status, decided_at, decided_by, decision_note, completed_at, created_at, updated_at, employees(name, personnel_number)",
        )
        .gte("work_date", from)
        .lte("work_date", to)
        .neq("approval_status", "rejected")
        .order("work_date");
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
        documents as unknown as Record<string, unknown>[],
        expenses as unknown as Record<string, unknown>[],
        from,
        to,
      ),
    [documents, expenses, from, to],
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

  // DATEV-kompatibler Buchungsstapel (vereinfacht, EXTF-Spaltennamen).
  const datevRows: Row[] = [
    ...documents.map((d) => ({
      Umsatz: de(num(d.total)),
      "Soll/Haben-Kennzeichen": "S",
      "WKZ Umsatz": "EUR",
      Konto: "10000",
      "Gegenkonto (ohne BU-Schlüssel)":
        (d as Record<string, unknown>)["tax_mode"] === "domestic" ? "8400" : "8336",
      "BU-Schlüssel": "",
      Belegdatum: formatDate(d.issue_date).slice(0, 5).replace(".", ""),
      Belegfeld1: d.number,
      Buchungstext: (d.customer_company || d.customer_name).slice(0, 60),
    })),
    ...expenses.map((e) => ({
      Umsatz: de(num(e.gross_amount)),
      "Soll/Haben-Kennzeichen": "H",
      "WKZ Umsatz": "EUR",
      Konto: "6300",
      "Gegenkonto (ohne BU-Schlüssel)": "70000",
      "BU-Schlüssel": num(e.vat_amount) > 0 ? "9" : "",
      Belegdatum: formatDate(e.expense_date).slice(0, 5).replace(".", ""),
      Belegfeld1: e.document_number,
      Buchungstext: e.supplier.slice(0, 60),
    })),
  ];

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
    const emp = (t["employees"] ?? null) as { name?: string; personnel_number?: string } | null;
    const code = lohnart(t);
    return {
      Datum: formatDate(String(t["work_date"] ?? "")),
      Mitarbeiter: String(t["employee_name"] || emp?.name || ""),
      "Personal-Nr.": String(emp?.personnel_number ?? ""),
      Lohnart: code,
      Von: String(t["start_time"] ?? "").slice(0, 5),
      Bis: String(t["end_time"] ?? "").slice(0, 5),
      "Pause (Min.)": String(t["break_minutes"] ?? 0),
      Stunden: de(code === "A" ? num(t["hours"]) : 0),
      Stundensatz: de(num(t["hourly_rate"])),
      Lohn: de(code === "A" ? num(t["hours"]) * num(t["hourly_rate"]) : 0),
      Status: t["completed_at"] ? "erledigt" : String(t["approval_status"] ?? "offen"),
      Einsatzort: String(t["location"] ?? ""),
    };
  });

  const payrollRows: Row[] = Array.from(
    timeList
      .reduce(
        (acc, t) => {
          const emp = (t["employees"] ?? null) as {
            name?: string;
            personnel_number?: string;
          } | null;
          const name = String(t["employee_name"] || emp?.name || "Ohne Zuordnung");
          const code = lohnart(t);
          const cur = acc.get(name) ?? {
            name,
            pnr: String(emp?.personnel_number ?? ""),
            hours: 0,
            amount: 0,
            sick: 0,
            vacation: 0,
          };
          if (code === "A") {
            cur.hours += num(t["hours"]);
            cur.amount += num(t["hours"]) * num(t["hourly_rate"]);
          }
          if (code === "K") cur.sick += 1;
          if (code === "U") cur.vacation += 1;
          acc.set(name, cur);
          return acc;
        },
        new Map<
          string,
          {
            name: string;
            pnr: string;
            hours: number;
            amount: number;
            sick: number;
            vacation: number;
          }
        >(),
      )
      .values(),
  ).map((v) => ({
    Mitarbeiter: v.name,
    "Personal-Nr.": v.pnr,
    Stunden: de(v.hours),
    Lohn: de(v.amount),
    "Kranktage (K)": String(v.sick),
    "Urlaubstage (U)": String(v.vacation),
  }));

  const period = `${from}_${to}`;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="font-display text-2xl font-semibold">Steuerberater</h1>
        <p className="text-sm text-muted-foreground">
          Auswertung und Belegexport für Ihren Steuerberater – DATEV-Buchungsstapel, Excel oder PDF.
        </p>
      </div>

      <SteuerberaterZugriffsstatus />

      <div className="no-print">
        <AccountantAccessCard />
      </div>

      <section className="no-print grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="from">Zeitraum von</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Zeitraum bis</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {[1, 2, 3, 4].map((q) => (
            <Button
              key={q}
              variant="outline"
              size="sm"
              onClick={() => {
                const startMonth = (q - 1) * 3;
                const start = new Date(Date.UTC(year, startMonth, 1));
                const end = new Date(Date.UTC(year, startMonth + 3, 0));
                setFrom(start.toISOString().slice(0, 10));
                setTo(end.toISOString().slice(0, 10));
              }}
            >
              Q{q} {year}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFrom(`${year}-01-01`);
              setTo(`${year}-12-31`);
            }}
          >
            Gesamtes Jahr {year}
          </Button>
        </div>
      </section>

      <section className="no-print flex flex-wrap gap-2">
        <Button onClick={() => downloadCsv(`DATEV_Buchungsstapel_${period}.csv`, datevRows, { from, to })}>
          <Download className="size-4" /> DATEV-Export (CSV)
        </Button>
        <Button variant="outline" onClick={() => downloadCsv(`Rechnungen_${period}.csv`, docRows, { from, to })}>
          <Download className="size-4" /> Rechnungen (CSV)
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadCsv(`Ausgaben_${period}.csv`, expenseRows, { from, to })}
        >
          <Download className="size-4" /> Ausgaben (CSV)
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadCsv(`Stundenzettel_${period}.csv`, timeRows, { from, to })}
        >
          <Download className="size-4" /> Stundenzettel (CSV)
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadCsv(`Lohnabrechnung_${period}.csv`, payrollRows, { from, to })}
        >
          <Download className="size-4" /> Lohnabrechnung (CSV)
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadExcel(`Steuerauswertung_${period}.xls`, [
              { title: "Rechnungen", rows: docRows },
              { title: "Ausgaben", rows: expenseRows },
              { title: "Stundenzettel", rows: timeRows },
              { title: "Lohnabrechnung", rows: payrollRows },
            ])
          }
        >
          <FileSpreadsheet className="size-4" /> Excel-Export
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" /> Als PDF drucken
        </Button>
      </section>

      <section className="print-area rounded-lg border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Lohnabrechnung je Mitarbeiter</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bestätigte Ist-Stunden aus dem Control Center inkl. Kranktagen (K) und Urlaubstagen (U).
        </p>
        <Table rows={payrollRows} empty="Keine Arbeitszeiten im Zeitraum." />
      </section>

      <section className="no-print rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <ShieldCheck className="size-4 text-primary" /> GoBD-Prüfexport (Betriebsprüfung)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enthält Belegdaten, Positionen, das unveränderbare Prüfprotokoll (Audit-Log) sowie
              alle archivierten Original-PDF-Dateien des gewählten Zeitraums als ZIP-Archiv.
            </p>
          </div>
          <Button onClick={() => gobdExport.mutate()} disabled={gobdExport.isPending}>
            <Archive className="size-4" />
            {gobdExport.isPending ? "Export wird erstellt…" : "GoBD-Export herunterladen"}
          </Button>
        </div>
      </section>

      <section className="print-area rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Calculator className="size-5 text-primary" /> EÜR – Einnahmenüberschussrechnung
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gewinnermittlung nach § 4 Abs. 3 EStG für {formatDate(from)} – {formatDate(to)}.
              Entwürfe bleiben unberücksichtigt, Stornorechnungen mindern die Einnahmen.
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button onClick={() => euerPdf.mutate()} disabled={euerPdf.isPending}>
              <FileText className="size-4" />
              {euerPdf.isPending ? "PDF wird erstellt…" : "EÜR als PDF"}
            </Button>
            <Button
              variant="outline"
              onClick={() => download(`EUER_${period}.csv`, buildEuerCsv(euer))}
            >
              <Download className="size-4" /> EÜR als CSV
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Kpi label="Betriebseinnahmen (netto)" value={formatMoney(euer.incomeNet)} />
          <Kpi label="Betriebsausgaben (netto)" value={formatMoney(euer.expenseNet)} />
          <Kpi
            label={euer.profit >= 0 ? "Gewinn (netto)" : "Verlust (netto)"}
            value={formatMoney(euer.profit)}
          />
        </div>

        <Table
          rows={[
            { Position: "Betriebseinnahmen (netto)", Betrag: formatMoney(euer.incomeNet) },
            { Position: "Vereinnahmte Umsatzsteuer", Betrag: formatMoney(euer.incomeVat) },
            { Position: "Betriebseinnahmen (brutto)", Betrag: formatMoney(euer.incomeGross) },
            { Position: "Betriebsausgaben (netto)", Betrag: formatMoney(euer.expenseNet) },
            { Position: "Gezahlte Vorsteuer", Betrag: formatMoney(euer.expenseVat) },
            { Position: "Betriebsausgaben (brutto)", Betrag: formatMoney(euer.expenseGross) },
            {
              Position: euer.profit >= 0 ? "Gewinn (netto)" : "Verlust (netto)",
              Betrag: formatMoney(euer.profit),
            },
          ]}
          empty=""
        />

        <h3 className="mt-6 font-display text-sm font-semibold">Betriebsausgaben je Kategorie</h3>
        <Table
          rows={euer.expensesByCategory.map((c) => ({
            Kategorie: c.category,
            Netto: formatMoney(c.net),
            Vorsteuer: formatMoney(c.vat),
            Brutto: formatMoney(c.gross),
          }))}
          empty="Keine Ausgaben im Zeitraum."
        />
      </section>

      <section className="print-area rounded-lg border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">
          Steuerauswertung {formatDate(from)} – {formatDate(to)}
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Kpi label="Umsatz netto" value={formatMoney(totals.net)} />
          <Kpi label="Umsatzsteuer (Ausgang)" value={formatMoney(totals.vat)} />
          <Kpi label="Umsatz brutto" value={formatMoney(totals.gross)} />
          <Kpi label="Ausgaben netto" value={formatMoney(totals.expNet)} />
          <Kpi label="Vorsteuer" value={formatMoney(totals.expVat)} />
          <Kpi label="Ausgaben brutto" value={formatMoney(totals.expGross)} />
          <Kpi label="USt-Zahllast" value={formatMoney(totals.zahllast)} />
          <Kpi label="Ergebnis (netto)" value={formatMoney(totals.ergebnis)} />
          <Kpi label="Belege" value={`${documents.length} / ${expenses.length}`} />
        </div>

        <h3 className="mt-6 font-display text-sm font-semibold">Rechnungen</h3>
        <Table rows={docRows} empty="Keine Rechnungen im Zeitraum." />

        <h3 className="mt-6 font-display text-sm font-semibold">Ausgaben</h3>
        <Table rows={expenseRows} empty="Keine Ausgaben im Zeitraum." />
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-base font-semibold">{value}</div>
    </div>
  );
}

function Table({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="mt-2 text-sm text-muted-foreground">{empty}</p>;
  const headers = Object.keys(rows[0]!);
  return (
    <>
    <TableSummary rows={rows} />
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {headers.map((h) => (
                <td key={h} className="py-1.5 pr-3">
                  {r[h]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

const STEUERBERATER_RECHTE = [
  { label: "Rechnungen", erlaubt: true },
  { label: "Ausgaben", erlaubt: true },
  { label: "DATEV-Export", erlaubt: true },
  { label: "Excel-Export", erlaubt: true },
  { label: "PDF-Belege", erlaubt: true },
  { label: "Bearbeitung der Unternehmensdaten", erlaubt: false },
];

function SteuerberaterZugriffsstatus() {
  const queryClient = useQueryClient();
  const { data: accesses = [] } = useQuery({
    queryKey: ["accountant_access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accountant_access")
        .select("id, email, active, created_at, last_used_at, invited_at, activated_at")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        email: string;
        active: boolean;
        created_at: string;
        last_used_at: string | null;
        invited_at: string | null;
        activated_at: string | null;
      }[];
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("accountant_access")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accountant_access"] });
      toast.success("Steuerberater-Zugang wurde widerrufen.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const zugang = accesses[0];
  const istAktiv = Boolean(zugang && (zugang.activated_at || zugang.last_used_at));
  const istEingeladen = Boolean(zugang && !istAktiv && zugang.invited_at);
  const aktiv = zugang;
  const statusLabel = istAktiv
    ? "🟢 Aktiv"
    : istEingeladen
      ? "🟡 Einladung gesendet"
      : zugang
        ? "⚪ Zugang erstellt – noch nicht eingeladen"
        : "Noch kein Steuerberater verbunden";
  const statusClass = istAktiv
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : istEingeladen
      ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "border-muted bg-muted/50 text-muted-foreground";

  return (
    <section className="no-print rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ShieldCheck className="size-5 text-primary" /> Berechtigungen des Steuerberaters
          </h2>
          <p className="text-sm text-muted-foreground">
            Übersicht über die eingeräumten Lese-Rechte und den aktuellen Zugangsstatus.
          </p>
        </div>
        <div
          className={
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium " +
            statusClass
          }
        >
          {statusLabel}
        </div>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {STEUERBERATER_RECHTE.map((recht) => (
          <li
            key={recht.label}
            className="flex items-center gap-2 rounded-md border p-2 text-sm"
          >
            {recht.erlaubt ? (
              <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Lock className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className={recht.erlaubt ? "" : "text-muted-foreground line-through"}>
              {recht.label}
            </span>
          </li>
        ))}
      </ul>

      {aktiv && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
          <div className="min-w-0 text-sm">
            <div className="font-medium">
              {aktiv.email || "Steuerberater ohne E-Mail"}
            </div>
            <div className="text-xs text-muted-foreground">
              {istAktiv
                ? `Aktiv seit ${formatDate(aktiv.activated_at ?? aktiv.last_used_at ?? aktiv.created_at)}`
                : istEingeladen
                  ? `Einladung gesendet am ${formatDate(aktiv.invited_at!)} · noch keine Anmeldung`
                  : `Zugang erstellt am ${formatDate(aktiv.created_at)} · Einladung noch nicht versendet`}
              {aktiv.last_used_at ? ` · zuletzt genutzt ${formatDate(aktiv.last_used_at)}` : ""}
            </div>
          </div>
          <ConfirmDeleteButton
            size="sm"
            variant="destructive"
            ariaLabel="Zugang widerrufen"
            title="Zugang wirklich widerrufen?"
            description={`Der Steuerberater-Zugang „${aktiv.email || "ohne E-Mail"}" wird unwiderruflich widerrufen. Der Steuerberater kann danach nicht mehr auf Ihre Daten zugreifen. Diese Aktion kann nicht rückgängig gemacht werden.`}
            confirmLabel="Zugang widerrufen"
            onConfirm={() => revoke.mutate(aktiv.id)}
          >
            <ShieldOff className="size-4" /> Widerrufen
          </ConfirmDeleteButton>
        </div>
      )}
    </section>
  );
}
