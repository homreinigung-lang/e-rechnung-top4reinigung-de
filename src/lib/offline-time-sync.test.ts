import { describe, expect, it } from "vitest";
import { deliverPendingTime, syncTimeQueue } from "./offline-time-sync";
import type { PendingTime } from "./offline-time-store";

function fixture() {
  const entries: PendingTime[] = [
    {
      id: "stable-id",
      accountId: "account-a",
      employeeId: "employee-a",
      row: { id: "stable-id", user_id: "owner", employee_name: "Test", work_date: "2026-10-10" },
    },
    {
      id: "other-id",
      accountId: "account-b",
      employeeId: "employee-a",
      row: { user_id: "other-owner", employee_name: "Other", work_date: "2026-10-10" },
    },
  ];
  const store = {
    list: async (account: string, employee: string) =>
      entries.filter((e) => e.accountId === account && e.employeeId === employee),
    remove: async (id: string) => {
      entries.splice(
        entries.findIndex((e) => e.id === id),
        1,
      );
    },
  };
  return { entries, store };
}

describe("offline work time synchronization", () => {
  it("retains the same ID after a lost response, then removes only the acknowledged account's entry", async () => {
    const { entries, store } = fixture();
    const server = new Set<string>();
    const send = async (entry: PendingTime) => {
      if (!server.has(entry.id)) {
        server.add(entry.id);
        throw new Error("Response lost");
      }
    };
    await expect(
      syncTimeQueue("account-a", "employee-a", store, send, async () => "account-a"),
    ).rejects.toThrow("Response lost");
    expect(entries[0]?.id).toBe("stable-id");
    expect(
      await syncTimeQueue("account-a", "employee-a", store, send, async () => "account-a"),
    ).toBe(1);
    expect(server.size).toBe(1);
    expect(entries.map((e) => e.id)).toEqual(["other-id"]);
  });
  it("does not transmit another account's data after logout or account change", async () => {
    const { entries, store } = fixture();
    let sent = 0;
    expect(
      await syncTimeQueue(
        "account-a",
        "employee-a",
        store,
        async () => {
          sent++;
        },
        async () => "account-b",
      ),
    ).toBe(0);
    expect(sent).toBe(0);
    expect(entries).toHaveLength(2);
  });
  it("preserves rejected entries for a visible retry", async () => {
    const { entries, store } = fixture();
    await expect(
      syncTimeQueue(
        "account-a",
        "employee-a",
        store,
        async () => {
          throw new Error("Permission denied");
        },
        async () => "account-a",
      ),
    ).rejects.toThrow("Permission denied");
    expect(entries).toHaveLength(2);
  });
});

describe("idempotent server delivery", () => {
  it("acknowledges a duplicate only for the same employee and company", async () => {
    const entry = fixture().entries[0]!;
    const transport = {
      insert: async () => ({ error: { code: "23505", message: "Duplicate" } }),
      find: async () => ({
        data: { employee_id: entry.employeeId, user_id: entry.row.user_id },
        error: null,
      }),
    };
    await expect(deliverPendingTime(entry, transport)).resolves.toBeUndefined();
    await expect(
      deliverPendingTime(entry, {
        ...transport,
        find: async () => ({
          data: { employee_id: "other", user_id: entry.row.user_id },
          error: null,
        }),
      }),
    ).rejects.toThrow("Duplicate");
    await expect(
      deliverPendingTime(entry, {
        ...transport,
        find: async () => ({
          data: { employee_id: entry.employeeId, user_id: "other" },
          error: null,
        }),
      }),
    ).rejects.toThrow("Duplicate");
  });
  it("retains an unverified duplicate and does not swallow other server errors", async () => {
    const entry = fixture().entries[0]!;
    let lookups = 0;
    const find = async () => {
      lookups++;
      return { data: null, error: new Error("Unavailable") };
    };
    await expect(
      deliverPendingTime(entry, {
        insert: async () => ({ error: { code: "23505", message: "Duplicate" } }),
        find,
      }),
    ).rejects.toThrow("Duplicate");
    await expect(
      deliverPendingTime(entry, {
        insert: async () => ({ error: { code: "42501", message: "Forbidden" } }),
        find,
      }),
    ).rejects.toThrow("Forbidden");
    expect(lookups).toBe(1);
  });
});
