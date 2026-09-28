import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { saveFile } from "@/lib/download";
import { buildCsvBlob } from "@/lib/table-summary";
import {
  buildLohnvorbereitung,
  lohnvorbereitungCsvRows,
  payrollReadinessIssues,
  type LohnEmployee,
  type LohnEntry,
  type LohnartRule,
} from "@/lib/lohnvorbereitung";

function monthBounds(month: string) {
  const [year, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(year!, m!, 1)).toISOString().slice(0, 10);
  return { start, end };
}

function de(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function LohnvorbereitungPanel() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { start, end } = monthBounds(month);

  const { data: employees = [] } = useQuery({
    queryKey: ["lohnvorbereitung-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,personnel_number,hourly_rate,weekly_hours,contract_type,contract_start")
        .order("name");
      if (error) throw error;
      return (data ?? []) as LohnEmployee[];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["lohnvorbereitung-time", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("employee_id,employee_name,work_date,start_time,end_time,break_minutes,hours,hourly_rate,entry_type,absence_reason,approval_status,completed_at")
        .gte("work_date", start)
        .lt("work_date", end)
        .order("work_date");
      if (error) throw error;
      return (data ?? []) as LohnEntry[];
    },
  });

  const { data: wageTypes = [] } = useQuery({
    queryKey: ["wage-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wage_types")
        .select("kind,surcharge_percent,active,time_from,time_to");
      if (error) throw error;
      return (data ?? []) as LohnartRule[];
    },
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["company-holidays", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_holidays")
        .select("holiday_date,surcharge_percent")
        .eq("active", true)
        .gte("holiday_date", start)
        .lt("holiday_date", end);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        holiday_date: row.holiday_date,
        surcharge_percent: row.surcharge_percent,
      }));
    },
  });

  const rows = useMemo(
    () => buildLohnvorbereitung(entries, employees, wageTypes, holidays),
    [entries, employees, wageTypes, holidays],
  );

  const readinessIssues = useMemo(
    () => payrollReadinessIssues(entries, employees),
    [entries, employees],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          hours: acc.hours + row.normalstunden + row.sonntagstunden,
          base: acc.base + row.grundlohn,
          supplements: acc.supplements + row.zuschlaege,
          gross: acc.gross + row.bruttoVorbereitet,
        }),
        { hours: 0, base: 0, supplements: 0, gross: 0 },
      ),
    [rows],
  );

  function exportCsv() {
    const csvRows = lohnvorbereitungCsvRows(rows, { period: month });
    const blob = buildCsvBlob(csvRows, { title: `Lohnvorbereitung ${month}` });
    if (!blob) {
      toast.error("Keine Lohndaten in diesem Monat.");
      return;
    }
    void saveFile(blob, `Lohnvorbereitung_Steuerberater_${month}.csv`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Lohnvorbereitung</h2>
          <p className="text-sm text-muted-foreground">
            Monatliche Übersicht aus Zeiterfassung und Lohnarten. Für die Übergabe an
            Steuerberater/DATEV vorbereitet, aber keine steuerliche Lohnabrechnung.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="w-[170px]"
          />
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" /> CSV für Steuerberater
          </Button>
        </div>
      </div>

      <div
        className={
          readinessIssues.length > 0
            ? "rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
            : "rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4"
        }
      >
        <div className="flex items-center gap-2 font-medium">
          {readinessIssues.length > 0 ? (
            <AlertTriangle className="size-4" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Abrechnungsprüfung
        </div>
        {readinessIssues.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Keine offenen Freigaben oder fehlenden Personal-/Lohndaten erkannt.
          </p>
        ) : (
          <div className="mt-2 text-sm text-muted-foreground">
            {readinessIssues.map((issue) => (
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
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Arbeitsstunden</div>
          <div className="mt-1 text-xl font-semibold">{de(totals.hours)} Std.</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Grundlohn</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(totals.base)}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Zuschläge</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(totals.supplements)}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Brutto vorbereitet</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(totals.gross)}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="surface px-5 py-12 text-center text-sm text-muted-foreground">
          Keine bestätigten Arbeits- oder Abwesenheitsdaten für diesen Monat.
        </div>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Mitarbeiter</th>
                <th className="px-4 py-3 text-right font-medium">Normal</th>
                <th className="px-4 py-3 text-right font-medium">Sonntag</th>
                <th className="px-4 py-3 text-right font-medium">Nacht</th>
                <th className="px-4 py-3 text-right font-medium">Feiertag</th>
                <th className="px-4 py-3 text-right font-medium">Belastung</th>
                <th className="px-4 py-3 text-right font-medium">Urlaub</th>
                <th className="px-4 py-3 text-right font-medium">Krank</th>
                <th className="px-4 py-3 text-right font-medium">Grundlohn</th>
                <th className="px-4 py-3 text-right font-medium">Zuschläge</th>
                <th className="px-4 py-3 text-right font-medium">Brutto vorbereitet</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.employeeId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.mitarbeiter}</div>
                    <div className="text-xs text-muted-foreground">{row.personalNr || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{de(row.normalstunden)} Std.</td>
                  <td className="px-4 py-3 text-right">{de(row.sonntagstunden)} Std.</td>
                  <td className="px-4 py-3 text-right">{de(row.nachtstunden)} Std.</td>
                  <td className="px-4 py-3 text-right">{de(row.feiertagstunden)} Std.</td>
                  <td className="px-4 py-3 text-right">{de(row.ueberstunden)} Std.</td>
                  <td className="px-4 py-3 text-right">{row.urlaubstage} Tage</td>
                  <td className="px-4 py-3 text-right">{row.kranktage} Tage</td>
                  <td className="px-4 py-3 text-right">{formatMoney(row.grundlohn)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(row.zuschlaege)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(row.bruttoVorbereitet)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="surface flex gap-3 p-4 text-sm text-muted-foreground">
        <WalletCards className="mt-0.5 size-5 shrink-0" />
        <p>
          Sonntagsstunden werden automatisch aus dem Datum erkannt. Nachtstunden werden aus
          Start-/Endzeit und der in „Lohnarten“ hinterlegten Nachtzeit berechnet. Feiertagsarbeit
          wird nur für die dort gepflegten Feiertage erkannt. Der Belastungszuschlag wird für
          Arbeitszeit über 8 Stunden täglich oder alternativ über 40 Stunden wöchentlich berechnet.
        </p>
      </div>
    </div>
  );
}
