import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";

import { saveFile } from "@/lib/download";

import {
  Archive,
  Calculator,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { type DatevChart } from "@/lib/datev-extf";

import { buildEuerCsv } from "@/lib/euer";
import { AccountantAccessCard } from "@/components/AccountantAccessCard";

import { download, downloadCsv, downloadExcel } from "./shared";

import { Kpi } from "./Kpi";
import { EuerSummaryToggle } from "./EuerSummaryToggle";
import { Table } from "./Table";
import { SteuerberaterZugriffsstatus } from "./SteuerberaterZugriffsstatus";

import type { SteuerberaterState } from "./useSteuerberaterState";
export function SteuerberaterView({ state }: { state: SteuerberaterState }) {
  const {
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
  } = state;
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

      <section className="no-print space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">DATEV-Kontenrahmen und Kontenzuordnung</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Kontenrahmen
            <select
              className="mt-1 w-full rounded border bg-background p-2"
              value={chart}
              onChange={(e) => setChart(e.target.value as DatevChart)}
            >
              <option value="SKR03">SKR03</option>
              <option value="SKR04">SKR04</option>
            </select>
          </label>
          <label className="text-sm">
            Beraternummer
            <Input
              value={beraternummer}
              onChange={(e) => setBeraternummer(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="text-sm">
            Mandantennummer
            <Input
              value={mandantennummer}
              onChange={(e) => setMandantennummer(e.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={saveDatevSettings.isPending}
          onClick={() => saveDatevSettings.mutate()}
        >
          DATEV-Einstellungen speichern
        </Button>
      </section>

      <section className="no-print flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void (async () => {
              if (fahrtenbuchRows.length === 0) {
                toast.error("Keine Fahrten im gewählten Zeitraum.");
                return;
              }
              try {
                const { buildBrandedFahrtenbuchPdf } =
                  await import("@/lib/fahrtenbuch-branded-pdf");
                await saveFile(
                  await buildBrandedFahrtenbuchPdf(fahrtenbuchRows, from, to),
                  `Fahrtenbuch_${period}.pdf`,
                );
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Fahrtenbuch PDF konnte nicht erstellt werden.",
                );
              }
            })()
          }
        >
          <FileText className="size-4" /> Fahrtenbuch PDF
        </Button>
        <Button onClick={() => datevExport.mutate()} disabled={datevExport.isPending}>
          <Download className="size-4" /> DATEV-Export (CSV)
        </Button>
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
          onClick={() => receiptZipExport.mutate()}
          disabled={receiptZipExport.isPending || expenses.length === 0}
        >
          {receiptZipExport.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileArchive className="size-4" />
          )}
          Alle Belege herunterladen
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadCsv(`Stundenzettel_${period}.csv`, timeRows, { from, to })}
        >
          <Download className="size-4" /> Stundenzettel (CSV)
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadCsv(`Lohnvorbereitung_${period}.csv`, payrollRows, { from, to })}
        >
          <Download className="size-4" /> Lohnvorbereitung (CSV)
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadExcel(
              `Steuerauswertung_${period}.xls`,
              [
                { title: "Fahrtenbuch", rows: fahrtenbuchRows },
                { title: "Rechnungen", rows: docRows },
                { title: "Ausgaben", rows: expenseRows },
                { title: "Stundenzettel", rows: timeRows },
                { title: "Lohnvorbereitung", rows: payrollRows },
              ],
              { from, to },
            )
          }
        >
          <FileSpreadsheet className="size-4" /> Excel-Export
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" /> Als PDF drucken
        </Button>
      </section>

      <section className="print-area rounded-lg border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Lohnvorbereitung je Mitarbeiter</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bestätigte Ist-Stunden mit Personalnummer, Vertragsart, Stundensatz sowie Krank- und
          Urlaubstagen als Vorbereitung für die Lohnabrechnung.
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

        <EuerSummaryToggle incomeGross={euer.incomeGross} profit={euer.profit} />
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
          summary={null}
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
