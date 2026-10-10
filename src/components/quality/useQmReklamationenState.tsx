import { useQmLatestFeedback } from "@/lib/qm";

import type { SupabaseClient } from "@supabase/supabase-js";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { type QmEvent, type QmCase, emptyForm } from "./shared";

export function useQmReklamationenState() {
  const db = supabase as SupabaseClient;
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("offen");
  const [projectFilter, setProjectFilter] = useState("alle");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["qm_cases"] });
    queryClient.invalidateQueries({ queryKey: ["qm_case_events"] });
  };

  const { data: latestFeedback = [], error: feedbackError } = useQmLatestFeedback();
  const {
    data: cases = [],
    error: casesError,
    isLoading: casesLoading,
  } = useQuery({
    queryKey: ["qm_cases"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("qm_cases")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QmCase[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "qm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,company")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "qm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,customer_id,city")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "qm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,role")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["qm_case_events", form.id],
    enabled: Boolean(form.id && open),
    queryFn: async () => {
      const { data, error } = await db
        .from("qm_case_events")
        .select("*")
        .eq("case_id", form.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QmEvent[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Bitte einen Titel angeben.");
      if (form.assigned_employee_id && !form.employee_instruction.trim()) {
        throw new Error("Bitte einen Arbeitsauftrag für den zugewiesenen Mitarbeiter eingeben.");
      }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Nicht angemeldet");
      const payload = {
        user_id: auth.user.id,
        customer_id: form.customer_id || null,
        project_id: form.project_id || null,
        assigned_employee_id: form.assigned_employee_id || null,
        title: form.title.trim(),
        description: form.description,
        category: form.category,
        priority: form.priority,
        status: form.status,
        due_date: form.due_date || null,
        employee_instruction: form.employee_instruction.trim(),
        action_note: form.action_note,
        solution: form.solution,
        occurred_at: form.occurred_at,
        attachment_paths: form.attachment_paths,
      };
      if (form.id) {
        const { error } = await db.from("qm_cases").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("qm_cases").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Reklamation aktualisiert" : "Reklamation angelegt");
      setOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("qm_cases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reklamation gelöscht");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function editCase(item: QmCase) {
    setForm({
      id: item.id,
      customer_id: item.customer_id ?? "",
      project_id: item.project_id ?? "",
      assigned_employee_id: item.assigned_employee_id ?? "",
      title: item.title,
      description: item.description,
      category: item.category,
      priority: item.priority,
      status: item.status,
      due_date: item.due_date ?? "",
      employee_instruction: item.employee_instruction ?? "",
      action_note: item.action_note,
      solution: item.solution,
      occurred_at: item.occurred_at,
      attachment_paths: item.attachment_paths ?? [],
    });
    setOpen(true);
  }

  const today = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(
    () =>
      cases.filter((item) => {
        if (statusFilter === "offen" && item.status === "erledigt") return false;
        if (statusFilter !== "alle" && statusFilter !== "offen" && item.status !== statusFilter)
          return false;
        if (projectFilter !== "alle" && item.project_id !== projectFilter) return false;
        return true;
      }),
    [cases, statusFilter, projectFilter],
  );

  const openCount = cases.filter((c) => c.status !== "erledigt").length;
  const overdueCount = cases.filter(
    (c) => c.status !== "erledigt" && c.due_date && c.due_date < today,
  ).length;
  const reviewCount = cases.filter(
    (c) =>
      c.status !== "erledigt" &&
      latestFeedback.some(
        (f) =>
          f.case_id === c.id && f.employee_id === c.assigned_employee_id && f.kind === "bearbeitet",
      ),
  ).length;
  const doneCount = cases.filter((c) => c.status === "erledigt").length;

  const customerName = (id: string | null) => {
    const c = customers.find((x) => x.id === id);
    return c ? c.company || c.name : "–";
  };
  const projectName = (id: string | null) => projects.find((x) => x.id === id)?.name || "–";
  const employeeName = (id: string | null) =>
    employees.find((x) => x.id === id)?.name || "Nicht zugeordnet";

  const compatibleProjects = projects.filter(
    (p) => !form.customer_id || p.customer_id === form.customer_id,
  );

  return {
    ready: true as const,
    casesError,
    casesLoading,
    compatibleProjects,
    customerName,
    customers,
    doneCount,
    editCase,
    employeeName,
    employees,
    events,
    feedbackError,
    filtered,
    form,
    latestFeedback,
    open,
    openCount,
    overdueCount,
    projectFilter,
    projectName,
    projects,
    remove,
    reviewCount,
    save,
    setForm,
    setOpen,
    setProjectFilter,
    setStatusFilter,
    statusFilter,
    today,
  };
}
export type QmReklamationenState = Extract<
  ReturnType<typeof useQmReklamationenState>,
  { ready: true }
>;
