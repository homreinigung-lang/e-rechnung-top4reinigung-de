// GoCardless Bank Account Data (ehemals Nordigen) – PSD2-Zugriff auf deutsche Banken
const BASE = "https://bankaccountdata.gocardless.com/api/v2";

export type Institution = {
  id: string;
  name: string;
  bic?: string;
  logo?: string;
  transaction_total_days?: string;
};

export function hasGocardlessCredentials(): boolean {
  return Boolean(
    process.env["GOCARDLESS_SECRET_ID"] && process.env["GOCARDLESS_SECRET_KEY"],
  );
}

export async function getToken(): Promise<string> {
  const secret_id = process.env["GOCARDLESS_SECRET_ID"];
  const secret_key = process.env["GOCARDLESS_SECRET_KEY"];
  if (!secret_id || !secret_key) {
    throw new Error(
      "Bank-Zugangsdaten fehlen. Bitte GOCARDLESS_SECRET_ID und GOCARDLESS_SECRET_KEY hinterlegen.",
    );
  }
  const res = await fetch(`${BASE}/token/new/`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ secret_id, secret_key }),
  });
  if (!res.ok) {
    throw new Error(`Bank-Anmeldung fehlgeschlagen (${res.status}). Zugangsdaten prüfen.`);
  }
  const json = (await res.json()) as { access: string };
  return json.access;
}

export async function api<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Bank-API Fehler (${res.status}): ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type RawTransaction = {
  transactionId?: string;
  internalTransactionId?: string;
  endToEndId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount?: { amount?: string; currency?: string };
  debtorName?: string;
  creditorName?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
};

export type NormalizedTx = {
  external_id: string;
  booking_date: string;
  amount: number;
  currency: string;
  counterparty_name: string;
  remittance_info: string;
  raw: unknown;
};

export function normalizeTransaction(
  t: RawTransaction,
  accountId: string,
): NormalizedTx | null {
  const amount = Number(t.transactionAmount?.amount ?? "0");
  const date = t.bookingDate || t.valueDate;
  if (!date || Number.isNaN(amount)) return null;
  const id =
    t.transactionId ||
    t.internalTransactionId ||
    `${accountId}:${date}:${amount}:${(t.remittanceInformationUnstructured ?? "").slice(0, 40)}`;
  const remittance =
    t.remittanceInformationUnstructured ??
    (t.remittanceInformationUnstructuredArray ?? []).join(" ") ??
    "";
  return {
    external_id: id,
    booking_date: date,
    amount,
    currency: t.transactionAmount?.currency ?? "EUR",
    counterparty_name: (amount >= 0 ? t.debtorName : t.creditorName) ?? "",
    remittance_info: remittance,
    raw: t,
  };
}
