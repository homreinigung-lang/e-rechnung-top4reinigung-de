import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";

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

type EmployeeForm = {
  id?: string;
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

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Montag der Woche zum übergebenen Datum (ISO-Format JJJJ-MM-TT). */
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

function Personal() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(empty);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [assignProject, setAssignProject] = useState("");
  const [assignRole, setAssignRole] = useState("Reinigungskraft");
  const [assignHours, setAssignHours] = useState("");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));

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

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,city")
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

  const save = useMutation({
    mutationFn: async (values: EmployeeForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { id, ...rest } = values;
      if (id) {
        const { error } = await supabase.from("employees").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert({ ...rest, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Mitarbeiter gespeichert");
      setOpen(false);
      setForm(empty);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
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

  const assign = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      if (!assignFor || !assignProject) throw new Error("Bitte Projekt wählen.");
      const { error } = await supabase.from("project_assignments").insert({
        project_id: assignProject,
        employee_id: assignFor,
        user_id: userId,
        assignment_role: assignRole,
        hours_per_week: Number(String(assignHours).replace(",", ".")) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Einsatzort zugeordnet");
      setAssignFor(null);
      setAssignProject("");
      setAssignHours("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const weekDays = useMemo(
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

  /** Stunden je Projekt für einen Mitarbeiter. */
  function hoursByProject(employeeId: string) {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.employee_id !== employeeId) continue;
      const key = e.project_id
        ? projectName(e.project_id as string) || "Projekt"
        : (e.location as string) || "Ohne Projekt";
      map.set(key, (map.get(key) ?? 0) + Number(e.hours || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
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
            Mitarbeiterstamm, Einsatzorte, Projektstunden und Wochenplanung.
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
              <DialogTitle>{form.id ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle>
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
                  type="number"
                  step="0.01"
                  value={form.hourly_rate}
                  onChange={(e) =>
                    setForm({ ...form, hourly_rate: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => save.mutate(form)}
                disabled={!form.name.trim() || save.isPending}
              >
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="surface overflow-x-auto">
        {employees.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine Mitarbeiter angelegt.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-5 py-3">Name</th>
                <th className="px-3 py-3">Rolle</th>
                <th className="px-3 py-3">Kontakt</th>
                <th className="px-3 py-3 text-right">Stundenlohn</th>
                <th className="px-3 py-3">Einsatzorte</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const mine = assignments.filter((a) => a.employee_id === e.id);
                const isOpen = expanded === e.id;
                const perProject = isOpen ? hoursByProject(e.id) : [];
                const totalHours = perProject.reduce((s, [, h]) => s + h, 0);
                return (
                  <>
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="px-5 py-3 font-medium">
                        {e.name}
                        {e.personnel_number && (
                          <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                            {e.personnel_number}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">{e.role || "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {[e.email, e.phone].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-3 text-right">{formatMoney(Number(e.hourly_rate))}</td>
                      <td className="px-3 py-3">
                        {mine.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {mine.map((a) => (
                              <Link
                                key={a.id}
                                to="/projekte/$id"
                                params={{ id: a.project_id }}
                                className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:underline"
                              >
                                {projectName(a.project_id) || "Projekt"}
                                {a.assignment_role ? ` · ${a.assignment_role}` : ""}
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Details"
                          onClick={() => setExpanded(isOpen ? null : e.id)}
                        >
                          {isOpen ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setForm({
                              id: e.id,
                              name: e.name,
                              role: e.role,
                              email: e.email,
                              phone: e.phone ?? "",
                              personnel_number: e.personnel_number ?? "",
                              hourly_rate: Number(e.hourly_rate),
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove.mutate(e.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${e.id}-details`} className="border-b bg-muted/30 last:border-0">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="grid gap-6 lg:grid-cols-2">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <h3 className="font-semibold">Einsatzorte / Objekte</h3>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setAssignFor(e.id);
                                    setAssignRole(e.role || "Reinigungskraft");
                                  }}
                                >
                                  <Plus className="size-4" /> Zuordnen
                                </Button>
                              </div>
                              {mine.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  Noch keinem Objekt zugeordnet.
                                </p>
                              ) : (
                                <ul className="divide-y rounded-md border bg-background">
                                  {mine.map((a) => {
                                    const p = projects.find((x) => x.id === a.project_id);
                                    return (
                                      <li
                                        key={a.id}
                                        className="flex items-center gap-3 px-3 py-2 text-sm"
                                      >
                                        <MapPin className="size-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                          <Link
                                            to="/projekte/$id"
                                            params={{ id: a.project_id }}
                                            className="font-medium hover:underline"
                                          >
                                            {p?.name || "Projekt"}
                                          </Link>
                                          <div className="text-xs text-muted-foreground">
                                            {[
                                              a.assignment_role,
                                              p?.city,
                                              Number(a.hours_per_week) > 0
                                                ? `${Number(a.hours_per_week)} Std./Woche`
                                                : "",
                                            ]
                                              .filter(Boolean)
                                              .join(" · ")}
                                          </div>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => unassign.mutate(a.id)}
                                        >
                                          <Trash2 className="size-4 text-destructive" />
                                        </Button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>

                            <div className="space-y-3">
                              <h3 className="font-semibold">Stunden pro Projekt</h3>
                              {perProject.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  Noch keine Arbeitszeiten erfasst.
                                </p>
                              ) : (
                                <table className="w-full text-sm">
                                  <tbody>
                                    {perProject.map(([label, h]) => (
                                      <tr key={label} className="border-b last:border-0">
                                        <td className="py-2 pr-3">{label}</td>
                                        <td className="py-2 text-right font-medium">
                                          {h.toFixed(2)} Std.
                                        </td>
                                      </tr>
                                    ))}
                                    <tr>
                                      <td className="py-2 pr-3 font-semibold">Gesamt</td>
                                      <td className="py-2 text-right font-semibold">
                                        {totalHours.toFixed(2)} Std.
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
                          {objects.join(", ") || "Kein Objekt"}
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

      {/* Zuordnungs-Dialog */}
      <Dialog open={assignFor !== null} onOpenChange={(o) => !o && setAssignFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Einsatzort zuordnen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Projekt / Baustelle</Label>
              <Select value={assignProject} onValueChange={setAssignProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Projekt wählen" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || "Ohne Namen"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Funktion im Einsatz</Label>
              <Select value={assignRole} onValueChange={setAssignRole}>
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
              <Label htmlFor="a-hours">Stunden pro Woche (optional)</Label>
              <Input
                id="a-hours"
                inputMode="decimal"
                value={assignHours}
                onChange={(ev) => setAssignHours(ev.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => assign.mutate()} disabled={!assignProject || assign.isPending}>
              Zuordnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
