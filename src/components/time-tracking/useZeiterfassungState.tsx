import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { useMyEmployee } from "@/lib/employee";
import { filterRowsByDateRange, summaryLines } from "@/lib/table-summary";
import {
  approvedWorkAmount,
  approvedWorkHours,
  approvedWorkTotals,
  workHourlyRate,
} from "@/lib/approved-work-totals";

import { toast } from "sonner";

import { formatMoney, formatDate } from "@/lib/format";

import { requireUserId } from "@/lib/auth-user";
import {
  downloadBlob,
  de,
  type Employee,
  type EntryForm,
  emptyEntry,
  emptyEmployee,
  num,
  computeHours,
  monthKey,
  monthEndDate,
} from "./shared";

export function useZeiterfassungState() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: myEmployee } = useMyEmployee();
  const [entryOpen, setEntryOpen] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [form, setForm] = useState<EntryForm>(emptyEntry());
  const [emp, setEmp] = useState(emptyEmployee);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reviewFilter, setReviewFilter] = useState<"all" | "pending" | "approved" | "rejected">(
    "all",
  );

  // Mitarbeiterkonten haben keinen Zugriff auf die Verwaltungsansicht.
  useEffect(() => {
    if (myEmployee) navigate({ to: "/meine-zeiten", replace: true });
  }, [myEmployee, navigate]);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      return (await fetchAllRows(() =>
        supabase.from("employees").select("*").order("name"),
      )) as Employee[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      return fetchAllRows(() => supabase.from("customers").select("id,name,company").order("name"));
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      return fetchAllRows(() =>
        supabase
          .from("projects")
          .select("id,name,address_line,postal_code,city,customer_name")
          .order("name"),
      );
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["time_entries"],
    queryFn: async () => {
      return fetchAllRows(() =>
        supabase.from("time_entries").select("*").order("work_date", { ascending: false }),
      );
    },
  });

  const monthEntries = useMemo(
    () =>
      entries
        .filter((e) => monthKey(e.work_date as string) === month)
        .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date))),
    [entries, month],
  );

  // Abwesenheiten werden weiterhin ausschließlich im bestehenden Urlaubsworkflow geprüft.
  const workEntries = useMemo(
    () => monthEntries.filter((entry) => entry.entry_type !== "absence"),
    [monthEntries],
  );
  const reviewCounts = useMemo(
    () => ({
      pending: workEntries.filter((entry) => entry.approval_status === "pending").length,
      approved: workEntries.filter((entry) => (entry.approval_status ?? "approved") === "approved")
        .length,
      rejected: workEntries.filter((entry) => entry.approval_status === "rejected").length,
      proofOpen: workEntries.filter(
        (entry) =>
          entry.approval_status !== "rejected" &&
          entry.performance_status !== "completed" &&
          !entry.performance_completed_at,
      ).length,
    }),
    [workEntries],
  );
  const visibleEntries = useMemo(
    () =>
      reviewFilter === "all"
        ? monthEntries
        : workEntries.filter((entry) => (entry.approval_status ?? "approved") === reviewFilter),
    [monthEntries, workEntries, reviewFilter],
  );

  const employeeRates = useMemo(
    () =>
      new Map(
        employees.map((employee) => [employee.id, Number(employee.hourly_rate || 0)] as const),
      ),
    [employees],
  );
  const totals = useMemo(
    () => approvedWorkTotals(monthEntries, employeeRates),
    [monthEntries, employeeRates],
  );

  const saveEmployee = useMutation({
    mutationFn: async (values: typeof emptyEmployee) => {
      const userId = await requireUserId();
      const payload = {
        name: values.name.trim(),
        role: values.role,
        email: values.email.trim().toLowerCase(),
        phone: values.phone.trim(),
        personnel_number: values.personnel_number.trim(),
        hourly_rate: num(values.hourly_rate),
        contract_type: values.contract_type,
        contract_start: values.contract_start || null,
        weekly_hours: num(values.weekly_hours),
      };

      if (values.id) {
        const { error } = await supabase.from("employees").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Mitarbeiter gespeichert");
      setEmpOpen(false);
      setEmp(emptyEmployee);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEmployee = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mitarbeiter gelöscht");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEntry = useMutation({
    mutationFn: async (values: EntryForm) => {
      const userId = await requireUserId();
      const hours = values.hours
        ? num(values.hours)
        : computeHours(values.start_time, values.end_time, values.break_minutes);
      if (hours <= 0) throw new Error("Bitte gültige Zeiten oder Stunden eingeben.");
      const payload = {
        employee_id: values.employee_id || null,
        employee_name:
          employees.find((e) => e.id === values.employee_id)?.name || values.employee_name,
        customer_id: values.customer_id || null,
        project_id: values.project_id || null,
        work_date: values.work_date,
        start_time: values.start_time || null,
        end_time: values.end_time || null,
        break_minutes: Math.round(num(values.break_minutes)),
        hours,
        hourly_rate: num(values.hourly_rate),
        location: values.location,
        note: values.note,
      };
      if (values.id) {
        const { error } = await supabase.from("time_entries").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("time_entries")
          .insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Zeiteintrag gespeichert");
      setEntryOpen(false);
      setForm(emptyEntry());
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zeiteintrag gelöscht");
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBilled = useMutation({
    mutationFn: async ({ id, billed }: { id: string; billed: boolean }) => {
      const { error } = await supabase.from("time_entries").update({ billed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["time_entries"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const approveWorkEntry = useMutation({
    mutationFn: async (id: string) => {
      const userId = await requireUserId();
      const { data, error } = await supabase
        .from("time_entries")
        .update({
          approval_status: "approved",
          decided_at: new Date().toISOString(),
          decided_by: userId,
        })
        .eq("id", id)
        .eq("entry_type", "work")
        .eq("approval_status", "pending")
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error("Eintrag ist nicht mehr zur Prüfung offen. Bitte aktualisieren.");
    },
    onSuccess: () => {
      toast.success("Arbeitszeit freigegeben");
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
      queryClient.invalidateQueries({ queryKey: ["lohnvorbereitung-time"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewHours = form.hours
    ? num(form.hours)
    : computeHours(form.start_time, form.end_time, form.break_minutes);

  const exportCsv = () => {
    if (monthEntries.length === 0) {
      toast.error("Keine Einträge in diesem Monat.");
      return;
    }
    const head = [
      "Mitarbeiter",
      "Datum",
      "Von",
      "Bis",
      "Pause (Min.)",
      "Erfasst (Std.)",
      "Stunden",
      "Stundensatz",
      "Betrag",
      "Einsatzort",
      "Notiz",
      "Prüfstatus",
      "Abgerechnet",
    ];
    const rows = monthEntries.map((e) => [
      (e.employee_name as string) || "Ohne Zuordnung",
      formatDate(e.work_date as string),
      e.start_time ? String(e.start_time).slice(0, 5) : "",
      e.end_time ? String(e.end_time).slice(0, 5) : "",
      String(e.break_minutes ?? 0),
      de(Number(e.hours || 0)),
      de(approvedWorkHours(e)),
      de(workHourlyRate(e, employeeRates.get(e.employee_id ?? "") ?? 0)),
      de(approvedWorkAmount(e, employeeRates.get(e.employee_id ?? "") ?? 0)),
      (e.location as string) || "",
      (e.note as string) || "",
      e.approval_status === "pending"
        ? "Zu prüfen"
        : e.approval_status === "rejected"
          ? "Abgelehnt"
          : "Freigegeben",
      e.billed ? "Ja" : "Nein",
    ]);
    const perEmployee = totals.perEmployee.map(([name, v]) => [
      name,
      "SUMME",
      "",
      "",
      "",
      "",
      de(v.hours),
      "",
      de(v.amount),
      "",
      "",
      "",
      "",
    ]);
    // Generischer Zusammenfassungsblock ganz oben im Export.
    // Strikt nur Datensätze des gewählten Monats (Sicherheitsnetz für den Export).
    const monthStart = `${month}-01`;
    const monthEnd = monthEndDate(month);
    const objRows = filterRowsByDateRange(
      rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""]))),
      { from: monthStart, to: monthEnd },
    );
    const preamble = [
      [`Stundenzettel ${month}`],
      ["Zusammenfassung (Endsummen)"],
      ...summaryLines(objRows).map((line) => {
        const [label, ...rest] = line.split(": ");
        return [label ?? "", rest.join(": ")];
      }),
      [],
    ];
    const dataRows = objRows.map((r) => head.map((h) => String(r[h] ?? "")));
    const csv = [...preamble, head, ...dataRows, [], ...perEmployee]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    downloadBlob(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
      `Stundenzettel_${month}.csv`,
    );
    toast.success("CSV-Export erstellt");
  };

  const exportPdf = async () => {
    // Sicherheitsnetz: PDF nutzt dieselbe strikte Datumsfilterung wie CSV/Excel.
    const pdfFrom = `${month}-01`;
    const pdfTo = monthEndDate(month);
    const pdfEntries = filterRowsByDateRange(monthEntries, {
      from: pdfFrom,
      to: pdfTo,
      columns: ["work_date"],
    });
    if (pdfEntries.length === 0) {
      toast.error("Keine Einträge in diesem Monat.");
      return;
    }
    // Kopf-Summen strikt aus denselben gefilterten Einträgen wie der Einzelnachweis.
    const pdfTotals = approvedWorkTotals(pdfEntries, employeeRates);
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const [y0, m0] = month.split("-");
    let y = 18;
    doc.setFontSize(15);
    doc.text(`Stundenzettel ${m0}/${y0}`, 15, y);
    y += 7;
    doc.setFontSize(9);
    // Firmenname immer aus den Einstellungen der angemeldeten Firma (RLS-geschützt).
    const { data: companySettings } = await supabase
      .from("company_settings")
      .select("company_name")
      .maybeSingle();
    const companyName = String(companySettings?.company_name ?? "").trim();
    doc.text(
      [companyName, "Freigegebene Arbeitsstunden je Mitarbeiter"].filter(Boolean).join(" · "),
      15,
      y,
    );
    y += 10;

    doc.setFontSize(10);
    doc.text("Mitarbeiter", 15, y);
    doc.text("Stunden", 120, y, { align: "right" });
    doc.text("Vergütung", 195, y, { align: "right" });
    y += 2;
    doc.line(15, y, 195, y);
    y += 6;
    doc.setFontSize(9);
    for (const [name, v] of pdfTotals.perEmployee) {
      doc.text(String(name).slice(0, 45), 15, y);
      doc.text(`${de(v.hours)} Std.`, 120, y, { align: "right" });
      doc.text(formatMoney(v.amount), 195, y, { align: "right" });
      y += 6;
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
    }
    y += 1;
    doc.line(15, y, 195, y);
    y += 6;
    doc.setFontSize(10);
    doc.text("Gesamt", 15, y);
    doc.text(`${de(pdfTotals.hours)} Std.`, 120, y, { align: "right" });
    doc.text(formatMoney(pdfTotals.amount), 195, y, { align: "right" });

    y += 12;
    doc.setFontSize(11);
    doc.text("Einzelnachweis", 15, y);
    y += 6;
    doc.setFontSize(8);
    for (const e of pdfEntries) {
      if (y > 282) {
        doc.addPage();
        y = 20;
      }
      const time =
        e.start_time && e.end_time
          ? `${String(e.start_time).slice(0, 5)}–${String(e.end_time).slice(0, 5)}`
          : "-";
      doc.text(
        `${formatDate(e.work_date as string)}  ${((e.employee_name as string) || "Ohne Zuordnung").slice(0, 28)}  ${time}  Pause ${e.break_minutes} Min.`,
        15,
        y,
      );
      doc.text(`${de(approvedWorkHours(e))} Std.`, 150, y, { align: "right" });
      doc.text(
        formatMoney(approvedWorkAmount(e, employeeRates.get(e.employee_id ?? "") ?? 0)),
        195,
        y,
        { align: "right" },
      );
      y += 4;
      doc.text(
        `Erfasst: ${de(Number(e.hours || 0))} Std. · ${e.approval_status === "pending" ? "Zu prüfen" : e.approval_status === "rejected" ? "Abgelehnt" : "Freigegeben"}`,
        15,
        y,
      );
      y += 5;
    }
    // Die PDF bleibt vollständig im Browser: kein Plattform- oder externer Link.
    const filename = `Stundenzettel_${month}.pdf`;
    const blob = doc.output("blob") as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Die URL muss für die Toast-Aktion verfügbar bleiben.
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    toast.success("Stundenzettel-PDF wird heruntergeladen", {
      action: {
        label: "Öffnen",
        onClick: () => {
          window.location.assign(url);
        },
      },
    });
  };

  return {
    ready: true as const,
    approveWorkEntry,
    customers,
    emp,
    empOpen,
    employeeRates,
    employees,
    entries,
    entryOpen,
    exportCsv,
    exportPdf,
    form,
    month,
    previewHours,
    projects,
    removeEmployee,
    removeEntry,
    reviewCounts,
    reviewFilter,
    saveEmployee,
    saveEntry,
    setEmp,
    setEmpOpen,
    setEntryOpen,
    setForm,
    setMonth,
    setReviewFilter,
    toggleBilled,
    totals,
    visibleEntries,
  };
}
export type ZeiterfassungState = Extract<ReturnType<typeof useZeiterfassungState>, { ready: true }>;
