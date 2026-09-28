import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, WalletCards } from "lucide-react";
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
        .select("id,name,personnel_number,hourly_rate,weekly_hours,contract_type")
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
        .select("employee_id,employee_name,work_date,hours,hourly_rate,entry_type,absence_reason,approval_status,completed_at")
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
        .select("kind,surcharge_percent,active");
      if (error) throw error;
      return (data ?? []) as LohnartRule[];
    },
  });

  const rows = useMemo(
    () => buildLohnvorbereitung(entries, employees, wageTypes),
    [entries, employees, wageTypes],
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
    const csvRows = lohnvorbereitungCsvRows(rows);
    const blob = buildCsvBlob(csvRows, { title: `Lohnvorbereitung ${month}` });
    if (!blob) {
      toast.error("Keine Lohndaten in diesem Monat.");
      return;
    }
    void saveFile(blob, `Lohnvorbereitung_${month}.csv`);
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
          Sonntagsstunden werden aus dem Arbeitsdatum automatisch erkannt und mit dem in
          „Lohnarten“ hinterlegten Sonntagszuschlag berechnet. Nacht- und Feiertagszuschläge
          werden erst automatisch berechnet, sobald dafür eindeutige Zeit- bzw. Feiertagsregeln
          hinterlegt sind.
        </p>
      </div>
    </div>
  );
}
