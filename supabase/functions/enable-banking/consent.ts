type BankApi = (path: string, init?: RequestInit) => Promise<unknown>;

/** Read the bank's authoritative limit; never trust a duration supplied by a browser. */
export async function bankConsentValidUntil(api: BankApi, name: string, country: string, now: Date): Promise<string> {
  const result = await api(`/aspsps?country=${encodeURIComponent(country)}`) as {
    aspsps?: Array<{ name?: string; country?: string; maximum_consent_validity?: number }>;
  };
  const bank = result.aspsps?.find((item) => item.name === name && item.country === country);
  const seconds = bank?.maximum_consent_validity;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 1) {
    throw new Error("Die Freigabedauer dieser Bank konnte nicht ermittelt werden. Bitte später erneut versuchen.");
  }
  const until = new Date(now.getTime() + Math.floor(seconds) * 1000);
  if (!Number.isFinite(until.getTime())) throw new Error("Ungültige Freigabedauer der Bank.");
  return until.toISOString();
}

export const BANK_RENEWAL_MESSAGE = "Die Bankfreigabe ist abgelaufen oder geschlossen. Bitte unter Bankverbindung die Freigabe erneut bei Ihrer Bank bestätigen (z. B. per TAN). Ihr Konto bleibt gespeichert.";

export function isClosedBankSession(error: unknown): boolean {
  const data = (error as { data?: { error?: unknown } } | null)?.data;
  return data?.error === "CLOSED_SESSION" || data?.error === "EXPIRED_SESSION";
}
