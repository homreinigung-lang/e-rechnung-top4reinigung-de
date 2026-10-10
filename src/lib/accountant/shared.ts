export type Cell = string | number | boolean | null;

export type Row = Record<string, Cell>;

export type AccountantReport = {
  companyName: string;
  documents: Row[];
  expenses: Row[];
  timeEntries: Row[];
  wageTypes: Row[];
  holidays: Row[];
  adjustments: Row[];
  fahrtenbuchEntries: Row[];
  fahrtenbuchVehicles: Row[];
};

export const NO_EXPIRY = "2999-12-31T00:00:00.000Z";

export function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export function expiryFrom(validDays?: number | null) {
  const days = Number(validDays ?? 0);
  if (!Number.isFinite(days) || days <= 0) return NO_EXPIRY;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}
