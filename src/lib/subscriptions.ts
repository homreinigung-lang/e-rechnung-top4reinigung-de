import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Subscription = {
  id: string;
  user_id: string;
  company_name: string;
  city: string;
  contact_email: string;
  plan: string;
  status: string;
  visible_on_landing: boolean;
  sort_order: number;
  note: string;
  started_on: string;
  renews_on: string | null;
};

export const PLANS = ["basis", "pro", "enterprise"] as const;
export const STATUS = ["active", "trial", "inactive"] as const;

export const statusLabel: Record<string, string> = {
  active: "Aktiv",
  trial: "Testphase",
  inactive: "Inaktiv",
};

export const planLabel: Record<string, string> = {
  basis: "Basis",
  pro: "Pro",
  enterprise: "Enterprise",
};

/** Ist das angemeldete Konto Administrator? */
export function useIsAdmin() {
  return useQuery({
    queryKey: ["is_admin"],
    staleTime: 300_000,
    queryFn: async (): Promise<boolean> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      return data === true;
    },
  });
}

/** Öffentliche Partnerliste (nur aktive und freigegebene Abonnements). */
export function usePublicPartners() {
  return useQuery({
    queryKey: ["public_partners"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id,company_name,city")
        .eq("status", "active")
        .eq("visible_on_landing", true)
        .order("sort_order", { ascending: true })
        .order("company_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; company_name: string; city: string }[];
    },
  });
}

/** Alle Abonnements – nur für Administratoren sichtbar (RLS). */
export function useAllSubscriptions(enabled: boolean) {
  return useQuery({
    queryKey: ["subscriptions_admin"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("company_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Subscription[];
    },
  });
}
