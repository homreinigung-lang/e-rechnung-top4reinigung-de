import { holidayName } from "@/lib/feiertage";
import { Fragment, useCallback, useMemo, useState } from "react";
import { isoWeek } from "@/lib/kw";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Camera,
  HeartPulse,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatDate } from "@/lib/format";
import {
  ABSENCE_REASONS,
  absenceClasses,
  absenceLabel,
  absenceReason,
  absenceShort,
  isAbsence,
  type AbsenceReason,
  type EntryType,
} from "@/lib/absence";
import {
  LEGEND,
  STATUS_CLASSES,
  STATUS_DOTS,
  STATUS_LABELS,
  einsatzStatus,
  statusClasses,
  statusLabel,
} from "@/lib/einsatz-status";
import { buildXlsx } from "@/lib/xlsx";
import { saveFile } from "@/lib/download";
import { AbwesenheitZeitraum } from "@/components/AbwesenheitZeitraum";
import { GermanTimeInput } from "@/components/GermanDateTimeInput";
import { ArbeitsnachweisFotos } from "@/components/ArbeitsnachweisFotos";

import { effectiveDayHours, normalizeDayTimes, formatDayTime } from "@/lib/planung";
import { mapsUrl, serviceAddress, serviceAddressOrBilling } from "@/lib/maps";

type PlanShift = {
  key: string;
  employeeId: string;
  employeeName: string;
  projectId: string | null;
  projectName: string;
  range: string;
  hours: number;
  start: string;
  end: string;
  breakMin: number;
  date: string;
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const NO_PROJECT = "__none__";
const ALL = "__all__";

type TimeEntry = import("@/integrations/supabase/types").Tables<"time_entries">;

export type KalenderEmployee = {
  id: string;
  name: string;
  hourly_rate: number | null;
  weekly_hours?: number | null;
};
export type KalenderProject = { id: string; name: string | null; city?: string | null };

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
}

