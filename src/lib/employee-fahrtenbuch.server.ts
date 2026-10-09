import type { SupabaseClient } from "@supabase/supabase-js";
import { projectAddress } from "./maps";

/** Return only address and destination choices for the verified employee's company. */
export async function employeeFahrtenbuchOptions(
  db: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
) {
  const access = await db.rpc("get_account_access_status");
  if (access.error || typeof access.data !== "string")
    throw new Error("Kontostatus konnte nicht geprüft werden.");
  if (["blocked", "rejected"].includes(access.data))
    throw new Error("Dieses Firmenkonto ist gesperrt.");

  const employee = await db
    .from("employees")
    .select("id,user_id")
    .eq("auth_user_id", userId)
    .neq("user_id", userId)
    .maybeSingle();
  if (employee.error || !employee.data)
    throw new Error("Kein verknüpfter Mitarbeiterzugang gefunden.");
  const ownerId = employee.data.user_id as string;
  const employeeId = employee.data.id as string;

  // Privileged reads are confined to the company derived from the verified link.
  // Never return company settings, billing/contact details or credentials wholesale.
  const [company, customers, assignments] = await Promise.all([
    admin
      .from("company_settings")
      .select("address_line,postal_code,city")
      .eq("user_id", ownerId)
      .maybeSingle(),
    admin
      .from("customers")
      .select(
        "id,name,company,address_line,postal_code,city,service_address_line,service_postal_code,service_city",
      )
      .eq("user_id", ownerId)
      .is("deleted_at", null)
      .order("company", { nullsFirst: false })
      .order("name", { nullsFirst: false }),
    db
      .from("project_assignments")
      .select("id,project_id,assignment_role,start_date,end_date")
      .eq("employee_id", employeeId),
  ]);
  for (const result of [company, customers, assignments]) {
    if (result.error) throw new Error("Fahrtenbuch-Auswahl konnte nicht geladen werden.");
  }
  const projectIds = [
    ...new Set((assignments.data ?? []).map((row) => row.project_id).filter(Boolean)),
  ];
  const projects = projectIds.length
    ? await db
        .from("projects")
        .select("id,name,customer_id,customer_name,address_line,postal_code,city")
        .eq("user_id", ownerId)
        .in("id", projectIds)
    : { data: [], error: null };
  if (projects.error) throw new Error("Einsätze konnten nicht geladen werden.");

  return {
    employeeId,
    ownerId,
    companyAddress: projectAddress(company.data ?? {}),
    customers: customers.data ?? [],
    tasks: (assignments.data ?? []).flatMap((assignment) => {
      const project = (projects.data ?? []).find((row) => row.id === assignment.project_id);
      return project
        ? [
            {
              id: assignment.id,
              name: project.name,
              customerId: project.customer_id,
              customerName: project.customer_name,
              address: projectAddress(project),
              role: assignment.assignment_role,
              startDate: assignment.start_date,
              endDate: assignment.end_date,
            },
          ]
        : [];
    }),
  };
}
