import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Freigabe-Status eines Firmenkontos. */
export const APPROVAL_STATUS = ["pending", "approved", "blocked"] as const;

export const approvalStatusLabel: Record<string, string> = {
  pending: "Wartet auf Freigabe",
  approved: "Freigegeben",
  blocked: "Gesperrt",
  rejected: "Abgelehnt",
};

export type AccountApproval = {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  company_name: string;
  status: string;
  created_at: string;
  decided_at: string | null;
};

/** Alle registrierten Firmenkonten – nur für Administratoren (RLS). */
export function useAccountApprovals(enabled: boolean) {
  return useQuery({
    queryKey: ["admin_approvals"],
    enabled,
    queryFn: async (): Promise<AccountApproval[]> => {
      const { data, error } = await supabase
        .from("account_approvals")
        .select("id,auth_user_id,email,full_name,company_name,status,created_at,decided_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AccountApproval[];
    },
  });
}

/** Firma freigeben oder sperren. */
export function useSetApprovalStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("account_approvals")
        .update({ status, decided_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin_approvals"] });
      toast.success("Status aktualisiert");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Firmenkonto endgültig löschen (inkl. Anmelde-Zugang und Abonnement). */
export function useDeleteCompanyAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (approvalId: string) => {
      const { deleteCompanyAccount } = await import("@/lib/approval.functions");
      await deleteCompanyAccount({ data: { approvalId } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin_approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Konto gelöscht");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}


export type Plan = {
  id: string;
  code: string;
  name: string;
  description: string;
  price_monthly_cents: number;
  price_yearly_cents: number;
  features: string[];
  sort_order: number;
  active: boolean;
};

/** Pakete und Preise. */
export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select(
          "id,code,name,description,price_monthly_cents,price_yearly_cents,features,sort_order,active",
        )
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Plan> }) => {
      const { error } = await supabase.from("plans").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Paket gespeichert");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { code: string; name: string }) => {
      const { error } = await supabase.from("plans").insert({
        code: input.code,
        name: input.name,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Paket angelegt");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Paket gelöscht");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Cent-Betrag als deutscher Euro-Preis. */
export function euro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
