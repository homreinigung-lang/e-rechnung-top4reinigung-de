import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, CalendarCheck } from "lucide-react";
import { formatDate } from "@/lib/format";
import { absenceClasses, absenceLabel, absenceReason, type AbsenceReason } from "@/lib/absence";

type Row = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  work_date: string;
  absence_reason: string | null;
  note: string | null;
};

type Antrag = {
  key: string;
  employeeName: string;
  reason: AbsenceReason | null;
  from: string;
  to: string;
  days: number;
  note: string;
  ids: string[];
};

/** Offene Anträge zu zusammenhängenden Zeiträumen bündeln. */
function toAntraege(rows: Row[]): Antrag[] {
  const sorted = [...rows].sort((a, b) =>
    `${a.employee_id}${a.absence_reason}${a.work_date}`.localeCompare(
      `${b.employee_id}${b.absence_reason}${b.work_date}`,
    ),
  );
  const out: Antrag[] = [];
  for (const r of sorted) {
    const reason = absenceReason(r as never);
    const last = out[out.length - 1];
    const nextDay = last
      ? new Date(new Date(`${last.to}T12:00:00`).getTime() + 86_400_000).toISOString().slice(0, 10)
      : null;
    if (
      last &&
      last.key.startsWith(`${r.employee_id}|${r.absence_reason}`) &&
      (nextDay === r.work_date || last.to === r.work_date)
    ) {
      last.ids.push(r.id);
      if (last.to !== r.work_date) {
        last.to = r.work_date;
        last.days += 1;
      }
      continue;
    }
    out.push({
      key: `${r.employee_id}|${r.absence_reason}|${r.work_date}`,
      employeeName: r.employee_name || "Mitarbeiter",
      reason,
      from: r.work_date,
      to: r.work_date,
      days: 1,
      note: r.note ?? "",
      ids: [r.id],
    });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

/** Admin-Übersicht aller offenen Urlaubs- und Abwesenheitsanträge. */
export function Urlaubsantraege() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["absence_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id,employee_id,employee_name,work_date,absence_reason,note,entry_type")
        .eq("entry_type", "absence")
        .eq("approval_status", "pending")
        .order("work_date");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const antraege = useMemo(() => toAntraege(rows), [rows]);

  const year = String(new Date().getFullYear());

  // Urlaubsanspruch und bereits verplante Tage, damit die Entscheidung
  // direkt mit dem Resturlaub des Mitarbeiters getroffen werden kann.
  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "urlaubsanspruch"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,vacation_days_per_year,vacation_carryover_days");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: vacationEntries = [] } = useQuery({
    queryKey: ["absence_year", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("employee_id,work_date,entry_type,absence_reason,approval_status")
        .eq("entry_type", "absence")
        .gte("work_date", `${year}-01-01`)
        .lte("work_date", `${year}-12-31`);
      if (error) throw error;
      return data ?? [];
    },
  });

  /** Resturlaub des Mitarbeiters im laufenden Jahr (inkl. offener Anträge). */
  const restUrlaub = (employeeId: string | null) => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!employeeId || !emp) return null;
    return urlaubskontoFor(employeeId, emp, vacationEntries as never, year);
  };

  const decide = useMutation({
    mutationFn: async ({ ids, approve }: { ids: string[]; approve: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      // Nur noch offene Anträge entscheiden – verhindert das Überschreiben
      // einer Entscheidung, die parallel bereits getroffen wurde.
      const { data, error } = await supabase
        .from("time_entries")
        .update({
          approval_status: approve ? "approved" : "rejected",
          decided_at: new Date().toISOString(),
          decided_by: auth.user?.id ?? null,
        } as never)
        .in("id", ids)
        .eq("approval_status", "pending")
        .select("id");
      if (error) throw error;
      if ((data ?? []).length === 0)
        throw new Error("Dieser Antrag wurde bereits von jemand anderem entschieden.");
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Antrag genehmigt" : "Antrag abgelehnt");
      queryClient.invalidateQueries({ queryKey: ["absence_requests"] });
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
      queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusy(null),
  });

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarCheck className="size-5" /> Offene Urlaubs- und Abwesenheitsanträge
        </h2>
        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600">
          {antraege.length} offen
        </span>
      </div>

      {antraege.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Aktuell warten keine Anträge auf Ihre Genehmigung.
        </p>
      ) : (
        <ul className="mt-3 divide-y text-sm">
          {antraege.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center gap-3 py-3">
              <span
                className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${absenceClasses(a.reason)}`}
              >
                {absenceLabel(a.reason)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{a.employeeName}</div>
                <div className="text-muted-foreground">
                  {formatDate(a.from)}
                  {a.to !== a.from ? ` – ${formatDate(a.to)}` : ""} · {a.days} Tag(e)
                  {a.note ? ` · ${a.note}` : ""}
                </div>
                {(() => {
                  const k = restUrlaub(a.employeeId);
                  if (!k || a.reason !== "vacation") return null;
                  return (
                    <div className="text-xs text-muted-foreground">
                      Urlaubsanspruch {k.anspruch + k.uebertrag} Tage · genommen {k.genommen} ·
                      beantragt {k.beantragt} ·{" "}
                      <span className={k.rest < 0 ? "font-medium text-destructive" : "font-medium"}>
                        Resturlaub {k.rest} Tage
                      </span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  disabled={busy === a.key}
                  onClick={() => {
                    setBusy(a.key);
                    decide.mutate({ ids: a.ids, approve: true });
                  }}
                >
                  <Check className="size-4" /> Genehmigen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === a.key}
                  onClick={() => {
                    setBusy(a.key);
                    decide.mutate({ ids: a.ids, approve: false });
                  }}
                >
                  <X className="size-4" /> Ablehnen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
