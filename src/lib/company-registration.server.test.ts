import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeCompanyRegistration } from "./company-registration.server";

const mocks = vi.hoisted(() => ({ getUserById: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { admin: { getUserById: mocks.getUserById } }, from: mocks.from },
}));
const uid = "81000000-0000-4000-8000-000000000003";
const input = { fullName: "Anna Beispiel", companyName: "Beispiel Reinigung" };
type Reply = { data: unknown; error: unknown };
let replies: Record<string, Reply>;
let writes: { table: string; value: unknown; operation: string }[];
let filters: [string, string, unknown][];
let insertErrors: Record<string, Error>;
beforeEach(() => {
  writes = [];
  filters = [];
  replies = {};
  insertErrors = {};
  mocks.getUserById.mockResolvedValue({
    data: { user: { id: uid, email: "owner@example.invalid" } },
    error: null,
  });
  mocks.from.mockImplementation((table: string) => {
    const result = () => replies[table] ?? { data: null, error: null };
    const chain = {
      select: () => chain,
      eq: (field: string, value: unknown) => {
        filters.push([table, field, value]);
        return chain;
      },
      limit: () => chain,
      maybeSingle: async () => result(),
      insert: async (value: unknown) => {
        writes.push({ table, value, operation: "insert" });
        return insertErrors[table] ? { data: null, error: insertErrors[table] } : result();
      },
      update: (value: unknown) => {
        writes.push({ table, value, operation: "update" });
        return chain;
      },
      then: (resolve: (reply: Reply) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  });
});
describe("automatic company registration", () => {
  it("activates a valid company after saving its profile and trial", async () => {
    expect(await completeCompanyRegistration(uid, input)).toEqual({ status: "approved" });
    expect(writes.map((w) => w.table)).toEqual([
      "company_settings",
      "subscriptions",
      "account_approvals",
    ]);
    expect(writes[2]?.value).toMatchObject({
      auth_user_id: uid,
      email: "owner@example.invalid",
      status: "approved",
    });
  });
  it.each(["blocked", "rejected"])(
    "never overrides an administrator's %s decision",
    async (status) => {
      replies["account_approvals"] = { data: { id: "approval", status }, error: null };
      expect(await completeCompanyRegistration(uid, input)).toEqual({ status });
      expect(writes).toEqual([]);
    },
  );
  it("rejects incomplete company data without provisioning anything", async () => {
    await expect(
      completeCompanyRegistration(uid, { ...input, companyName: "  " }),
    ).rejects.toThrow();
    expect(writes).toEqual([]);
  });
  it("keeps linked employees out of company registrations", async () => {
    replies["employees"] = { data: [{ id: "worker" }], error: null };
    expect(await completeCompanyRegistration(uid, {})).toEqual({ status: "approved" });
    expect(filters).toContainEqual(["employees", "auth_user_id", uid]);
    expect(writes).toEqual([]);
  });
  it("does not report activation when saving the trial fails", async () => {
    insertErrors["subscriptions"] = new Error("database unavailable");
    await expect(completeCompanyRegistration(uid, input)).rejects.toThrow("database unavailable");
    expect(writes.map((w) => w.table)).toEqual(["company_settings", "subscriptions"]);
  });
  it("retries partial registration without overwriting the profile or restarting the trial", async () => {
    replies["company_settings"] = {
      data: { id: "settings", company_name: input.companyName, owner_name: input.fullName },
      error: null,
    };
    replies["subscriptions"] = { data: { id: "trial" }, error: null };
    await completeCompanyRegistration(uid, {});
    expect(writes.map((w) => w.table)).toEqual(["account_approvals"]);
  });
  it("does not overwrite a ban applied while an old pending registration completes", async () => {
    replies["account_approvals"] = {
      data: {
        id: "approval",
        status: "pending",
        full_name: input.fullName,
        company_name: input.companyName,
      },
      error: null,
    };
    // A conditional update losing the race returns no row.
    const original = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table: string) => {
      const chain = original(table);
      if (table === "account_approvals")
        chain.update = (value: unknown) => {
          writes.push({ table, value, operation: "update" });
          replies["account_approvals"] = { data: null, error: null };
          return chain;
        };
      return chain;
    });
    await expect(completeCompanyRegistration(uid, {})).rejects.toThrow(
      "Kontostatus wurde geändert",
    );
    expect(filters).toContainEqual(["account_approvals", "status", "pending"]);
  });
});
