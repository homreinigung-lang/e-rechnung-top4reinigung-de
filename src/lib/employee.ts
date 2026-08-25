import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MyEmployee = {
  id: string;
  name: string;
  role: string;
  hourly_rate: number;
  email: string;
  phone?: string;
  personnel_number?: string;
  user_id: string;
  contract_type?: string | null;
  contract_start?: string | null;
  weekly_hours?: number | null;
  work_location?: string | null;
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

      // Inhaber/Administrator: niemals auf die Mitarbeiteransicht einschränken.
      const asEmployee = (row: MyEmployee | null) => (row && row.user_id !== uid ? row : null);

      const { data: existing } = await supabase
        .from("employees")
        .select(
          "id,name,role,hourly_rate,email,phone,personnel_number,user_id,contract_type,contract_start,weekly_hours,work_location",
        )
        .eq("auth_user_id", uid)
        .maybeSingle();
      if (existing) return asEmployee(existing as MyEmployee);

      const { data: linkedId } = await supabase.rpc("link_employee_account");
      if (!linkedId) return null;

      const { data: linked } = await supabase
        .from("employees")
        .select(
          "id,name,role,hourly_rate,email,phone,personnel_number,user_id,contract_type,contract_start,weekly_hours,work_location",
        )
        .eq("id", linkedId as string)
        .maybeSingle();
      return asEmployee((linked as MyEmployee | null) ?? null);
    },
  });
}

/**
 * Routen, die Mitarbeiterkonten aufrufen dürfen. Alles andere gehört zum
 * Unternehmenskonto (Rechnungen, Kunden, Einstellungen, Administration).
 */
export const EMPLOYEE_ALLOWED_PREFIXES = [
  "/meine-zeiten",
  "/nachrichten",
  "/profil",
  "/hilfe",
] as const;

export function isEmployeeAllowedPath(pathname: string): boolean {
  return EMPLOYEE_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/**
 * Prüft nach der Anmeldung, ob das Konto ein Mitarbeiterkonto ist, und liefert
 * die passende Startseite. Inhaberkonten landen im Dashboard.
 */
export async function resolveStartRoute(): Promise<"/dashboard" | "/meine-zeiten"> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return "/dashboard";
  const { data: row } = await supabase
    .from("employees")
    .select("id,user_id")
    .eq("auth_user_id", uid)
    .maybeSingle();
  if (row && row.user_id !== uid) return "/meine-zeiten";
  if (row) return "/dashboard";
  const { data: linkedId } = await supabase.rpc("link_employee_account");
  return linkedId ? "/meine-zeiten" : "/dashboard";
}
