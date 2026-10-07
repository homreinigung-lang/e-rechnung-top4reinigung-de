import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeCompanyAiQuota } from "./company-ai-access.server";

type Reply = { data: unknown; error: { message: string } | null };
function database(overrides: Record<string, Reply> = {}) {
  const replies: Record<string, Reply> = {
    status: { data: "approved", error: null },
    user_roles: { data: null, error: null },
    employees: { data: [], error: null },
    company_settings: { data: { company_name: "Reinigung" }, error: null },
    assistant_requests: { data: null, error: null },
    ...overrides,
  };
  const insert = vi.fn(async () => replies["assistant_requests"]);
  const filters: [string, string, unknown][] = [];
  const db = {
    rpc: vi.fn(async () => replies["status"]),
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters.push([table, key, value]);
          return chain;
        },
        neq: (key: string, value: unknown) => {
          filters.push([table, key, value]);
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => replies[table],
        insert,
        then: (resolve: (v: Reply) => unknown) => Promise.resolve(replies[table]!).then(resolve),
      };
      return chain;
    },
  };
  return { db: db as unknown as SupabaseClient, insert, filters };
}

describe("company AI authorization and shared quota", () => {
  it("consumes the authenticated company's shared quota", async () => {
    const fixture = database();
    await consumeCompanyAiQuota(fixture.db, "owner");
    expect(fixture.insert).toHaveBeenCalledExactlyOnceWith({ user_id: "owner" });
    expect(fixture.filters).toContainEqual(["company_settings", "user_id", "owner"]);
  });
  it.each(["blocked", "rejected"])("rejects %s before any quota is consumed", async (status) => {
    const fixture = database({ status: { data: status, error: null } });
    await expect(consumeCompanyAiQuota(fixture.db, "owner")).rejects.toThrow("gesperrt");
    expect(fixture.insert).not.toHaveBeenCalled();
  });
  it("rejects employee accounts even if they also have company settings", async () => {
    const fixture = database({ employees: { data: [{ id: "employee" }], error: null } });
    await expect(consumeCompanyAiQuota(fixture.db, "worker")).rejects.toThrow("Firmenverwaltung");
    expect(fixture.insert).not.toHaveBeenCalled();
  });
  it("requires a completed company profile for non-administrators", async () => {
    const fixture = database({ company_settings: { data: null, error: null } });
    await expect(consumeCompanyAiQuota(fixture.db, "owner")).rejects.toThrow("Firmenregistrierung");
    expect(fixture.insert).not.toHaveBeenCalled();
  });
  it("allows a verified platform administrator without a company profile", async () => {
    const fixture = database({
      user_roles: { data: { role: "admin" }, error: null },
      company_settings: { data: null, error: null },
    });
    await consumeCompanyAiQuota(fixture.db, "admin");
    expect(fixture.insert).toHaveBeenCalledExactlyOnceWith({ user_id: "admin" });
  });
  it.each(["status", "user_roles", "employees", "company_settings"])(
    "fails closed when %s cannot be checked",
    async (table) => {
      const fixture = database({ [table]: { data: null, error: { message: "unavailable" } } });
      await expect(consumeCompanyAiQuota(fixture.db, "owner")).rejects.toThrow();
      expect(fixture.insert).not.toHaveBeenCalled();
    },
  );
  it("stops on a quota rejection instead of letting the model run", async () => {
    const fixture = database({
      assistant_requests: { data: null, error: { message: "KI-Limit erreicht." } },
    });
    await expect(consumeCompanyAiQuota(fixture.db, "owner")).rejects.toThrow("KI-Limit");
  });
});
