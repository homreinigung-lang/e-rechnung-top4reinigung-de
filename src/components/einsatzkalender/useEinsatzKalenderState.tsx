import { useCallback, useMemo, useState, type DragEvent as ReactDragEvent } from "react";
import { isoWeek } from "@/lib/kw";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { friendlyDbError } from "@/lib/db-errors";
import { firstError } from "@/components/LoadError";
import { absenceLabel, absenceReason, isAbsence } from "@/lib/absence";
import { statusClasses, statusLabel } from "@/lib/einsatz-status";
import { saveFile } from "@/lib/download";
import { effectiveDayHours, normalizeDayTimes, formatDayTime } from "@/lib/planung";
import { serviceAddress, serviceAddressOrBilling } from "@/lib/maps";
import { WEEKS_PER_MONTH } from "@/lib/constants";
import {
  PlanShift,
  NO_PROJECT,
  ALL,
  TimeEntry,
  KalenderEmployee,
  KalenderProject,
  isoDay,
  monthStart,
  parseHm,
  minutesToHm,
  hoursFromTimes,
  serviceClasses,
  PlanForm,
  emptyForm,
} from "./shared";

export function useEinsatzKalenderState({
  employees,
  projects: projectsProp = [],
}: {
  employees: KalenderEmployee[];
  projects?: KalenderProject[];
}) {
  const queryClient = useQueryClient();

  // Eigene Projektliste laden, damit das Objekt/Projekt-Dropdown immer gefüllt ist,
  // auch wenn die übergebene Liste leer oder noch nicht geladen ist.
  const { data: fetchedProjects = [], error: projectsError } = useQuery({
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

  const { data: allEntries = [], error: entriesError } = useQuery({
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

  /** Zusätzlich zugeordnete Mitarbeiter (Team) je Einsatz. */
  const entryIds = useMemo(() => allEntries.map((e) => e.id).sort(), [allEntries]);
  const { data: teamRows = [], error: teamError } = useQuery({
    queryKey: ["time_entry_employees", "calendar", entryIds],
    enabled: entryIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entry_employees")
        .select("id,time_entry_id,employee_id")
        .in("time_entry_id", entryIds);
      if (error) throw error;
      return data;
    },
  });

  type TeamMember = { rowId: string; employeeId: string; name: string };

  const teamByEntry = useMemo(() => {
    const map = new Map<string, TeamMember[]>();
    for (const r of teamRows) {
      const list = map.get(r.time_entry_id) ?? [];
      list.push({
        rowId: r.id,
        employeeId: r.employee_id,
        name: employees.find((e) => e.id === r.employee_id)?.name ?? "Mitarbeiter",
      });
      map.set(r.time_entry_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, "de"));
    return map;
  }, [teamRows, employees]);

  const teamOf = useCallback(
    (e: {
      id: string;
      employee_id?: string | null;
      employee_name?: string | null;
    }): TeamMember[] => {
      const list = teamByEntry.get(e.id) ?? [];
      if (list.length > 0) return list;
      return e.employee_id
        ? [{ rowId: "", employeeId: e.employee_id, name: e.employee_name || "Mitarbeiter" }]
        : [];
    },
    [teamByEntry],
  );

  const teamNames = useCallback(
    (e: TimeEntry) => {
      const names = teamOf(e).map((m) => m.name);
      return names.length > 0 ? names.join(" & ") : e.employee_name || "";
    },
    [teamOf],
  );

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
  const { data: customers = [], error: customersError } = useQuery({
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
    try {
      const { buildXlsx } = await import("@/lib/xlsx");
      const blob = await buildXlsx([{ name: "Einsatzplan", rows }]);
      await saveFile(blob, `Einsatzplan_${periodLabel.replace(/[^\w]+/g, "_")}.xlsx`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Excel-Export konnte nicht erstellt werden.",
      );
    }
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
    queryClient.invalidateQueries({ queryKey: ["time_entry_employees"] });
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
      // Über Mitternacht wird nur bei plausibler Schichtlänge gerechnet –
      // sonst ist es fast immer ein Zahlendreher (z. B. 08:00–07:00).
      if (!absence && endMin! <= startMin! && hours > 12)
        throw new Error(
          "Endzeit liegt vor der Startzeit. Für Nachtschichten sind maximal 12 Stunden möglich – bitte Zeiten prüfen.",
        );
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
        customer_id:
          !absence && values.customerId && values.customerId !== NO_PROJECT
            ? values.customerId
            : null,
        location: absence ? absenceLabel(values.absenceReason) : locText || project?.name || "",

        note: values.note.trim(),
        entry_type: values.entryType,
        absence_reason: absence ? values.absenceReason : "",
        service_category: absence ? "sonstiges" : values.serviceCategory,
      }));

      const { error } = await supabase.from("time_entries").insert(rows);
      if (error) throw new Error(friendlyDbError(error, "Einsatz konnte nicht geplant werden."));
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
      if (error)
        throw new Error(
          friendlyDbError(
            error,
            'Einsatz konnte nicht gelöscht werden. Erledigte Einsätze bitte zuerst über "Erledigt zurücknehmen" öffnen.',
          ),
        );
    },
    onSuccess: () => {
      toast.success("Einsatz entfernt");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---------------------------------------------------------------
   * Drag & Drop: Einsätze verschieben bzw. Mitarbeiter auf einen Tag ziehen
   * Einsätze werden ausschließlich über ihre eindeutige id identifiziert.
   * ------------------------------------------------------------- */
  type DragPayload =
    | { kind: "entry"; id: string; employeeId: string | null; date: string }
    | { kind: "employee"; employeeId: string };

  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [repeatEntry, setRepeatEntry] = useState<TimeEntry | null>(null);

  /** Abgeschlossene Einsätze sind gesperrt (kein Verschieben, kein Umbesetzen). */
  const isCompleted = (e: { status?: string | null }) => (e.status ?? "active") === "completed";

  /**
   * Einsatz auf einen anderen Tag (und optional Mitarbeiter) verschieben.
   * Der verschobene Einsatz gilt als neu geplante Aufgabe: Erledigt-Status,
   * Abrechnung, Fotos und Genehmigungsentscheidungen des Ursprungstages
   * werden dabei zurückgesetzt.
   */
  const moveEntry = useMutation({
    mutationFn: async ({
      id,
      workDate,
      employeeId,
    }: {
      id: string;
      workDate: string;
      employeeId?: string;
    }) => {
      const source = allEntries.find((e) => e.id === id);
      if (source && isCompleted(source))
        throw new Error("Abgeschlossene Einsätze können nicht verschoben werden.");
      if (source?.billed)
        throw new Error(
          "Bereits abgerechnete Einsätze können nicht verschoben werden. Bitte die Abrechnung zuerst aufheben.",
        );
      const emp = employeeId ? employees.find((e) => e.id === employeeId) : null;
      const patch = {
        work_date: workDate,
        completed_at: null,
        billed: false,
        photo_paths: [],
        approval_status: "pending",
        decided_at: null,
        decided_by: null,
        decision_note: "",
        ...(employeeId ? { employee_id: employeeId } : {}),
        ...(emp ? { employee_name: emp.name } : {}),
      };

      const { error } = await supabase
        .from("time_entries")
        .update(patch)
        .eq("id", id)
        .neq("status", "completed");
      if (error) throw new Error(friendlyDbError(error, "Einsatz konnte nicht verschoben werden."));

      // Teamzuordnung mit dem Haupt-Mitarbeiter synchron halten.
      if (employeeId && source?.employee_id && source.employee_id !== employeeId) {
        await supabase
          .from("time_entry_employees")
          .delete()
          .eq("time_entry_id", id)
          .eq("employee_id", source.employee_id);
        const others = teamByEntry.get(id) ?? [];
        if (others.some((m) => m.employeeId !== source.employee_id)) {
          await supabase
            .from("time_entry_employees")
            .upsert(
              { time_entry_id: id, employee_id: employeeId },
              { onConflict: "time_entry_id,employee_id", ignoreDuplicates: true },
            );
        }
      }
    },
    onSuccess: () => {
      toast.success("Einsatz verschoben – als neue Aufgabe (offen) angelegt");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Schnellzuweisung: Mitarbeiter per Drag & Drop auf einen Tag legen. */
  const quickAssign = useMutation({
    mutationFn: async ({ employeeId, workDate }: { employeeId: string; workDate: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) throw new Error("Mitarbeiter nicht gefunden");
      const project =
        filterProject !== ALL ? (projects.find((p) => p.id === filterProject) ?? null) : null;
      const start = emptyForm.start;
      const end = emptyForm.end;
      const breakMinutes = Number(emptyForm.breakMinutes);
      const { error } = await supabase.from("time_entries").insert({
        user_id: userId,
        employee_id: emp.id,
        employee_name: emp.name,
        work_date: workDate,
        start_time: start,
        end_time: end,
        break_minutes: breakMinutes,
        hours: Number(hoursFromTimes(start, end, breakMinutes).toFixed(2)),
        hourly_rate: Number(emp.hourly_rate ?? 0),
        project_id: project?.id ?? null,
        location: project?.name ?? "",
        note: "",
        entry_type: "work",
        absence_reason: "",
      });
      if (error) throw new Error(friendlyDbError(error, "Einsatz konnte nicht zugewiesen werden."));
    },
    onSuccess: () => {
      toast.success("Einsatz zugewiesen (08:00–16:00, Pause 30 Min.) – bei Bedarf anpassen");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Gemeinsame Drop-Logik für Monats- und Wochenansicht. */
  const handleDrop = (date: string, employeeId?: string) => {
    setDropTarget(null);
    const payload = drag;
    setDrag(null);
    if (!payload) return;
    if (payload.kind === "employee") {
      quickAssign.mutate({ employeeId: payload.employeeId, workDate: date });
      return;
    }
    const sameDay = payload.date === date;
    const sameEmployee = !employeeId || payload.employeeId === employeeId;
    if (sameDay && sameEmployee) return;
    moveEntry.mutate({ id: payload.id, workDate: date, ...(employeeId ? { employeeId } : {}) });
  };

  const dropProps = (dropKey: string, date: string, employeeId?: string) => ({
    onDragOver: (ev: ReactDragEvent) => {
      if (!drag) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = drag.kind === "employee" ? "copy" : "move";
      if (dropTarget !== dropKey) setDropTarget(dropKey);
    },
    onDragLeave: () => setDropTarget((c) => (c === dropKey ? null : c)),
    onDrop: (ev: ReactDragEvent) => {
      ev.preventDefault();
      handleDrop(date, employeeId);
    },
  });

  /** Mitarbeiter zusätzlich zu einer bestehenden Aufgabe hinzufügen. */
  const addTeamMember = useMutation({
    mutationFn: async ({ id, employeeId }: { id: string; employeeId: string }) => {
      const source = allEntries.find((e) => e.id === id);
      if (source && isCompleted(source))
        throw new Error("Abgeschlossene Einsätze können nicht geändert werden.");
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) throw new Error("Mitarbeiter nicht gefunden");
      // Primär-Mitarbeiter der Aufgabe ebenfalls als Zuordnung sichern.
      if (source?.employee_id) {
        await supabase
          .from("time_entry_employees")
          .upsert(
            { time_entry_id: id, employee_id: source.employee_id },
            { onConflict: "time_entry_id,employee_id", ignoreDuplicates: true },
          );
      }
      const { error } = await supabase
        .from("time_entry_employees")
        .upsert(
          { time_entry_id: id, employee_id: employeeId },
          { onConflict: "time_entry_id,employee_id", ignoreDuplicates: true },
        );
      if (error)
        throw new Error(friendlyDbError(error, "Mitarbeiter konnte nicht hinzugefügt werden."));
      return emp.name;
    },
    onSuccess: (name) => {
      toast.success(`${name} zum Einsatz hinzugefügt`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Einen einzelnen Mitarbeiter von einer Aufgabe entfernen (Aufgabe bleibt bestehen). */
  const removeTeamMember = useMutation({
    mutationFn: async ({ id, employeeId }: { id: string; employeeId: string }) => {
      const source = allEntries.find((e) => e.id === id);
      if (source && isCompleted(source))
        throw new Error("Abgeschlossene Einsätze können nicht geändert werden.");
      const { error } = await supabase
        .from("time_entry_employees")
        .delete()
        .eq("time_entry_id", id)
        .eq("employee_id", employeeId);
      if (error)
        throw new Error(friendlyDbError(error, "Mitarbeiter konnte nicht entfernt werden."));
    },
    onSuccess: () => {
      toast.success("Mitarbeiter vom Einsatz entfernt");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Kopiert eine Aufgabe unverändert auf weitere Tage (Batch-INSERT). */
  const repeatTask = useMutation({
    mutationFn: async ({ source, dates }: { source: TimeEntry; dates: string[] }) => {
      if (dates.length === 0) throw new Error("Bitte mindestens einen Tag auswählen.");
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const rows = dates.map((work_date) => ({
        user_id: userId,
        employee_id: source.employee_id,
        employee_name: source.employee_name,
        customer_id: source.customer_id,
        project_id: source.project_id,
        location: source.location,
        note: source.note,
        start_time: source.start_time,
        end_time: source.end_time,
        break_minutes: source.break_minutes,
        hours: source.hours,
        hourly_rate: source.hourly_rate,
        entry_type: source.entry_type,
        absence_reason: source.absence_reason,
        service_category: source.service_category ?? "sonstiges",
        work_date,
        status: "active",
      }));
      const { data: created, error } = await supabase
        .from("time_entries")
        .insert(rows)
        .select("id");
      if (error) throw new Error(friendlyDbError(error, "Kopieren fehlgeschlagen."));

      // Zugeordnete Mitarbeiter mitkopieren
      const members = (teamByEntry.get(source.id) ?? []).map((m) => m.employeeId);
      if (source.employee_id && !members.includes(source.employee_id))
        members.push(source.employee_id);
      if (created && created.length > 0 && members.length > 0) {
        const links = created.flatMap((row) =>
          members.map((employee_id) => ({ time_entry_id: row.id, employee_id })),
        );
        const { error: linkError } = await supabase.from("time_entry_employees").insert(links);
        if (linkError)
          throw new Error(
            friendlyDbError(linkError, "Mitarbeiter konnten nicht mitkopiert werden."),
          );
      }
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} Einsatz/Einsätze angelegt`);
      setRepeatEntry(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const entryDragProps = (e: TimeEntry) => {
    const locked = isCompleted(e);
    return {
      draggable: !locked,
      onDragStart: (ev: ReactDragEvent) => {
        if (locked) {
          ev.preventDefault();
          toast.info("Abgeschlossene Einsätze können nicht verschoben werden.");
          return;
        }
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", e.id);
        setDrag({ kind: "entry", id: e.id, employeeId: e.employee_id, date: e.work_date });
      },
      onDragEnd: () => {
        setDrag(null);
        setDropTarget(null);
      },
      // Mitarbeiter aus der Liste auf eine bestehende Aufgabe ziehen = zusätzlich zuordnen
      onDragOver: (ev: ReactDragEvent) => {
        if (drag?.kind !== "employee") return;
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.dropEffect = locked ? "none" : "copy";
      },
      onDrop: (ev: ReactDragEvent) => {
        if (drag?.kind !== "employee") return;
        ev.preventDefault();
        ev.stopPropagation();
        const employeeId = drag.employeeId;
        setDrag(null);
        setDropTarget(null);
        if (locked) {
          toast.info("Abgeschlossene Einsätze können nicht geändert werden.");
          return;
        }
        if (teamOf(e).some((m) => m.employeeId === employeeId)) return;
        addTeamMember.mutate({ id: e.id, employeeId });
      },
    };
  };

  const entryLockClasses = (e: TimeEntry) =>
    isCompleted(e) ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing";

  /** Farbgebung der Karte: Arbeitseinsätze nach Leistungsart, Abwesenheiten wie bisher. */
  const entryCardClasses = (e: TimeEntry, donePlan: unknown) => {
    if (donePlan) return "border-sky-600 bg-sky-600 text-white";
    if (isAbsence(e)) return statusClasses(e);
    return serviceClasses(e);
  };

  /** Mitarbeiter-Chips mit „x" zum Entfernen einzelner Mitarbeiter. */
  const TeamChips = ({ e }: { e: TimeEntry }) => {
    const members = teamOf(e);
    if (members.length === 0) return null;
    const locked = isCompleted(e);
    return (
      <div className="mt-0.5 flex flex-wrap gap-1">
        {members.map((m) => (
          <span
            key={m.employeeId}
            className="inline-flex items-center gap-0.5 rounded-full border bg-background/80 px-1.5 text-[10px] leading-4"
          >
            {m.name}
            {!locked && (
              <button
                type="button"
                aria-label={`${m.name} vom Einsatz entfernen`}
                title={`${m.name} vom Einsatz entfernen`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  removeTeamMember.mutate({ id: e.id, employeeId: m.employeeId });
                }}
                className="rounded-full px-0.5 text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
    );
  };

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
  const { data: assignments = [], error: assignmentsError } = useQuery({
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

  /** Soll-Stunden aus dem Vertrag: Woche = Wochenstunden, Monat = Wochenstunden × 52/12. */
  const plannedFor = (emp: KalenderEmployee) =>
    Number(emp.weekly_hours ?? 0) * (view === "week" ? 1 : WEEKS_PER_MONTH);

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

  const loadError = firstError(projectsError, entriesError, customersError, assignmentsError);

  return {
    TeamChips,
    actualByEmployee,
    byDay,
    confirmPlan,
    createPlan,
    customerName,
    customerSite,
    customers,
    day,
    dayEntries,
    days,
    detail,
    doneEntries,
    dropProps,
    dropTarget,
    employees,
    entryCardClasses,
    entryDragProps,
    entryLockClasses,
    exportXlsx,
    filterEmployee,
    filterProject,
    first,
    form,
    isAbsent,
    isCompleted,
    loadError,
    openDay,
    openPlans,
    periodLabel,
    planDetail,
    plannedFor,
    plannedHours,
    printPlan,
    projectName,
    projects,
    queryClient,
    removePlan,
    repeatEntry,
    repeatTask,
    setAnchor,
    setDay,
    setDetail,
    setDrag,
    setDropTarget,
    setEntryStatus,
    setFilterEmployee,
    setFilterProject,
    setForm,
    setPlanDetail,
    setRepeatEntry,
    setView,
    shift,
    teamNames,
    timesValid,
    today,
    view,
    visibleEmployees,
  };
}

export type EinsatzKalenderStateContext = NonNullable<ReturnType<typeof useEinsatzKalenderState>>;
