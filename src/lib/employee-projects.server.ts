import type { SupabaseClient } from "@supabase/supabase-js";
import { employeeProjectAddressParts } from "./maps";

/** Resolve work locations only for the authenticated employee's assigned objects. */
export async function employeeProjects(db: SupabaseClient, admin: SupabaseClient, userId: string) {
  const access = await db.rpc("get_account_access_status");
  if (
    access.error ||
    typeof access.data !== "string" ||
    ["blocked", "rejected"].includes(access.data)
  )
    throw new Error("Mitarbeiterzugang konnte nicht bestätigt werden.");
  const employee = await db
    .from("employees")
    .select("id,user_id")
    .eq("auth_user_id", userId)
    .neq("user_id", userId)
    .maybeSingle();
  if (employee.error || !employee.data)
    throw new Error("Kein verknüpfter Mitarbeiterzugang gefunden.");
  const assignments = await db
    .from("project_assignments")
    .select("project_id")
    .eq("employee_id", employee.data.id);
  if (assignments.error) throw new Error("Einsätze konnten nicht geladen werden.");
  const ids = [...new Set((assignments.data ?? []).map((a) => a.project_id).filter(Boolean))];
  if (!ids.length) return [];
  const projects = await db
    .from("projects")
    .select("id,name,city,address_line,postal_code,customer_name,customer_id")
    .eq("user_id", employee.data.user_id)
    .in("id", ids);
  if (projects.error) throw new Error("Objekte konnten nicht geladen werden.");
  const customerIds = [...new Set((projects.data ?? []).map((p) => p.customer_id).filter(Boolean))];
  // Employees cannot read customer billing records. The server reads only linked
  // customers of the verified company and returns resolved work locations only.
  const customers = customerIds.length
    ? await admin
        .from("customers")
        .select(
          "id,address_line,postal_code,city,service_address_line,service_postal_code,service_city",
        )
        .eq("user_id", employee.data.user_id)
        .in("id", customerIds)
        .is("deleted_at", null)
    : { data: [], error: null };
  if (customers.error) throw new Error("Einsatzadressen konnten nicht geladen werden.");
  return (projects.data ?? []).map((project) => {
    const customer = (customers.data ?? []).find((c) => c.id === project.customer_id);
    const address = employeeProjectAddressParts(project, customer);
    return {
      id: project.id,
      name: project.name,
      customer_name: project.customer_name,
      address_line: address.address_line ?? "",
      postal_code: address.postal_code ?? "",
      city: address.city ?? "",
    };
  });
}
