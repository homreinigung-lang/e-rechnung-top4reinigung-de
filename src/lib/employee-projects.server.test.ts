import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { employeeProjects } from "./employee-projects.server";
type Reply = { data: unknown; error: { message: string } | null };
function database(replies: Record<string, Reply>) {
  const calls: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const chain = {
      select: (value: string) => {
        calls.push([table, "select", value]);
        return chain;
      },
      eq: (key: string, value: unknown) => {
        calls.push([table, "eq", key, value]);
        return chain;
      },
      neq: (key: string, value: unknown) => {
        calls.push([table, "neq", key, value]);
        return chain;
      },
      is: (key: string, value: unknown) => {
        calls.push([table, "is", key, value]);
        return chain;
      },
      in: (key: string, value: unknown) => {
        calls.push([table, "in", key, value]);
        return chain;
      },
      order: () => chain,
      maybeSingle: async () => replies[table],
      then: (resolve: (reply: Reply) => unknown) => Promise.resolve(replies[table]!).then(resolve),
    };
    return chain;
  });
  const rpc = vi.fn(async () => replies["status"]);
  return { db: { from, rpc } as unknown as SupabaseClient, calls, from };
}
const ok = (data: unknown): Reply => ({ data, error: null });

function fixture() {
  const user = database({
    status: ok("approved"),
    employees: ok({ id: "employee", user_id: "owner" }),
    project_assignments: ok([{ project_id: "project" }]),
    projects: ok([
      {
        id: "project",
        name: "Gebäude",
        customer_id: "customer",
        customer_name: "Hausverwaltung",
        address_line: "Verwaltung 1",
        postal_code: "66111",
        city: "Saarbrücken",
      },
    ]),
  });
  const admin = database({
    customers: ok([
      {
        id: "customer",
        address_line: "Verwaltung 1",
        postal_code: "66111",
        city: "Saarbrücken",
        service_address_line: "Arbeitsort 10",
        service_postal_code: "66333",
        service_city: "Völklingen",
      },
    ]),
  });
  return { user, admin };
}
describe("employee project locations", () => {
  it("returns only resolved work details for assigned objects of the verified company", async () => {
    const { user, admin } = fixture();
    const result = await employeeProjects(user.db, admin.db, "worker");
    expect(result).toEqual([
      {
        id: "project",
        name: "Gebäude",
        customer_name: "Hausverwaltung",
        address_line: "Arbeitsort 10",
        postal_code: "66333",
        city: "Völklingen",
      },
    ]);
    expect(user.calls).toContainEqual(["employees", "eq", "auth_user_id", "worker"]);
    expect(user.calls).toContainEqual(["project_assignments", "eq", "employee_id", "employee"]);
    expect(user.calls).toContainEqual(["projects", "eq", "user_id", "owner"]);
    expect(user.calls).toContainEqual(["projects", "in", "id", ["project"]]);
    expect(admin.calls).toContainEqual(["customers", "eq", "user_id", "owner"]);
    expect(admin.calls).toContainEqual(["customers", "in", "id", ["customer"]]);
    expect(JSON.stringify(result)).not.toContain("Verwaltung 1");
  });
  it("rejects unlinked employees before privileged customer reads", async () => {
    const { admin } = fixture();
    const user = database({ status: ok("approved"), employees: ok(null) });
    await expect(employeeProjects(user.db, admin.db, "worker")).rejects.toThrow("Kein verknüpfter");
    expect(admin.from).not.toHaveBeenCalled();
  });
  it("rejects blocked accounts before any address reads", async () => {
    const { admin } = fixture();
    const user = database({ status: ok("blocked") });
    await expect(employeeProjects(user.db, admin.db, "worker")).rejects.toThrow(
      "Mitarbeiterzugang",
    );
    expect(admin.from).not.toHaveBeenCalled();
    expect(user.from).not.toHaveBeenCalled();
  });
  it("returns no locations for employees without assignments", async () => {
    const { admin } = fixture();
    const user = database({
      status: ok("approved"),
      employees: ok({ id: "employee", user_id: "owner" }),
      project_assignments: ok([]),
    });
    expect(await employeeProjects(user.db, admin.db, "worker")).toEqual([]);
    expect(admin.from).not.toHaveBeenCalled();
  });
});
