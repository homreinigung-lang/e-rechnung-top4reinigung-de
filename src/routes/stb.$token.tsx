import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import JSZip from "jszip";
import {
  getAccountantMonthReceipts,
  getAccountantReceiptUrl,
  getAccountantReport,
  type Row,
} from "@/lib/accountant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";
import {
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  Printer,
} from "lucide-react";

import { PasswordInput } from "@/components/PasswordInput";
import { saveFile } from "@/lib/download";
import { TableSummary } from "@/components/TableSummary";
import {
  buildCsvBlob,
  filterRowsByDateRange,
  summaryHtml,
  type DateRange,
} from "@/lib/table-summary";

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
/** Wandelt deutsche Zahlenstrings ("1.234,56") zurück in eine Zahl. */
function parseDe(v: unknown) {
  return Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
}
function download(name: string, blob: Blob) {
  void (async () => {
    try {
      await saveFile(blob, name);
    } catch (e) {
      toast.error(`Download fehlgeschlagen: ${(e as Error).message}`);
    }
  })();
}

function downloadCsv(name: string, rows: Table[], range?: DateRange) {
  // Strikte Datumsfilterung + Endsummen oben + UTF-8-BOM/Semikolon (Excel-tauglich).
  const blob = buildCsvBlob(rows, { title: name.replace(/\.csv$/i, ""), range });
  if (!blob) {
    toast.error("Keine Daten im gewählten Zeitraum.");
    return;
  }
  download(name, blob);
}
function downloadExcel(
  name: string,
  sheets: { title: string; rows: Table[] }[],
  range?: DateRange,
) {
  sheets = sheets.map((s) => ({ ...s, rows: filterRowsByDateRange(s.rows, range) }));
  const tables = sheets
    .filter((s) => s.rows.length > 0)
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
  download(
    name,
    new Blob([`\uFEFF<html><head><meta charset="utf-8" /></head><body>${tables}</body></html>`], {
      type: "application/vnd.ms-excel;charset=utf-8",
    }),
  );
}

