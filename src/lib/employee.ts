import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MyEmployee = {
  id: string;
  name: string;
  role: string;
  hourly_rate: number;
  email: string;
  user_id: string;
};

/**
 * Verknüpft das angemeldete Konto (per E-Mail) mit dem Mitarbeiter-Stammsatz
 * und liefert diesen zurück. Für Inhaber-/Admin-Konten ist das Ergebnis null.
 */
export function useMyEmployee() {
  return useQuery({
    queryKey: ["my_employee"],
    staleTime: 60_000,
    queryFn: async (): Promise<MyEmployee | null> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;

      const { data: existing } = await supabase
        .from("employees")
        .select("id,name,role,hourly_rate,email,user_id")
        .eq("auth_user_id", uid)
        .maybeSingle();
      if (existing) return existing as MyEmployee;

      const { data: linkedId } = await supabase.rpc("link_employee_account");
      if (!linkedId) return null;

      const { data: linked } = await supabase
        .from("employees")
        .select("id,name,role,hourly_rate,email,user_id")
        .eq("id", linkedId as string)
        .maybeSingle();
      return (linked as MyEmployee | null) ?? null;
    },
  });
}
