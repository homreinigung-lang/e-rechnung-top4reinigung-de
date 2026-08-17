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
import { MapPin, Navigation, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { kwLabel } from "@/lib/kw";
import { mapsUrl, projectAddress } from "@/lib/maps";
import { DAY_NAMES, effectiveDayHours, normalizeDayHours, normalizeDayTimes, formatDayTime } from "@/lib/planung";
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
import { MeinEinsatzkalender } from "@/components/MeinEinsatzkalender";


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
        .select("id,project_id,assignment_role,hours_per_week,day_hours,day_times,start_date,end_date")
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
        onSelectProject={(id) => setSelectedProjectId(id)}
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
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(e.id as string)}>
                    <Trash2 className="size-4" />
                  </Button>
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
  assignments: { id: string; project_id: string | null; assignment_role: string; hours_per_week: number; day_hours?: unknown; day_times?: unknown; start_date: string | null; end_date: string | null }[];
  onClose: () => void;
}) {
  const project = projectId ? projects.find((p) => p.id === projectId) ?? null : null;
  const address = project ? projectAddress(project) : "";
  const projectAssignments = assignments.filter((a) => a.project_id === projectId);
  // Tageswerte aus der Arbeitsplanung; ältere Einträge ohne Tageswerte auf Mo–Fr verteilen.
  const dayTotals = projectAssignments.reduce<number[]>(
    (acc, a) => {
      const effective = effectiveDayHours(a.day_hours, a.hours_per_week, a.day_times);
      return acc.map((v, i) => v + (effective[i] ?? 0));
    },
    normalizeDayHours(null),
  );
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
            <div className="mt-1 text-sm font-medium">
              {address || "Keine Adresse hinterlegt"}
            </div>
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
