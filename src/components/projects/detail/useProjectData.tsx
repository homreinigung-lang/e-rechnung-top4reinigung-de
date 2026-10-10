import type { SupabaseClient } from "@supabase/supabase-js";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { useServerFn } from "@tanstack/react-start";
import { analyzeProject, type ScannedProject } from "@/lib/project-scan.functions";

import { toast } from "sonner";

import { type ProjectUpdate, type Room, type LvItem } from "./shared";
import { getRouteApi } from "@tanstack/react-router";
const routeApi = getRouteApi("/_authenticated/projekte/$id");

export function useProjectData() {
  const { id } = routeApi.useParams();
  const queryClient = useQueryClient();
  const runAnalyze = useServerFn(analyzeProject);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<ScannedProject | null>(null);
  const [roomDialog, setRoomDialog] = useState<Room | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEmployee, setAssignEmployee] = useState("");
  const [assignRole, setAssignRole] = useState("Reinigungskraft");
  const [controllingMonth, setControllingMonth] = useState(new Date().toISOString().slice(0, 7));
  const db = supabase as SupabaseClient;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["project", id] });
    queryClient.invalidateQueries({ queryKey: ["project_rooms", id] });
    queryClient.invalidateQueries({ queryKey: ["project_lv", id] });
    queryClient.invalidateQueries({ queryKey: ["project_assignments", id] });
  };

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: projectCustomer } = useQuery({
    queryKey: ["project_customer_location", project?.customer_id],
    enabled: Boolean(project?.customer_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id,name,company,email,phone,address_line,postal_code,city,service_address_line,service_postal_code,service_city,service_note",
        )
        .eq("id", project!.customer_id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ["project_rooms", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_rooms")
        .select("*")
        .eq("project_id", id)
        .order("position");
      if (error) throw error;
      return data as Room[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["project_lv", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_lv_items")
        .select("*")
        .eq("project_id", id)
        .order("position");
      if (error) throw error;
      return data as LvItem[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["project_assignments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select("*")
        .eq("project_id", id);
      if (error) throw error;
      return data;
    },
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ["project_time_entries", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select(
          "id,hours,hourly_rate,work_date,entry_type,approval_status,completed_at,employee_name,start_time,end_time,note,photo_paths,performance_services,performance_note,employee_signature,customer_signature,customer_signer_name,performance_status,performance_completed_at",
        )
        .eq("project_id", id);
      if (error) throw error;
      return data;
    },
  });

  const { data: qmCases = [] } = useQuery({
    queryKey: ["project_qm_cases", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("qm_cases")
        .select("id,title,status,priority,due_date,occurred_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthStart = `${controllingMonth}-01`;
  const monthDate = new Date(`${monthStart}T12:00:00`);
  const monthEnd = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  const trendStartDate = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() - 5, 1),
  );
  const trendStart = trendStartDate.toISOString().slice(0, 10);

  const customerId = project?.customer_id ?? null;
  const { data: customerProjects = [] } = useQuery({
    queryKey: ["customer_projects_for_controlling", customerId],
    enabled: Boolean(customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id")
        .eq("customer_id", customerId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: controllingDocuments = [] } = useQuery({
    queryKey: ["project_controlling_documents", id, controllingMonth],
    queryFn: async () => {
      const { data, error } = await db
        .from("documents")
        .select(
          "id,type,status,issue_date,service_period,net_total,total,is_storno,project_id,customer_id",
        )
        .eq("type", "invoice")
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: controllingExpenses = [] } = useQuery({
    queryKey: ["project_controlling_expenses", id, controllingMonth],
    queryFn: async () => {
      const { data, error } = await db
        .from("expenses")
        .select("id,expense_date,net_amount,gross_amount,category")
        .eq("project_id", id)
        .is("deleted_at", null)
        .gte("expense_date", trendStart)
        .lte("expense_date", monthEnd);
      if (error) throw error;
      return data ?? [];
    },
  });

  const patchProject = useMutation({
    mutationFn: async (values: ProjectUpdate) => {
      const { error } = await supabase.from("projects").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const patchRoom = useMutation({
    mutationFn: async ({ roomId, values }: { roomId: string; values: Partial<Room> }) => {
      const { error } = await supabase.from("project_rooms").update(values).eq("id", roomId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const addRoom = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("project_rooms").insert({
        project_id: id,
        user_id: userId,
        position: rooms.length + 1,
        name: `Raum ${rooms.length + 1}`,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRoom = useMutation({
    mutationFn: async (roomId: string) => {
      const { error } = await supabase.from("project_rooms").delete().eq("id", roomId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const patchItem = useMutation({
    mutationFn: async ({ itemId, values }: { itemId: string; values: Partial<LvItem> }) => {
      const { error } = await supabase.from("project_lv_items").update(values).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  return {
    addRoom,
    analyzing,
    assignEmployee,
    assignOpen,
    assignRole,
    assignments,
    controllingDocuments,
    controllingExpenses,
    controllingMonth,
    customerId,
    customerProjects,
    employees,
    id,
    invalidate,
    items,
    monthDate,
    patchItem,
    patchProject,
    patchRoom,
    project,
    projectCustomer,
    qmCases,
    removeRoom,
    roomDialog,
    rooms,
    runAnalyze,
    scanResult,
    setAnalyzing,
    setAssignEmployee,
    setAssignOpen,
    setAssignRole,
    setControllingMonth,
    setRoomDialog,
    setScanResult,
    timeEntries,
  };
}