/** Erstellt eine druckfertige Stundenliste als PDF für die Lohnabrechnung. */
async function exportHoursPdf(
  filename: string,
  title: string,
  companyName: string,
  entries: Row[],
) {
  if (entries.length === 0) {
    toast.error("Keine Arbeitszeiten im gewählten Zeitraum.");
    return;
  }
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 18;
  doc.setFontSize(15);
  doc.text(title, 15, y);
  y += 7;
  doc.setFontSize(9);
  doc.text(`${companyName || "Stundenübersicht"} · Stunden je Mitarbeiter`, 15, y);
  y += 10;

  const per = new Map<
    string,
    { hours: number; amount: number; sick: number; vacation: number; personnel: string }
  >();
  for (const e of entries) {
    const name = String(e["employee_name"] || "Ohne Zuordnung");
    const code = String(e["lohnart"] ?? "A");
    const h = code === "A" ? num(e["hours"]) : 0;
    const cur = per.get(name) ?? { hours: 0, amount: 0, sick: 0, vacation: 0, personnel: "" };
    per.set(name, {
      hours: cur.hours + h,
      amount: cur.amount + h * num(e["hourly_rate"]),
      sick: cur.sick + (code === "K" ? 1 : 0),
      vacation: cur.vacation + (code === "U" ? 1 : 0),
      personnel: cur.personnel || String(e["personnel_number"] || ""),
    });
  }

  // Kompakte Abrechnungs-Zusammenfassung direkt in der Kopfzeile.
  const sumH = [...per.values()].reduce((s, v) => s + v.hours, 0);
  const sumA = [...per.values()].reduce((s, v) => s + v.amount, 0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Gesamtstunden: ${de(sumH)} Std.    Gesamtlohn: ${formatMoney(sumA)}`, 15, y);
  doc.setFont("helvetica", "normal");
  y += 8;

  doc.setFontSize(10);
  doc.text("Mitarbeiter (Personal-Nr.)", 15, y);
  doc.text("Krank (K)", 100, y, { align: "right" });
  doc.text("Urlaub (U)", 130, y, { align: "right" });
  doc.text("Stunden", 160, y, { align: "right" });
  doc.text("Vergütung", 195, y, { align: "right" });
  y += 2;
  doc.line(15, y, 195, y);
  y += 6;
  doc.setFontSize(9);
  let totalH = 0;
  let totalA = 0;
  for (const [name, v] of per) {
    totalH += v.hours;
    totalA += v.amount;
    doc.text(`${name}${v.personnel ? ` (${v.personnel})` : ""}`.slice(0, 44), 15, y);
    doc.text(`${v.sick}`, 100, y, { align: "right" });
    doc.text(`${v.vacation}`, 130, y, { align: "right" });
    doc.text(`${de(v.hours)} Std.`, 160, y, { align: "right" });
    doc.text(formatMoney(v.amount), 195, y, { align: "right" });
    y += 6;
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
  }
  y += 1;
  doc.line(15, y, 195, y);
  y += 6;
  doc.setFontSize(10);
  doc.text("Gesamt", 15, y);
  doc.text(`${de(totalH)} Std.`, 160, y, { align: "right" });
  doc.text(formatMoney(totalA), 195, y, { align: "right" });

  y += 12;
  doc.setFontSize(11);
  doc.text("Einzelnachweis (A = Arbeit, K = Krank, U = Urlaub, F = Feiertag)", 15, y);
  y += 6;
  doc.setFontSize(8);
  for (const e of entries) {
    if (y > 282) {
      doc.addPage();
      y = 20;
    }
    const code = String(e["lohnart"] ?? "A");
    const time =
      e["start_time"] && e["end_time"]
        ? `${String(e["start_time"]).slice(0, 5)}–${String(e["end_time"]).slice(0, 5)}`
        : "-";
    doc.text(
      `${formatDate(String(e["work_date"] ?? ""))}  [${code}]  ${String(e["employee_name"] || "Ohne Zuordnung").slice(0, 26)}  ${time}  Pause ${num(e["break_minutes"])} Min.`,
      15,
      y,
    );
    const h = code === "A" ? num(e["hours"]) : 0;
    doc.text(code === "A" ? `${de(h)} Std.` : "-", 150, y, { align: "right" });
    doc.text(formatMoney(h * num(e["hourly_rate"])), 195, y, { align: "right" });
    y += 5;
  }

  download(filename, doc.output("blob"));
}

/** Öffnet den nativen Kalender, ohne die Tastatureingabe zu blockieren. */

function openPicker(input: HTMLInputElement) {
  const el = input as HTMLInputElement & { showPicker?: () => void };
  try {
    el.showPicker?.();
  } catch {
    /* Browser ohne showPicker: natives Verhalten genügt. */
  }
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

  const [zipMonth, setZipMonth] = useState(new Date().toISOString().slice(0, 7));
  const fetchMonthReceipts = useServerFn(getAccountantMonthReceipts);
  const zipExport = useMutation({
    mutationFn: async () => {
      const files = await fetchMonthReceipts({ data: { token, code, month: zipMonth } });
      if (files.length === 0) throw new Error("Keine Belege in diesem Monat.");
      const zip = new JSZip();
      for (const f of files) {
        const res = await fetch(f.url);
        if (!res.ok) continue;
        zip.file(f.name, await res.blob());
      }
      const blob = await zip.generateAsync({ type: "blob" });
      await saveFile(blob, `Belege_${zipMonth}.zip`);
      return files.length;
    },
    onSuccess: (count) => toast.success(`${count} Belege als ZIP heruntergeladen`),
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

  const workEntries = timeEntries.filter((t) => String(t["lohnart"] ?? "A") === "A");
  const absenceEntries = timeEntries.filter((t) => String(t["lohnart"] ?? "A") !== "A");

  const timeRows: Table[] = timeEntries.map((t) => ({
    Datum: formatDate(String(t["work_date"] ?? "")),
    Mitarbeiter: String(t["employee_name"] ?? ""),
    "Personal-Nr.": String(t["personnel_number"] ?? ""),
    Lohnart: String(t["lohnart"] ?? "A"),
    Von: String(t["start_time"] ?? "").slice(0, 5),
    Bis: String(t["end_time"] ?? "").slice(0, 5),
    "Pause (Min.)": String(t["break_minutes"] ?? 0),
    Stunden: de(num(t["hours"])),
    Stundensatz: de(num(t["hourly_rate"])),
    Lohn: de(num(t["hours"]) * num(t["hourly_rate"])),
    Status: t["is_absence"]
      ? String(t["approval_status"] ?? "")
      : t["completed_at"]
        ? "erledigt"
        : "offen",
    Einsatzort: String(t["location"] ?? ""),
    Notiz: String(t["note"] || t["absence_reason"] || ""),
  }));
  const hoursTotal = workEntries.reduce((s, t) => s + num(t["hours"]), 0);
  const wageTotal = workEntries.reduce(
    (s, t) => s + num(t["hours"]) * num(t["hourly_rate"]),
    0,
  );
  const sickDays = absenceEntries.filter((t) => t["lohnart"] === "K").length;
  const vacationDays = absenceEntries.filter((t) => t["lohnart"] === "U").length;

  /** Lohn-Sammelzeile je Mitarbeiter: Ist-Stunden, K- und U-Tage. */
  const payrollRows: Table[] = Array.from(
    timeEntries
      .reduce((acc, t) => {
        const name = String(t["employee_name"] || "Ohne Zuordnung");
        const code = String(t["lohnart"] ?? "A");
        const cur = acc.get(name) ?? {
          Mitarbeiter: name,
          "Personal-Nr.": String(t["personnel_number"] ?? ""),
          Stunden: 0,
          Lohn: 0,
          "Kranktage (K)": 0,
          "Urlaubstage (U)": 0,
        };
        if (code === "A") {
          cur["Stunden"] = (cur["Stunden"] as number) + num(t["hours"]);
          cur["Lohn"] = (cur["Lohn"] as number) + num(t["hours"]) * num(t["hourly_rate"]);
        }
        if (code === "K") cur["Kranktage (K)"] = (cur["Kranktage (K)"] as number) + 1;
        if (code === "U") cur["Urlaubstage (U)"] = (cur["Urlaubstage (U)"] as number) + 1;
        acc.set(name, cur);
        return acc;
      }, new Map<string, Record<string, string | number>>())
      .values(),
  ).map((r) => ({
    ...r,
    Stunden: de(r["Stunden"] as number),
    Lohn: de(r["Lohn"] as number),
  })) as Table[];

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
          Nur-Lese-Zugriff auf Rechnungen, Ausgaben und Stundenzettel aller Mitarbeiter inkl. DATEV-
          und Excel-Export.
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
          <Input
            id="from"
            type="date"
            lang="de-DE"
            dir="ltr"
            max={to || undefined}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onClick={(e) => openPicker(e.currentTarget)}
            className="w-full"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Zeitraum bis</Label>
          <Input
            id="to"
            type="date"
            lang="de-DE"
            dir="ltr"
            min={from || undefined}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onClick={(e) => openPicker(e.currentTarget)}
            className="w-full"
          />
        </div>
        <div className="sm:col-span-3">
          <Button onClick={() => report.mutate()} disabled={report.isPending || !code}>
            <Lock className="size-4" /> {report.isPending ? "Lädt…" : "Daten laden"}
          </Button>
        </div>
      </section>

      {data && (
        <>
          <section className="no-print flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => downloadCsv(`Rechnungen_${period}.csv`, docRows, { from, to })}
            >
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
              onClick={() =>
                void exportHoursPdf(
                  `Stundenzettel_${period}.pdf`,
                  `Stundenliste ${formatDate(from)} – ${formatDate(to)}`,
                  data.companyName,
                  timeEntries,
                )
              }
            >
              <FileText className="size-4" /> Stundenliste (PDF)
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

            <div className="flex items-center gap-2 rounded-md border px-2">
              <Label htmlFor="zipMonth" className="text-xs text-muted-foreground">
                Belege-Monat
              </Label>
              <Input
                id="zipMonth"
                type="month"
                value={zipMonth}
                onChange={(e) => setZipMonth(e.target.value)}
                className="h-8 w-[150px] border-0 shadow-none focus-visible:ring-0"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={zipExport.isPending}
                onClick={() => zipExport.mutate()}
              >
                {zipExport.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileArchive className="size-4" />
                )}
                ZIP laden
              </Button>
            </div>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Als PDF drucken
            </Button>
          </section>

          <section className="print-area rounded-lg border bg-card p-6">
            <h2 className="font-display text-lg font-semibold">
              Auswertung {formatDate(from)} – {formatDate(to)}
            </h2>

            {/* Abrechnungs-Zusammenfassung ganz oben für den Buchhalter. */}
            <div className="mt-4 rounded-md border-2 border-primary/30 bg-muted/40 p-4">
              <h3 className="font-display text-sm font-semibold">
                Abrechnungsübersicht (Zeitraum {formatDate(from)} – {formatDate(to)})
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Gesamtstunden</div>
                  <div className="text-xl font-semibold">{de(hoursTotal)} Std.</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Gesamtlohn</div>
                  <div className="text-xl font-semibold">{formatMoney(wageTotal)}</div>
                </div>
              </div>
              {payrollRows.length > 0 && (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">Mitarbeiter</th>
                      <th className="py-1 pr-3 font-medium">Personal-Nr.</th>
                      <th className="py-1 pr-3 text-right font-medium">Stunden</th>
                      <th className="py-1 text-right font-medium">Lohn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollRows.map((r) => (
                      <tr key={String(r["Mitarbeiter"])} className="border-b last:border-0">
                        <td className="py-1 pr-3">{String(r["Mitarbeiter"])}</td>
                        <td className="py-1 pr-3">{String(r["Personal-Nr."] || "—")}</td>
                        <td className="py-1 pr-3 text-right">{String(r["Stunden"])} Std.</td>
                        <td className="py-1 text-right">{formatMoney(parseDe(r["Lohn"]))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Kpi label="Umsatz netto" value={formatMoney(netTotal)} />
              <Kpi label="Umsatzsteuer" value={formatMoney(vatTotal)} />
              <Kpi label="Ausgaben netto" value={formatMoney(expNet)} />
              <Kpi label="USt-Zahllast" value={formatMoney(vatTotal - expVat)} />
              <Kpi label="Arbeitsstunden (bestätigt)" value={`${de(hoursTotal)} Std.`} />
              <Kpi label="Kranktage (K)" value={`${sickDays}`} />
              <Kpi label="Urlaubstage (U)" value={`${vacationDays}`} />
            </div>

            <h3 className="mt-6 font-display text-sm font-semibold">Rechnungen</h3>
            <DataTable rows={docRows} empty="Keine Rechnungen im Zeitraum." />
            <h3 className="mt-6 font-display text-sm font-semibold">Ausgaben</h3>
            <DataTable rows={expenseRows} empty="Keine Ausgaben im Zeitraum." />
            <h3 className="mt-6 font-display text-sm font-semibold">
              Lohnabrechnung je Mitarbeiter
            </h3>
            <DataTable rows={payrollRows} empty="Keine Arbeitszeiten im Zeitraum." />

            <h3 className="mt-6 font-display text-sm font-semibold">Belege (PDF/Bild)</h3>
            {expenses.filter((e) => String(e["receipt_url"] ?? "")).length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Keine hochgeladenen Belege im Zeitraum.
              </p>
            ) : (
              <ul className="mt-2 divide-y text-sm">
                {expenses
                  .filter((e) => String(e["receipt_url"] ?? ""))
                  .map((e) => (
                    <li key={String(e["id"])} className="flex items-center gap-3 py-2">
                      <span className="flex-1">
                        {formatDate(String(e["expense_date"] ?? ""))} ·{" "}
                        {String(e["supplier"] || "Ohne Lieferant")}
                        {e["document_number"] ? ` · ${String(e["document_number"])}` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        {formatMoney(num(e["gross_amount"]))}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="no-print"
                        onClick={() => openReceipt(String(e["id"]))}
                      >
                        <Paperclip className="size-4" /> Beleg öffnen
                      </Button>
                    </li>
                  ))}
              </ul>
            )}

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
