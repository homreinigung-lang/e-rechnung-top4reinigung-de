import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: mocks.eq }) }),
  },
}));
import { resolveLoginEntry } from "./employee";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "worker-account" } } });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
});

describe("existing account entry", () => {
  it.each([true, false])(
    "opens the linked worker's own area (employee entry: %s)",
    async (employeeOnly) => {
      mocks.maybeSingle.mockResolvedValue({
        data: { id: "personnel-record", user_id: "employer-account" },
      });
      expect(await resolveLoginEntry(employeeOnly)).toBe("/mein-bereich");
      expect(mocks.eq).toHaveBeenCalledWith("auth_user_id", "worker-account");
    },
  );
  it("asks an existing but unlinked account for its company code on employee entry", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    expect(await resolveLoginEntry(true)).toBe("link-employee");
  });
  it("keeps company entry available for an owner without a personnel link", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    expect(await resolveLoginEntry(false)).toBe("/dashboard");
  });
  it("does not treat an owner's own personnel record as employee membership", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "self", user_id: "worker-account" } });
    expect(await resolveLoginEntry(true)).toBe("link-employee");
  });
  it("does not grant employee entry based on editable account metadata", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "worker-account", user_metadata: { account_type: "employee" } } },
    });
    mocks.maybeSingle.mockResolvedValue({ data: null });
    expect(await resolveLoginEntry(true)).toBe("link-employee");
  });
});
