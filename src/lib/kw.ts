/** Kalenderwochen nach ISO 8601 (Woche beginnt am Montag, KW 1 enthält den 4. Januar). */
export function isoWeek(value: string | Date): number {
  const date = typeof value === "string" ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Das Jahr, zu dem die ISO-Kalenderwoche gehört (kann vom Kalenderjahr abweichen). */
export function isoWeekYear(value: string | Date): number {
  const date = typeof value === "string" ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/** Kurzform, z. B. „KW 31“. */
export function kwLabel(value: string | Date): string {
  const week = isoWeek(value);
  return week ? `KW ${week}` : "";
}
