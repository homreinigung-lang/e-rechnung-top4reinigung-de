import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const qmFeedbackLabels: Record<string, string> = {
  in_bearbeitung: "In Bearbeitung",
  bearbeitet: "Bearbeitet – wartet auf Prüfung",
  rueckfrage: "Rückfrage",
};
export function useQmLatestFeedback(employeeId?: string) {
  return useQuery({
    queryKey: ["qm_latest_feedback", employeeId ?? "owner"],
    refetchInterval: 15_000,
    queryFn: async () => {
      let query = (supabase as SupabaseClient)
        .from("qm_latest_feedback")
        .select("case_id,employee_id,kind,created_at");
      if (employeeId) query = query.eq("employee_id", employeeId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as {
        case_id: string;
        employee_id: string;
        kind: string;
        created_at: string;
      }[];
    },
  });
}
