import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Eye, Send, Undo2, WalletCards } from "lucide-react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney } from "@/lib/format";
import { saveFile } from "@/lib/download";
import { buildCsvBlob } from "@/lib/table-summary";
import { sollHoursForMonth } from "@/lib/zeitkonto";
import {
  buildLohnvorbereitung,
  lohnvorbereitungCsvRows,
  payrollReadinessIssues,
  type LohnEmployee,
  type LohnEntry,
  type LohnartRule,
  type LohnvorbereitungRow,
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

type HandoffStatus = "draft" | "reviewed" | "transferred";

type PayrollHandoff = {
  id: string;
  employee_id: string;
  period: string;
  status: HandoffStatus;
  reviewed_at: string | null;
  transferred_at: string | null;
  note: string;
  gross_prepared: number;
  hours_prepared: number;
};

const STATUS_LABEL: Record<HandoffStatus, string> = {
  draft: "Entwurf",
  reviewed: "Geprüft",
  transferred: "An Steuerberater übergeben",
};

export function LohnvorbereitungPanel() {
  const db = supabase as SupabaseClient;
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [detailNote, setDetailNote] = useState("");
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

  const { data: handoffs = [] } = useQuery({
    queryKey: ["payroll_handoffs", month],
    queryFn: async () => {
      const { data, error } = await db
        .from("payroll_handoffs")
        .select("id,employee_id,period,status,reviewed_at,transferred_at,note,gross_prepared,hours_prepared")
        .eq("period", month);
      if (error) throw error;
      return (data ?? []) as PayrollHandoff[];
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

  const handoffByEmployee = useMemo(
    () => new Map(handoffs.map((item) => [item.employee_id, item] as const)),
    [handoffs],
  );

  const selectedRow = rows.find((row) => row.employeeId === selectedEmployeeId) ?? null;
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
  const selectedHandoff = selectedEmployeeId ? handoffByEmployee.get(selectedEmployeeId) ?? null : null;

  const issueEmployeeIds = useMemo(
    () => new Set(readinessIssues.flatMap((issue) => issue.employeeIds)),
    [readinessIssues],
  );

  const counts = useMemo(() => {
    let draft = 0;
    let reviewed = 0;
    let transferred = 0;
    for (const row of rows) {
      const status = handoffByEmployee.get(row.employeeId)?.status ?? "draft";
      if (status === "reviewed") reviewed += 1;
      else if (status === "transferred") transferred += 1;
      else draft += 1;
    }
    return { draft, reviewed, transferred };
  }, [rows, handoffByEmployee]);

  const updateStatus = useMutation({
    mutationFn: async ({
      row,
      status,
      note,
    }: {
      row: LohnvorbereitungRow;
      status: HandoffStatus;
      note: string;
    }) => {
      if (status !== "draft" && issueEmployeeIds.has(row.employeeId)) {
        throw new Error("Dieser Mitarbeiter hat noch offene Abrechnungsprüfungen.");
      }
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      const hours = row.normalstunden + row.sonntagstunden;
      const { error } = await db.from("payroll_handoffs").upsert(
        {
          user_id: uid,
          employee_id: row.employeeId,
          period: month,
          status,
          note: note.trim(),
          gross_prepared: row.bruttoVorbereitet,
          hours_prepared: hours,
        },
        { onConflict: "user_id,employee_id,period" },
      );
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payroll_handoffs", month] });
      toast.success(
        variables.status === "reviewed"
          ? "Lohnvorbereitung als geprüft markiert."
          : variables.status === "transferred"
            ? "Übergabe an Steuerberater dokumentiert."
            : "Status auf Entwurf zurückgesetzt.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openDetails(row: LohnvorbereitungRow) {
    setSelectedEmployeeId(row.employeeId);
    setDetailNote(handoffByEmployee.get(row.employeeId)?.note ?? "");
  }

  function exportCsv() {
    const csvRows = lohnvorbereitungCsvRows(rows, { period: month });
    const blob = buildCsvBlob(csvRows, { title: `Lohnvorbereitung ${month}` });
    if (!blob) {
      toast.error("Keine Lohndaten in diesem Monat.");
      return;
    }
    void saveFile(blob, `Lohnvorbereitung_Steuerberater_${month}.csv`);
  }

  function exportEmployeePdf(row: LohnvorbereitungRow) {
    const employee = employees.find((item) => item.id === row.employeeId);
    const handoff = handoffByEmployee.get(row.employeeId);
    const soll = sollHoursForMonth(employee?.weekly_hours, month, employee?.contract_start);
    const ist = row.normalstunden + row.sonntagstunden;

    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text("Lohnvorbereitung", 15, 18);
    pdf.setFontSize(11);
    const lines = [
      `Abrechnungszeitraum: ${month}`,
      `Mitarbeiter: ${row.mitarbeiter}`,
      `Personal-Nr.: ${row.personalNr || "-"}`,
      `Status: ${STATUS_LABEL[handoff?.status ?? "draft"]}`,
      "",
      `Sollstunden: ${de(soll)} Std.`,
      `Arbeitsstunden: ${de(ist)} Std.`,
      `Normalstunden: ${de(row.normalstunden)} Std.`,
      `Sonntagsstunden: ${de(row.sonntagstunden)} Std.`,
      `Nachtstunden: ${de(row.nachtstunden)} Std.`,
      `Feiertagsstunden: ${de(row.feiertagstunden)} Std.`,
      `Belastungsstunden: ${de(row.ueberstunden)} Std.`,
      `Urlaub: ${row.urlaubstage} Tage`,
      `Krankheit: ${row.kranktage} Tage`,
      "",
      `Grundlohn: ${formatMoney(row.grundlohn)}`,
      `Zuschläge: ${formatMoney(row.zuschlaege)}`,
      `Brutto vorbereitet: ${formatMoney(row.bruttoVorbereitet)}`,
      "",
      `Hinweis: Lohnsteuer, Sozialversicherung und Netto werden nicht in GebCalc berechnet.`,
      ...(handoff?.reviewed_at ? [`Geprüft am: ${formatDate(handoff.reviewed_at.slice(0, 10))}`] : []),
      ...(handoff?.transferred_at ? [`Übergeben am: ${formatDate(handoff.transferred_at.slice(0, 10))}`] : []),
      ...(handoff?.note ? ["", `Notiz: ${handoff.note}`] : []),
    ];
    pdf.text(lines, 15, 30);
    void saveFile(pdf.output("blob"), `Lohnvorbereitung_${row.personalNr || row.mitarbeiter}_${month}.pdf`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Lohnvorbereitung</h2>
          <p className="text-sm text-muted-foreground">
            Monatliche Prüfung und dokumentierte Übergabe an Steuerberater/DATEV. Keine steuerliche
            Lohnabrechnung und keine Netto-Berechnung.
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

      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
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
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Entwurf</div>
          <div className="mt-1 text-xl font-semibold">{counts.draft}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Geprüft</div>
          <div className="mt-1 text-xl font-semibold">{counts.reviewed}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Übergeben</div>
          <div className="mt-1 text-xl font-semibold">{counts.transferred}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="surface px-5 py-12 text-center text-sm text-muted-foreground">
          Keine bestätigten Arbeits- oder Abwesenheitsdaten für diesen Monat.
        </div>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
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
                <th className="px-4 py-3 text-right font-medium">Brutto vorbereitet</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const status = handoffByEmployee.get(row.employeeId)?.status ?? "draft";
                const hasIssue = issueEmployeeIds.has(row.employeeId);
                return (
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
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatMoney(row.bruttoVorbereitet)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          status === "transferred"
                            ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"
                            : status === "reviewed"
                              ? "rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                              : "rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {STATUS_LABEL[status]}
                      </span>
                      {hasIssue && (
                        <div className="mt-1 text-xs text-amber-700">Prüfung offen</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => openDetails(row)}>
                        <Eye className="size-4" /> Details
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="surface flex gap-3 p-4 text-sm text-muted-foreground">
        <WalletCards className="mt-0.5 size-5 shrink-0" />
        <p>
          „Brutto vorbereitet“ enthält Grundlohn und die hier konfigurierten Zuschläge. Lohnsteuer,
          Sozialversicherung und Netto-Auszahlung werden weiterhin durch Steuerberater/DATEV
          abgerechnet.
        </p>
      </div>

      <Dialog
        open={Boolean(selectedRow)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEmployeeId(null);
            setDetailNote("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selectedRow && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selectedRow.mitarbeiter} · Lohnvorbereitung {month}
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Sollstunden</div>
                  <div className="font-semibold">
                    {de(
                      sollHoursForMonth(
                        selectedEmployee?.weekly_hours,
                        month,
                        selectedEmployee?.contract_start,
                      ),
                    )}{" "}
                    Std.
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Arbeitsstunden</div>
                  <div className="font-semibold">
                    {de(selectedRow.normalstunden + selectedRow.sonntagstunden)} Std.
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Brutto vorbereitet</div>
                  <div className="font-semibold">{formatMoney(selectedRow.bruttoVorbereitet)}</div>
                </div>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>Normalstunden: <strong>{de(selectedRow.normalstunden)} Std.</strong></div>
                <div>Sonntag: <strong>{de(selectedRow.sonntagstunden)} Std.</strong></div>
                <div>Nacht: <strong>{de(selectedRow.nachtstunden)} Std.</strong></div>
                <div>Feiertag: <strong>{de(selectedRow.feiertagstunden)} Std.</strong></div>
                <div>Belastung: <strong>{de(selectedRow.ueberstunden)} Std.</strong></div>
                <div>Urlaub: <strong>{selectedRow.urlaubstage} Tage</strong></div>
                <div>Krankheit: <strong>{selectedRow.kranktage} Tage</strong></div>
                <div>Sonstige Abwesenheit: <strong>{selectedRow.sonstigeAbwesenheitstage} Tage</strong></div>
                <div>Grundlohn: <strong>{formatMoney(selectedRow.grundlohn)}</strong></div>
                <div>Zuschläge: <strong>{formatMoney(selectedRow.zuschlaege)}</strong></div>
              </div>

              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Übergabestatus</div>
                <div className="mt-1">{STATUS_LABEL[selectedHandoff?.status ?? "draft"]}</div>
                {selectedHandoff?.reviewed_at && (
                  <div className="text-xs text-muted-foreground">
                    Geprüft am {formatDate(selectedHandoff.reviewed_at.slice(0, 10))}
                  </div>
                )}
                {selectedHandoff?.transferred_at && (
                  <div className="text-xs text-muted-foreground">
                    Übergeben am {formatDate(selectedHandoff.transferred_at.slice(0, 10))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 text-sm font-medium">Notiz für Steuerberater</div>
                <Textarea
                  value={detailNote}
                  onChange={(event) => setDetailNote(event.target.value)}
                  rows={3}
                  placeholder="z. B. Einmalzahlung, Rückfrage oder Besonderheit …"
                />
              </div>

              {issueEmployeeIds.has(selectedRow.employeeId) && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-amber-800">
                    <AlertTriangle className="size-4" />
                    Prüfung noch nicht abgeschlossen
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Erst offene Zeiteinträge, Personal-Nr. oder fehlenden Stundensatz korrigieren.
                  </p>
                </div>
              )}

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <Button variant="outline" onClick={() => exportEmployeePdf(selectedRow)}>
                  <Download className="size-4" /> PDF
                </Button>
                <div className="flex flex-wrap gap-2">
                  {(selectedHandoff?.status ?? "draft") !== "draft" && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        updateStatus.mutate({ row: selectedRow, status: "draft", note: detailNote })
                      }
                    >
                      <Undo2 className="size-4" /> Entwurf
                    </Button>
                  )}
                  {(selectedHandoff?.status ?? "draft") === "draft" && (
                    <Button
                      variant="outline"
                      disabled={issueEmployeeIds.has(selectedRow.employeeId) || updateStatus.isPending}
                      onClick={() =>
                        updateStatus.mutate({ row: selectedRow, status: "reviewed", note: detailNote })
                      }
                    >
                      <CheckCircle2 className="size-4" /> Als geprüft markieren
                    </Button>
                  )}
                  {(selectedHandoff?.status ?? "draft") === "reviewed" && (
                    <Button
                      disabled={updateStatus.isPending}
                      onClick={() =>
                        updateStatus.mutate({ row: selectedRow, status: "transferred", note: detailNote })
                      }
                    >
                      <Send className="size-4" /> An Steuerberater übergeben
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
