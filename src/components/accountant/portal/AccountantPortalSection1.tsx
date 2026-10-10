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
  Paperclip,
  Printer,
} from "lucide-react";

import { saveFile } from "@/lib/download";

import { filterRowsByDateRange } from "@/lib/table-summary";
import { num, de, parseDe, downloadCsv, downloadExcel, exportHoursPdf } from "./shared";

import { Kpi } from "./Kpi";
import { DataTable } from "./DataTable";
import type { AccountantPortalState } from "./useAccountantPortalState";
export function AccountantPortalSection1({ state }: { state: AccountantPortalState }) {
  const {
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
    saveDatevSettings,
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
    zipExport,
    zipMonth,
  } = state;
  return (
    <>
      {data && (
        <>
          <section className="no-print space-y-3 rounded-lg border bg-card p-4">
            <h2 className="font-display text-lg font-semibold">DATEV-Einstellungen</h2>
            <p className="text-sm text-muted-foreground">
              Hier dürfen Sie ausschließlich Kontenrahmen, Beraternummer und Mandantennummer für
              diesen Mandanten pflegen. Alle übrigen Unternehmensdaten bleiben schreibgeschützt.
            </p>
            {datevSettings.isPending && !datevSettings.data ? (
              <p className="text-sm text-muted-foreground">DATEV-Einstellungen werden geladen…</p>
            ) : datevSettings.isSuccess ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="datev-chart">Kontenrahmen</Label>
                    <select
                      id="datev-chart"
                      className="w-full rounded-md border bg-background p-2"
                      value={datevChart}
                      onChange={(e) => setDatevChart(e.target.value as "" | "SKR03" | "SKR04")}
                    >
                      <option value="">Bitte auswählen</option>
                      <option value="SKR03">SKR03</option>
                      <option value="SKR04">SKR04</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="datev-berater">Beraternummer</Label>
                    <Input
                      id="datev-berater"
                      value={datevBeraternummer}
                      inputMode="numeric"
                      maxLength={7}
                      onChange={(e) => setDatevBeraternummer(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="datev-mandant">Mandantennummer</Label>
                    <Input
                      id="datev-mandant"
                      value={datevMandantennummer}
                      inputMode="numeric"
                      maxLength={5}
                      onChange={(e) => setDatevMandantennummer(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => saveDatevSettings.mutate()}
                  disabled={saveDatevSettings.isPending || !datevChart}
                >
                  {saveDatevSettings.isPending ? "Speichert…" : "DATEV-Einstellungen speichern"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => datevSettings.mutate()}
                disabled={datevSettings.isPending}
              >
                DATEV-Einstellungen erneut laden
              </Button>
            )}
          </section>
          <section
            className={
              payrollReadiness.length > 0
                ? "no-print rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
                : "no-print rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4"
            }
          >
            <h2 className="font-display text-sm font-semibold">Datenqualität Lohnvorbereitung</h2>
            {payrollReadiness.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Keine offenen Freigaben oder fehlenden Personal-/Lohndaten erkannt.
              </p>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">
                {payrollReadiness.map((issue) => (
                  <div key={issue.code}>
                    {issue.code === "pending_entries" &&
                      `${issue.count} Mitarbeiter mit noch nicht freigegebenen Zeiteinträgen.`}
                    {issue.code === "missing_personnel_number" &&
                      `${issue.count} Mitarbeiter ohne Personal-Nr.`}
                    {issue.code === "missing_hourly_rate" &&
                      `${issue.count} Mitarbeiter mit Arbeitszeit ohne gültigen Stundensatz.`}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="no-print flex flex-wrap gap-2">
            <Button
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
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(`Fahrtenbuch_${period}.csv`, fahrtenbuchRows, { from, to })
              }
            >
              <Download className="size-4" /> Fahrtenbuch (CSV)
            </Button>
            <Button
              onClick={() => datevExport.mutate()}
              disabled={datevExport.isPending || !datevSettings.isSuccess}
            >
              {datevExport.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              DATEV-Export (EXTF)
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
                  filterRowsByDateRange(timeEntries, { from, to, columns: ["work_date"] }),
                )
              }
            >
              <FileText className="size-4" /> Stundenliste (PDF)
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(`Lohnvorbereitung_${period}.csv`, payrollRows, { from, to })
              }
            >
              <Download className="size-4" /> Lohnvorbereitung für Steuerberater (CSV)
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

            <div className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1">
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
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!/^\\d{4}-\\d{2}$/.test(zipMonth)) return;
                  const [y, m] = zipMonth.split("-").map(Number);
                  setFrom(`${zipMonth}-01`);
                  setTo(new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10));
                }}
              >
                Monat verwenden
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={zipExport.isPending || !code || !from || !to}
                onClick={() => zipExport.mutate()}
              >
                {zipExport.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileArchive className="size-4" />
                )}
                Alle Belege herunterladen
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
                        <td className="py-1 pr-3 text-right">
                          {de(parseDe(r["Normalstunden"]) + parseDe(r["Sonntagsstunden"]))} Std.
                        </td>
                        <td className="py-1 text-right">
                          {formatMoney(parseDe(r["Brutto vorbereitet"]))}
                        </td>
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
              Lohnvorbereitung je Mitarbeiter
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
    </>
  );
}
