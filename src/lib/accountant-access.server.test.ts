import { afterEach, describe, expect, it, vi } from "vitest";
import { hashAccessCode, verifyAccountantAccess } from "./accountant-access.server";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));
afterEach(() => vi.resetAllMocks());
describe("accountant access", () => {
  it("passes only a salted hash into the atomic check", async () => {
    rpc.mockResolvedValue({
      data: { status: "ok", id: "access-id", user_id: "owner-id" },
      error: null,
    });
    expect(await verifyAccountantAccess("synthetic-token", "ABC123")).toEqual({
      id: "access-id",
      user_id: "owner-id",
    });
    expect(rpc).toHaveBeenCalledWith("check_accountant_access", {
      _token: "synthetic-token",
      _candidate_hash: await hashAccessCode("synthetic-token", "abc123"),
    });
  });
  it.each(["invalid", "expired", "locked"])("denies %s credentials", async (status) => {
    rpc.mockResolvedValue({ data: { status }, error: null });
    await expect(verifyAccountantAccess("synthetic-token", "wrong")).rejects.toThrow();
  });
  it.each([
    { data: null, error: new Error("db unavailable") },
    { data: { status: "ok" }, error: null },
  ])("fails closed when the check is incomplete", async (result) => {
    rpc.mockResolvedValue(result);
    await expect(verifyAccountantAccess("synthetic-token", "ABC123")).rejects.toThrow();
  });
});
