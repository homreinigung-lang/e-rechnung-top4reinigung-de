import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { employeeFahrtenbuchOptions } from "./employee-fahrtenbuch.server";

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
function fixture(overrides: Record<string, Reply> = {}) {
  const user = database({
    status: ok("approved"),
    employees: ok({ id: "employee", user_id: "owner" }),
    project_assignments: ok([
      {
        id: "assignment",
        project_id: "project",
        assignment_role: "Reinigung",
        start_date: null,
        end_date: null,
      },
    ]),
    projects: ok([
      {
        id: "project",
        name: "Büro",
        customer_id: "customer",
        customer_name: "Kunde",
        address_line: "Ziel 2",
        postal_code: "45678",
        city: "Stadt",
      },
    ]),
    ...overrides,
  });
  const admin = database({
    company_settings: ok({ address_line: "Firma 1", postal_code: "12345", city: "Ort" }),
    customers: ok([{ id: "customer", name: "Kunde" }]),
  });
  return { user, admin };
}

describe("employee Fahrtenbuch destination access", () => {
  it.each(["blocked", "rejected"])(
    "rejects %s before reading private company data",
    async (status) => {
      const { user, admin } = fixture({ status: ok(status) });
      await expect(employeeFahrtenbuchOptions(user.db, admin.db, "worker")).rejects.toThrow(
        "gesperrt",
      );
      expect(admin.from).not.toHaveBeenCalled();
    },
  );
  it("rejects accounts without an employee link before privileged reads", async () => {
    const { user, admin } = fixture({ employees: ok(null) });
    await expect(employeeFahrtenbuchOptions(user.db, admin.db, "worker")).rejects.toThrow(
      "Mitarbeiterzugang",
    );
    expect(admin.from).not.toHaveBeenCalled();
  });
  it("fails closed when the access check fails", async () => {
    const { user, admin } = fixture({ status: { data: null, error: { message: "offline" } } });
    await expect(employeeFahrtenbuchOptions(user.db, admin.db, "worker")).rejects.toThrow(
      "Kontostatus",
    );
    expect(admin.from).not.toHaveBeenCalled();
  });
  it("scopes address and customers to the verified employer and tasks to the employee", async () => {
    const { user, admin } = fixture();
    const result = await employeeFahrtenbuchOptions(user.db, admin.db, "worker");
    expect(user.calls).toContainEqual(["employees", "eq", "auth_user_id", "worker"]);
    expect(user.calls).toContainEqual(["employees", "neq", "user_id", "worker"]);
    expect(admin.calls).toContainEqual(["company_settings", "eq", "user_id", "owner"]);
    expect(admin.calls).toContainEqual([
      "company_settings",
      "select",
      "address_line,postal_code,city",
    ]);
    expect(admin.calls).toContainEqual(["customers", "eq", "user_id", "owner"]);
    expect(admin.calls).toContainEqual(["customers", "is", "deleted_at", null]);
    expect(user.calls).toContainEqual(["project_assignments", "eq", "employee_id", "employee"]);
    expect(user.calls).toContainEqual(["projects", "eq", "user_id", "owner"]);
    expect(user.calls).toContainEqual(["projects", "in", "id", ["project"]]);
    expect(result.companyAddress).toBe("Firma 1, 12345 Ort");
    expect(result.tasks[0]).toMatchObject({
      id: "assignment",
      role: "Reinigung",
      address: "Ziel 2, 45678 Stadt",
    });
  });
  it("does not fetch company projects without assigned tasks", async () => {
    const { user, admin } = fixture({ project_assignments: ok([]) });
    const result = await employeeFahrtenbuchOptions(user.db, admin.db, "worker");
    expect(user.from).not.toHaveBeenCalledWith("projects");
    expect(result.tasks).toEqual([]);
  });
});
