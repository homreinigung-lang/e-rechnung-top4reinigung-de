import { FahrtenbuchMitarbeiterErfassung } from "@/components/FahrtenbuchMitarbeiterErfassung";
import { QmEmployeeTasks } from "@/components/QmEmployeeTasks";
import { AssistantPanel } from "@/components/AssistantPanel";
import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, MapPin, MessageSquare, Navigation, UserCircle } from "lucide-react";

import { LoadError, firstError } from "@/components/LoadError";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/employee";
import { mapsUrl, projectAddress } from "@/lib/maps";
import { effectiveDayHours, formatDayTime, normalizeDayTimes } from "@/lib/planung";
import { matchesTask } from "@/lib/employee-task";

export const Route = createFileRoute("/_authenticated/mein-bereich")({
  head: () => ({
    meta: [
      { title: "Mein Bereich – GebCalc" },
      {
        name: "description",
        content:
          "Mobile Mitarbeiter-Startseite mit den heutigen Einsätzen und den wichtigsten Aktionen.",
      },
    ],
  }),
  component: MeinBereich,
});

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function MeinBereich() {
  const { data: me, isLoading } = useMyEmployee();
  const today = localDateKey();
  const weekdayIndex = (new Date().getDay() + 6) % 7;

  const {
    data: assignments = [],
    error: assignmentsError,
    isLoading: assignmentsLoading,
  } = useQuery({
    queryKey: ["mobile_today_assignments", me?.id, today],
    enabled: Boolean(me?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select(
          "id,project_id,assignment_role,hours_per_week,day_hours,day_times,start_date,end_date",
        )
        .eq("employee_id", me!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const projectIds = useMemo(
    () => [...new Set(assignments.map((item) => item.project_id).filter(Boolean))] as string[],
    [assignments],
  );

  const {
    data: projects = [],
    error: projectsError,
    isLoading: projectsLoading,
  } = useQuery({
    queryKey: ["mobile_today_projects", projectIds.join(",")],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,customer_name,address_line,postal_code,city")
        .in("id", projectIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: todayEntries = [],
    error: entriesError,
    isLoading: entriesLoading,
  } = useQuery({
    queryKey: ["mobile_today_time_entries", me?.id, today],
    enabled: Boolean(me?.id),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id,work_date,project_id,start_time,end_time,entry_type,approval_status")
        .eq("employee_id", me!.id)
        .eq("work_date", today)
        .eq("entry_type", "work");
      if (error) throw error;
      return data ?? [];
    },
  });

  const todayAssignments = useMemo(() => {
    return assignments
      .map((assignment) => {
        if (assignment.start_date && String(assignment.start_date) > today) return null;
        if (assignment.end_date && String(assignment.end_date) < today) return null;

        const hours =
          effectiveDayHours(assignment.day_hours, assignment.hours_per_week, assignment.day_times)[
            weekdayIndex
          ] ?? 0;
        if (!(hours > 0)) return null;

        const time = normalizeDayTimes(assignment.day_times)[weekdayIndex];
        const project = projects.find((item) => item.id === assignment.project_id) ?? null;
        return { assignment, hours, time, project };
      })
      .filter(Boolean) as Array<{
      assignment: (typeof assignments)[number];
      hours: number;
      time: ReturnType<typeof normalizeDayTimes>[number];
      project: (typeof projects)[number] | null;
    }>;
  }, [assignments, projects, today, weekdayIndex]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  }

  if (!me) {
    return (
      <div className="surface max-w-xl p-6">
        <h1 className="text-2xl font-bold">Mein Bereich</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Dieses Konto ist noch keinem Mitarbeiter zugeordnet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <LoadError
        error={firstError(assignmentsError, projectsError, entriesError)}
        title="Einsätze konnten nicht geladen werden"
      />
      <header>
        <p className="text-sm text-muted-foreground">Heute</p>
        <h1 className="text-3xl font-bold">Hallo {me.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date().toLocaleDateString("de-DE", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

      <section className="surface space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5" />
          <h2 className="text-lg font-semibold">Meine Einsätze heute</h2>
        </div>

        {assignmentsError || projectsError || entriesError ? null : assignmentsLoading ||
          projectsLoading ||
          entriesLoading ? (
          <p className="text-sm text-muted-foreground">Einsätze werden geladen …</p>
        ) : todayAssignments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            Für heute ist kein fester Einsatz geplant.
          </div>
        ) : (
          <div className="space-y-3">
            {todayAssignments.map(({ assignment, hours, time, project }) => {
              const address = project ? projectAddress(project) : "";
              const timeLabel = formatDayTime(time);
              const workTimeDone = todayEntries.some((entry) =>
                matchesTask(entry, {
                  date: today,
                  projectId: assignment.project_id,
                  start: time?.start ?? "",
                  end: time?.end ?? "",
                }),
              );
              return (
                <article key={assignment.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold">
                        {project?.name || "Objekt"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {project?.customer_name || assignment.assignment_role || "Einsatz"}
                      </p>
                      <p
                        className={
                          workTimeDone
                            ? "mt-1 text-xs font-medium text-foreground"
                            : "mt-1 text-xs text-muted-foreground"
                        }
                      >
                        {workTimeDone ? "✓ Arbeitszeit erfasst" : "○ Arbeitszeit noch offen"}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-lg bg-muted px-3 py-2 text-right text-sm">
                      <div className="font-semibold">{hours.toFixed(2).replace(".", ",")} Std.</div>
                      {timeLabel ? (
                        <div className="text-xs text-muted-foreground">{timeLabel}</div>
                      ) : null}
                    </div>
                  </div>

                  {address ? (
                    <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 size-4 shrink-0" />
                      <span>{address}</span>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {address ? (
                      <Button asChild className="min-h-11">
                        <a href={mapsUrl(address)} target="_blank" rel="noreferrer">
                          <Navigation className="size-4" /> Navigation
                        </a>
                      </Button>
                    ) : null}
                    <Button asChild variant="outline" className="min-h-11">
                      <Link
                        to="/meine-zeiten"
                        search={{
                          projekt: assignment.project_id ?? undefined,
                          einsatz: assignment.id,
                          datum: today,
                        }}
                      >
                        <Clock className="size-4" />{" "}
                        {workTimeDone ? "Details öffnen" : "Einsatz öffnen"}
                      </Link>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <FahrtenbuchMitarbeiterErfassung employeeId={me.id} ownerUserId={me.user_id} />

      <QmEmployeeTasks employeeId={me.id} />

      <AssistantPanel mode="work" employeeId={me.id} />

      <section className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-2 py-4">
          <Link to="/meine-zeiten">
            <Clock className="size-5" />
            <span>Meine Zeiten</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-2 py-4">
          <Link to="/meine-zeiten" search={{ aktion: "urlaub" }}>
            <CalendarDays className="size-5" />
            <span>Urlaub / Abwesenheit</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-2 py-4">
          <Link to="/nachrichten">
            <MessageSquare className="size-5" />
            <span>Nachrichten</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-2 py-4">
          <Link to="/profil">
            <UserCircle className="size-5" />
            <span>Mein Profil</span>
          </Link>
        </Button>
      </section>

      <p className="px-1 text-xs text-muted-foreground">
        Alle Detailfunktionen wie Leistungsnachweis, Fotos, Material und Zeitkonto bleiben
        unverändert unter „Meine Zeiten“ verfügbar.
      </p>
    </div>
  );
}
