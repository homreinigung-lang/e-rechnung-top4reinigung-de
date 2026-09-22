import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowPublicMail } from "./mail-throttle.server";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getHeader: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: mocks.getHeader }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));
beforeEach(() => {
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.getHeader.mockImplementation((name: string) =>
    name === "cf-connecting-ip" ? "192.0.2.1" : "spoofed",
  );
  mocks.from.mockReturnValue({ delete: () => ({ lt: async () => ({ error: null }) }) });
});
afterEach(() => vi.resetAllMocks());
describe("public mail throttle", () => {
  it.each([
    { data: null, error: new Error("unavailable") },
    { data: false, error: null },
    { data: null, error: null },
  ])("fails closed on %s", async (result) => {
    mocks.rpc.mockResolvedValue(result);
    expect(await allowPublicMail({ email: "a@example.invalid" })).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("reserves limits atomically and passes only hashed identities", async () => {
    expect(await allowPublicMail({ email: "A@example.invalid" })).toBe(true);
    const [name, args] = mocks.rpc.mock.calls[0]!;
    expect(name).toBe("consume_mail_budget");
    expect(args._email_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(args._ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.getHeader).toHaveBeenCalledWith("cf-connecting-ip");
    expect(mocks.getHeader).not.toHaveBeenCalledWith("x-forwarded-for");
  });
});
