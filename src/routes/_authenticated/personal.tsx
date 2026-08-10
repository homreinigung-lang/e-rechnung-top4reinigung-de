import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { EinsatzKalender } from "@/components/EinsatzKalender";


export const Route = createFileRoute("/_authenticated/personal")({
  head: () => ({
    meta: [
      { title: "Personal – Einsatzorte, Stunden & Wochenplan" },
      {
        name: "description",
        content:
          "Mitarbeiter verwalten, Einsatzorte und Baustellen zuordnen, Stunden pro Projekt auswerten und die Wochenübersicht planen.",
      },
      { property: "og:title", content: "Personal- und Einsatzplanung" },
      {
        property: "og:description",
        content: "Team, Objektzuordnung, Projektstunden und Wochenübersicht in einer Ansicht.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Personal,
});

const ROLES = ["Reinigungskraft", "Vorarbeiter", "Objektleiter", "Springer", "Verwaltung"];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const NO_PROJECT = "__none__";

type EmployeeForm = {
  name: string;
  role: string;
  email: string;
  phone: string;
  personnel_number: string;
  hourly_rate: number;
};

const empty: EmployeeForm = {
  name: "",
  role: "Reinigungskraft",
  email: "",
  phone: "",
  personnel_number: "",
  hourly_rate: 0,
};

/** Montag der Woche zum übergebenen Datum. */
function mondayOf(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(12, 0, 0, 0);
  return d;
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toNumber(value: string) {
  return Number(String(value).replace(",", ".").trim()) || 0;
}

/**
 * Ein einziges kombiniertes Einsatzort-Feld:
 * Beim Klick/Tippen öffnet sich sofort eine Vorschlagsliste aller Projekte.
 * Freitext, der zu keinem Projekt passt, wird direkt übernommen.
 */
function EinsatzortCell({
  projects,
  projectId,
  freeText,
  onSelectProject,
  onFreeText,
}: {
  projects: { id: string; name: string | null; city?: string | null }[];
  projectId: string | null;
  freeText: string;
  onSelectProject: (projectId: string | null) => void;
  onFreeText: (value: string) => void;
}) {
  const selected = projects.find((p) => p.id === projectId) ?? null;
  const shown = selected ? selected.name || "Ohne Namen" : freeText;

  const [openList, setOpenList] = React.useState(false);
  const [text, setText] = React.useState(shown);
  const lastShown = React.useRef(shown);
  if (lastShown.current !== shown) {
    lastShown.current = shown;
    if (text !== shown) setText(shown);
  }

  const q = text.trim().toLowerCase();
  const matches = projects.filter((p) =>
    q ? `${p.name ?? ""} ${p.city ?? ""}`.toLowerCase().includes(q) : true,
  );

  const commitFreeText = (value: string) => {
    const v = value.trim();
    if (v === shown) return;
    onFreeText(v);
  };

  return (
    <div className="relative">
      <Input
        value={text}
        placeholder="Einsatzort eintippen oder Projekt wählen"
        className="h-9 pr-9"
        onFocus={() => setOpenList(true)}
        onClick={() => setOpenList(true)}
        onChange={(ev) => {
          setText(ev.target.value);
          setOpenList(true);
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            ev.currentTarget.blur();
          } else if (ev.key === "Escape") {
            setOpenList(false);
          }
        }}
        onBlur={(ev) => {
          // Klick auf einen Vorschlag zuerst verarbeiten lassen
          const next = ev.relatedTarget as HTMLElement | null;
          if (next?.dataset?.["einsatzortOption"]) return;
          setOpenList(false);
          commitFreeText(text);
        }}
      />
      <button
        type="button"
        aria-label="Projekte anzeigen"
        className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center text-muted-foreground"
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={() => setOpenList((v) => !v)}
      >
        <ChevronDown className="size-4" />
      </button>

      {openList && (
        <div className="absolute left-0 top-10 z-50 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {selected && (
            <button
              type="button"
              data-einsatzort-option="1"
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                setOpenList(false);
                setText("");
                onSelectProject(null);
              }}
            >
              Projekt-Zuordnung entfernen
            </button>
          )}
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              data-einsatzort-option="1"
              className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                setOpenList(false);
                setText(p.name || "Ohne Namen");
                onSelectProject(p.id);
              }}
            >
              {p.name || "Ohne Namen"}
              {p.city ? ` · ${p.city}` : ""}
            </button>
          ))}
          {matches.length === 0 && (
            <button
              type="button"
              data-einsatzort-option="1"
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                setOpenList(false);
                commitFreeText(text);
              }}
            >
              „{text.trim()}" als Freitext übernehmen
            </button>
          )}
          {projects.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Noch keine Projekte angelegt – Freitext eintippen.
            </p>
          )}
        </div>
      )}
    </div>
  );
}



