/**
 * Zentraler Schutz für echte (versendete bzw. festgeschriebene) Belege.
 * GoBD / § 14b UStG: Solche Belege dürfen weder gelöscht noch überschrieben werden.
 */

type DocLike = Record<string, unknown> | null | undefined;

/**
 * Gesperrt ist ausschließlich eine Rechnung, die offiziell versendet bzw.
 * festgeschrieben wurde (locked_at). Entwürfe bleiben vollständig änderbar
 * und löschbar, Angebote sind generell ausgenommen.
 */
export function isLockedDocument(doc: DocLike): boolean {
  if (!doc) return false;
  if (doc["type"] === "quote") return false;
  return Boolean(doc["locked_at"]);
}

export function documentLabel(doc: DocLike): string {
  const number = String(doc?.["number"] ?? "").trim();
  const type = doc?.["type"] === "quote" ? "Angebot" : "Rechnung";
  return number ? `${type} ${number}` : type;
}

/** Klare Warnung beim Versuch, einen geschützten Beleg zu löschen. */
export function deleteBlockedMessage(doc: DocLike): string {
  return `Löschen gesperrt: ${documentLabel(doc)} ist ein echter, festgeschriebener Beleg und muss gemäß GoBD und § 14b UStG dauerhaft erhalten bleiben. Korrekturen sind nur über eine Stornorechnung möglich.`;
}

/** Klare Warnung beim Versuch, einen geschützten Beleg zu überschreiben. */
export function editBlockedMessage(doc: DocLike): string {
  return `Änderung gesperrt: ${documentLabel(doc)} ist festgeschrieben und darf nicht überschrieben werden (GoBD, § 14 UStG). Bitte eine Stornorechnung erstellen und anschließend einen neuen Beleg ausstellen.`;
}

/** Übersetzt Datenbank-Fehler der GoBD-Trigger in eine verständliche Warnung. */
export function errorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts = [e["message"], e["details"], e["hint"], e["code"]]
      .filter((p) => typeof p === "string" && p.trim() !== "")
      .map(String);
    if (parts.length > 0) return parts.join(" – ");
    try {
      return JSON.stringify(error);
    } catch {
      return "Unbekannter Fehler";
    }
  }
  return String(error);
}

export function describeGobdError(error: unknown, doc?: DocLike): string {
  const message = errorText(error);
  if (/GoBD|unveränderbar|festgeschrieben/i.test(message)) {
    return `${message}${doc ? ` (${documentLabel(doc)})` : ""}`;
  }
  return message || "Unbekannter Fehler";
}
