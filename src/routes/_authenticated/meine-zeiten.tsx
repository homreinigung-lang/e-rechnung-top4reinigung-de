import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GermanDateInput, GermanTimeInput } from "@/components/GermanDateTimeInput";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  absenceClasses,
  absenceLabel,
  absenceReason,
  isAbsence,
  type AbsenceReason,
} from "@/lib/absence";
import { AbwesenheitZeitraum } from "@/components/AbwesenheitZeitraum";

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

type Form = {
  id?: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: string;
  location: string;
  note: string;
};

const emptyForm = (): Form => ({
  work_date: new Date().toISOString().slice(0, 10),
  start_time: "08:00",
  end_time: "16:00",
  break_minutes: "30",
  location: "",
  note: "",
});

function num(v: string) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function computeHours(start: string, end: string, breakMinutes: string) {
  if (!start || !end) return 0;
  const [sh = NaN, sm = NaN] = start.split(":").map(Number);
  const [eh = NaN, em = NaN] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((x) => Number.isNaN(x))) return 0;
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  minutes -= num(breakMinutes);
  return Math.max(0, Math.round((minutes / 60) * 100) / 100);
}

function MeineZeiten() {
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useMyEmployee();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

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
      const { data, error } = await supabase.from("projects").select("id,name,city,address_line");
      if (error) return [];
      return (data ?? []) as { id: string; name: string; city: string; address_line: string }[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["my_assignments", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select("id,project_id,assignment_role,hours_per_week,start_date,end_date")
        .eq("employee_id", me!.id);
      if (error) return [];
      return data ?? [];
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

  const previewHours = computeHours(form.start_time, form.end_time, form.break_minutes);

  const save = useMutation({
    mutationFn: async (values: Form) => {
      if (!me) throw new Error("Kein Mitarbeiterkonto verknüpft.");
      const hours = computeHours(values.start_time, values.end_time, values.break_minutes);
      if (hours <= 0) throw new Error("Bitte gültige Zeiten eingeben.");
      const payload = {
        employee_id: me.id,
        employee_name: me.name,
        work_date: values.work_date,
        start_time: values.start_time || null,
        end_time: values.end_time || null,
        break_minutes: Math.round(num(values.break_minutes)),
        hours,
        hourly_rate: Number(me.hourly_rate || 0),
        location: values.location,
        note: values.note,
        entry_type: "work",
        absence_reason: "",
      };
      if (values.id) {
        const { error } = await supabase.from("time_entries").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("time_entries")
          .insert({ ...payload, user_id: me.user_id, billed: false });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Arbeitszeit gespeichert");
      setOpen(false);
      setForm(emptyForm());
      queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setForm(emptyForm());
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Zeit erfassen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{form.id ? "Eintrag bearbeiten" : "Neue Arbeitszeit"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="work_date">Datum</Label>
                <GermanDateInput
                  id="work_date"
                  value={form.work_date}
                  onChange={(iso) => setForm({ ...form, work_date: iso })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Einsatzort</Label>
                <Input
                  id="location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_time">Von</Label>
                <GermanTimeInput
                  id="start_time"
                  value={form.start_time}
                  onChange={(t) => setForm({ ...form, start_time: t })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">Bis</Label>
                <GermanTimeInput
                  id="end_time"
                  value={form.end_time}
                  onChange={(t) => setForm({ ...form, end_time: t })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="break_minutes">Pause (Minuten)</Label>
                <Input
                  id="break_minutes"
                  inputMode="numeric"
                  value={form.break_minutes}
                  onChange={(e) => setForm({ ...form, break_minutes: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="note">Notiz</Label>
                <Textarea
                  id="note"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Berechnete Arbeitszeit: <strong>{previewHours} Std.</strong>
            </p>
            <DialogFooter>
              <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AbwesenheitZeitraum
          employees={[{ id: me.id, name: me.name, user_id: me.user_id }]}
          fixedEmployeeId={me.id}
          triggerLabel="Urlaub / Abwesenheit"
        />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-5">
          <h2 className="text-lg font-semibold">Meine Objekte / Einsatzorte</h2>
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
              {assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">
                      {projectName(a.project_id as string) ?? "Projekt"}
                    </span>
                    {a.assignment_role ? ` · ${a.assignment_role}` : ""}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {Number(a.hours_per_week ?? 0) > 0
                      ? `${Number(a.hours_per_week).toFixed(2)} Std./Woche`
                      : ""}
                  </span>
                </li>
              ))}
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
                    {formatDate(e.work_date as string)}
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
    </div>
  );
}