function Personal() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = useState<EmployeeForm>(empty);
  const [weekStart, setWeekStart] = React.useState(() => mondayOf(new Date()));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["project_assignments"] });
  };

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["project_assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_assignments").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Eigener Query-Key: verhindert Kollision mit anders geformten "projects"-Caches
  // (Zeiterfassung/Projektliste) und lädt die Objektliste bei jedem Aufruf frisch.
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "personal-picker"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,city,status")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["time_entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .order("work_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createEmployee = useMutation({
    mutationFn: async (values: EmployeeForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("employees").insert({ ...values, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mitarbeiter angelegt");
      setOpen(false);
      setForm(empty);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchEmployee = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; role?: string; hourly_rate?: number; work_location?: string };
    }) => {

      const { error } = await supabase.from("employees").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mitarbeiter gelöscht");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Primäre Zuordnung (Einsatzort) eines Mitarbeiters. */
  const primaryAssignment = (employeeId: string) =>
    assignments.find((a) => a.employee_id === employeeId) ?? null;

  const setEinsatzort = useMutation({
    mutationFn: async ({ employeeId, projectId }: { employeeId: string; projectId: string }) => {
      const current = primaryAssignment(employeeId);
      if (projectId === NO_PROJECT) {
        if (current) {
          const { error } = await supabase
            .from("project_assignments")
            .delete()
            .eq("id", current.id);
          if (error) throw error;
        }
        return;
      }
      if (current) {
        const { error } = await supabase
          .from("project_assignments")
          .update({ project_id: projectId })
          .eq("id", current.id);
        if (error) throw error;
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const employee = employees.find((e) => e.id === employeeId);
      const { error } = await supabase.from("project_assignments").insert({
        project_id: projectId,
        employee_id: employeeId,
        user_id: userId,
        assignment_role: employee?.role || "Reinigungskraft",
        hours_per_week: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project_assignments"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setWeeklyHours = useMutation({
    mutationFn: async ({ employeeId, hours }: { employeeId: string; hours: number }) => {
      const current = primaryAssignment(employeeId);
      if (!current) throw new Error("Bitte zuerst einen Einsatzort wählen.");
      const { error } = await supabase
        .from("project_assignments")
        .update({ hours_per_week: hours })
        .eq("id", current.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project_assignments"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const weekDays = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return isoDay(d);
      }),
    [weekStart],
  );

  const projectName = (id: string | null | undefined) =>
    projects.find((p) => p.id === id)?.name || "";

  function trackedHours(employeeId: string) {
    return entries
      .filter((e) => e.employee_id === employeeId)
      .reduce((s, e) => s + Number(e.hours || 0), 0);
  }

  function hoursOnDay(employeeId: string, day: string) {
    return entries
      .filter((e) => e.employee_id === employeeId && e.work_date === day)
      .reduce((s, e) => s + Number(e.hours || 0), 0);
  }

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(mondayOf(d));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Personal</h1>
          <p className="mt-1 text-muted-foreground">
            Arbeits-Tabelle: Name, Einsatzort und Stunden direkt in der Zeile bearbeiten.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setForm(empty);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Neuer Mitarbeiter
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Neuer Mitarbeiter</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="e-name">Name</Label>
                <Input
                  id="e-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Rolle / Position</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-nr">Personalnummer</Label>
                <Input
                  id="e-nr"
                  value={form.personnel_number}
                  onChange={(e) => setForm({ ...form, personnel_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-mail">E-Mail</Label>
                <Input
                  id="e-mail"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-phone">Telefon</Label>
                <Input
                  id="e-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-rate">Stundenlohn (€)</Label>
                <Input
                  id="e-rate"
                  inputMode="decimal"
                  value={form.hourly_rate}
                  onChange={(e) => setForm({ ...form, hourly_rate: toNumber(e.target.value) })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createEmployee.mutate(form)}
                disabled={!form.name.trim() || createEmployee.isPending}
              >
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Direkt editierbare Arbeits-Tabelle */}
      <div className="surface overflow-x-auto">
        {employees.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine Mitarbeiter angelegt.
          </p>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-5 py-3 w-[22%]">Mitarbeiter</th>
                <th className="px-3 py-3 w-[14%]">Funktion</th>
                <th className="px-3 py-3 w-[26%]">Einsatzort</th>
                <th className="px-3 py-3 w-[12%]">Std./Woche</th>
                <th className="px-3 py-3 w-[12%]">Stundenlohn €</th>
                <th className="px-3 py-3 text-right w-[10%]">Erfasst</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>


            <tbody>
              {employees.map((e) => {
                const assignment = primaryAssignment(e.id);
                return (
                  <tr key={e.id} className="border-b last:border-0 align-middle">
                    <td className="px-5 py-2">
                      <Input
                        key={`name-${e.id}-${e.name}`}
                        defaultValue={e.name}
                        className="h-9"
                        onBlur={(ev) => {
                          const value = ev.target.value.trim();
                          if (value && value !== e.name)
                            patchEmployee.mutate({ id: e.id, patch: { name: value } });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={e.role || "Reinigungskraft"}
                        onValueChange={(v) =>
                          patchEmployee.mutate({ id: e.id, patch: { role: v } })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <EinsatzortCell
                        projects={projects}
                        projectId={assignment?.project_id ?? null}
                        freeText={e.work_location ?? ""}
                        onSelectProject={(projectId) => {
                          setEinsatzort.mutate({
                            employeeId: e.id,
                            projectId: projectId ?? NO_PROJECT,
                          });
                          if (projectId && (e.work_location ?? ""))
                            patchEmployee.mutate({ id: e.id, patch: { work_location: "" } });
                        }}
                        onFreeText={(value) => {
                          if (value && assignment)
                            setEinsatzort.mutate({ employeeId: e.id, projectId: NO_PROJECT });
                          if (value !== (e.work_location ?? ""))
                            patchEmployee.mutate({ id: e.id, patch: { work_location: value } });
                        }}
                      />
                    </td>



                    <td className="px-3 py-2">
                      <Input
                        key={`h-${e.id}-${assignment?.id ?? "none"}-${assignment?.hours_per_week ?? 0}`}
                        defaultValue={assignment ? String(assignment.hours_per_week ?? 0) : ""}
                        inputMode="decimal"
                        placeholder="0"
                        className="h-9"
                        onBlur={(ev) => {
                          const hours = toNumber(ev.target.value);
                          if (!assignment) {
                            if (ev.target.value.trim())
                              toast.info(
                                "Std./Woche werden nur für Projekt-Einsatzorte gespeichert – bitte ein Projekt wählen.",
                              );
                            return;
                          }
                          if (hours !== Number(assignment.hours_per_week ?? 0))
                            setWeeklyHours.mutate({ employeeId: e.id, hours });
                        }}

                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        key={`r-${e.id}-${e.hourly_rate}`}
                        defaultValue={String(e.hourly_rate ?? 0)}
                        inputMode="decimal"
                        className="h-9"
                        onBlur={(ev) => {
                          const rate = toNumber(ev.target.value);
                          if (rate !== Number(e.hourly_rate ?? 0))
                            patchEmployee.mutate({ id: e.id, patch: { hourly_rate: rate } });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {trackedHours(e.id).toFixed(2)} Std.
                    </td>
                    <td className="px-5 py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(e.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <EinsatzKalender employees={employees} projects={projects} />

      {/* Wochenübersicht */}

      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Wochenübersicht</h2>
            <p className="text-sm text-muted-foreground">
              {formatDate(weekDays[0]!)} – {formatDate(weekDays[6]!)} · erfasste Stunden je Tag
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => shiftWeek(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" onClick={() => setWeekStart(mondayOf(new Date()))}>
              Aktuelle Woche
            </Button>
            <Button variant="outline" size="icon" onClick={() => shiftWeek(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Mitarbeiter vorhanden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Mitarbeiter</th>
                  {weekDays.map((d, i) => (
                    <th key={d} className="py-2 pr-3 text-right">
                      {WEEKDAYS[i]} {formatDate(d).slice(0, 6)}
                    </th>
                  ))}
                  <th className="py-2 text-right">Summe</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const days = weekDays.map((d) => hoursOnDay(e.id, d));
                  const sum = days.reduce((s, h) => s + h, 0);
                  const objects = assignments
                    .filter((a) => a.employee_id === e.id)
                    .map((a) => projectName(a.project_id))
                    .filter(Boolean);
                  return (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{e.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {objects.join(", ") || e.work_location || "Kein Objekt"}
                        </div>
                      </td>
                      {days.map((h, i) => (
                        <td
                          key={weekDays[i]}
                          className={`py-2 pr-3 text-right ${h > 0 ? "" : "text-muted-foreground"}`}
                        >
                          {h > 0 ? h.toFixed(2) : "–"}
                        </td>
                      ))}
                      <td className="py-2 text-right font-semibold">{sum.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Einsatzübersicht je Projekt */}
      <section className="surface space-y-3 p-5">
        <h2 className="text-lg font-semibold">Einsatzübersicht nach Objekten</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Projekte vorhanden.</p>
        ) : (
          <ul className="divide-y">
            {projects.map((p) => {
              const team = assignments.filter((a) => a.project_id === p.id);
              const hours = entries
                .filter((e) => e.project_id === p.id)
                .reduce((s, e) => s + Number(e.hours || 0), 0);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Link
                    to="/projekte/$id"
                    params={{ id: p.id }}
                    className="min-w-0 flex-1 font-medium hover:underline"
                  >
                    {p.name || "Ohne Namen"}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {team.length === 0
                      ? "Kein Team zugewiesen"
                      : team
                          .map(
                            (a) =>
                              employees.find((e) => e.id === a.employee_id)?.name ?? "Unbekannt",
                          )
                          .join(", ")}
                  </span>
                  <span className="text-sm font-medium">{hours.toFixed(2)} Std.</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
