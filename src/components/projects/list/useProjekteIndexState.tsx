import type { SupabaseClient } from "@supabase/supabase-js";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { approvedProjectWorkTotals } from "@/lib/approved-work-totals";
import { useServerFn } from "@tanstack/react-start";
import { analyzeProject, type ScannedProject } from "@/lib/project-scan.functions";
import { type ReviewResult } from "@/components/ProjectScanReview";
import { fileUrl, uploadUserFile } from "@/lib/storage";

import { toast } from "sonner";

import {
  invoiceBelongsToProject,
  isProjectRevenueInvoice,
  plannedHoursForMonth,
  revenueForMonth,
} from "@/lib/object-controlling";

export function useProjekteIndexState() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runAnalyze = useServerFn(analyzeProject);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<string>("floorplan");
  const [customerId, setCustomerId] = useState<string>("none");
  const [projectAddressLine, setProjectAddressLine] = useState("");
  const [projectPostalCode, setProjectPostalCode] = useState("");
  const [projectCity, setProjectCity] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState("");
  const [scanResult, setScanResult] = useState<ScannedProject | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [controllingMonth, setControllingMonth] = useState(new Date().toISOString().slice(0, 7));
  const db = supabase as SupabaseClient;

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      return fetchAllRows(() =>
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
      );
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      return fetchAllRows(() => supabase.from("customers").select("*").order("name"));
    },
  });

  const monthStart = `${controllingMonth}-01`;
  const monthDate = new Date(`${monthStart}T12:00:00`);
  const monthEnd = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);

  const { data: controllingDocuments = [] } = useQuery({
    queryKey: ["projects_controlling_documents", controllingMonth],
    queryFn: async () => {
      return fetchAllRows(() =>
        db
          .from("documents")
          .select(
            "id,status,issue_date,service_period,net_total,total,vat_amount,is_storno,project_id,customer_id",
          )
          .eq("type", "invoice")
          .is("deleted_at", null),
      );
    },
  });

  const { data: controllingExpenses = [] } = useQuery({
    queryKey: ["projects_controlling_expenses", controllingMonth],
    queryFn: async () => {
      return fetchAllRows(() =>
        db
          .from("expenses")
          .select("id,expense_date,net_amount,project_id")
          .is("deleted_at", null)
          .gte("expense_date", monthStart)
          .lte("expense_date", monthEnd),
      );
    },
  });

  const { data: controllingEmployees = [] } = useQuery({
    queryKey: ["projects_controlling_employees"],
    queryFn: async () => {
      return fetchAllRows(() => supabase.from("employees").select("id,hourly_rate"));
    },
  });

  const { data: controllingTimeEntries = [] } = useQuery({
    queryKey: ["projects_controlling_time_entries", controllingMonth],
    queryFn: async () => {
      return fetchAllRows(() =>
        supabase
          .from("time_entries")
          .select(
            "id,project_id,employee_id,work_date,hours,hourly_rate,entry_type,approval_status",
          )
          .gte("work_date", monthStart)
          .lte("work_date", monthEnd),
      );
    },
  });

  const { data: controllingAssignments = [] } = useQuery({
    queryKey: ["projects_controlling_assignments", controllingMonth],
    queryFn: async () => {
      return fetchAllRows(() =>
        supabase
          .from("project_assignments")
          .select("id,project_id,hours_per_week,start_date,end_date,day_hours,day_times"),
      );
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const customer = customers.find((c) => c.id === customerId);
      setStep("Projekt wird angelegt …");
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: userId,
          name: name.trim(),
          mode,
          customer_id: customer?.id ?? null,
          customer_name: customer ? customer.company || customer.name : "",
          contact_email: customer?.email ?? "",
          contact_phone: customer?.phone ?? "",
          // Eigener Objekt-/Einsatzort pro Projekt. Dadurch können Kunden wie
          // Hausverwaltungen beliebig viele Häuser mit eigenen Adressen haben.
          address_line: projectAddressLine.trim(),
          postal_code: projectPostalCode.trim(),
          city: projectCity.trim(),
        })
        .select("id")
        .single();
      if (error) throw error;
      const projectId = data.id as string;

      let scan: ScannedProject | null = null;

      if (file) {
        setStep("Datei wird hochgeladen …");
        const path = await uploadUserFile(file, "projekte");
        await supabase
          .from("projects")
          .update({ source_file_path: path, source_file_name: file.name })
          .eq("id", projectId);

        setStep(
          mode === "tender" ? "Ausschreibung wird analysiert …" : "Grundriss wird analysiert …",
        );
        try {
          const url = await fileUrl(path);
          scan = await runAnalyze({
            data: { fileUrl: url, mimeType: file.type || "application/pdf", mode },
          });
          if (!name.trim() && scan.project_name) {
            await supabase.from("projects").update({ name: scan.project_name }).eq("id", projectId);
          }
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Analyse fehlgeschlagen – Datei wurde gespeichert.",
          );
        }
      }
      return { projectId, scan };
    },
    onSuccess: ({ projectId, scan }) => {
      setStep("");
      setOpen(false);
      setName("");
      setCustomerId("none");
      setProjectAddressLine("");
      setProjectPostalCode("");
      setProjectCity("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (scan) {
        setPendingId(projectId);
        setScanResult(scan);
        return;
      }
      navigate({ to: "/projekte/$id", params: { id: projectId } });
    },
    onError: (e: Error) => {
      setStep("");
      toast.error(e.message);
    },
  });

  const applyScan = useMutation({
    mutationFn: async (review: ReviewResult) => {
      const projectId = pendingId;
      if (!projectId) throw new Error("Kein Projekt");
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      await supabase
        .from("projects")
        .update({
          expected_room_count: review.expected_room_count,
          executive_summary: review.executive_summary,
        })
        .eq("id", projectId);

      if (review.rooms.length > 0) {
        const { error } = await supabase.from("project_rooms").insert(
          review.rooms.map((r, index) => ({
            project_id: projectId,
            user_id: userId,
            position: index + 1,
            name: r.name,
            floor: r.floor,
            usage_type: r.usage_type,
            area_sqm: r.area_sqm,
          })),
        );
        if (error) throw error;
      }
      if (review.items.length > 0) {
        const { error } = await supabase.from("project_lv_items").insert(
          review.items.map((it, index) => ({
            project_id: projectId,
            user_id: userId,
            position: index + 1,
            section: it.section,
            title: it.title,
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            deadline: it.deadline || null,
            evidence: it.evidence,
            critical: it.critical,
          })),
        );
        if (error) throw error;
      }
      return projectId;
    },
    onSuccess: (projectId) => {
      setScanResult(null);
      setPendingId(null);
      toast.success("Daten übernommen");
      navigate({ to: "/projekte/$id", params: { id: projectId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function skipScan() {
    const projectId = pendingId;
    setScanResult(null);
    setPendingId(null);
    if (projectId) navigate({ to: "/projekte/$id", params: { id: projectId } });
  }

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Projekt gelöscht");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const projectCountByCustomer = new Map<string, number>();
  for (const p of projects) {
    if (!p.customer_id) continue;
    projectCountByCustomer.set(p.customer_id, (projectCountByCustomer.get(p.customer_id) ?? 0) + 1);
  }

  const employeeRates = new Map(
    controllingEmployees.map(
      (employee) => [employee.id, Number(employee.hourly_rate ?? 0)] as const,
    ),
  );
  const projectWorkTotals = approvedProjectWorkTotals(controllingTimeEntries, employeeRates);

  const controllingRows = projects
    .map((p) => {
      const { hours: actualHours, amount: wageCosts } = projectWorkTotals.get(p.id) ?? {
        hours: 0,
        amount: 0,
      };
      const directCosts = controllingExpenses
        .filter((e) => e.project_id === p.id)
        .reduce((sum, e) => sum + Number(e.net_amount || 0), 0);

      const revenue = controllingDocuments
        .filter((d) => invoiceBelongsToProject(d, p, projectCountByCustomer))
        .filter(isProjectRevenueInvoice)
        .reduce((sum, d) => sum + revenueForMonth(d, controllingMonth), 0);

      const assignments = controllingAssignments.filter((a) => a.project_id === p.id);
      const plannedHours = plannedHoursForMonth(assignments, controllingMonth);

      const totalCosts = wageCosts + directCosts;
      const contribution = revenue - totalCosts;
      const margin = revenue > 0 ? (contribution / revenue) * 100 : null;

      return {
        id: p.id,
        name: p.name || "Ohne Namen",
        customer: p.customer_name || "",
        city: p.city || "",
        revenue,
        plannedHours,
        actualHours,
        totalCosts,
        contribution,
        margin,
      };
    })
    .sort((a, b) => {
      if (a.margin == null && b.margin == null) return b.revenue - a.revenue;
      if (a.margin == null) return 1;
      if (b.margin == null) return -1;
      return b.margin - a.margin;
    });

  const portfolioRevenue = controllingRows.reduce((sum, r) => sum + r.revenue, 0);
  const portfolioCosts = controllingRows.reduce((sum, r) => sum + r.totalCosts, 0);
  const portfolioContribution = portfolioRevenue - portfolioCosts;
  const portfolioMargin =
    portfolioRevenue > 0 ? (portfolioContribution / portfolioRevenue) * 100 : null;

  return {
    ready: true as const,
    applyScan,
    controllingMonth,
    controllingRows,
    create,
    customerId,
    customers,
    dragging,
    file,
    inputRef,
    mode,
    name,
    open,
    portfolioContribution,
    portfolioCosts,
    portfolioMargin,
    portfolioRevenue,
    projectAddressLine,
    projectCity,
    projectPostalCode,
    projects,
    remove,
    scanResult,
    setControllingMonth,
    setCustomerId,
    setDragging,
    setFile,
    setMode,
    setName,
    setOpen,
    setProjectAddressLine,
    setProjectCity,
    setProjectPostalCode,
    skipScan,
    step,
  };
}
export type ProjekteIndexState = Extract<ReturnType<typeof useProjekteIndexState>, { ready: true }>;
