/**
 * Verständliche Meldungen für typische Datenbankfehler.
 * Insbesondere die Eindeutigkeitsregeln gegen Doppelbuchungen.
 */
export function friendlyDbError(error: unknown, fallback = "Speichern nicht möglich."): string {
  const msg = String((error as { message?: string })?.message ?? error ?? "");
  if (msg.includes("time_entries_one_absence_per_day")) {
    return "Für mindestens einen Tag ist bereits eine Abwesenheit eingetragen. Bitte den Zeitraum prüfen.";
  }
  if (msg.includes("time_entries_no_duplicate_shift")) {
    return "Für diesen Mitarbeiter besteht an diesem Tag bereits ein Einsatz mit derselben Uhrzeit.";
  }
  if (msg.includes("duplicate key value")) {
    return "Dieser Eintrag existiert bereits.";
  }
  return msg || fallback;
}
