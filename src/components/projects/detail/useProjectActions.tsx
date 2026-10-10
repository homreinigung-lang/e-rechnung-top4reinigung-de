import { useMutation } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import { fileUrl } from "@/lib/storage";

import { type ReviewResult } from "@/components/ProjectScanReview";

import { toast } from "sonner";

import type { useProjectData } from "./useProjectData";

export function useProjectActions(input: {
  assignEmployee: ReturnType<typeof useProjectData>["assignEmployee"];
  assignRole: ReturnType<typeof useProjectData>["assignRole"];
  id: ReturnType<typeof useProjectData>["id"];
  invalidate: ReturnType<typeof useProjectData>["invalidate"];
  items: ReturnType<typeof useProjectData>["items"];
  patchProject: ReturnType<typeof useProjectData>["patchProject"];
  project: ReturnType<typeof useProjectData>["project"];
  rooms: ReturnType<typeof useProjectData>["rooms"];
  runAnalyze: ReturnType<typeof useProjectData>["runAnalyze"];
  setAnalyzing: ReturnType<typeof useProjectData>["setAnalyzing"];
  setAssignEmployee: ReturnType<typeof useProjectData>["setAssignEmployee"];
  setAssignOpen: ReturnType<typeof useProjectData>["setAssignOpen"];
  setScanResult: ReturnType<typeof useProjectData>["setScanResult"];
}) {
  const {
    assignEmployee,
    assignRole,
    id,
    invalidate,
    items,
    patchProject,
    project,
    rooms,
    runAnalyze,
    setAnalyzing,
    setAssignEmployee,
    setAssignOpen,
    setScanResult,
  } = input;
  const addItem = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("project_lv_items").insert({
        project_id: id,
        user_id: userId,
        position: items.length + 1,
        title: "Neue Position",
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("project_lv_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("project_assignments").insert({
        project_id: id,
        employee_id: assignEmployee,
        user_id: userId,
        assignment_role: assignRole,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAssignOpen(false);
      setAssignEmployee("");
      toast.success("Mitarbeiter zugewiesen");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassign = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from("project_assignments").delete().eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleUploaded(path: string, file: File) {
    await patchProject.mutateAsync({ source_file_path: path, source_file_name: file.name });
    setAnalyzing(true);
    try {
      const url = await fileUrl(path);
      const result = await runAnalyze({
        data: {
          fileUrl: url,
          mimeType: file.type || "application/pdf",
          mode: project?.mode ?? "floorplan",
        },
      });
      setScanResult(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analyse fehlgeschlagen");
    } finally {
      setAnalyzing(false);
    }
  }

  const applyScan = useMutation({
    mutationFn: async (review: ReviewResult) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      await supabase
        .from("projects")
        .update({
          expected_room_count: Math.max(review.expected_room_count, review.rooms.length),
          executive_summary: review.executive_summary || project?.executive_summary || "",
          analysis_highlights: review.highlights,
          analysis_requirements: review.requirements,
        })
        .eq("id", id);

      if (review.rooms.length > 0) {
        const { error } = await supabase.from("project_rooms").insert(
          review.rooms.map((r, index) => ({
            project_id: id,
            user_id: userId,
            position: rooms.length + index + 1,
            name: r.name,
            floor: r.floor,
            usage_type: r.usage_type,
            area_sqm: r.area_sqm,
            floor_covering: r.floor_covering,
          })),
        );
        if (error) throw error;
      }
      if (review.items.length > 0) {
        const { error } = await supabase.from("project_lv_items").insert(
          review.items.map((it, index) => ({
            project_id: id,
            user_id: userId,
            position: items.length + index + 1,
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
    },
    onSuccess: () => {
      setScanResult(null);
      toast.success("Daten übernommen");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { addItem, applyScan, assign, handleUploaded, removeItem, unassign };
}
