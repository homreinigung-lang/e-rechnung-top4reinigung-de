import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { toast } from "sonner";
import { Clock, MapPin, Navigation, Trash2 } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatDate } from "@/lib/format";
import { kwLabel } from "@/lib/kw";
import { mapsUrl, projectAddress } from "@/lib/maps";
import {
  DAY_NAMES,
  effectiveDayHours,
  normalizeDayHours,
  normalizeDayTimes,
  formatDayTime,
} from "@/lib/planung";
import {
  absenceClasses,
  absenceLabel,
  absenceReason,
  approvalClasses,
  approvalLabel,
  approvalStatus,
  isAbsence,
  type AbsenceReason,
} from "@/lib/absence";
import { AbwesenheitZeitraum } from "@/components/AbwesenheitZeitraum";
import { ZeitkontoCard } from "@/components/ZeitkontoCard";
import { ArbeitsnachweisFotos } from "@/components/ArbeitsnachweisFotos";
import { MeinEinsatzkalender, type DayTask } from "@/components/MeinEinsatzkalender";

export const Route = createFileRoute("/_authenticated/meine-zeiten")({
  head: () => ({
    meta: [
      { title: "Meine Arbeitszeiten – HomR" },
      {
        name: "description",
        content:
          "Mitarbeiterbereich: eigene Arbeitszeiten erfassen, bearbeiten und den Monat im Blick behalten.",
      },
      { property: "og:title", content: "Meine Arbeitszeiten" },
      {
        property: "og:description",
        content: "Eigene Arbeitsstunden schnell und einfach selbst erfassen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeineZeiten,
});

function MeineZeiten() {
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useMyEmployee();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const { data: entries = [] } = useQuery({
    queryKey: ["my_time_entries", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("employee_id", me!.id)
        .order("work_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["my_projects", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,city,address_line,postal_code");
      if (error) return [];
      return (data ?? []) as {
        id: string;
        name: string;
        city: string;
        address_line: string;
        postal_code: string;
      }[];
    },
  });

  const { data: releasedWeeks = [] } = useQuery({
    queryKey: ["plan_releases", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data } = await supabase.from("plan_releases").select("week_start");
      return (data ?? []).map((r) => String(r.week_start));
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["my_assignments", me?.id, releasedWeeks.join(",")],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select(
          "id,project_id,assignment_role,hours_per_week,day_hours,day_times,start_date,end_date",
        )
        .eq("employee_id", me!.id);
      if (error) return [];
      // Alle Planungen sind sichtbar; noch nicht freigegebene Wochen werden markiert.
      const released = new Set(releasedWeeks);
      return (data ?? []).map((a) => ({
        ...a,
        released: !a.start_date || released.has(String(a.start_date)),
      }));
    },
  });

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name || "Projekt"]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? "Projekt") : null);
  }, [projects]);

  const monthEntries = useMemo(
    () => entries.filter((e) => String(e.work_date).slice(0, 7) === month),
    [entries, month],
  );

  const workEntries = useMemo(() => monthEntries.filter((e) => !isAbsence(e)), [monthEntries]);

  const totalHours = useMemo(
    () => workEntries.reduce((s, e) => s + Number(e.hours || 0), 0),
    [workEntries],
  );

  /** Stunden nach Objekt / Projekt gruppiert. */
  const byProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of workEntries) {
      const key = projectName(e.project_id as string | null) || e.location || "Ohne Objekt";
      map.set(key, (map.get(key) ?? 0) + Number(e.hours || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [workEntries, projectName]);

  /** Abwesenheiten des Jahres zu zusammenhängenden Zeiträumen zusammengefasst. */
  const absenceRanges = useMemo(() => {
    const year = month.slice(0, 4);
    const list = entries
      .filter((e) => isAbsence(e) && String(e.work_date).slice(0, 4) === year)
      .map((e) => ({ date: String(e.work_date), reason: absenceReason(e) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const out: { from: string; to: string; reason: AbsenceReason | null; days: number }[] = [];
    for (const item of list) {
      const last = out[out.length - 1];
      const prevDay = last
        ? new Date(new Date(`${last.to}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10)
        : null;
      if (last && last.reason === item.reason && (prevDay === item.date || last.to === item.date)) {
        if (last.to !== item.date) {
          last.to = item.date;
          last.days += 1;
        }
      } else {
        out.push({ from: item.date, to: item.date, reason: item.reason, days: 1 });
      }
    }
    return out.reverse();
  }, [entries, month]);

  const absenceTotals = useMemo(() => {
    const year = month.slice(0, 4);
    let vacation = 0;
    let sick = 0;
    let other = 0;
    for (const e of entries) {
      if (!isAbsence(e) || String(e.work_date).slice(0, 4) !== year) continue;
      const r = absenceReason(e);
      if (r === "vacation") vacation += 1;
      else if (r === "sick") sick += 1;
      else other += 1;
    }
    return { vacation, sick, other };
  }, [entries, month]);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eintrag gelöscht");
      queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Einsatz bestätigen: überträgt die geplanten Zeiten des Tages als
   * tatsächliche Arbeitszeit in die Zeiterfassung (Ist-Stunden).
   */
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const confirmShift = useMutation({
    mutationFn: async (task: DayTask) => {
      if (!me) throw new Error("Kein Mitarbeiter");
      if (!(task.hours > 0)) throw new Error("Für diesen Tag sind keine Stunden geplant.");
      const project = projects.find((p) => p.id === task.projectId);
      // Doppelbuchung vermeiden: pro Tag nur eine bestätigte Arbeitszeit
      const { data: existing, error: dupError } = await supabase
        .from("time_entries")
        .select("id")
        .eq("employee_id", me.id)
        .eq("work_date", task.date)
        .eq("entry_type", "work")
        .limit(1);
      if (dupError) throw dupError;
      if (existing && existing.length > 0) {
        throw new Error("Für diesen Tag ist bereits eine Arbeitszeit erfasst.");
      }
      const { error } = await supabase.from("time_entries").insert({
        user_id: me.user_id,
        employee_id: me.id,
        employee_name: me.name,
        entry_type: "work",
        work_date: task.date,
        start_time: task.start || null,
        end_time: task.end || null,
        break_minutes: Math.max(0, Number(task.breakMin) || 0),
        hours: task.hours,
        hourly_rate: Number(me.hourly_rate ?? 0),
        project_id: task.projectId,
        location: project?.name ?? "",
        note: "Einsatz aus der Planung bestätigt",
        billed: false,
      });
      if (error) throw error;
    },
    onMutate: (task: DayTask) => setConfirmingKey(task.key),
    onSettled: () => setConfirmingKey(null),
    onSuccess: () => {
      toast.success("Einsatz bestätigt – Arbeitszeit übernommen");
      queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  }

  if (!me) {
    return (
      <div className="surface max-w-xl p-6">
        <h1 className="text-2xl font-bold">Mitarbeiterbereich</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Ihr Konto ist noch keinem Mitarbeiter zugeordnet. Bitte lassen Sie Ihre E-Mail-Adresse von
          der Verwaltung im Mitarbeiter-Stammsatz eintragen und melden Sie sich anschließend erneut
          an.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Meine Arbeitszeiten</h1>
          <p className="mt-1 text-muted-foreground">
            {me.name}
            {me.role ? ` · ${me.role}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ZeitErfassenDialog
            employee={me}
            projects={projects}
            assignments={assignments as { project_id: string | null }[]}
          />
          <AbwesenheitZeitraum
            employees={[{ id: me.id, name: me.name, user_id: me.user_id }]}
            fixedEmployeeId={me.id}
            triggerLabel="Urlaub / Abwesenheit beantragen"
            variant="outline"
            asRequest
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Monat</div>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-2"
          />
        </div>
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Stunden gesamt</div>
          <div className="mt-2 text-2xl font-bold">{totalHours.toFixed(2)} Std.</div>
        </div>
      </div>

      <section className="surface p-5">
        <h2 className="text-lg font-semibold">Meine Vertragsdaten</h2>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Vertragsart</dt>
            <dd className="font-medium">{me.contract_type || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vertragsbeginn</dt>
            <dd className="font-medium">
              {me.contract_start ? formatDate(me.contract_start) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Soll-Stunden / Woche</dt>
            <dd className="font-medium">
              {me.weekly_hours ? `${Number(me.weekly_hours).toFixed(2)} Std.` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Funktion</dt>
            <dd className="font-medium">{me.role || "—"}</dd>
          </div>
        </dl>
      </section>

      <MeinEinsatzkalender
        assignments={assignments as never}
        projects={projects}
        entries={entries as never}
        onSelectProject={(id) => setSelectedProjectId(id)}
        onConfirm={(task) => confirmShift.mutate(task)}
        confirmingKey={confirmingKey}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-5">
          <h2 className="text-lg font-semibold">Meine Objekte / Einsatzorte</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Tippen Sie auf ein Objekt, um Details und die Navigation dorthin zu öffnen.
          </p>
          {assignments.length === 0 && !me.work_location ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Aktuell sind Ihnen keine festen Objekte zugewiesen.
            </p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {me.work_location && (
                <li className="py-2">
                  <span className="font-medium">{me.work_location}</span>
                  <span className="text-muted-foreground"> · Einsatzort (Freitext)</span>
                </li>
              )}
              {assignments.map((a) => {
                const p = projects.find((x) => x.id === a.project_id);
                const address = p ? projectAddress(p) : "";
                const name = projectName(a.project_id as string) ?? "Projekt";
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedProjectId(a.project_id as string)}
                      className="flex w-full items-center justify-between gap-3 rounded px-1 py-2 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">
                          <span className="font-medium">{name}</span>
                          {a.assignment_role ? ` · ${a.assignment_role}` : ""}
                        </span>
                        {address && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {address}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-muted-foreground">
                          {Number(a.hours_per_week ?? 0) > 0
                            ? `${Number(a.hours_per_week).toFixed(2)} Std./Woche`
                            : ""}
                        </span>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="surface p-5">
          <h2 className="text-lg font-semibold">Stunden nach Objekt</h2>
          {byProject.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Für diesen Monat sind noch keine Arbeitsstunden erfasst.
            </p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {byProject.map(([name, hours]) => (
                <li key={name} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{name}</span>
                  <span className="shrink-0 font-medium">{hours.toFixed(2)} Std.</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Meine Urlaubs- und Abwesenheitsplanung {month.slice(0, 4)}
          </h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded border px-2 py-1 ${absenceClasses("vacation")}`}>
              Urlaub: {absenceTotals.vacation} Tage
            </span>
            <span className={`rounded border px-2 py-1 ${absenceClasses("sick")}`}>
              Krankheit: {absenceTotals.sick} Tage
            </span>
            <span className={`rounded border px-2 py-1 ${absenceClasses("other")}`}>
              Sonstiges: {absenceTotals.other} Tage
            </span>
          </div>
        </div>
        {absenceRanges.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Für {month.slice(0, 4)} sind keine Abwesenheiten geplant.
          </p>
        ) : (
          <ul className="mt-3 divide-y text-sm">
            {absenceRanges.map((r) => (
              <li key={`${r.from}-${r.reason}`} className="flex items-center gap-3 py-2">
                <span
                  className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${absenceClasses(r.reason)}`}
                >
                  {absenceLabel(r.reason)}
                </span>
                <span className="min-w-0 flex-1">
                  {formatDate(r.from)}
                  {r.to !== r.from ? ` – ${formatDate(r.to)}` : ""}
                </span>
                <span className="shrink-0 text-muted-foreground">{r.days} Tag(e)</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ZeitkontoCard
        employees={[{ id: me.id, name: me.name, weekly_hours: me.weekly_hours ?? 0 }]}
        entries={entries as never}
        month={month}
        readOnly
      />

      <p className="text-sm text-muted-foreground">
        Arbeitszeiten und Zeitkonto werden ausschließlich von der Verwaltung gepflegt (Nur-Lesen).
        Urlaub und Abwesenheiten können Sie beantragen – sie gelten erst nach Genehmigung.
      </p>

      <div className="surface overflow-hidden">
        {monthEntries.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Für diesen Monat sind noch keine Arbeitszeiten erfasst.
          </p>
        ) : (
          <ul className="divide-y">
            {monthEntries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {formatDate(e.work_date as string)} ·{" "}
                    <span className="text-muted-foreground">{kwLabel(e.work_date as string)}</span>
                    {isAbsence(e) && (
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-medium ${absenceClasses(absenceReason(e))}`}
                      >
                        {absenceLabel(absenceReason(e))}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isAbsence(e)
                      ? "ganztägig · keine Arbeitsstunden"
                      : [
                          e.start_time && e.end_time
                            ? `${String(e.start_time).slice(0, 5)}–${String(e.end_time).slice(0, 5)}`
                            : null,
                          `Pause ${e.break_minutes} Min.`,
                          `${Number(e.hours).toFixed(2)} Std.`,
                          e.location || null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </div>
                  {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
                  {!isAbsence(e) && (
                    <ArbeitsnachweisFotos
                      entryId={e.id as string}
                      paths={((e as { photo_paths?: string[] }).photo_paths ?? []) as string[]}
                      canUpload
                      invalidateKey="my_time_entries"
                    />
                  )}
                </div>
                <span
                  className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${approvalClasses(approvalStatus(e))}`}
                >
                  {isAbsence(e) ? approvalLabel(approvalStatus(e)) : "Von der Verwaltung erfasst"}
                </span>
                {isAbsence(e) && approvalStatus(e) === "pending" && (
                  <ConfirmDeleteButton
                    iconClassName="size-4"
                    title="Antrag wirklich löschen?"
                    description="Der Abwesenheitsantrag wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
                    onConfirm={() => remove.mutate(e.id as string)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProjectDetailDialog
        projectId={selectedProjectId}
        projects={projects}
        assignments={assignments}
        onClose={() => setSelectedProjectId(null)}
      />
    </div>
  );
}

function ProjectDetailDialog({
  projectId,
  projects,
  assignments,
  onClose,
}: {
  projectId: string | null;
  projects: { id: string; name: string; city: string; address_line: string; postal_code: string }[];
  assignments: {
    id: string;
    project_id: string | null;
    assignment_role: string;
    hours_per_week: number;
    day_hours?: unknown;
    day_times?: unknown;
    start_date: string | null;
    end_date: string | null;
  }[];
  onClose: () => void;
}) {
  const project = projectId ? (projects.find((p) => p.id === projectId) ?? null) : null;
  const address = project ? projectAddress(project) : "";
  const projectAssignments = assignments.filter((a) => a.project_id === projectId);
  // Tageswerte aus der Arbeitsplanung; ältere Einträge ohne Tageswerte auf Mo–Fr verteilen.
  const dayTotals = projectAssignments.reduce<number[]>((acc, a) => {
    const effective = effectiveDayHours(a.day_hours, a.hours_per_week, a.day_times);
    return acc.map((v, i) => v + (effective[i] ?? 0));
  }, normalizeDayHours(null));
  const totalHours = dayTotals.reduce((s, n) => s + n, 0);
  // Arbeitszeiten (Von–Bis) je Wochentag aus der Planung.
  const dayRanges = Array.from({ length: 7 }, (_, i) =>
    projectAssignments
      .map((a) => formatDayTime(normalizeDayTimes(a.day_times)[i]))
      .filter(Boolean)
      .join(", "),
  );

  return (
    <Dialog open={!!projectId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{project?.name ?? "Objekt"}</DialogTitle>
          <DialogDescription>Objekt-Details und Routenführung</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="text-xs text-muted-foreground">Adresse</div>
            <div className="mt-1 text-sm font-medium">{address || "Keine Adresse hinterlegt"}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Wochenstunden</div>
              <div className="mt-1 text-sm font-medium">{totalHours.toFixed(2)} Std.</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Einsätze</div>
              <div className="mt-1 text-sm font-medium">{projectAssignments.length}</div>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Arbeitszeiten je Wochentag</div>
            <ul className="mt-1 divide-y text-sm">
              {DAY_NAMES.map((name, i) => (
                <li key={name} className="flex items-center justify-between py-1.5">
                  <span className={dayTotals[i] ? "font-medium" : "text-muted-foreground"}>
                    {name}
                  </span>
                  <span className={dayTotals[i] ? "font-medium" : "text-muted-foreground"}>
                    {dayRanges[i] ? `${dayRanges[i]} · ` : ""}
                    {(dayTotals[i] ?? 0).toFixed(2)} Std.
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between py-1.5 font-semibold">
                <span>Summe</span>
                <span>{totalHours.toFixed(2)} Std.</span>
              </li>
            </ul>
          </div>
          {address && (
            <Button asChild className="w-full">
              <a href={mapsUrl(address)} target="_blank" rel="noreferrer">
                <Navigation className="mr-2 h-4 w-4" />
                Zum Einsatzort navigieren
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Manuelle Arbeitszeit-Erfassung durch Mitarbeitende (Von–Bis mit Pause). */
function ZeitErfassenDialog({
  employee,
  projects,
  assignments,
}: {
  employee: { id: string; name: string; user_id: string; hourly_rate?: number | null };
  projects: { id: string; name: string; city: string; address_line: string; postal_code: string }[];
  assignments: { project_id: string | null }[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");
  const [breakMinutes, setBreakMinutes] = useState("30");
  const [note, setNote] = useState("");

  /** Zuerst die eigenen Einsatzorte, danach alle übrigen Objekte. */
  const options = useMemo(() => {
    const mine = new Set(assignments.map((a) => a.project_id).filter(Boolean) as string[]);
    return [...projects].sort((a, b) => {
      const d = (mine.has(b.id) ? 1 : 0) - (mine.has(a.id) ? 1 : 0);
      return d !== 0 ? d : a.name.localeCompare(b.name, "de-DE");
    });
  }, [projects, assignments]);

  const hours = useMemo(() => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return 0;
    let minutes = eh! * 60 + em! - (sh! * 60 + sm!);
    if (minutes < 0) minutes += 24 * 60; // Nachtschicht über Mitternacht
    minutes -= Math.max(0, Number(breakMinutes) || 0);
    return Math.max(0, Math.round((minutes / 60) * 100) / 100);
  }, [start, end, breakMinutes]);

  const reset = () => {
    setProjectId("");
    setLocation("");
    setStart("08:00");
    setEnd("16:00");
    setBreakMinutes("30");
    setNote("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (hours <= 0) throw new Error("Bitte eine gültige Arbeitszeit angeben.");
      const project = projects.find((p) => p.id === projectId);
      const { error } = await supabase.from("time_entries").insert({
        user_id: employee.user_id,
        employee_id: employee.id,
        employee_name: employee.name,
        entry_type: "work",
        work_date: workDate,
        start_time: start,
        end_time: end,
        break_minutes: Math.max(0, Number(breakMinutes) || 0),
        hours,
        hourly_rate: Number(employee.hourly_rate ?? 0),
        project_id: projectId || null,
        location: location.trim() || project?.name || "",
        note: note.trim(),
        billed: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Arbeitszeit erfasst – ${hours.toFixed(2)} Std.`);
      queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
      reset();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Clock className="size-4" /> Zeit erfassen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Arbeitszeit erfassen</DialogTitle>
          <DialogDescription>
            Erfassen Sie Ihre Arbeitszeit als Zeitraum (Von–Bis). Die Stunden werden automatisch
            abzüglich der Pause berechnet.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="ze-datum">Datum</Label>
              <Input
                id="ze-datum"
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ze-objekt">Objekt / Einsatzort</Label>
              <select
                id="ze-objekt"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-0 h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">— ohne Objekt —</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.city ? ` · ${p.city}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label htmlFor="ze-von">Von</Label>
              <Input
                id="ze-von"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ze-bis">Bis</Label>
              <Input id="ze-bis" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ze-pause">Pause (Min.)</Label>
              <Input
                id="ze-pause"
                type="number"
                min={0}
                step={5}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ze-ort">Freitext-Einsatzort (optional)</Label>
            <Input
              id="ze-ort"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="z. B. Baustelle Saarbrücken, Hauptstraße 5"
            />
          </div>

          <div>
            <Label htmlFor="ze-notiz">Tätigkeit / Notiz</Label>
            <Textarea
              id="ze-notiz"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. Unterhaltsreinigung Erdgeschoss"
            />
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            Berechnete Arbeitszeit: <span className="font-semibold">{hours.toFixed(2)} Std.</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || hours <= 0}>
            {save.isPending ? "Wird gespeichert …" : "Zeit speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
