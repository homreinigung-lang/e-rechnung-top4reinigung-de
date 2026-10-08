import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteCompanySafely } from "./company-deletion.server";

function fixture(
  errors: {
    prepare?: boolean;
    auth?: boolean;
    lookup?: string;
    subscription?: boolean;
    approval?: boolean;
  } = {},
) {
  const operations: string[] = [];
  const caller = {
    rpc: vi.fn(async () => {
      operations.push("block");
      return {
        data: errors.prepare ? null : "owner",
        error: errors.prepare ? { message: "denied" } : null,
      };
    }),
  };
  const admin = {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: errors.lookup ? null : { id: "owner" } },
          error: errors.lookup ? { code: errors.lookup, message: "lookup failed" } : null,
        })),
        deleteUser: vi.fn(async () => {
          operations.push("auth-delete");
          return { error: errors.auth ? { message: "Auth unavailable" } : null };
        }),
      },
    },
    from: (table: string) => ({
      delete: () => ({
        eq: async () => {
          operations.push(`delete:${table}`);
          return {
            error: (table === "subscriptions" ? errors.subscription : errors.approval)
              ? { message: "cleanup failed" }
              : null,
          };
        },
      }),
    }),
  };
  return {
    caller: caller as unknown as SupabaseClient,
    admin: admin as unknown as SupabaseClient,
    operations,
  };
}

describe("safe company deletion", () => {
  it("blocks first and only removes approvals after confirmed Auth deletion", async () => {
    const f = fixture();
    expect(await deleteCompanySafely(f.caller, f.admin, "approval")).toEqual({ deleted: true });
    expect(f.operations).toEqual([
      "block",
      "auth-delete",
      "delete:subscriptions",
      "delete:account_approvals",
    ]);
  });
  it("leaves both subscription and blocking approval intact when Auth deletion fails", async () => {
    const f = fixture({ auth: true });
    await expect(deleteCompanySafely(f.caller, f.admin, "approval")).rejects.toThrow(
      "Auth unavailable",
    );
    expect(f.operations).toEqual(["block", "auth-delete"]);
  });
  it("never deletes anything when the administrator preparation is denied", async () => {
    const f = fixture({ prepare: true });
    await expect(deleteCompanySafely(f.caller, f.admin, "approval")).rejects.toThrow("denied");
    expect(f.operations).toEqual(["block"]);
  });
  it("does not treat lookup failures as proof that the user is gone", async () => {
    const f = fixture({ lookup: "unexpected_failure" });
    await expect(deleteCompanySafely(f.caller, f.admin, "approval")).rejects.toThrow(
      "lookup failed",
    );
    expect(f.operations).toEqual(["block"]);
  });
  it("can retry cleanup after a previous Auth deletion", async () => {
    const f = fixture({ lookup: "user_not_found" });
    await deleteCompanySafely(f.caller, f.admin, "approval");
    expect(f.operations).toEqual(["block", "delete:subscriptions", "delete:account_approvals"]);
  });
  it("keeps the blocking row and reports a subscription cleanup error", async () => {
    const f = fixture({ subscription: true });
    await expect(deleteCompanySafely(f.caller, f.admin, "approval")).rejects.toThrow(
      "cleanup failed",
    );
    expect(f.operations).not.toContain("delete:account_approvals");
  });
  it("reports an approval cleanup error instead of returning success", async () => {
    const f = fixture({ approval: true });
    await expect(deleteCompanySafely(f.caller, f.admin, "approval")).rejects.toThrow(
      "cleanup failed",
    );
  });
});