/** "HH:MM" (auch "8:5", "0800") → Minuten seit Mitternacht, sonst null. */
function parseHm(value: string): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let h: number, m: number;
  const colon = /^(\d{1,2})[:.](\d{1,2})$/.exec(raw);
  const plain = /^(\d{3,4})$/.exec(raw);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (plain) {
    const s = plain[1]!.padStart(4, "0");
    h = Number(s.slice(0, 2));
    m = Number(s.slice(2));
  } else return null;
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Minuten seit Mitternacht → "HH:MM". */
function minutesToHm(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Stunden aus Start/Ende minus Pause (Minuten). Immer eine gültige Zahl (>= 0). */

function hoursFromTimes(start: string, end: string, breakMinutes: number) {
  const s = parseHm(start);
  const e = parseHm(end);
  if (s === null || e === null) return 0;
  const pause = Number.isFinite(breakMinutes) ? Math.max(0, breakMinutes) : 0;
  let mins = e - s;
  if (mins < 0) mins += 24 * 60;
  mins -= pause;
  const hours = Math.round((mins / 60) * 100) / 100;
  return Number.isFinite(hours) ? Math.max(0, hours) : 0;
}

type PlanForm = {
  employeeIds: string[];
  entryType: EntryType;
  absenceReason: AbsenceReason;
  projectId: string;
  location: string;
  start: string;
  end: string;
  breakMinutes: string;
  note: string;
};

const emptyForm: PlanForm = {
  employeeIds: [],
  entryType: "work",
  absenceReason: "vacation",
  projectId: NO_PROJECT,
  location: "",
  start: "08:00",
  end: "16:00",
  breakMinutes: "30",
  note: "",
};

export function EinsatzKalender({
  employees,
  projects: projectsProp = [],
}: {
  employees: KalenderEmployee[];
  projects?: KalenderProject[];
}) {
  const queryClient = useQueryClient();

  // Eigene Projektliste laden, damit das Objekt/Projekt-Dropdown immer gefüllt ist,
  // auch wenn die übergebene Liste leer oder noch nicht geladen ist.
  const { data: fetchedProjects = [] } = useQuery({
    queryKey: ["projects", "kalender-picker"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name,city").order("name");
      if (error) throw error;
      return data as KalenderProject[];
    },
  });

  const projects = useMemo<KalenderProject[]>(() => {
    const map = new Map<string, KalenderProject>();
    for (const p of [...projectsProp, ...fetchedProjects]) if (p?.id) map.set(p.id, p);
    return [...map.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "de"));
  }, [projectsProp, fetchedProjects]);
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [filterEmployee, setFilterEmployee] = useState<string>(ALL);
  const [filterProject, setFilterProject] = useState<string>(ALL);
  const [day, setDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<TimeEntry | null>(null);
  const [planDetail, setPlanDetail] = useState<PlanShift | null>(null);

  const [form, setForm] = useState<PlanForm>(emptyForm);

  const first = monthStart(anchor);
  const weekStart = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(12, 0, 0, 0);
    return d;
  }, [anchor]);

  const gridStart = useMemo(() => {
    if (view === "week") return weekStart;
    const d = new Date(first);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(12, 0, 0, 0);
    return d;
  }, [first, weekStart, view]);

  const days = useMemo(
    () =>
      Array.from({ length: view === "week" ? 7 : 42 }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [gridStart, view],
  );

  const rangeFrom = isoDay(days[0]!);
  const rangeTo = isoDay(days[days.length - 1]!);

  const { data: allEntries = [] } = useQuery({
    queryKey: ["time_entries", "calendar", rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .gte("work_date", rangeFrom)
        .lte("work_date", rangeTo)
        .order("start_time", { nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  /** Anzeige nach Mitarbeiter- und Projektfilter eingeschränkt. */
  const entries = useMemo(
    () =>
      allEntries.filter(
        (e) =>
          (filterEmployee === ALL || e.employee_id === filterEmployee) &&
          (filterProject === ALL || e.project_id === filterProject),
      ),
    [allEntries, filterEmployee, filterProject],
  );

  const visibleEmployees = useMemo(
    () => (filterEmployee === ALL ? employees : employees.filter((e) => e.id === filterEmployee)),
    [employees, filterEmployee],
  );

  /** Kundennamen für die Schnellansicht und den Export. */
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "calendar-names"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id,name,company,address_line,postal_code,city,service_address_line,service_postal_code,service_city,service_note",
        );
      if (error) throw error;
      return data;
    },
  });

  const customerName = (id: string | null) => {
    if (!id) return "";
    const c = customers.find((x) => x.id === id);
    return c ? c.company || c.name : "";
  };

  /** Einsatzort des Kunden (falls gepflegt), sonst Rechnungsadresse. */
  const customerSite = (id: string | null) => {
    if (!id) return { address: "", note: "", own: false };
    const c = customers.find((x) => x.id === id);
    if (!c) return { address: "", note: "", own: false };
    const own = Boolean(serviceAddress(c));
    return {
      address: serviceAddressOrBilling(c),
      note: c.service_note ?? "",
      own,
    };
  };


  const projectName = useCallback(
    (id: string | null) => {
      if (!id) return "";
      return projects.find((x) => x.id === id)?.name || "";
    },
    [projects],
  );

  /** Excel-Export des sichtbaren Zeitraums (inkl. Filter). */
  const exportXlsx = async () => {
    const rows = [...entries]
      .sort((a, b) =>
        (a.work_date + (a.start_time ?? "")).localeCompare(b.work_date + (b.start_time ?? "")),
      )
      .map((e) => ({
        Datum: formatDate(e.work_date),
        Mitarbeiter: e.employee_name,
        Status: statusLabel(e),
        Von: (e.start_time ?? "").slice(0, 5),
        Bis: (e.end_time ?? "").slice(0, 5),
        "Pause (Min.)": Number(e.break_minutes ?? 0),
        Stunden: Number(e.hours ?? 0),
        "Objekt / Einsatzort": e.location || projectName(e.project_id),
        Kunde: customerName(e.customer_id),
        Notiz: e.note || "",
      }));
    if (rows.length === 0) {
      toast.info("Für diesen Zeitraum gibt es keine Einträge zum Exportieren.");
      return;
    }
    const blob = await buildXlsx([{ name: "Einsatzplan", rows }]);
    await saveFile(blob, `Einsatzplan_${periodLabel.replace(/[^\w]+/g, "_")}.xlsx`);
  };

  /** Druck-/PDF-Ausgabe des Kalenders (Querformat, ohne Bedienelemente). */
  const printPlan = () => {
    const style = document.createElement("style");
    style.id = "kalender-print-style";
    style.textContent = `@media print{
      @page{size:A4 landscape;margin:10mm;}
      body *{visibility:hidden !important;}
      #einsatz-kalender-print,#einsatz-kalender-print *{visibility:visible !important;}
      #einsatz-kalender-print{position:absolute !important;left:0;top:0;width:100%;box-shadow:none !important;border:none !important;padding:0 !important;}
      #einsatz-kalender-print .kalender-no-print{display:none !important;}
      #einsatz-kalender-print .overflow-x-auto{overflow:visible !important;}
      #einsatz-kalender-print [class*="min-w-"]{min-width:0 !important;}
      *{print-color-adjust:exact;-webkit-print-color-adjust:exact;}
    }`;
    document.head.appendChild(style);
    const cleanup = () => {
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 3000);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["time_entries"] });
  };

  const createPlan = useMutation({
    mutationFn: async (values: PlanForm & { workDate: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const selected = employees.filter((e) => values.employeeIds.includes(e.id));
      if (selected.length === 0) throw new Error("Bitte mindestens einen Mitarbeiter wählen.");
      const absence = values.entryType === "absence";
      const rawBreak = Number(String(values.breakMinutes).replace(",", "."));
      const breakMinutes = absence || !Number.isFinite(rawBreak) ? 0 : Math.max(0, rawBreak);
      const startMin = parseHm(values.start);
      const endMin = parseHm(values.end);
      if (!absence && (startMin === null || endMin === null))
        throw new Error("Bitte Start- und Endzeit im Format HH:MM eintragen.");
      const hours = absence ? 0 : hoursFromTimes(values.start, values.end, breakMinutes);
      if (!absence && !(hours > 0))
        throw new Error("Die geplante Dauer muss größer als 0 Stunden sein.");
      const locText = values.location.trim();
      const project = absence
        ? null
        : projects.find((p) => p.id === values.projectId && values.projectId !== NO_PROJECT) ||
          projects.find((p) => (p.name || "").trim().toLowerCase() === locText.toLowerCase()) ||
          null;

      const rows = selected.map((employee) => ({
        user_id: userId,
        employee_id: employee.id,
        employee_name: employee.name,
        work_date: values.workDate,
        start_time: absence ? null : minutesToHm(startMin!),
        end_time: absence ? null : minutesToHm(endMin!),
        break_minutes: breakMinutes,
        hours: Number(hours.toFixed(2)),

        hourly_rate: Number(employee.hourly_rate ?? 0),
        project_id: project?.id ?? null,
        location: absence ? absenceLabel(values.absenceReason) : locText || project?.name || "",

        note: values.note.trim(),
        entry_type: values.entryType,
        absence_reason: absence ? values.absenceReason : "",
      }));

      const { error } = await supabase.from("time_entries").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count, values) => {
      const n = count ?? 1;
      toast.success(
        values.entryType === "absence"
          ? `Abwesenheit für ${n} Mitarbeiter eingetragen`
          : `Einsatz für ${n} Mitarbeiter geplant`,
      );

      setDay(null);
      setForm(emptyForm);

      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Einsatz entfernt");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, typeof entries>();
    for (const e of entries) {
      const list = map.get(e.work_date) ?? [];
      list.push(e);
      map.set(e.work_date, list);
    }
    return map;
  }, [entries]);

  /** Wochenplanung (Arbeitsplanung) für den sichtbaren Zeitraum. */
  const { data: assignments = [] } = useQuery({
    queryKey: ["project_assignments", "calendar", rangeFrom, rangeTo],
    queryFn: async () => {
      const from = new Date(`${rangeFrom}T12:00:00`);
      from.setDate(from.getDate() - 6);
      const { data, error } = await supabase
        .from("project_assignments")
        .select(
          "id,employee_id,project_id,assignment_role,start_date,hours_per_week,day_hours,day_times",
        )
        .gte("start_date", isoDay(from))
        .lte("start_date", rangeTo);
      if (error) throw error;
      return data;
    },
  });

  /** Aus der Planung abgeleitete Schichten (Von–Bis) je Tag. */
  const planByDay = useMemo(() => {
    const map = new Map<string, PlanShift[]>();
    for (const a of assignments) {
      if (!a.start_date || !a.employee_id) continue;
      if (filterEmployee !== ALL && a.employee_id !== filterEmployee) continue;
      if (filterProject !== ALL && a.project_id !== filterProject) continue;
      const monday = new Date(`${a.start_date}T12:00:00`);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const hours = effectiveDayHours(a.day_hours, a.hours_per_week, a.day_times);
      const times = normalizeDayTimes(a.day_times);
      hours.forEach((h, i) => {
        if (!h || h <= 0) return;
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        const key = isoDay(d);
        const list = map.get(key) ?? [];
        list.push({
          key: `${a.id}-${i}`,
          employeeId: a.employee_id!,
          employeeName: employees.find((e) => e.id === a.employee_id)?.name ?? "Mitarbeiter",
          projectId: a.project_id ?? null,
          projectName: projectName(a.project_id) || "Ohne Objekt",
          range: formatDayTime(times[i]),
          hours: h,
          start: times[i]?.start ?? "",
          end: times[i]?.end ?? "",
          breakMin: times[i]?.breakMin ?? 0,
          date: key,
        });
        map.set(key, list);
      });
    }
    for (const list of map.values()) {
      list.sort((x, y) => (x.range || "zz").localeCompare(y.range || "zz"));
    }
    return map;
  }, [assignments, employees, projectName, filterEmployee, filterProject]);

  /**
   * Erfasste Zeiten mit der Planung zusammenführen: pro Mitarbeiter, Tag und
   * (falls vorhanden) Objekt wird genau EIN Block angezeigt – die erfasste Zeit
   * ersetzt die geplante Schicht und gilt als erledigt.
   */
  const { matchedPlanKeys, doneEntries } = useMemo(() => {
    const matched = new Set<string>();
    const done = new Map<string, PlanShift>();
    for (const [date, plans] of planByDay) {
      const dayList = (byDay.get(date) ?? []).filter((e) => !isAbsence(e) && e.employee_id);
      const used = new Set<string>();
      for (const p of plans) {
        const hit =
          dayList.find(
            (e) =>
              !used.has(e.id) &&
              e.employee_id === p.employeeId &&
              p.projectId &&
              e.project_id === p.projectId,
          ) ?? dayList.find((e) => !used.has(e.id) && e.employee_id === p.employeeId);
        if (!hit) continue;
        used.add(hit.id);
        matched.add(p.key);
        done.set(hit.id, p);
      }
    }
    return { matchedPlanKeys: matched, doneEntries: done };
  }, [planByDay, byDay]);

  /** Nur noch offene (nicht erfasste) Planungen eines Tages. */
  const openPlans = (key: string, employeeId?: string) =>
    (planByDay.get(key) ?? []).filter(
      (p) => !matchedPlanKeys.has(p.key) && (!employeeId || p.employeeId === employeeId),
    );

  const today = isoDay(new Date());

  const shift = (delta: number) => {
    if (view === "week") {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + delta * 7);
      setAnchor(d);
    } else {
      setAnchor(new Date(first.getFullYear(), first.getMonth() + delta, 1, 12));
    }
  };

  const periodLabel =
    view === "week"
      ? `KW ${isoWeek(weekStart)} · ${formatDate(isoDay(days[0]!))} – ${formatDate(isoDay(days[6]!))}`
      : first.toLocaleDateString("de-DE-u-ca-gregory-nu-latn", { month: "long", year: "numeric" });

  /** Ist-Stunden (nur Arbeitseinsätze) je Mitarbeiter im sichtbaren Zeitraum. */
  const actualByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (isAbsence(e) || !e.employee_id) continue;
      map.set(e.employee_id, (map.get(e.employee_id) ?? 0) + Number(e.hours ?? 0));
    }
    return map;
  }, [entries]);

  /** Soll-Stunden aus dem Vertrag: Woche = Wochenstunden, Monat = Wochenstunden × 4,33. */
  const plannedFor = (emp: KalenderEmployee) =>
    Number(emp.weekly_hours ?? 0) * (view === "week" ? 1 : 4.33);

  const dayEntries = day ? (byDay.get(day) ?? []) : [];
  const isAbsent = form.entryType === "absence";
  const breakInput = Number(String(form.breakMinutes).replace(",", "."));
  const plannedHours = hoursFromTimes(
    form.start,
    form.end,
    Number.isFinite(breakInput) ? breakInput : 0,
  );
  const timesValid = parseHm(form.start) !== null && parseHm(form.end) !== null;

  const setEntryStatus = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { completed_at?: string | null; approval_status?: string };
    }) => {
      const { error } = await supabase.from("time_entries").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status aktualisiert");
      setDetail(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Geplante Schicht als erledigt übernehmen: Planzeit wird zur Ist-Arbeitszeit. */
  const confirmPlan = useMutation({
    mutationFn: async (p: PlanShift) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const emp = employees.find((e) => e.id === p.employeeId);
      // Doppelte Ist-Zeiten verhindern (Mehrfachklick oder bereits im Portal bestätigt)
      const { data: existing, error: dupError } = await supabase
        .from("time_entries")
        .select("id")
        .eq("employee_id", p.employeeId)
        .eq("work_date", p.date)
        .eq("entry_type", "work")
        .limit(1);
      if (dupError) throw dupError;
      if (existing && existing.length > 0) {
        throw new Error("Für diesen Tag ist bereits eine Arbeitszeit erfasst.");
      }
      const { error } = await supabase.from("time_entries").insert({
        user_id: userId,
        employee_id: p.employeeId,
        employee_name: emp?.name ?? p.employeeName,
        work_date: p.date,
        start_time: p.start || null,
        end_time: p.end || null,
        break_minutes: p.breakMin || 0,
        hours: Number(p.hours.toFixed(2)),
        hourly_rate: Number(emp?.hourly_rate ?? 0),
        project_id: p.projectId,
        location: p.projectName === "Ohne Objekt" ? "" : p.projectName,
        note: "",
        entry_type: "work",
        absence_reason: "",
        completed_at: new Date().toISOString(),
        approval_status: "approved",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Einsatz als erledigt übernommen");
      setPlanDetail(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDay = (key: string, employeeId?: string) => {
    const preset = employeeId ?? (filterEmployee !== ALL ? filterEmployee : "");
    setForm({
      ...emptyForm,
      employeeIds: preset ? [preset] : [],
      projectId: filterProject !== ALL ? filterProject : NO_PROJECT,
    });
    setDay(key);
  };

  return (
    <section id="einsatz-kalender-print" className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Einsatz-Kalender</h2>
          <p className="text-sm text-muted-foreground">
            Monats- oder Wochenansicht, Einsatzort je Zeitfenster sowie Soll-/Ist-Stunden je
            Mitarbeiter.
          </p>
          <p className="hidden text-sm font-medium print:block">{periodLabel}</p>
        </div>
        <div className="kalender-no-print flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            <Button
              variant={view === "month" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setView("month")}
            >
              Monat
            </Button>
            <Button
              variant={view === "week" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setView("week")}
            >
              Woche
            </Button>
          </div>
          <Button variant="outline" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium">{periodLabel}</span>
          <Button variant="outline" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const d = new Date();
              d.setHours(12, 0, 0, 0);
              setAnchor(d);
            }}
          >
            Heute
          </Button>
          <Button variant="outline" size="sm" onClick={exportXlsx}>
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={printPlan}>
            <Printer className="size-4" /> Drucken / PDF
          </Button>
          <AbwesenheitZeitraum employees={employees} />
        </div>
      </div>

      <div className="kalender-no-print flex flex-wrap items-center gap-2">
        <Select value={filterEmployee} onValueChange={setFilterEmployee}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Alle Mitarbeiter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Mitarbeiter</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Alle Objekte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Objekte / Projekte</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name || "Ohne Namen"}
                {p.city ? ` · ${p.city}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterEmployee !== ALL || filterProject !== ALL) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterEmployee(ALL);
              setFilterProject(ALL);
            }}
          >
            Filter zurücksetzen
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${STATUS_DOTS[s]}`} />
            {STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      {view === "month" && visibleEmployees.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {visibleEmployees.map((emp) => {
            const actual = actualByEmployee.get(emp.id) ?? 0;
            const planned = plannedFor(emp);
            return (
              <span key={emp.id} className="rounded border px-2 py-1">
                <span className="font-medium">{emp.name}</span> · Soll {planned.toFixed(2)} / Ist{" "}
                {actual.toFixed(2)} Std.
              </span>
            );
          })}
        </div>
      )}

      {view === "month" ? (
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-lg border bg-border text-sm">
          <div className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            KW
          </div>
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground"
            >
              {w}
            </div>
          ))}
          {days.map((d, index) => {
            const key = isoDay(d);
            const inMonth = d.getMonth() === first.getMonth();
            const holiday = holidayName(key);
            const list = byDay.get(key) ?? [];
            return (
              <Fragment key={key}>
                {index % 7 === 0 && (
                  <div
                    className="flex items-center justify-center bg-muted/40 px-1 py-1.5 text-xs font-medium text-muted-foreground"
                    title={`Kalenderwoche ${isoWeek(d)}`}
                  >
                    {isoWeek(d)}
                  </div>
                )}

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openDay(key)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") openDay(key);
                  }}
                  className={`min-h-[132px] cursor-pointer space-y-1 bg-background p-2 text-left transition hover:bg-accent/60 ${
                    inMonth ? "" : "opacity-45"
                  } ${key === today ? "ring-1 ring-inset ring-primary" : ""} ${
                    holiday ? "bg-amber-50 dark:bg-amber-950/30" : ""
                  }`}
                  title={holiday ? `Feiertag (Saarland): ${holiday}` : undefined}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${key === today ? "font-bold text-primary" : ""}`}>
                      {d.getDate()}
                    </span>
                    {list.length > 0 && (
                      <span className="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                        {list.length}
                      </span>
                    )}
                  </div>
                  {holiday && (
                    <div className="mt-0.5 truncate text-[10px] font-medium text-amber-700 dark:text-amber-400">
                      {holiday}
                    </div>
                  )}
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, 3).map((e) => {
                      const reason = absenceReason(e);
                      const donePlan = doneEntries.get(e.id);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setDetail(e);
                          }}
                          className={`flex w-full items-center gap-1 truncate rounded border px-1 py-0.5 text-left text-[11px] leading-tight hover:brightness-95 ${
                            donePlan
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : statusClasses(e)
                          }`}
                          title={
                            donePlan
                              ? `Erledigt: ${e.employee_name} · ${donePlan.projectName} · Plan ${donePlan.range || `${donePlan.hours.toFixed(2)} Std.`} · Ist ${Number(e.hours ?? 0).toFixed(2)} Std.`
                              : `${e.employee_name} · ${statusLabel(e)}`
                          }
                        >
                          {reason === "sick" && <HeartPulse className="size-3 shrink-0" />}
                          {((e as { photo_paths?: string[] }).photo_paths ?? []).length > 0 && (
                            <span
                              title={`${((e as { photo_paths?: string[] }).photo_paths ?? []).length} Foto(s) vorhanden`}
                              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white"
                            >
                              <Camera className="size-2.5" />
                              {((e as { photo_paths?: string[] }).photo_paths ?? []).length}
                            </span>
                          )}
                          <span className="truncate">
                            {reason ? absenceShort(reason) : (e.start_time ?? "").slice(0, 5)}{" "}
                            {e.employee_name}
                            {!reason && (donePlan?.projectName || e.location)
                              ? ` · ${donePlan?.projectName || e.location}`
                              : ""}
                            {donePlan ? " · Erledigt" : ""}
                          </span>
                        </button>
                      );
                    })}
                    {list.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{list.length - 3} weitere
                      </div>
                    )}
                    {openPlans(key)
                      .slice(0, 3)
                      .map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setPlanDetail(p);
                          }}
                          title={`Planung: ${p.employeeName} · ${p.projectName} · ${p.range || `${p.hours.toFixed(2)} Std.`}`}
                          className="block w-full rounded-md border border-dashed border-primary/50 bg-primary/5 px-1.5 py-1 text-left text-[11px] leading-tight text-primary hover:bg-primary/10"
                        >
                          <div className="truncate font-semibold">{p.employeeName}</div>
                          <div className="truncate opacity-90">{p.projectName}</div>
                          <div className="text-[10px] opacity-80">
                            {p.range ? `${p.range} · ` : ""}
                            {p.hours.toFixed(2)} Std. · Plan
                          </div>
                        </button>
                      ))}

                    {openPlans(key).length > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{openPlans(key).length - 3} weitere Planungen
                      </div>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[56rem] grid-cols-[12rem_repeat(7,minmax(0,1fr))] gap-px rounded-lg border bg-border text-sm">
            <div className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Mitarbeiter · Soll / Ist
            </div>
            {days.map((d, i) => (
              <div
                key={isoDay(d)}
                className={`bg-muted/60 px-2 py-1.5 text-xs font-medium ${
                  isoDay(d) === today ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {WEEKDAYS[i]} {d.getDate()}.{d.getMonth() + 1}.
              </div>
            ))}

            {visibleEmployees.length === 0 && (
              <div className="col-span-8 bg-background px-3 py-6 text-center text-sm text-muted-foreground">
                Keine Mitarbeiter für diesen Filter.
              </div>
            )}

            {visibleEmployees.map((emp) => {
              const actual = actualByEmployee.get(emp.id) ?? 0;
              const planned = plannedFor(emp);
              const diff = actual - planned;
              return (
                <Fragment key={emp.id}>
                  <div className="bg-background px-2 py-2">
                    <div className="truncate font-medium">{emp.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Soll {planned.toFixed(2)} · Ist {actual.toFixed(2)} Std.
                    </div>
                    <div
                      className={`text-xs font-medium ${
                        diff < 0 ? "text-destructive" : "text-primary"
                      }`}
                    >
                      {diff >= 0 ? "+" : ""}
                      {diff.toFixed(2)} Std.
                    </div>
                  </div>
                  {days.map((d) => {
                    const key = isoDay(d);
                    const list = (byDay.get(key) ?? []).filter((e) => e.employee_id === emp.id);
                    return (
                      <div
                        key={`${emp.id}-${key}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => openDay(key, emp.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") openDay(key, emp.id);
                        }}
                        className={`min-h-[112px] cursor-pointer space-y-1 bg-background p-1.5 text-left align-top transition hover:bg-accent/60 ${
                          key === today ? "ring-1 ring-inset ring-primary" : ""
                        }`}
                      >
                        {list.map((e) => {
                          const reason = absenceReason(e);
                          const donePlan = doneEntries.get(e.id);
                          return (
                            <button
                              key={e.id}
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setDetail(e);
                              }}
                              title={
                                donePlan
                                  ? `Erledigt · Plan ${donePlan.range || `${donePlan.hours.toFixed(2)} Std.`}`
                                  : statusLabel(e)
                              }
                              className={`w-full rounded border px-1 py-0.5 text-left text-[11px] leading-tight hover:brightness-95 ${
                                donePlan
                                  ? "border-emerald-600 bg-emerald-600 text-white"
                                  : statusClasses(e)
                              }`}
                            >
                              {reason ? (
                                <span className="flex items-center gap-1">
                                  {reason === "sick" && <HeartPulse className="size-3 shrink-0" />}
                                  {absenceLabel(reason)}
                                </span>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-medium">
                                      {(e.start_time ?? "").slice(0, 5)}–
                                      {(e.end_time ?? "").slice(0, 5)}
                                    </span>
                                    {((e as { photo_paths?: string[] }).photo_paths ?? []).length >
                                      0 && (
                                      <span
                                        title={`${((e as { photo_paths?: string[] }).photo_paths ?? []).length} Foto(s) vorhanden`}
                                        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white"
                                      >
                                        <Camera className="size-2.5" />
                                        {
                                          ((e as { photo_paths?: string[] }).photo_paths ?? [])
                                            .length
                                        }
                                      </span>
                                    )}
                                  </div>
                                  <div className="truncate">
                                    {donePlan?.projectName || e.location || "ohne Objekt"}
                                  </div>
                                  <div className="text-[10px] opacity-80">
                                    {donePlan ? "Erledigt · " : ""}
                                    {Number(e.hours ?? 0).toFixed(2)} Std.
                                  </div>
                                </>
                              )}
                            </button>
                          );
                        })}
                        {openPlans(key, emp.id).map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setPlanDetail(p);
                            }}
                            title={`Planung: ${p.employeeName} · ${p.projectName}`}
                            className="block w-full rounded-md border border-dashed border-primary/50 bg-primary/5 px-1.5 py-1 text-left text-[11px] leading-tight text-primary hover:bg-primary/10"
                          >
                            <div className="truncate font-semibold">{p.employeeName}</div>
                            <div className="truncate">{p.projectName}</div>
                            <div className="text-[10px] opacity-80">
                              {p.range ? `${p.range} · ` : ""}
                              {p.hours.toFixed(2)} Std. · Plan
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={day !== null} onOpenChange={(o) => !o && setDay(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {isAbsent ? "Abwesenheit eintragen" : "Einsatz planen"} – {day ? formatDate(day) : ""}
            </DialogTitle>
          </DialogHeader>

          {dayEntries.length > 0 && (
            <ul className="divide-y rounded-md border">
              {dayEntries.map((e) => {
                const reason = absenceReason(e);
                return (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {reason
                        ? "ganztägig"
                        : `${(e.start_time ?? "").slice(0, 5)}–${(e.end_time ?? "").slice(0, 5)}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{e.employee_name}</span>
                      {e.location ? ` · ${e.location}` : ""}
                    </span>
                    {reason ? (
                      <span
                        className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${absenceClasses(reason)}`}
                      >
                        {reason === "sick" && <HeartPulse className="size-3" />}
                        {absenceLabel(reason)}
                      </span>
                    ) : (
                      <span className="shrink-0">{Number(e.hours ?? 0).toFixed(2)} Std.</span>
                    )}
                    <ConfirmDeleteButton
                      title="Eintrag wirklich löschen?"
                      description={`Der Eintrag für „${e.employee_name || "Mitarbeiter"}"${e.location ? ` (${e.location})` : ""} wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                      onConfirm={() => removePlan.mutate(e.id)}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Mitarbeiter (Mehrfachauswahl)</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => setForm({ ...form, employeeIds: employees.map((e) => e.id) })}
                  >
                    Alle
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => setForm({ ...form, employeeIds: [] })}
                  >
                    Keine
                  </button>
                </div>
              </div>
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                {employees.length === 0 && (
                  <span className="text-sm text-muted-foreground">Keine Mitarbeiter vorhanden</span>
                )}
                {employees.map((e) => {
                  const active = form.employeeIds.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          employeeIds: active
                            ? form.employeeIds.filter((id) => id !== e.id)
                            : [...form.employeeIds, e.id],
                        })
                      }
                      className={`rounded-full border px-3 py-1 text-sm transition ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      {e.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {form.employeeIds.length} ausgewählt – der Einsatz wird für alle gleichzeitig
                angelegt.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Art des Eintrags</Label>
              <Select
                value={form.entryType}
                onValueChange={(v) => setForm({ ...form, entryType: v as EntryType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">Arbeitseinsatz</SelectItem>
                  <SelectItem value="absence">Abwesenheit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isAbsent && (
              <div className="space-y-2">
                <Label>Grund der Abwesenheit</Label>
                <Select
                  value={form.absenceReason}
                  onValueChange={(v) => setForm({ ...form, absenceReason: v as AbsenceReason })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isAbsent && (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="k-loc">Objekt / Projekt (Freitext)</Label>
                  <Input
                    id="k-loc"
                    list="k-projects"
                    value={form.location}
                    placeholder="Projekt, Kunde oder Adresse frei eingeben"
                    onChange={(e) => {
                      const v = e.target.value;
                      const match = projects.find(
                        (p) => (p.name || "").trim().toLowerCase() === v.trim().toLowerCase(),
                      );
                      setForm({ ...form, location: v, projectId: match?.id ?? NO_PROJECT });
                    }}
                  />
                  <datalist id="k-projects">
                    {projects.map((p) => (
                      <option key={p.id} value={p.name || ""}>
                        {p.city || ""}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="k-start">Von (HH:MM)</Label>
                  <GermanTimeInput
                    id="k-start"
                    value={form.start}
                    onChange={(v) => setForm({ ...form, start: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="k-end">Bis (HH:MM)</Label>
                  <GermanTimeInput
                    id="k-end"
                    value={form.end}
                    onChange={(v) => setForm({ ...form, end: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="k-break">Pause (Min.)</Label>
                  <Input
                    id="k-break"
                    inputMode="numeric"
                    value={form.breakMinutes}
                    onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="k-note">Notiz</Label>
              <Input
                id="k-note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {isAbsent ? (
              <>
                Ganztägige Abwesenheit:{" "}
                <span className="font-medium text-foreground">
                  {absenceLabel(form.absenceReason)}
                </span>{" "}
                – wird ohne Arbeitsstunden erfasst und in der Monatsabrechnung separat ausgewiesen.
              </>
            ) : (
              <>
                Geplante Dauer:{" "}
                <span className="font-medium text-foreground">
                  {timesValid ? `${plannedHours.toFixed(2)} Std.` : "—"}
                </span>
                {timesValid && plannedHours <= 0 ? (
                  <span className="text-destructive"> · Endzeit/Pause prüfen</span>
                ) : null}
              </>
            )}
          </p>

          <DialogFooter>
            <Button
              onClick={() => day && createPlan.mutate({ ...form, workDate: day })}
              disabled={
                form.employeeIds.length === 0 ||
                createPlan.isPending ||
                (!isAbsent && (!timesValid || plannedHours <= 0))
              }
            >
              <Plus className="size-4" /> {isAbsent ? "Abwesenheit eintragen" : "Einsatz eintragen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schnellansicht: Details eines einzelnen Einsatzes */}
      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Einsatz-Details</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <span
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[einsatzStatus(detail)]}`}
              >
                <span className={`size-2 rounded-full ${STATUS_DOTS[einsatzStatus(detail)]}`} />
                {statusLabel(detail)}
              </span>
              <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2">
                <dt className="text-muted-foreground">Datum</dt>
                <dd className="font-medium">{formatDate(detail.work_date)}</dd>
                <dt className="text-muted-foreground">Mitarbeiter</dt>
                <dd className="font-medium">{detail.employee_name}</dd>
                <dt className="text-muted-foreground">Zeit</dt>
                <dd>
                  {isAbsence(detail)
                    ? "ganztägig"
                    : `${(detail.start_time ?? "").slice(0, 5)}–${(detail.end_time ?? "").slice(0, 5)} (Pause ${Number(detail.break_minutes ?? 0)} Min.)`}
                </dd>
                <dt className="text-muted-foreground">Arbeitsstunden</dt>
                <dd className="font-medium">{Number(detail.hours ?? 0).toFixed(2)} Std.</dd>
                <dt className="text-muted-foreground">Objekt / Einsatzort</dt>
                <dd>{detail.location || projectName(detail.project_id) || "—"}</dd>
                <dt className="text-muted-foreground">Kunde</dt>
                <dd>{customerName(detail.customer_id) || "—"}</dd>
                {detail.note ? (
                  <>
                    <dt className="text-muted-foreground">Notiz</dt>
                    <dd>{detail.note}</dd>
                  </>
                ) : null}
              </dl>

              {/* Objektfotos: nur interne Verwaltungsansicht, nie im Steuerberater-Portal. */}
              {!isAbsence(detail) &&
                (() => {
                  const fotos = ((detail as { photo_paths?: string[] }).photo_paths ??
                    []) as string[];
                  return (
                    <div className="rounded-md border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/30">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                          <Camera className="size-4" />
                          Objektfotos
                          <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
                            {fotos.length}
                          </span>
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-amber-700/70 dark:text-amber-400/70">
                          nur intern
                        </span>
                      </div>
                      <ArbeitsnachweisFotos
                        entryId={detail.id}
                        paths={fotos}
                        canDelete
                        invalidateKey="time_entries"
                      />
                      {fotos.length === 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Keine Fotos vom Mitarbeiter hochgeladen.
                        </p>
                      )}
                    </div>
                  );
                })()}
            </div>
          )}
          {detail && !isAbsence(detail) && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {detail.completed_at ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={setEntryStatus.isPending}
                  onClick={() =>
                    setEntryStatus.mutate({ id: detail.id, patch: { completed_at: null } })
                  }
                >
                  Abschluss zurücknehmen
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={setEntryStatus.isPending}
                  onClick={() =>
                    setEntryStatus.mutate({
                      id: detail.id,
                      patch: {
                        completed_at: new Date().toISOString(),
                        approval_status: "approved",
                      },
                    })
                  }
                >
                  <Check className="size-4" /> Erledigt bestätigen
                </Button>
              )}
              {einsatzStatus(detail) === "cancelled" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={setEntryStatus.isPending}
                  onClick={() =>
                    setEntryStatus.mutate({ id: detail.id, patch: { approval_status: "approved" } })
                  }
                >
                  Stornierung aufheben
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={setEntryStatus.isPending}
                  onClick={() =>
                    setEntryStatus.mutate({
                      id: detail.id,
                      patch: { approval_status: "rejected", completed_at: null },
                    })
                  }
                >
                  Einsatz stornieren
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            {detail && (
              <Button
                variant="outline"
                onClick={() => {
                  const key = detail.work_date;
                  setDetail(null);
                  openDay(key, detail.employee_id ?? undefined);
                }}
              >
                Tag öffnen
              </Button>
            )}
            <Button variant="ghost" onClick={() => setDetail(null)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Plan-Details: geplante Schicht bestätigen */}
      <Dialog open={planDetail !== null} onOpenChange={(o) => !o && setPlanDetail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Plan-Details</DialogTitle>
          </DialogHeader>
          {planDetail && (
            <div className="space-y-3 text-sm">
              <span className="inline-flex items-center gap-1 rounded border border-dashed border-primary/50 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
                Geplanter Einsatz
              </span>
              <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2">
                <dt className="text-muted-foreground">Datum</dt>
                <dd className="font-medium">{formatDate(planDetail.date)}</dd>
                <dt className="text-muted-foreground">Mitarbeiter</dt>
                <dd className="font-medium">{planDetail.employeeName}</dd>
                <dt className="text-muted-foreground">Objekt / Einsatzort</dt>
                <dd>{planDetail.projectName}</dd>
                <dt className="text-muted-foreground">Zeit</dt>
                <dd>
                  {planDetail.range || "—"}
                  {planDetail.breakMin ? ` (Pause ${planDetail.breakMin} Min.)` : ""}
                </dd>
                <dt className="text-muted-foreground">Planstunden</dt>
                <dd className="font-medium">{planDetail.hours.toFixed(2)} Std.</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                Mit „Erledigt bestätigen“ werden die Planzeiten als tatsächliche Arbeitszeit
                übernommen.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button
              size="sm"
              disabled={confirmPlan.isPending}
              onClick={() => planDetail && confirmPlan.mutate(planDetail)}
            >
              <Check className="size-4" /> Erledigt bestätigen
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPlanDetail(null)}>
              Schließen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
