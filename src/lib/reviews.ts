import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type Review = {
  id: string;
  user_id: string;
  company_name: string;
  rating: number;
  body: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export const reviewStatusLabel: Record<string, string> = {
  pending: "In Prüfung",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
};

/** Öffentlich sichtbare, freigegebene Bewertungen (echte Kundenstimmen). */
export function useApprovedReviews() {
  return useQuery({
    queryKey: ["reviews_public"],
    staleTime: 60_000,
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id,user_id,company_name,rating,body,status,created_at")
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });
}

/** Eigene Bewertung des angemeldeten Firmenkontos. */
export function useMyReview() {
  return useQuery({
    queryKey: ["my_review"],
    queryFn: async (): Promise<Review | null> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("reviews")
        .select("id,user_id,company_name,rating,body,status,created_at")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw error;
      return (data as Review | null) ?? null;
    },
  });
}

/** Bewertung anlegen oder – solange nicht freigegeben – überarbeiten. */
export function useSaveReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; company_name: string; rating: number; body: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      if (!input.body.trim()) throw new Error("Bitte einen Bewertungstext eingeben.");
      const payload = {
        company_name: input.company_name.trim(),
        rating: Math.min(5, Math.max(1, Math.round(input.rating))),
        body: input.body.trim(),
        status: "pending" as const,
      };
      const { error } = input.id
        ? await supabase.from("reviews").update(payload).eq("id", input.id)
        : await supabase.from("reviews").insert({ ...payload, user_id: uid });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my_review"] });
      void queryClient.invalidateQueries({ queryKey: ["reviews_admin"] });
      toast.success("Danke! Ihre Bewertung wurde zur Prüfung übermittelt.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Alle Bewertungen – nur für Administratoren sichtbar (RLS). */
export function useAllReviews(enabled: boolean) {
  return useQuery({
    queryKey: ["reviews_admin"],
    enabled,
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id,user_id,company_name,rating,body,status,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });
}

/** Freigabe bzw. Ablehnung durch die Administration. */
export function useModerateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Review["status"] }) => {
      const { error } = await supabase.from("reviews").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews_admin"] });
      void queryClient.invalidateQueries({ queryKey: ["reviews_public"] });
      toast.success("Bewertung aktualisiert");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
