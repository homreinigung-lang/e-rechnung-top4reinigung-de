export type BankTransaction = {
  transaction_id?: string;
  entry_reference?: string;
  booking_date?: string;
  value_date?: string;
  credit_debit_indicator?: string;
  status?: string;
  transaction_amount?: { amount?: string | number; currency?: string };
  debtor?: { name?: string };
  creditor?: { name?: string };
  remittance_information?: string[] | string;
  reference_number?: string;
};
export type BankSession = {
  session_id: string;
  accounts: Array<{
    uid: string;
    identification_hash?: string;
    account_id?: { iban?: string };
    name?: string;
  }>;
  aspsp?: { name?: string; country?: string };
};
export type StoredConnection = { id: string; requisition_id: string; account_ids: string[] };
export type ProviderSession = {
  status: string;
  psu_id_hash?: string;
  accounts: string[];
  accounts_data?: BankSession["accounts"];
  aspsp?: BankSession["aspsp"];
};
export class BankError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export interface BankStore {
  authenticate(request: Request): Promise<string>;
  connection(userId: string): Promise<StoredConnection | null>;
  saveState(userId: string, stateHash: string, psuHash: string, expiresAt: string): Promise<void>;
  consumeState(userId: string, stateHash: string, now: string): Promise<string | null>;
  attach(userId: string, session: BankSession): Promise<void>;
  disconnect(userId: string, sessionId: string): Promise<boolean>;
  reconcile(
    userId: string,
    connection: StoredConnection,
    accountId: string,
    accountHash: string,
    tx: BankTransaction,
  ): Promise<string | null>;
}
export type BankApi = (path: string, init?: RequestInit) => Promise<unknown>;
export async function hashText(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function transactionAmount(tx: BankTransaction) {
  const amount = Number(tx.transaction_amount?.amount ?? 0);
  return tx.credit_debit_indicator === "DBIT" ? -Math.abs(amount) : amount;
}
export function transactionDate(tx: BankTransaction) {
  return tx.booking_date ?? tx.value_date ?? "";
}
export function eligibleCredit(tx: BankTransaction) {
  return (
    tx.credit_debit_indicator === "CRDT" &&
    tx.status === "BOOK" &&
    tx.transaction_amount?.currency === "EUR" &&
    Boolean(tx.entry_reference) &&
    typeof tx.transaction_amount.amount !== "undefined" &&
    /^[0-9]+(?:\.[0-9]{1,2})?$/.test(String(tx.transaction_amount.amount)) &&
    Number(tx.transaction_amount.amount) > 0
  );
}
const stringValue = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim() || value.length > 512)
    throw new BankError(`${label} fehlt oder ist ungültig.`);
  return value;
};
async function verifyConnection(
  store: BankStore,
  api: BankApi,
  userId: string,
  accountId?: string,
) {
  const connection = await store.connection(userId);
  if (!connection) throw new BankError("Keine aktive Bankverbindung gefunden.", 403);
  if (accountId && !connection.account_ids.includes(accountId))
    throw new BankError("Dieses Bankkonto gehört nicht zu diesem Benutzer.", 403);
  const session = (await api(
    `/sessions/${encodeURIComponent(connection.requisition_id)}`,
  )) as ProviderSession;
  if (
    session.status !== "AUTHORIZED" ||
    !Array.isArray(session.accounts) ||
    connection.account_ids.some((id) => !session.accounts.includes(id))
  ) {
    throw new BankError("Die Bankverbindung ist nicht mehr gültig. Bitte erneut verbinden.", 403);
  }
  return { connection, session };
}
async function transactions(api: BankApi, accountId: string) {
  const rows: BankTransaction[] = [];
  const keys = new Set<string>();
  let key: string | undefined;
  for (let page = 0; page < 100; page++) {
    const result = (await api(
      `/accounts/${encodeURIComponent(accountId)}/transactions${key ? `?continuation_key=${encodeURIComponent(key)}` : ""}`,
    )) as { transactions?: BankTransaction[]; continuation_key?: string };
    if (!Array.isArray(result.transactions)) throw new BankError("Ungültige Bankumsätze.", 502);
    rows.push(...result.transactions);
    if (rows.length > 10000)
      throw new BankError("Zu viele Bankumsätze für einen sicheren Abruf.", 502);
    key = result.continuation_key;
    if (!key) return rows.sort((a, b) => transactionDate(b).localeCompare(transactionDate(a)));
    if (keys.has(key))
      throw new BankError("Die Bank hat eine ungültige Folgeseite geliefert.", 502);
    keys.add(key);
  }
  throw new BankError("Der Bankabruf konnte nicht vollständig abgeschlossen werden.", 502);
}
export function createBankHandler(
  store: BankStore,
  api: BankApi,
  redirectUrl: string,
  now = () => new Date(),
) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  return async (request: Request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      const userId = await store.authenticate(request);
      const body = (await request.json().catch(() => {
        throw new BankError("Ungültige Anfrage.");
      })) as {
        action?: unknown;
        country?: unknown;
        bank?: unknown;
        code?: unknown;
        state?: unknown;
        session_id?: unknown;
        account_id?: unknown;
        reconcile?: unknown;
        protocol?: unknown;
      };
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new BankError("Ungültige Anfrage.");
      if (body.action === "application")
        return json({ ...((await api("/application")) as object), security_version: 2 });
      if (body.action === "list_banks") {
        const country = String(body.country ?? "DE")
          .trim()
          .toUpperCase();
        if (!/^[A-Z]{2}$/.test(country)) throw new BankError("Ungültiger Ländercode.");
        return json(await api(`/aspsps?country=${country}`));
      }
      if (body.action === "start_auth") {
        const bank = body.bank as { name?: unknown; country?: unknown } | undefined;
        const name = stringValue(bank?.name, "Bank");
        const country = stringValue(bank?.country, "Land").toUpperCase();
        if (!/^[A-Z]{2}$/.test(country) || !redirectUrl)
          throw new BankError("Ungültige Bank-Konfiguration.");
        const state = crypto.randomUUID();
        const result = (await api("/auth", {
          method: "POST",
          body: JSON.stringify({
            access: { valid_until: new Date(now().getTime() + 10 * 86400000).toISOString() },
            aspsp: { name, country },
            state,
            redirect_url: redirectUrl,
            psu_type: "business",
            psu_id: userId,
          }),
        })) as { url?: string; psu_id_hash?: string };
        if (!result.url || !result.psu_id_hash)
          throw new BankError("Unvollständige Bankfreigabe.", 502);
        await store.saveState(
          userId,
          await hashText(state),
          result.psu_id_hash,
          new Date(now().getTime() + 30 * 60000).toISOString(),
        );
        return json({ url: result.url, state });
      }
      if (body.action === "exchange_code") {
        const code = stringValue(body.code, "Authorization-Code");
        const state = stringValue(body.state, "Bankfreigabe");
        const psuHash = await store.consumeState(
          userId,
          await hashText(state),
          now().toISOString(),
        );
        if (!psuHash)
          throw new BankError(
            "Die Bankfreigabe ist abgelaufen oder gehört nicht zu diesem Benutzer.",
            403,
          );
        const session = (await api("/sessions", {
          method: "POST",
          body: JSON.stringify({ code }),
        })) as BankSession;
        const sid = stringValue(session.session_id, "Bank-Sitzung");
        const verified = (await api(`/sessions/${encodeURIComponent(sid)}`)) as ProviderSession;
        if (
          verified.status !== "AUTHORIZED" ||
          verified.psu_id_hash !== psuHash ||
          !Array.isArray(session.accounts) ||
          !Array.isArray(verified.accounts) ||
          session.accounts.length === 0 ||
          session.accounts.some((account) => !verified.accounts.includes(account.uid))
        ) {
          throw new BankError("Die Bankfreigabe konnte nicht sicher bestätigt werden.", 403);
        }
        await store.attach(userId, session);
        return json(session);
      }
      if (body.action === "migrate_session") {
        const sid = stringValue(body.session_id, "Bank-Sitzung");
        const connection = await store.connection(userId);
        // Never claim a browser bearer session for the currently signed-in user.
        if (!connection || connection.requisition_id !== sid)
          throw new BankError("Bitte das Bankkonto erneut sicher verbinden.", 403);
        const { session } = await verifyConnection(store, api, userId);
        return json({
          session_id: sid,
          accounts: connection.account_ids.map((uid) => ({ uid })),
          aspsp: session.aspsp,
        });
      }
      if (body.action === "disconnect") {
        const sid = stringValue(body.session_id, "Bank-Sitzung");
        if (!(await store.disconnect(userId, sid)))
          throw new BankError(
            "Die Bankverbindung wurde inzwischen geändert. Bitte neu laden.",
            409,
          );
        return json({ disconnected: true });
      }
      if (
        body.action === "session" ||
        body.action === "balances" ||
        body.action === "transactions"
      ) {
        if (body.action === "transactions" && body.protocol !== 2)
          throw new BankError(
            "Bitte die Anwendung neu laden, um Bankumsätze sicher abzurufen.",
            426,
          );
        const accountId =
          body.action === "session" ? undefined : stringValue(body.account_id, "Konto-ID");
        const { connection, session } = await verifyConnection(store, api, userId, accountId);
        if (body.action === "session") {
          if (body.session_id !== connection.requisition_id)
            throw new BankError("Diese Bank-Sitzung gehört nicht zu diesem Konto.", 403);
          return json(session);
        }
        if (body.action === "balances")
          return json(await api(`/accounts/${encodeURIComponent(accountId!)}/balances`));
        const rows = await transactions(api, accountId!);
        const matched = new Set<string>();
        const identity = session.accounts_data?.find(
          (account) => account.uid === accountId,
        )?.identification_hash;
        // Missing stable identity/reference is displayed, but never auto-paid.
        if (body.reconcile === true && identity) {
          const accountHash = await hashText(identity);
          for (const tx of rows)
            if (eligibleCredit(tx)) {
              const id = await store.reconcile(userId, connection, accountId!, accountHash, tx);
              if (id) matched.add(id);
            }
        }
        return json({ transactions: rows, reconciled: [...matched] });
      }
      throw new BankError("Unbekannte Aktion.");
    } catch (error) {
      const status = error instanceof BankError ? error.status : 500;
      // No raw provider payloads, authorization codes, or bank identifiers in logs/errors.
      return json(
        {
          error:
            error instanceof BankError
              ? error.message
              : "Bankdaten konnten nicht sicher verarbeitet werden.",
        },
        status,
      );
    }
  };
}
