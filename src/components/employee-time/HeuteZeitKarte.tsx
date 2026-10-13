import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Square, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useOfflineTime } from "@/hooks/useOfflineTime";
import { buildDayTasks, type DayTask } from "@/lib/day-tasks";
import { localDay } from "@/lib/employee-task";
import { stopTimer } from "@/lib/arbeits-timer";
import { BREAK_CHOICES, clockTime, workedHours } from "@/lib/time-entry";
import { useArbeitsTimer } from "./useArbeitsTimer";
import type { MeineZeitenState } from "./useMeineZeitenState";

const fmt = (hours: number) => hours.toFixed(2).replace(".", ",");
export function HeuteZeitKarte({ state }: { state: MeineZeitenState }) {
  const { me, assignments, projects, entries, confirmShift } = state;
  const client = useQueryClient();
  const offline = useOfflineTime(me.id);
  const { timer, write } = useArbeitsTimer(me.id);
  const [now, setNow] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const savingRef = useRef(false);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const id = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const today = localDay(now);
  const tasks = useMemo(
    () =>
      buildDayTasks(assignments, projects, [
        ...entries,
        ...offline.entries.map((e) => ({
          ...e.row,
          id: e.id,
          work_date: e.row.work_date ?? "",
          project_id: e.row.project_id ?? null,
        })),
      ])
        .get(today)
        ?.filter((t) => t.released && !t.done) ?? [],
    [assignments, projects, entries, offline.entries, today],
  );
  const overnight = Boolean(timer?.end && timer.endDate !== timer.date);
  const hours = timer?.end ? workedHours(timer.start, timer.end, timer.breakMin) : 0;
  const update = (action: () => void) => {
    try {
      action();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Timer konnte nicht gespeichert werden.");
    }
  };
  const begin = (task?: DayTask) =>
    update(() => {
      const at = new Date();
      setNow(at);
      setSaved("");
      write({
        date: localDay(at),
        start: clockTime(at),
        projectId: task?.projectId ?? null,
        breakMin: task?.breakMin ?? 0,
        planned: Boolean(task),
      });
    });
  const save = async () => {
    if (!timer?.end || overnight || hours <= 0 || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const queued = await offline.save({
        user_id: me.user_id,
        employee_id: me.id,
        employee_name: me.name,
        entry_type: "work",
        work_date: timer.date,
        start_time: timer.start,
        end_time: timer.end,
        break_minutes: timer.breakMin,
        hours,
        hourly_rate: Number(me.hourly_rate ?? 0),
        project_id: timer.projectId,
        location: projects.find((p) => p.id === timer.projectId)?.name ?? "",
        note: "",
        billed: false,
        approval_status: "pending",
        ...(timer.planned ? { completed_at: new Date().toISOString() } : {}),
      });
      write(null);
      setSaved(
        queued
          ? "Auf diesem Gerät gespeichert. Wird bei Internetverbindung gesendet."
          : `Gespeichert · ${timer.start}–${timer.end} · ${fmt(hours)} Std.`,
      );
      void client.invalidateQueries({ queryKey: ["my_time_entries"] });
      void client.invalidateQueries({ queryKey: ["time_entries"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <section className="surface space-y-4 p-5" aria-label="Heute">
      <h2 className="text-xl font-semibold">
        Heute · {now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
      </h2>
      {saved && (
        <p role="status" className="rounded-md bg-accent p-3">
          {saved}
        </p>
      )}
      {timer ? (
        <div className="space-y-4">
          <p className="text-lg font-medium">
            {timer.end ? "Arbeit beendet" : `Arbeit läuft seit ${timer.start} Uhr`}
          </p>
          {timer.projectId && (
            <p className="text-sm text-muted-foreground">
              {projects.find((p) => p.id === timer.projectId)?.name}
            </p>
          )}
          {!timer.end ? (
            <Button
              size="lg"
              className="h-14 w-full text-lg"
              onClick={() => update(() => write(stopTimer(timer, new Date())))}
            >
              <Square className="size-5" /> Beenden
            </Button>
          ) : (
            <>
              <p className="text-lg font-semibold">
                {timer.start}–{timer.end} · {fmt(hours)} Std.
              </p>
              {overnight ? (
                <p role="alert" className="text-destructive">
                  Die Arbeit ging über Mitternacht. Bitte die Zeiten unter „Zeit nachtragen“ für
                  jeden Tag einzeln erfassen. Der Timer bleibt gespeichert.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium">Wie lange war Ihre Pause?</p>
                  <div className="flex flex-wrap gap-2" aria-label="Pause auswählen">
                    {BREAK_CHOICES.map((min) => (
                      <Button
                        key={min}
                        disabled={saving}
                        aria-pressed={timer.breakMin === min}
                        variant={timer.breakMin === min ? "default" : "outline"}
                        onClick={() => update(() => write({ ...timer, breakMin: min }))}
                      >
                        {min ? `${min} Min.` : "Keine"}
                      </Button>
                    ))}
                  </div>
                  {hours <= 0 && (
                    <p role="alert" className="text-destructive">
                      Die Arbeitszeit ist kürzer als eine Minute oder die Pause ist zu lang. Bitte
                      Pause ändern oder die Zeit nachtragen.
                    </p>
                  )}
                  <Button
                    size="lg"
                    className="h-14 w-full text-lg"
                    disabled={saving || hours <= 0}
                    onClick={() => void save()}
                  >
                    <Check className="size-5" /> {saving ? "Wird gespeichert …" : "Speichern"}
                  </Button>
                </>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Timer korrigieren
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() =>
                      update(() => {
                        const { end: _end, endDate: _date, ...running } = timer;
                        write(running);
                      })
                    }
                  >
                    Weiterarbeiten
                  </Button>
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Timer wirklich verwerfen? Die Zeit wird dabei nicht gespeichert.",
                        )
                      )
                        update(() => write(null));
                    }}
                  >
                    Timer verwerfen
                  </Button>
                </div>
              </details>
            </>
          )}
        </div>
      ) : tasks.length ? (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.key} className="space-y-3 rounded-md border p-4">
              <p className="font-semibold">{task.name}</p>
              <p className="text-sm text-muted-foreground">
                {task.range || `${fmt(task.hours)} Std. geplant`}
              </p>
              <Button
                size="lg"
                className="h-14 w-full text-lg"
                disabled={confirmShift.isPending}
                onClick={() => begin(task)}
              >
                <Play className="size-5" /> Arbeit starten
              </Button>
              {task.start && task.end > task.start && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={confirmShift.isPending || !offline.online}
                  onClick={() => confirmShift.mutate(task)}
                >
                  Planzeit übernehmen
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Button size="lg" className="h-14 w-full text-lg" onClick={() => begin()}>
          <Play className="size-5" /> Arbeit starten
        </Button>
      )}
      {offline.pending > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {offline.pending} Zeit(en) gespeichert – warten auf Internetverbindung.
        </p>
      )}
      {offline.error && (
        <p role="alert" className="text-sm text-destructive">
          {offline.error}
        </p>
      )}
    </section>
  );
}
