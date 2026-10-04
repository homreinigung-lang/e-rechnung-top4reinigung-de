import { describe, expect, it, vi } from "vitest";
import {
  BankError,
  createBankHandler,
  eligibleCredit,
  hashText,
  transactionAmount,
  type BankApi,
  type BankSession,
  type BankStore,
  type BankTransaction,
  type StoredConnection,
} from "../../supabase/functions/enable-banking/core";
import { validBankState } from "./enable-banking";

const payment: BankTransaction = {
  entry_reference: "stable-payment",
  transaction_id: "unstable-id",
  booking_date: "2026-10-03",
  status: "BOOK",
  credit_debit_indicator: "CRDT",
  transaction_amount: { amount: "100.00", currency: "EUR" },
  remittance_information: ["RE-2026-001"],
  debtor: { name: "Anna Muster" },
};
function fixture() {
  let user = "user-a";
  let active = true;
  let connection: StoredConnection | null = {
    id: "connection-a",
    requisition_id: "session-a",
    account_ids: ["account-a"],
  };
  const states = new Map<string, { user: string; psu: string; expiry: string; used: boolean }>();
  const paid = new Set<string>();
  let ledgerCalls = 0;
  const store: BankStore = {
    authenticate: vi.fn(async (request) => {
      if (!request.headers.get("Authorization")) throw new BankError("login", 401);
      if (!active) throw new BankError("blocked", 403);
      return user;
    }),
    connection: vi.fn(async () => connection),
    saveState: vi.fn(async (id, hash, psu, expiry) => {
      states.set(hash, { user: id, psu, expiry, used: false });
    }),
    consumeState: vi.fn(async (id, hash, now) => {
      const row = states.get(hash);
      if (!row || row.used || row.user !== id || row.expiry <= now) return null;
      row.used = true;
      return row.psu;
    }),
    attach: vi.fn(async (id: string, session: BankSession) => {
      connection = {
        id: "connection-a",
        requisition_id: session.session_id,
        account_ids: session.accounts.map((account) => account.uid),
      };
    }),
    disconnect: vi.fn(async (id, sid) => {
      if (!connection || sid !== connection.requisition_id) return false;
      connection = null;
      return true;
    }),
    reconcile: vi.fn(async (id, conn, account, identity, tx) => {
      ledgerCalls++;
      const key = identity + tx.entry_reference;
      if (paid.has(key)) return null;
      paid.add(key);
      return "invoice-a";
    }),
  };
  const provider = {
    status: "AUTHORIZED",
    psu_id_hash: "psu-a",
    accounts: ["account-a"],
    accounts_data: [{ uid: "account-a", identification_hash: "stable-account-identity" }],
  };
  const api = vi.fn<BankApi>(async (path) => {
    if (path === "/auth")
      return { url: "https://auth.enablebanking.com/test", psu_id_hash: "psu-a" };
    if (path === "/sessions")
      return { session_id: "session-a", accounts: [{ uid: "account-a" }] } satisfies BankSession;
    if (path.startsWith("/sessions/")) return provider;
    if (path.includes("/transactions")) return { transactions: [payment] };
    if (path.endsWith("/balances")) return { balances: [] };
    return {};
  });
  const clock = new Date("2026-10-04T12:00:00Z");
  const handler = createBankHandler(
    store,
    api,
    "https://synthetic.invalid/bankverbindung",
    () => clock,
  );
  const request = (body: unknown, authorized = true) =>
    handler(
      new Request("https://synthetic.invalid/enable-banking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authorized ? { Authorization: "Bearer synthetic-token" } : {}),
        },
        body: JSON.stringify(
          body && typeof body === "object" && !Array.isArray(body)
            ? { protocol: 2, ...body }
            : body,
        ),
      }),
    );
  return {
    store,
    api,
    provider,
    request,
    states,
    paid,
    clock,
    setUser: (value: string) => {
      user = value;
    },
    setActive: (value: boolean) => {
      active = value;
    },
    setConnection: (value: StoredConnection | null) => {
      connection = value;
    },
    calls: () => ledgerCalls,
  };
}
describe("Enable Banking authorization", () => {
  it("rejects unauthenticated calls before contacting the bank", async () => {
    const f = fixture();
    expect(
      (await f.request({ action: "transactions", account_id: "account-a" }, false)).status,
    ).toBe(401);
    expect(f.api).not.toHaveBeenCalled();
  });
  it("rejects blocked users even for application metadata", async () => {
    const f = fixture();
    f.setActive(false);
    expect((await f.request({ action: "application" })).status).toBe(403);
    expect(f.api).not.toHaveBeenCalled();
  });
  it("rejects accounts outside the stored connection", async () => {
    const f = fixture();
    expect((await f.request({ action: "balances", account_id: "other-account" })).status).toBe(403);
    expect(f.api).not.toHaveBeenCalled();
  });
  it("rejects a forged stored account not present in the provider session", async () => {
    const f = fixture();
    f.setConnection({
      id: "own-row",
      requisition_id: "session-a",
      account_ids: ["victim-account"],
    });
    expect((await f.request({ action: "transactions", account_id: "victim-account" })).status).toBe(
      403,
    );
    expect(f.api.mock.calls).toHaveLength(1);
  });
  it("rejects revoked sessions before fetching transactions", async () => {
    const f = fixture();
    f.provider.status = "CLOSED";
    expect((await f.request({ action: "transactions", account_id: "account-a" })).status).toBe(403);
    expect(f.api.mock.calls).toHaveLength(1);
  });
  it("requires callback state before code exchange", async () => {
    const f = fixture();
    expect((await f.request({ action: "exchange_code", code: "code" })).status).toBe(400);
    expect(f.api).not.toHaveBeenCalled();
  });
  it("stores only a state digest bound to the signed-in user", async () => {
    const f = fixture();
    const result = await (
      await f.request({ action: "start_auth", bank: { name: "Test", country: "DE" } })
    ).json();
    expect(f.states.has(result.state)).toBe(false);
    expect(f.states.get(await hashText(result.state))?.user).toBe("user-a");
    expect(JSON.parse(String(f.api.mock.calls[0]?.[1]?.body)).psu_id).toBe("user-a");
  });
  it("rejects another user's state without redeeming a code", async () => {
    const f = fixture();
    const start = await (
      await f.request({ action: "start_auth", bank: { name: "Test", country: "DE" } })
    ).json();
    f.setUser("user-b");
    expect(
      (await f.request({ action: "exchange_code", code: "code", state: start.state })).status,
    ).toBe(403);
    expect(f.store.attach).not.toHaveBeenCalled();
    expect(f.api.mock.calls).toHaveLength(1);
  });
  it("rejects expired state", async () => {
    const f = fixture();
    const start = await (
      await f.request({ action: "start_auth", bank: { name: "Test", country: "DE" } })
    ).json();
    f.clock.setTime(f.clock.getTime() + 31 * 60000);
    expect(
      (await f.request({ action: "exchange_code", code: "code", state: start.state })).status,
    ).toBe(403);
    expect(f.store.attach).not.toHaveBeenCalled();
  });
  it("redeems state exactly once under concurrent callbacks", async () => {
    const f = fixture();
    const start = await (
      await f.request({ action: "start_auth", bank: { name: "Test", country: "DE" } })
    ).json();
    const results = await Promise.all(
      [1, 2].map(() => f.request({ action: "exchange_code", code: "code", state: start.state })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 403]);
    expect(f.store.attach).toHaveBeenCalledTimes(1);
  });
  it("checks the provider's PSU hash rather than trusting a supplied code", async () => {
    const f = fixture();
    const start = await (
      await f.request({ action: "start_auth", bank: { name: "Test", country: "DE" } })
    ).json();
    f.provider.psu_id_hash = "attacker-psu";
    expect(
      (await f.request({ action: "exchange_code", code: "attacker-code", state: start.state }))
        .status,
    ).toBe(403);
    expect(f.store.attach).not.toHaveBeenCalled();
  });
  it("does not attach a localStorage session without an existing central binding", async () => {
    const f = fixture();
    f.setConnection(null);
    expect(
      (await f.request({ action: "migrate_session", session_id: "browser-session" })).status,
    ).toBe(403);
    expect(f.store.attach).not.toHaveBeenCalled();
    expect(f.api).not.toHaveBeenCalled();
  });
  it("validates existing legacy bindings without rewriting them", async () => {
    const f = fixture();
    expect((await f.request({ action: "migrate_session", session_id: "session-a" })).status).toBe(
      200,
    );
    expect(f.store.attach).not.toHaveBeenCalled();
  });
  it("a stale device cannot disconnect a replacement session", async () => {
    const f = fixture();
    expect((await f.request({ action: "disconnect", session_id: "old-session" })).status).toBe(409);
    expect((await f.request({ action: "balances", account_id: "account-a" })).status).toBe(200);
  });
  it("a disconnected connection stays disconnected on refresh", async () => {
    const f = fixture();
    expect((await f.request({ action: "disconnect", session_id: "session-a" })).status).toBe(200);
    expect((await f.request({ action: "transactions", account_id: "account-a" })).status).toBe(403);
    expect(f.store.attach).not.toHaveBeenCalled();
  });
  it("hides raw upstream errors and credentials", async () => {
    const f = fixture();
    f.api.mockRejectedValue(new Error("secret-code-and-bank-identifier"));
    const response = await f.request({ action: "application" });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret-code");
  });
});
describe("Enable Banking transaction ingestion", () => {
  it("blocks legacy clients from running the old unsafe browser matcher", async () => {
    const f = fixture();
    expect(
      (await f.request({ action: "transactions", account_id: "account-a", protocol: 1 })).status,
    ).toBe(426);
    expect(f.api).not.toHaveBeenCalled();
  });
  it.each([
    { credit_debit_indicator: "DBIT" },
    { status: "PDNG" },
    { status: "CNCL" },
    { transaction_amount: { amount: "100", currency: "USD" } },
    { transaction_amount: { amount: "-100", currency: "EUR" } },
    { transaction_amount: { amount: "100.005", currency: "EUR" } },
    { entry_reference: undefined },
  ])("does not reconcile ineligible transactions %j", async (change) => {
    const f = fixture();
    f.api.mockImplementation(async (path) =>
      path.startsWith("/sessions/") ? f.provider : { transactions: [{ ...payment, ...change }] },
    );
    expect(
      (await f.request({ action: "transactions", account_id: "account-a", reconcile: true }))
        .status,
    ).toBe(200);
    expect(f.store.reconcile).not.toHaveBeenCalled();
  });
  it("uses a stable account digest rather than transaction_id", async () => {
    const f = fixture();
    await f.request({ action: "transactions", account_id: "account-a", reconcile: true });
    expect(f.calls()).toBe(1);
    expect(f.store.reconcile).toHaveBeenCalledWith(
      "user-a",
      expect.anything(),
      "account-a",
      await hashText("stable-account-identity"),
      payment,
    );
  });
  it("displays transactions but skips auto-payment without an account identity", async () => {
    const f = fixture();
    f.provider.accounts_data = [];
    const data = await (
      await f.request({ action: "transactions", account_id: "account-a", reconcile: true })
    ).json();
    expect(data.transactions).toHaveLength(1);
    expect(f.store.reconcile).not.toHaveBeenCalled();
  });
  it("does not reconcile during a read-only Bankverbindung refresh", async () => {
    const f = fixture();
    await f.request({ action: "transactions", account_id: "account-a" });
    expect(f.store.reconcile).not.toHaveBeenCalled();
  });
  it("retrieves every page and sorts newest first", async () => {
    const f = fixture();
    f.api.mockImplementation(async (path) =>
      path.startsWith("/sessions/")
        ? f.provider
        : path.includes("continuation_key")
          ? { transactions: [{ ...payment, booking_date: "2026-10-04" }] }
          : {
              transactions: [{ ...payment, booking_date: "2026-10-01" }],
              continuation_key: "next/key",
            },
    );
    const data = await (
      await f.request({ action: "transactions", account_id: "account-a" })
    ).json();
    expect(data.transactions.map((t: BankTransaction) => t.booking_date)).toEqual([
      "2026-10-04",
      "2026-10-01",
    ]);
    expect(f.api.mock.calls.at(-1)?.[0]).toContain("next%2Fkey");
  });
  it("never settles a partial fetch when the next page fails", async () => {
    const f = fixture();
    f.api.mockImplementation(async (path) => {
      if (path.startsWith("/sessions/")) return f.provider;
      if (path.includes("continuation_key")) throw Error("provider timeout");
      return { transactions: [payment], continuation_key: "next" };
    });
    expect(
      (await f.request({ action: "transactions", account_id: "account-a", reconcile: true }))
        .status,
    ).toBe(500);
    expect(f.store.reconcile).not.toHaveBeenCalled();
  });
  it("rejects repeated continuation keys before any payment update", async () => {
    const f = fixture();
    f.api.mockImplementation(async (path) =>
      path.startsWith("/sessions/")
        ? f.provider
        : { transactions: [payment], continuation_key: "loop" },
    );
    expect(
      (await f.request({ action: "transactions", account_id: "account-a", reconcile: true }))
        .status,
    ).toBe(502);
    expect(f.store.reconcile).not.toHaveBeenCalled();
  });
  it("shows a positive API debit as a negative amount", () => {
    expect(transactionAmount({ ...payment, credit_debit_indicator: "DBIT" })).toBe(-100);
    expect(transactionAmount(payment)).toBe(100);
  });
  it("requires booked incoming EUR credits", () => {
    expect(eligibleCredit(payment)).toBe(true);
  });
});
describe("Bank callback state validation", () => {
  it.each([
    [null, null],
    [null, "value"],
    ["value", null],
    ["value", "other"],
  ])("rejects missing or mismatched states %j", (expected, returned) => {
    expect(validBankState(expected, returned)).toBe(false);
  });
  it("accepts identical nonempty states", () => {
    expect(validBankState("value", "value")).toBe(true);
  });
});
