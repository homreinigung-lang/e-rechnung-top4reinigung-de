import type { SupabaseClient } from "@supabase/supabase-js";
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
  address_line?: string;
  postal_code?: string;
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
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return data?.role === "admin";
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

/** Reverse-Charge ist steuerliche Behandlung und in allen unterstützten Paketen verfügbar. */
export const REVERSE_CHARGE_PLANS = ["basis", "pro", "enterprise"];

/** Paket-Code des angemeldeten Kontos (leer, wenn kein Abo hinterlegt ist). */
export function useMyPlanCode() {
  return useQuery({
    queryKey: ["my_plan_code"],
    staleTime: 300_000,
    queryFn: async (): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return "";
      const { data } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", uid)
        .maybeSingle();
      return String((data as { plan?: string } | null)?.plan ?? "");
    },
  });
}

/**
 * Reverse-Charge (Rechnung ohne deutsche MwSt. bei erfüllten Voraussetzungen)
 * ist nicht paketabhängig.
 */
export function useCanReverseCharge() {
  const { data: plan = "", isLoading } = useMyPlanCode();
  return {
    canReverseCharge: REVERSE_CHARGE_PLANS.includes(plan.toLowerCase()),
    planCode: plan,
    isLoading,
  };
}

export type SubscriptionAccess = {
  plan: string;
  status: string;
  renewsOn: string | null;
  expired: boolean;
};

const PLAN_LEVEL: Record<string, number> = { basis: 1, pro: 2, enterprise: 3 };

export function requiredPlanForPath(pathname: string): "basis" | "pro" | "enterprise" {
  if (
    pathname.startsWith("/projekte") ||
    pathname.startsWith("/steuerberater")
  ) {
    return "enterprise";
  }
  if (
    pathname.startsWith("/mein-bereich") ||
    pathname.startsWith("/meine-zeiten") ||
    pathname.startsWith("/kalkulation") ||
    pathname.startsWith("/team") ||
    pathname.startsWith("/karte") ||
    pathname.startsWith("/fahrtenbuch") ||
    pathname.startsWith("/wiederkehrend") ||
    pathname.startsWith("/ausgaben") ||
    pathname.startsWith("/qm-reklamationen") ||
    pathname.startsWith("/nachrichten") ||
    pathname.startsWith("/lv-analyse")
  ) {
    return "pro";
  }
  return "basis";
}

export function subscriptionAllowsPath(access: SubscriptionAccess | null, pathname: string): boolean {
  if (
    pathname.startsWith("/mein-paket") ||
    pathname.startsWith("/profil") ||
    pathname.startsWith("/hilfe") ||
    pathname.startsWith("/einstellungen")
  ) {
    return true;
  }
  if (!access) return false;
  if (access.status === "trial") return !access.expired;
  if (access.status !== "active" || access.expired) return false;
  const current = PLAN_LEVEL[access.plan.toLowerCase()] ?? 0;
  const required = PLAN_LEVEL[requiredPlanForPath(pathname)] ?? 1;
  return current >= required;
}

export function useMySubscriptionAccess() {
  return useQuery({
    queryKey: ["my_subscription_access"],
    staleTime: 60_000,
    queryFn: async (): Promise<SubscriptionAccess | null> => {
      const db = supabase as SupabaseClient;
      const { data, error } = await db.rpc("current_subscription_access");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return null;
      const renewsOn = row.renews_on ? String(row.renews_on) : null;
      const today = new Date().toISOString().slice(0, 10);
      const expired = Boolean(renewsOn && renewsOn < today);
      return {
        plan: String(row.plan ?? ""),
        status: String(row.status ?? ""),
        renewsOn,
        expired,
      };
    },
  });
}
