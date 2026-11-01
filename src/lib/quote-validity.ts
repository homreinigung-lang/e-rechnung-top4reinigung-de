/** Angebotsgültigkeit: 30 Kalendertage ab Ausstellungsdatum (manuell über due_date änderbar). */
export function quoteValidUntil(issueDate: string, days = 30): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return "";
  const date = new Date(issueDate + "T12:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== issueDate) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
