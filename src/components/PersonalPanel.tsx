import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadError, firstError } from "@/components/LoadError";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { fahrtenbuchClient } from "@/lib/fahrtenbuch-client";
import { saveFile } from "@/lib/download";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Car, ChevronDown, ChevronLeft, ChevronRight, HeartPulse, Plus, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { EinsatzKalender } from "@/components/EinsatzKalender";
import { MitarbeiterEinladung } from "@/components/MitarbeiterEinladung";

import {
  absenceClasses,
  absenceLabel,
  absenceReason,
  absenceShort,
  countsForPayroll,
  isAbsence,
  isEffective,
} from "@/lib/absence";

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

export function Personal() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<EmployeeForm>(empty);
  const [weekStart, setWeekStart] = React.useState(() => mondayOf(new Date()));
  const [monthCursor, setMonthCursor] = React.useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12),
  );

  const reportMonth = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`;
  const reportMonthEnd = isoDay(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0, 12));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["project_assignments"] });
  };

  const { data: employees = [], error: employeesError } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [], error: assignmentsError } = useQuery({
    queryKey: ["project_assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_assignments").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Eigener Query-Key: verhindert Kollision mit anders geformten "projects"-Caches
  // (Zeiterfassung/Projektliste) und lädt die Objektliste bei jedem Aufruf frisch.
  const { data: projects = [], error: projectsError } = useQuery({
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

  const { data: entries = [], error: entriesError } = useQuery({
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

  // Company Fahrtenbuch is separate from individual payroll: do not attribute trips to employees.
  const { data: monthTrips = [], error: monthTripsError } = useQuery({
    queryKey: ["personal_fahrtenbuch", reportMonth],
    queryFn: async () => {
      const { data, error } = await fahrtenbuchClient.from("fahrtenbuch_entries")
        .select("*").gte("trip_date", `${reportMonth}-01`).lte("trip_date", reportMonthEnd)
        .order("trip_date").order("trip_time");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: monthTripVehicles = [], error: monthTripVehiclesError } = useQuery({
    queryKey: ["personal_fahrtenbuch_vehicles"],
    queryFn: async () => {
      const { data, error } = await fahrtenbuchClient.from("fahrtenbuch_vehicles")
        .select("id,vehicle_name,license_plate").order("vehicle_name");
      if (error) throw error;
      return data ?? [];
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
      patch: {
        name?: string;
        role?: string;
        hourly_rate?: number;
        weekly_hours?: number;
        work_location?: string;
        vacation_days_per_year?: number;
        vacation_carryover_days?: number;
      };
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
      const { error: employeeError } = await supabase
        .from("employees")
        .update({ weekly_hours: hours })
        .eq("id", employeeId);
      if (employeeError) throw employeeError;

      // Bei einer Projekt-Zuordnung bleibt der projektspezifische Wert synchron.
      // Für Freitext-Einsatzorte ist keine Zuordnung erforderlich.
      if (current) {
        const { error: assignmentError } = await supabase
          .from("project_assignments")
          .update({ hours_per_week: hours })
          .eq("id", current.id);
        if (assignmentError) throw assignmentError;
      }
    },
    onSuccess: () => invalidate(),
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
      .filter((e) => e.employee_id === employeeId && e.work_date === day && !isAbsence(e))
      .reduce((s, e) => s + Number(e.hours || 0), 0);
  }

  /** Abwesenheitsgrund des Mitarbeiters an einem Tag (Krankheit hat Vorrang). */
  function absenceOnDay(employeeId: string, day: string) {
    const list = entries
      .filter((e) => e.employee_id === employeeId && e.work_date === day && isEffective(e))
      .map(absenceReason)
      .filter(Boolean) as ReturnType<typeof absenceReason>[];
    if (list.length === 0) return null;
    return list.includes("sick") ? "sick" : list[0]!;
  }

  /** Monatsabrechnung: Arbeitsstunden, Lohn und Abwesenheitstage je Mitarbeiter. */
  const monthPrefix = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`;
  const payroll = employees.map((e) => {
    // Strikt: nur bestätigte Stundenzettel-Einträge des gewählten Monats.
    const rows = entries.filter(
      (t) =>
        t.employee_id === e.id &&
        String(t.work_date).startsWith(monthPrefix) &&
        countsForPayroll(t),
    );
    const workHours = rows
      .filter((t) => !isAbsence(t))
      .reduce((s, t) => s + Number(t.hours || 0), 0);
    const days = (reason: string) =>
      new Set(rows.filter((t) => absenceReason(t) === reason).map((t) => t.work_date)).size;
    const rate = Number(e.hourly_rate ?? 0);
    return {
      id: e.id,
      name: e.name,
      workHours,
      rate,
      wage: workHours * rate,
      vacationDays: days("vacation"),
      sickDays: days("sick"),
      otherDays: days("other"),
    };
  });

  async function downloadMonthFahrtenbuchPdf() {
    if (monthTripsError || monthTripVehiclesError) {
      toast.error("Fahrtenbuch konnte nicht vollständig geladen werden.");
      return;
    }
    if (monthTrips.length === 0) {
      toast.error("Keine Fahrten im ausgewählten Monat.");
      return;
    }
    try {
      const { buildBrandedFahrtenbuchPdf } = await import("@/lib/fahrtenbuch-branded-pdf");
      const rows: Record<string, string>[] = monthTrips.map((trip) => {
        const vehicle = monthTripVehicles.find((v) => v.id === trip.vehicle_id);
        return {
          Datum: formatDate(trip.trip_date),
          Startzeit: String(trip.trip_time ?? "").slice(0, 5),
          Rückkehrzeit: String(trip.return_time ?? "").slice(0, 5),
          Fahrtart: trip.trip_type === "round_trip" ? "Hin- und Rückfahrt" : "Nur Hinfahrt",
          Fahrzeug: vehicle?.vehicle_name ?? "",
          Kennzeichen: vehicle?.license_plate ?? "",
          Von: trip.from_location ?? "",
          "Kunde / Ziel / Zweck": trip.customer_name ?? "",
          Zieladresse: trip.to_location ?? "",
          "Start-km": String(trip.start_km ?? ""),
          "End-km": String(trip.end_km ?? ""),
          "Geschäftliche km": String(trip.distance_km ?? ""),
          Bemerkung: trip.notes ?? "",
        };
      });
      await saveFile(await buildBrandedFahrtenbuchPdf(rows, `${reportMonth}-01`, reportMonthEnd), `Fahrtenbuch_${reportMonth}.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fahrtenbuch-PDF konnte nicht erstellt werden.");
    }
  }

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(mondayOf(d));
  };

  const loadError = firstError(employeesError, assignmentsError, projectsError, entriesError);

  return (
    <div className="space-y-6">
      <LoadError
        error={loadError}
        title="Personaldaten konnten nicht geladen werden"
        onRetry={() => void queryClient.invalidateQueries()}
      />
      <MitarbeiterEinladung />
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
                <th className="px-3 py-3 w-[10%]">Std./Woche</th>
                <th className="px-3 py-3 w-[10%]">Stundenlohn €</th>
                <th className="px-3 py-3 w-[10%]">Urlaub/Jahr</th>
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
                        key={`h-${e.id}-${e.weekly_hours ?? 0}`}
                        defaultValue={String(e.weekly_hours ?? assignment?.hours_per_week ?? 0)}
                        inputMode="decimal"
                        placeholder="0"
                        className="h-9"
                        onBlur={(ev) => {
                          const hours = toNumber(ev.target.value);
                          if (hours !== Number(e.weekly_hours ?? assignment?.hours_per_week ?? 0))
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
                    <td className="px-3 py-2">
                      <Input
                        key={`u-${e.id}-${e.vacation_days_per_year ?? 0}`}
                        defaultValue={String(e.vacation_days_per_year ?? 0)}
                        inputMode="decimal"
                        placeholder="0"
                        className="h-9"
                        title="Jahresurlaub in Tagen"
                        onBlur={(ev) => {
                          const days = toNumber(ev.target.value);
                          if (days !== Number(e.vacation_days_per_year ?? 0))
                            patchEmployee.mutate({
                              id: e.id,
                              patch: { vacation_days_per_year: days },
                            });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {trackedHours(e.id).toFixed(2)} Std.
                    </td>
                    <td className="px-5 py-2 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Mitarbeiter wirklich löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {`Der Mitarbeiter „${e.name || "ohne Namen"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              className={buttonVariants({ variant: "destructive" })}
                              onClick={() => remove.mutate(e.id)}
                            >
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <p className="font-medium">Fahrtenbuch</p>
          <p className="text-sm text-muted-foreground">Fahrten erfassen und denselben Fahrtenbuch-PDF-Bericht wie beim Steuerberater herunterladen.</p>
        </div>
        <Button asChild variant="outline"><Link to="/fahrtenbuch"><Car className="size-4" /> Fahrtenbuch / PDF</Link></Button>
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
                      {days.map((h, i) => {
                        const day = weekDays[i]!;
                        const reason = absenceOnDay(e.id, day);
                        return (
                          <td key={day} className="py-2 pr-3 text-right">
                            {reason ? (
                              <span
                                title={absenceLabel(reason)}
                                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold ${absenceClasses(reason)}`}
                              >
                                {reason === "sick" && <HeartPulse className="size-3" />}
                                {absenceShort(reason)}
                              </span>
                            ) : h > 0 ? (
                              h.toFixed(2)
                            ) : (
                              <span className="text-muted-foreground">–</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 text-right font-semibold">{sum.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Legende: <span className="font-semibold text-destructive">K</span> = Krankheit ·{" "}
          <span className="font-semibold text-amber-600">U</span> = Urlaub ·{" "}
          <span className="font-semibold">S</span> = Sonstiges
        </p>
      </section>

      {/* Monatsabrechnung */}
      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Monatsabrechnung</h2>
            <p className="text-sm text-muted-foreground">
              Arbeitsstunden und Lohn je Mitarbeiter – Urlaub und Krankheit separat ausgewiesen.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setMonthCursor(
                  new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1, 12),
                )
              }
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[9rem] text-center text-sm font-medium">
              {monthCursor.toLocaleDateString("de-DE-u-ca-gregory-nu-latn", {
                month: "long",
                year: "numeric",
              })}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setMonthCursor(
                  new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1, 12),
                )
              }
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {payroll.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Mitarbeiter vorhanden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Mitarbeiter</th>
                  <th className="py-2 pr-3 text-right">Arbeitsstunden</th>
                  <th className="py-2 pr-3 text-right">Stundenlohn</th>
                  <th className="py-2 pr-3 text-right">Lohn (brutto)</th>
                  <th className="py-2 pr-3 text-right">Urlaubstage</th>
                  <th className="py-2 pr-3 text-right">Krankheitstage</th>
                  <th className="py-2 text-right">Sonstige</th>
                </tr>
              </thead>
              <tbody>
                {payroll.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{p.name}</td>
                    <td className="py-2 pr-3 text-right">{p.workHours.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-right">{p.rate.toFixed(2)} €</td>
                    <td className="py-2 pr-3 text-right font-semibold">{p.wage.toFixed(2)} €</td>
                    <td className="py-2 pr-3 text-right text-amber-600">{p.vacationDays}</td>
                    <td className="py-2 pr-3 text-right font-medium text-destructive">
                      {p.sickDays}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">{p.otherDays}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-2 pr-3">Gesamt</td>
                  <td className="py-2 pr-3 text-right">
                    {payroll.reduce((s, p) => s + p.workHours, 0).toFixed(2)}
                  </td>
                  <td />
                  <td className="py-2 pr-3 text-right">
                    {payroll.reduce((s, p) => s + p.wage, 0).toFixed(2)} €
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {payroll.reduce((s, p) => s + p.vacationDays, 0)}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {payroll.reduce((s, p) => s + p.sickDays, 0)}
                  </td>
                  <td className="py-2 text-right">
                    {payroll.reduce((s, p) => s + p.otherDays, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Firmenfahrten sind ein eigenständiger Bericht, kein Bestandteil der Lohnsumme. */}
      <section className="surface space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Fahrtenbuch – Betriebsfahrten</h2>
            <p className="text-sm text-muted-foreground">
              Fahrten für {monthCursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}; keine automatische Zuordnung zu Mitarbeitern oder Lohn.
            </p>
          </div>
          <Button variant="outline" onClick={() => void downloadMonthFahrtenbuchPdf()}
            disabled={monthTrips.length === 0 || Boolean(monthTripsError || monthTripVehiclesError)}>
            <Car className="size-4" /> Fahrtenbuch PDF
          </Button>
        </div>
        {(monthTripsError || monthTripVehiclesError) ? (
          <p className="text-sm text-destructive">Fahrtenbuch konnte nicht geladen werden.</p>
        ) : (
          <p className="text-sm text-muted-foreground">{monthTrips.length} Fahrten im gewählten Monat.</p>
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
