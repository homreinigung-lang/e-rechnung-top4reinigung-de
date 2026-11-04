export function monthlyDistance(start: string, end: string): number | null {
  if (!start.trim() || !end.trim()) return null;
  const first = Number(start);
  const last = Number(end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first < 0 || last < first) return null;
  return Math.round((last - first) * 10) / 10;
}

export function tripsForMonth<T extends { trip_date: string }>(entries: T[], month: string): T[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  return entries.filter((entry) => entry.trip_date.startsWith(`${month}-`));
}
