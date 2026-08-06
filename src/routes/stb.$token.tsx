import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAccountantReport, type Row } from "@/lib/accountant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";
import { Download, FileSpreadsheet, Lock, Printer } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import { saveFile } from "@/lib/download";

export const Route = createFileRoute("/stb/$token")({
  head: () => ({
    meta: [
      { title: "Steuerberater-Zugang – Nur-Lese-Auswertung" },
      {
        name: "description",
        content:
          "Geschützter Nur-Lese-Zugang für den Steuerberater: Rechnungen, Ausgaben und Exporte als DATEV-CSV oder Excel.",
      },
      { property: "og:title", content: "Steuerberater-Zugang" },
      { property: "og:description", content: "Rechnungen und Ausgaben ansehen und exportieren." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountantPortal,
});

type Table = Record<string, string>;

function num(v: unknown) {
  return Number(v ?? 0) || 0;
}
function de(v: number) {
  return v.toFixed(2).replace(".", ",");
}
function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
function download(name: string, blob: Blob) {
  void saveFile(blob, name);
}
function downloadCsv(name: string, rows: Table[]) {
  if (rows.length === 0) {
    toast.error("Keine Daten im gewählten Zeitraum.");
    return;
  }
  const headers = Object.keys(rows[0]!);
  const csv = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(";")),
  ].join("\r\n");
  download(name, new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
}
function downloadExcel(name: string, sheets: { title: string; rows: Table[] }[]) {
  const tables = sheets
    .filter((s) => s.rows.length > 0)
    .map((s) => {
      const headers = Object.keys(s.rows[0]!);
      return `<h3>${s.title}</h3><table border="1"><tr>${headers
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
  download(
    name,
    new Blob(
      [`\uFEFF<html><head><meta charset="utf-8" /></head><body>${tables}</body></html>`],
      { type: "application/vnd.ms-excel;charset=utf-8" },
    ),
  );
}

function AccountantPortal() {
  const { token } = Route.useParams();
  const year = new Date().getFullYear();
  const [code, setCode] = useState("");
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const fetchReport = useServerFn(getAccountantReport);
  const report = useMutation({
    mutationFn: () => fetchReport({ data: { token, code, from, to } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const data = report.data;
  const documents: Row[] = data?.documents ?? [];
  const expenses: Row[] = data?.expenses ?? [];
  const timeEntries: Row[] = data?.timeEntries ?? [];

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

  const timeRows: Table[] = timeEntries.map((t) => ({
    Datum: formatDate(String(t["work_date"] ?? "")),
    Mitarbeiter: String(t["employee_name"] ?? ""),
    Von: String(t["start_time"] ?? "").slice(0, 5),
    Bis: String(t["end_time"] ?? "").slice(0, 5),
    "Pause (Min.)": String(t["break_minutes"] ?? 0),
    Stunden: de(num(t["hours"])),
    Stundensatz: de(num(t["hourly_rate"])),
    Lohn: de(num(t["hours"]) * num(t["hourly_rate"])),
    Einsatzort: String(t["location"] ?? ""),
    Notiz: String(t["note"] ?? ""),
  }));
  const hoursTotal = timeEntries.reduce((s, t) => s + num(t["hours"]), 0);

  const netTotal = documents.reduce((s, d) => s + num(d["net_total"] ?? d["total"]), 0);
  const vatTotal = documents.reduce((s, d) => s + num(d["vat_amount"]), 0);
  const expVat = expenses.reduce((s, e) => s + num(e["vat_amount"]), 0);
  const expNet = expenses.reduce((s, e) => s + num(e["net_amount"]), 0);
  const period = `${from}_${to}`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header className="no-print">
        <h1 className="font-display text-2xl font-semibold">
          Steuerberater-Zugang {data?.companyName ? `– ${data.companyName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Nur-Lese-Zugriff auf Rechnungen, Ausgaben und Stundenzettel aller Mitarbeiter inkl. DATEV- und Excel-Export.
        </p>
      </header>

      <section className="no-print grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="code">Zugangspasswort</Label>
          <PasswordInput
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="z. B. A1B2"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">Zeitraum von</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Zeitraum bis</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <Button onClick={() => report.mutate()} disabled={report.isPending || !code}>
            <Lock className="size-4" /> Daten laden
          </Button>
        </div>
      </section>

      {data && (
        <>
          <section className="no-print flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadCsv(`Rechnungen_${period}.csv`, docRows)}>
              <Download className="size-4" /> Rechnungen (CSV)
            </Button>
            <Button variant="outline" onClick={() => downloadCsv(`Ausgaben_${period}.csv`, expenseRows)}>
              <Download className="size-4" /> Ausgaben (CSV)
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadCsv(`Stundenzettel_${period}.csv`, timeRows)}
            >
              <Download className="size-4" /> Stundenzettel (CSV)
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadExcel(`Steuerauswertung_${period}.xls`, [
                  { title: "Rechnungen", rows: docRows },
                  { title: "Ausgaben", rows: expenseRows },
                  { title: "Stundenzettel", rows: timeRows },
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
            <h2 className="font-display text-lg font-semibold">
              Auswertung {formatDate(from)} – {formatDate(to)}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Kpi label="Umsatz netto" value={formatMoney(netTotal)} />
              <Kpi label="Umsatzsteuer" value={formatMoney(vatTotal)} />
              <Kpi label="Ausgaben netto" value={formatMoney(expNet)} />
              <Kpi label="USt-Zahllast" value={formatMoney(vatTotal - expVat)} />
              <Kpi label="Arbeitsstunden" value={`${de(hoursTotal)} Std.`} />
            </div>

            <h3 className="mt-6 font-display text-sm font-semibold">Rechnungen</h3>
            <DataTable rows={docRows} empty="Keine Rechnungen im Zeitraum." />
            <h3 className="mt-6 font-display text-sm font-semibold">Ausgaben</h3>
            <DataTable rows={expenseRows} empty="Keine Ausgaben im Zeitraum." />
            <h3 className="mt-6 font-display text-sm font-semibold">
              Stundenzettel (alle Mitarbeiter)
            </h3>
            <DataTable rows={timeRows} empty="Keine Arbeitszeiten im Zeitraum." />
          </section>
        </>
      )}
    </main>
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

function DataTable({ rows, empty }: { rows: Table[]; empty: string }) {
  if (rows.length === 0) return <p className="mt-2 text-sm text-muted-foreground">{empty}</p>;
  const headers = Object.keys(rows[0]!);
  return (
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
  );
}
